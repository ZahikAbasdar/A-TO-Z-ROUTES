import redis.asyncio as aioredis
from redis.asyncio import Redis
from typing import Optional, Any
import json
import structlog
from app.core.config import settings

logger = structlog.get_logger()

_redis_client: Optional[Redis] = None


async def get_redis() -> Redis:
    """FastAPI dependency — returns the shared Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = await init_redis()
    return _redis_client


async def init_redis() -> Redis:
    """Create and verify Redis connection on startup."""
    global _redis_client
    try:
        client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        await client.ping()
        _redis_client = client
        logger.info("redis.connected", host=settings.REDIS_HOST)
        return client
    except Exception as e:
        logger.error("redis.connection_failed", error=str(e))
        raise


async def close_redis() -> None:
    """Close Redis connection on shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("redis.disconnected")


# ── Cache helpers ─────────────────────────────────────────────────────────────

class RedisCache:
    """Typed cache wrapper with JSON serialization."""

    def __init__(self, client: Redis):
        self.client = client

    async def get(self, key: str) -> Optional[Any]:
        value = await self.client.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value

    async def set(
        self,
        key: str,
        value: Any,
        expire: int = 300,  # default 5 minutes
    ) -> None:
        serialized = json.dumps(value, default=str)
        await self.client.setex(key, expire, serialized)

    async def delete(self, key: str) -> None:
        await self.client.delete(key)

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern. Returns count deleted."""
        keys = await self.client.keys(pattern)
        if keys:
            return await self.client.delete(*keys)
        return 0

    async def exists(self, key: str) -> bool:
        return bool(await self.client.exists(key))

    async def increment(self, key: str, amount: int = 1) -> int:
        return await self.client.incrby(key, amount)

    async def expire(self, key: str, seconds: int) -> None:
        await self.client.expire(key, seconds)


# ── Cache key builders ────────────────────────────────────────────────────────

class CacheKeys:
    """Centralised cache key namespace — prevents typos across codebase."""

    @staticmethod
    def user(user_id: str) -> str:
        return f"user:{user_id}"

    @staticmethod
    def user_token_blacklist(jti: str) -> str:
        return f"token:blacklist:{jti}"

    @staticmethod
    def shipment(shipment_id: str) -> str:
        return f"shipment:{shipment_id}"

    @staticmethod
    def shipment_list(user_id: str) -> str:
        return f"shipments:user:{user_id}"

    @staticmethod
    def tracking_events(shipment_id: str) -> str:
        return f"tracking:{shipment_id}"

    @staticmethod
    def rate_limit(ip: str) -> str:
        return f"rate_limit:{ip}"

    @staticmethod
    def driver_location(driver_id: str) -> str:
        return f"driver:location:{driver_id}"

    @staticmethod
    def analytics(user_id: str, period: str) -> str:
        return f"analytics:{user_id}:{period}"
