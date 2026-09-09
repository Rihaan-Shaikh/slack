# Phase 1: Real Identity & Access — JWT + bcrypt auth module
# This module never reads X-User-Role/Name/Email headers.
# All identity comes from a signed JWT the server issued itself.

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt
import bcrypt

from app.config import settings


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash a plain-text password with bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─── JWT helpers ──────────────────────────────────────────────────────────────

def create_jwt(user_id: str, email: str, display_name: str) -> str:
    """
    Issue a signed JWT with user identity embedded.
    Expires in settings.jwt_expire_days days.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {
        "sub": user_id,
        "email": email,
        "display_name": display_name,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    """
    Decode and verify a JWT. Raises HTTP 401 on failure.
    Returns the full payload dict.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        if not payload.get("sub"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token invalid or expired: {exc}",
        )


# ─── FastAPI dependency ───────────────────────────────────────────────────────

def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency that extracts and verifies the JWT from the request.

    Token resolution order:
      1. Authorization: Bearer <token>  (standard — used by the Next.js frontend)
      2. access_token query param       (used by SSE stream which cannot set headers)
      3. access_token httpOnly cookie   (for future same-origin / proxy deployments)

    Returns dict: {user_id, email, display_name}

    NOTE on httpOnly cookies:
      In a same-origin deployment (API proxied through Next.js rewrites at /api/*),
      the token would be stored in an httpOnly cookie. For the current cross-origin dev
      setup (frontend :3000, API :8000), the frontend stores the JWT in localStorage
      and sends it as a Bearer token. The cookie path is preserved here for future use.
    """
    token: Optional[str] = None

    # 1. Authorization header (primary path for frontend)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # 2. Query param (for SSE — EventSource API cannot set custom headers)
    if not token:
        token = request.query_params.get("token")

    # 3. httpOnly cookie (future same-origin deployments)
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )

    payload = decode_jwt(token)
    return {
        "user_id": payload["sub"],
        "email": payload["email"],
        "display_name": payload["display_name"],
    }


def get_current_user_optional(request: Request) -> Optional[dict]:
    """
    Same as get_current_user but returns None instead of raising 401.
    Used for SSE endpoint which should work for read-only stream even if unauthenticated.
    """
    try:
        return get_current_user(request)
    except HTTPException:
        return None
