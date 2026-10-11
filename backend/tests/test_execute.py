from httpx import AsyncClient

from app.core.context import AppContext


async def test_run_success_with_stdin(client: AsyncClient) -> None:
    r = await client.post(
        "/api/execute", json={"code": "a, b = map(int, input().split())\nprint(a + b)", "stdin": "2 40"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "OK"
    assert body["stdout"] == "42\n"
    assert body["explanation"] is None


async def test_syntax_error_has_explanation_and_original_traceback(client: AsyncClient) -> None:
    r = await client.post("/api/execute", json={"code": "for i in range(3)\n    print(i)"})
    body = r.json()
    assert body["status"] == "SYNTAX_ERROR"
    assert "SyntaxError" in body["stderr"]  # original error is never hidden
    assert body["explanation"]["title"]
    assert body["explanation"]["line"] == 1


async def test_runtime_error_types(client: AsyncClient) -> None:
    cases = {
        "print(undefined_name)": "NameError",
        "'a' + 1": "TypeError",
        "int('abc')": "ValueError",
        "[1][3]": "IndexError",
        "{}['k']": "KeyError",
        "1 / 0": "ZeroDivisionError",
    }
    for code, error_type in cases.items():
        body = (await client.post("/api/execute", json={"code": code})).json()
        assert body["status"] == "RUNTIME_ERROR", code
        assert body["error_type"] == error_type
        assert body["explanation"]["summary"]


async def test_timeout_and_output_limit(client: AsyncClient) -> None:
    loop = (await client.post("/api/execute", json={"code": "while True: pass"})).json()
    assert loop["status"] == "TIMEOUT"
    assert loop["explanation"]["title"] == "The program ran out of time"
    spam = (await client.post("/api/execute", json={"code": "while True: print('spam' * 50)"})).json()
    assert spam["status"] == "OUTPUT_LIMIT"
    assert spam["truncated"] is True


async def test_missing_input_is_explained(client: AsyncClient) -> None:
    body = (await client.post("/api/execute", json={"code": "x = input()"})).json()
    assert body["error_type"] == "EOFError"
    assert "input" in body["explanation"]["summary"]


async def test_size_validation(client: AsyncClient, ctx: AppContext) -> None:
    big = "x = 1\n" * (ctx.settings.max_code_chars // 6 + 10)
    assert (await client.post("/api/execute", json={"code": big})).status_code == 422
    assert (await client.post("/api/execute", json={"code": ""})).status_code == 422


async def test_executor_outage_is_a_503_not_a_user_error(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    executor.fail = True
    r = await client.post("/api/execute", json={"code": "print(1)"})
    assert r.status_code == 503
    assert "unavailable" in r.json()["detail"]
    health = (await client.get("/api/health")).json()
    assert health["status"] == "degraded"


async def test_execute_rate_limit(client: AsyncClient, ctx: AppContext) -> None:
    ctx.settings.rate_execute_per_minute = 2
    codes = [(await client.post("/api/execute", json={"code": "print(1)"})).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
