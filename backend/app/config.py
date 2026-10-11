"""Centralized backend settings, loaded from environment variables.

Values come from the process environment first, then from ``backend/.env``
(local development).  ``backend/.env.example`` documents every variable.
Secrets never have production-safe defaults: the app refuses to start in
production with the development placeholders.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"  # noqa: S105 - placeholder, rejected in production
DEV_WORKER_TOKEN = "dev-only-worker-token"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "PyArena API"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False

    # --- Database -------------------------------------------------------
    database_url: str = "postgresql+asyncpg://pyarena:pyarena@localhost:5432/pyarena"
    database_echo: bool = False
    # Connection pool (PostgreSQL only; SQLite ignores these).
    db_pool_size: int = Field(10, ge=1, le=100)
    db_max_overflow: int = Field(10, ge=0, le=100)
    db_pool_timeout_seconds: float = Field(10.0, gt=0)
    db_pool_recycle_seconds: int = Field(1800, ge=60)

    # --- Shared state ---------------------------------------------------
    # redis://host:6379/0. Empty = in-process memory (single backend process only).
    redis_url: str = ""

    # --- Observability ----------------------------------------------------
    log_format: Literal["json", "text"] = "json"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    metrics_enabled: bool = True
    # When set, GET /metrics requires "Authorization: Bearer <token>".
    metrics_token: str = ""

    # --- Idempotency ------------------------------------------------------
    idempotency_ttl_hours: int = Field(24, ge=1, le=168)

    # --- Security -------------------------------------------------------
    secret_key: str = DEV_SECRET
    session_cookie_name: str = "pyarena_session"
    session_days: int = Field(7, ge=1, le=90)
    cookie_secure: bool = False
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    trust_proxy_headers: bool = False

    # --- Execution worker ---------------------------------------------
    worker_url: str = "http://localhost:8001"
    worker_token: str = DEV_WORKER_TOKEN
    worker_timeout_seconds: float = 20.0
    worker_connect_timeout_seconds: float = 3.0
    max_code_chars: int = 20_000
    max_stdin_chars: int = 10_000
    playground_cpu_seconds: float = 2.0
    playground_wall_seconds: float = 5.0
    playground_memory_mb: int = 256

    # --- Competitions ---------------------------------------------------
    competition_min_players: int = Field(2, ge=1, le=8)
    competition_max_players: int = Field(8, ge=2, le=16)
    competition_countdown_seconds: int = Field(5, ge=0, le=60)
    competition_idle_minutes: int = Field(60, ge=1)
    submission_cooldown_seconds: float = Field(3.0, ge=0)

    # --- Rate limits (requests per window) ----------------------------
    rate_limit_enabled: bool = True
    rate_execute_per_minute: int = 30
    rate_login_per_minute: int = 10
    rate_register_per_hour: int = 20
    rate_join_per_minute: int = 20
    rate_submit_per_minute: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [v.strip().rstrip("/") for v in value.split(",") if v.strip()]
        return value

    @model_validator(mode="after")
    def _production_safety(self) -> Settings:
        if self.environment == "production":
            problems = []
            if self.secret_key == DEV_SECRET or len(self.secret_key) < 32:
                problems.append("SECRET_KEY must be a random value of at least 32 characters")
            if self.worker_token == DEV_WORKER_TOKEN or len(self.worker_token) < 24:
                problems.append("WORKER_TOKEN must be a random value of at least 24 characters")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE must be true in production (HTTPS)")
            if self.is_sqlite:
                problems.append("DATABASE_URL must point to PostgreSQL in production (SQLite is for development)")
            if not self.redis_url:
                problems.append("REDIS_URL must be set in production (shared rate limits, presence and sockets)")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
