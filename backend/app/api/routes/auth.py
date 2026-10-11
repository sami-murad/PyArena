from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.dependencies import Ctx, OptionalUser, Session, rate_limit
from app.repositories.users import UserRepository
from app.schemas.users import LoginRequest, RegisterRequest, UserOut
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.tokens import create_session_token

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, user_id: int, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_token(user_id, settings),
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register", "rate_register_per_hour", 3600))],
)
async def register(body: RegisterRequest, response: Response, ctx: Ctx, session: Session) -> UserOut:
    repo = UserRepository(session)
    username_taken, email_taken = await repo.exists(body.username, body.email)
    if username_taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken.")
    if email_taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists.")
    try:
        user = await repo.create(body.username, body.email, hash_password(body.password))
        await session.commit()
    except IntegrityError as exc:  # two sign-ups racing for the same name
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That username or email is already registered.") from exc
    _set_session_cookie(response, user.id, ctx.settings)
    return UserOut.model_validate(user)


@router.post(
    "/login",
    response_model=UserOut,
    dependencies=[Depends(rate_limit("login", "rate_login_per_minute", 60))],
)
async def login(body: LoginRequest, response: Response, ctx: Ctx, session: Session) -> UserOut:
    repo = UserRepository(session)
    user = await repo.by_login(body.login.strip())
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        # One message for both cases, so attackers cannot probe which accounts exist.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username, email or password.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
        await session.commit()
    _set_session_cookie(response, user.id, ctx.settings)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, ctx: Ctx) -> Response:
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(
        ctx.settings.session_cookie_name, path="/", samesite="lax", secure=ctx.settings.cookie_secure, httponly=True
    )
    return response


@router.get("/session", response_model=UserOut | None)
async def session_info(user: OptionalUser) -> UserOut | None:
    """The signed-in user, or ``null`` for guests (200 either way, so guests see no error)."""
    return UserOut.model_validate(user) if user else None
