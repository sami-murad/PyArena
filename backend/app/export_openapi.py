"""Write the API's OpenAPI schema to a file (used for contract testing).

    python -m app.export_openapi                 # -> ../frontend/openapi.json
    python -m app.export_openapi path/to/out.json

The frontend generates TypeScript types from this file (``npm run api:types``)
and CI fails if either the schema or the generated types are out of date.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from app.config import Settings
from app.core.context import build_context
from app.execution.client import ExecLimits, ExecResult
from app.main import create_fastapi_app
from app.websocket.events import RecordingBus

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"


class _NoExecutor:
    """The schema needs no worker; this stands in for one."""

    async def run(self, code: str, stdin: str, limits: ExecLimits) -> ExecResult:
        raise NotImplementedError("schema export does not run code")

    async def call(self, code: str, function_name: str, args: list[Any], limits: ExecLimits) -> ExecResult:
        raise NotImplementedError("schema export does not run code")

    async def health(self) -> dict[str, Any]:
        return {"status": "ok"}


def openapi_schema() -> dict[str, object]:
    settings = Settings(_env_file=None, environment="development", database_url="sqlite+aiosqlite:///:memory:")
    ctx = build_context(settings, _NoExecutor(), RecordingBus())
    app = create_fastapi_app(ctx, start_background=False)
    return app.openapi()


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.write_text(json.dumps(openapi_schema(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
