from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
import uuid

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache, CacheKeys
from app.core.security import decode_token
from app.models.user import User
from app.core.responses import UnauthorizedException, ForbiddenException

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> User:
    """
    Core auth dependency.
    - Validates the Bearer token
    - Checks token is not blacklisted
    - Returns the live User object
    Raise 401 on any failure — never reveal why exactly (security best practice).
    """
    if not credentials:
        raise UnauthorizedException("Authentication required")

    token = credentials.credentials

    try:
        payload = decode_token(token)
    except JWTError:
        raise UnauthorizedException("Invalid or expired token")

    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type")

    jti = payload.get("jti")
    user_id_str = payload.get("sub")

    if not jti or not user_id_str:
        raise UnauthorizedException("Malformed token")

    # Check blacklist
    cache = RedisCache(redis)
    if await cache.exists(CacheKeys.user_token_blacklist(jti)):
        raise UnauthorizedException("Token has been revoked")

    # Try cache first
    cached_user = await cache.get(CacheKeys.user(user_id_str))
    if cached_user:
        # Still hit DB to get a live ORM object (cache just verifies existence)
        pass

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise UnauthorizedException("Invalid token subject")

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.deleted_at.is_(None),
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedException("User not found or inactive")

    # Attach jti to request state for logout use
    request.state.token_jti = jti
    request.state.user = user

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Alias — same as get_current_user, but makes intent explicit in route signatures."""
    return current_user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Restrict route to admin role only."""
    if not current_user.is_admin:
        raise ForbiddenException("Admin access required")
    return current_user


async def require_driver(
    current_user: User = Depends(get_current_user),
) -> User:
    """Restrict route to driver role only."""
    if not current_user.is_driver:
        raise ForbiddenException("Driver access required")
    return current_user


async def require_admin_or_driver(
    current_user: User = Depends(get_current_user),
) -> User:
    if not (current_user.is_admin or current_user.is_driver):
        raise ForbiddenException("Insufficient permissions")
    return current_user


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
