import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.auth_service import AuthService
from app.schemas.auth import RegisterRequest, LoginRequest
from app.core.responses import ConflictException, UnauthorizedException, ForbiddenException


# ── Fixtures ──────────────────────────────────────────────────────────────────

def mock_role():
    role = MagicMock()
    role.id = "role-uuid"
    role.name = "user"
    role.permissions = {}
    return role


def mock_user(active=True, deleted=False):
    user = MagicMock()
    user.id = "user-uuid"
    user.email = "test@example.com"
    user.password_hash = "$2b$12$hashed"
    user.full_name = "Test User"
    user.is_active = active
    user.deleted_at = "2024-01-01" if deleted else None
    user.role = mock_role()
    user.role_id = "role-uuid"
    return user


def make_service():
    db = AsyncMock()
    cache = AsyncMock()
    cache.exists = AsyncMock(return_value=False)
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()
    cache.delete = AsyncMock()
    return AuthService(db=db, cache=cache)


# ── Register ──────────────────────────────────────────────────────────────────

class TestRegister:
    @pytest.mark.asyncio
    async def test_register_conflict_on_existing_email(self):
        service = make_service()
        service._get_user_by_email = AsyncMock(return_value=mock_user())
        with pytest.raises(ConflictException):
            await service.register(RegisterRequest(
                email="existing@example.com",
                password="Password1",
                full_name="Test User",
            ))

    @pytest.mark.asyncio
    async def test_register_fails_without_role(self):
        service = make_service()
        service._get_user_by_email = AsyncMock(return_value=None)
        service._get_role_by_name = AsyncMock(return_value=None)
        with pytest.raises(Exception, match="Default role not found"):
            await service.register(RegisterRequest(
                email="new@example.com",
                password="Password1",
                full_name="New User",
            ))


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.mark.asyncio
    async def test_login_wrong_password(self):
        service = make_service()
        service._get_user_by_email = AsyncMock(return_value=mock_user())
        with patch("app.services.auth_service.verify_password", return_value=False):
            with pytest.raises(UnauthorizedException):
                await service.login(LoginRequest(email="test@example.com", password="wrong"))

    @pytest.mark.asyncio
    async def test_login_inactive_user(self):
        service = make_service()
        service._get_user_by_email = AsyncMock(return_value=mock_user(active=False))
        with patch("app.services.auth_service.verify_password", return_value=True):
            with pytest.raises(ForbiddenException, match="deactivated"):
                await service.login(LoginRequest(email="test@example.com", password="Password1"))

    @pytest.mark.asyncio
    async def test_login_deleted_user(self):
        service = make_service()
        service._get_user_by_email = AsyncMock(return_value=mock_user(deleted=True))
        with patch("app.services.auth_service.verify_password", return_value=True):
            with pytest.raises(ForbiddenException):
                await service.login(LoginRequest(email="test@example.com", password="Password1"))


# ── Schema validation ─────────────────────────────────────────────────────────

class TestSchemas:
    def test_weak_password_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="short", full_name="Test")

    def test_no_uppercase_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="password1", full_name="Test")

    def test_valid_registration(self):
        r = RegisterRequest(email="user@example.com", password="Secure123", full_name="John Doe")
        assert r.email == "user@example.com"

    def test_password_mismatch_change(self):
        from pydantic import ValidationError
        from app.schemas.auth import ChangePasswordRequest
        with pytest.raises(ValidationError):
            ChangePasswordRequest(
                current_password="Old1234",
                new_password="New1234A",
                confirm_password="Different1",
            )
