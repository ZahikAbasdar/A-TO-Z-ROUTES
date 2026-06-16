from datetime import datetime, timezone
from typing import Optional, Tuple
import uuid
import structlog

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from app.models.user import User, Role
from app.models.audit import AuditLog
from app.schemas.auth import RegisterRequest, LoginRequest
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings
from app.core.redis import RedisCache, CacheKeys
from app.core.responses import (
    NotFoundException,
    UnauthorizedException,
    ConflictException,
    ForbiddenException,
)

logger = structlog.get_logger()


class AuthService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db = db
        self.cache = cache

    # ── Register ──────────────────────────────────────────────────────────────

    async def register(
        self, data: RegisterRequest, ip_address: Optional[str] = None
    ) -> User:
        # Check email uniqueness
        existing = await self._get_user_by_email(data.email)
        if existing:
            raise ConflictException("An account with this email already exists")

        # Get default 'user' role
        role = await self._get_role_by_name("user")
        if not role:
            raise Exception("Default role not found — run database seed")

        user = User(
            email=data.email.lower().strip(),
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            phone=data.phone,
            role_id=role.id,
        )
        self.db.add(user)
        await self.db.flush()  # get the UUID without committing

        # Audit log
        await self._audit(
            user_id=user.id,
            action="USER_REGISTERED",
            resource_type="user",
            resource_id=user.id,
            ip_address=ip_address,
        )

        logger.info("auth.registered", user_id=str(user.id), email=user.email)
        return user

    # ── Login ─────────────────────────────────────────────────────────────────

    async def login(
        self, data: LoginRequest, ip_address: Optional[str] = None
    ) -> Tuple[str, str, User]:
        """Returns (access_token, refresh_token, user)."""
        user = await self._get_user_by_email(data.email)

        if not user or not verify_password(data.password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")

        if not user.is_active:
            raise ForbiddenException("Your account has been deactivated")

        if user.deleted_at is not None:
            raise ForbiddenException("Account not found")

        # Load role for token claims
        role = await self._get_role_by_id(user.role_id)

        access_token, access_jti = create_access_token(
            subject=str(user.id),
            role=role.name if role else "user",
        )
        refresh_token, refresh_jti = create_refresh_token(subject=str(user.id))

        # Store refresh token JTI in Redis (for revocation)
        refresh_key = f"refresh:{refresh_jti}"
        await self.cache.set(
            refresh_key,
            {"user_id": str(user.id), "jti": refresh_jti},
            expire=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

        # Update last login
        user.last_login = datetime.now(timezone.utc)

        # Audit log
        await self._audit(
            user_id=user.id,
            action="USER_LOGIN",
            resource_type="user",
            resource_id=user.id,
            ip_address=ip_address,
        )

        # Invalidate user cache so fresh data is fetched
        await self.cache.delete(CacheKeys.user(str(user.id)))

        logger.info("auth.login", user_id=str(user.id))
        return access_token, refresh_token, user

    # ── Refresh Token ─────────────────────────────────────────────────────────

    async def refresh_access_token(self, refresh_token: str) -> Tuple[str, str]:
        """Validates refresh token, issues new access + refresh token pair."""
        try:
            payload = decode_token(refresh_token)
        except JWTError:
            raise UnauthorizedException("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedException("Token type mismatch")

        jti = payload.get("jti")
        user_id = payload.get("sub")

        # Check JTI is still valid in Redis (not revoked)
        stored = await self.cache.get(f"refresh:{jti}")
        if not stored:
            raise UnauthorizedException("Refresh token has been revoked or expired")

        # Rotate: revoke old refresh token
        await self.cache.delete(f"refresh:{jti}")

        user = await self._get_user_by_id(uuid.UUID(user_id))
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive")

        role = await self._get_role_by_id(user.role_id)

        new_access, _ = create_access_token(
            subject=str(user.id),
            role=role.name if role else "user",
        )
        new_refresh, new_refresh_jti = create_refresh_token(subject=str(user.id))

        # Store new refresh JTI
        await self.cache.set(
            f"refresh:{new_refresh_jti}",
            {"user_id": str(user.id), "jti": new_refresh_jti},
            expire=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

        logger.info("auth.token_refreshed", user_id=str(user.id))
        return new_access, new_refresh

    # ── Logout ────────────────────────────────────────────────────────────────

    async def logout(
        self, access_jti: str, user_id: str, ip_address: Optional[str] = None
    ) -> None:
        """Blacklists the access token JTI in Redis."""
        await self.cache.set(
            CacheKeys.user_token_blacklist(access_jti),
            "blacklisted",
            expire=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        await self._audit(
            user_id=uuid.UUID(user_id),
            action="USER_LOGOUT",
            resource_type="user",
            resource_id=uuid.UUID(user_id),
            ip_address=ip_address,
        )
        logger.info("auth.logout", user_id=user_id)

    # ── Change Password ───────────────────────────────────────────────────────

    async def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
        ip_address: Optional[str] = None,
    ) -> None:
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedException("Current password is incorrect")

        user.password_hash = hash_password(new_password)

        await self._audit(
            user_id=user.id,
            action="PASSWORD_CHANGED",
            resource_type="user",
            resource_id=user.id,
            ip_address=ip_address,
        )
        logger.info("auth.password_changed", user_id=str(user.id))

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_user_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(
                User.email == email.lower().strip(),
                User.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def _get_user_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def _get_role_by_name(self, name: str) -> Optional[Role]:
        result = await self.db.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()

    async def _get_role_by_id(self, role_id: uuid.UUID) -> Optional[Role]:
        result = await self.db.execute(select(Role).where(Role.id == role_id))
        return result.scalar_one_or_none()

    async def _audit(
        self,
        action: str,
        user_id: Optional[uuid.UUID] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
        )
        self.db.add(log)
