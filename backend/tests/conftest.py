import pytest
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

from app.main import app
from app.core.database import Base, get_db
from app.core.redis import get_redis, RedisCache

# ── Test DB (SQLite in-memory for speed) ─────────────────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession  = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def make_mock_redis():
    mock = AsyncMock()
    mock.get     = AsyncMock(return_value=None)
    mock.set     = AsyncMock(return_value=True)
    mock.delete  = AsyncMock(return_value=1)
    mock.exists  = AsyncMock(return_value=False)
    mock.incr    = AsyncMock(return_value=1)
    mock.expire  = AsyncMock(return_value=True)
    mock.keys    = AsyncMock(return_value=[])
    mock.ping    = AsyncMock(return_value=True)
    return mock


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(setup_db) -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        yield session
        await session.rollback()


@pytest.fixture
def mock_redis():
    return make_mock_redis()


@pytest.fixture
async def client(mock_redis) -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db]     = override_get_db
    app.dependency_overrides[get_redis]  = lambda: mock_redis

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Helper factories ──────────────────────────────────────────────────────────

def make_role(name="user"):
    from app.models.user import Role
    return Role(
        id=uuid.uuid4(),
        name=name,
        permissions={"all": True} if name == "admin" else {},
    )


def make_user(role_name="user", active=True):
    from app.models.user import User
    from app.core.security import hash_password
    role = make_role(role_name)
    user = User(
        id=uuid.uuid4(),
        email=f"{role_name}_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Test1234"),
        full_name="Test User",
        role_id=role.id,
        is_active=active,
    )
    user.role = role
    return user


def make_auth_headers(user):
    from app.core.security import create_access_token
    token, _ = create_access_token(
        subject=str(user.id),
        role=user.role.name,
    )
    return {"Authorization": f"Bearer {token}"}
