"""Request ids, structured logs, health checks, metrics and API versioning."""

import json
import logging

from httpx import AsyncClient

from app.core.context import AppContext
from app.core.logging import JsonFormatter, bind, current_fields, start_context
from tests.conftest import register

V1 = "/api/v1"


async def test_request_id_is_generated_or_propagated(client: AsyncClient) -> None:
    generated = await client.get(f"{V1}/health/live")
    assert len(generated.headers["x-request-id"]) == 32
    chosen = await client.get(f"{V1}/health/live", headers={"X-Request-ID": "nginx-req-12345"})
    assert chosen.headers["x-request-id"] == "nginx-req-12345"
    junk = await client.get(f"{V1}/health/live", headers={"X-Request-ID": "x" * 500})
    assert junk.headers["x-request-id"] != "x" * 500


def test_json_log_line_carries_context() -> None:
    start_context(request_id="req-1", user_id=5)
    with bind(competition_id=9, submission_id=33):
        record = logging.LogRecord("pyarena.test", logging.INFO, __file__, 1, "judged %s", ("ok",), None)
        for key, value in current_fields().items():
            setattr(record, key, value)
        line = json.loads(JsonFormatter().format(record))
    assert line["msg"] == "judged ok"
    assert (line["request_id"], line["user_id"], line["competition_id"], line["submission_id"]) == ("req-1", 5, 9, 33)
    assert "submission_id" not in current_fields()  # bind() restored the outer context


async def test_access_log_includes_user(client: AsyncClient, caplog) -> None:  # type: ignore[no-untyped-def]
    await register(client, "logged_user")
    with caplog.at_level(logging.INFO, logger="pyarena.access"):
        await client.get(f"{V1}/users/me")
    entry = next(r for r in caplog.records if r.name == "pyarena.access" and "/users/me" in r.getMessage())
    assert entry.user_id is not None
    assert entry.status == 200
    assert entry.route == "/api/v1/users/me"


async def test_liveness_and_readiness(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    assert (await client.get(f"{V1}/health/live")).json() == {"status": "ok"}
    ready = await client.get(f"{V1}/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["redis"] == "not_configured"
    executor.fail = True
    assert (await client.get(f"{V1}/health/ready")).status_code == 503
    assert (await client.get(f"{V1}/health/live")).status_code == 200  # a dependency outage is not a dead process


async def test_metrics_exposes_the_five_core_series(client: AsyncClient) -> None:
    await client.post(f"{V1}/execute", json={"code": "while True: pass"})  # a cpu kill
    text = (await client.get("/metrics")).text
    for name in (
        "pyarena_judge_queue_depth",
        "pyarena_sandbox_kills_total",
        "pyarena_submission_latency_seconds",
        "pyarena_active_competitions",
        "pyarena_socket_connections",
    ):
        assert name in text, name
    assert 'pyarena_sandbox_kills_total{reason="cpu"}' in text
    assert 'route="/api/v1/execute"' in text


async def test_metrics_token(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    ctx.settings.metrics_token = "scrape-secret"
    c = make_client()
    assert (await c.get("/metrics")).status_code == 401
    ok = await c.get("/metrics", headers={"Authorization": "Bearer scrape-secret"})
    assert ok.status_code == 200
    ctx.settings.metrics_token = ""


async def test_versioned_routes_and_deprecated_aliases(client: AsyncClient) -> None:
    v1 = await client.get(f"{V1}/questions")
    legacy = await client.get("/api/questions")
    assert v1.status_code == legacy.status_code == 200
    assert v1.json() == legacy.json()
    assert "deprecation" not in v1.headers
    assert legacy.headers["deprecation"] == "true"
    assert legacy.headers["link"] == '</api/v1/questions>; rel="successor-version"'


async def test_openapi_lists_only_versioned_paths(client: AsyncClient) -> None:
    paths = (await client.get(f"{V1}/openapi.json")).json()["paths"]
    assert "/api/v1/execute" in paths
    assert not any(p.startswith("/api/") and not p.startswith("/api/v1/") for p in paths)
