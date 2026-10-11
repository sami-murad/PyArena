"""Signed session tokens stored in an httpOnly cookie.

Why a cookie instead of a bearer token in localStorage?  JavaScript cannot read
an httpOnly cookie, so an XSS bug cannot steal the session.  The trade-off is
CSRF exposure, which ``app.security.csrf`` handles with SameSite=Lax cookies
plus an Origin check on every state-changing request.

Tokens are stateless JWTs (HS256).  Logging out deletes the cookie; a copied
token stays valid until it expires (``SESSION_DAYS``).  A server-side session
table would allow instant revocation and is a documented future improvement.
"""

from __future__ import annotations

from datetime import timedelta

import jwt

from app.config import Settings
from app.core.database import utcnow

ALGORITHM = "HS256"


def create_session_token(user_id: int, settings: Settings) -> str:
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.session_days)).timestamp()),
        "typ": "session",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_session_token(token: str | None, settings: Settings) -> int | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "session":
        return None
    try:
        return int(payload["sub"])
    except (TypeError, ValueError):
        return None
