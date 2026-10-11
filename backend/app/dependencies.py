"""FastAPI dependencies: database session, current user, rate limiting."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.context import AppContext
from app.models import User
from app.repositories.users import UserRepository
from app.security.tokens import decode_session_token


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx  # type: ignore[no-any-return]


def get_settings_dep(ctx: Annotated[AppContext, Depends(get_ctx)]) -> Settings:
    return ctx.settings


async def get_session(ctx: Annotated[AppContext, Depends(get_ctx)]) -> AsyncIterator[AsyncSession]:
    async with ctx.db.sessionmaker() as session:
        yield session


Ctx = Annotated[AppContext, Depends(get_ctx)]
Session = Annotated[AsyncSession, Depends(get_session)]


async def get_optional_user(request: Request, ctx: Ctx, session: Session) -> User | None:
    token = request.cookies.get(ctx.settings.session_cookie_name)
    user_id = decode_session_token(token, ctx.settings)
    if user_id is None:
        return None
    return await UserRepository(session).get(user_id)


async def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def client_ip(request: Request, settings: Settings) -> str:
    # Behind the bundled nginx proxy the real address arrives in X-Real-IP.
    # It is only trusted when TRUST_PROXY_HEADERS=true (nginx overwrites the
    # header, so clients cannot spoof it there); see docs/SECURITY.md.
    if settings.trust_proxy_headers and request.headers.get("x-real-ip"):
        return request.headers["x-real-ip"]
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, limit_attr: str, window_seconds: float, per_user: bool = False) -> Callable[..., None]:
    """Build a dependency that limits requests per IP (or per user when signed in)."""

    def dependency(request: Request, ctx: Ctx, user: OptionalUser) -> None:
        limit = int(getattr(ctx.settings, limit_attr))
        key = f"{bucket}:user:{user.id}" if (per_user and user) else f"{bucket}:ip:{client_ip(request, ctx.settings)}"
        retry = ctx.limiter.hit(key, limit, window_seconds)
        if retry is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(int(retry) + 1)},
            )

    return dependency
