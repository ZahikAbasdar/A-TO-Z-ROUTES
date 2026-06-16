from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import structlog
from app.core.config import settings
from app.core.redis import get_redis, CacheKeys

logger = structlog.get_logger()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter — tracks request count per IP per minute.
    Skips rate limiting for health check and docs endpoints.
    """

    SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        key = CacheKeys.rate_limit(client_ip)

        try:
            redis = await get_redis()
            count = await redis.incr(key)

            if count == 1:
                # First request in window — set expiry
                await redis.expire(key, 60)

            if count > settings.RATE_LIMIT_PER_MINUTE:
                logger.warning("rate_limit.exceeded", ip=client_ip, count=count)
                return JSONResponse(
                    status_code=429,
                    content={
                        "success": False,
                        "message": "Too many requests. Please slow down.",
                        "data": None,
                    },
                    headers={"Retry-After": "60"},
                )

        except Exception as e:
            # If Redis is down, allow the request through (fail open)
            logger.error("rate_limit.redis_error", error=str(e))

        response = await call_next(request)
        return response

    def _get_client_ip(self, request: Request) -> str:
        # Respect X-Forwarded-For from Nginx proxy
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next) -> Response:
        import time
        start = time.perf_counter()

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        logger.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            ip=request.client.host if request.client else "unknown",
        )

        return response
