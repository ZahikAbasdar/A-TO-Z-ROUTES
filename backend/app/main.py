from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError
import structlog

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.redis import init_redis, close_redis
from app.core.logging import setup_logging
from app.core.responses import AppException
from app.middleware.rate_limit import RateLimitMiddleware, RequestLoggingMiddleware
from app.api.v1.router import api_router
from app.websockets.endpoint import router as ws_router

logger = structlog.get_logger()


# ── Lifespan (replaces on_event startup/shutdown) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger.info("app.starting", version=settings.APP_VERSION, env=settings.APP_ENV)
    await init_db()
    await init_redis()

    # Load AI ETA model (non-blocking — falls back gracefully if model file missing)
    from ai.predictor import predictor
    model_loaded = predictor.load()
    if model_loaded:
        logger.info("ai.eta_model_loaded")
    else:
        logger.warning("ai.eta_model_not_found", hint="Run: python -m ai.train.train_eta")

    logger.info("app.ready")
    yield
    # Shutdown
    logger.info("app.shutting_down")
    await close_db()
    await close_redis()
    logger.info("app.stopped")


# ── App factory ───────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Premium logistics intelligence platform",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # ── Middleware (order matters — outermost runs first) ──────────────────
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Exception handlers ─────────────────────────────────────────────────
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "message": exc.message, "data": None},
        )

    @app.exception_handler(JWTError)
    async def jwt_exception_handler(request: Request, exc: JWTError):
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": "Invalid or expired token", "data": None},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("unhandled_exception", error=str(exc), path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Internal server error", "data": None},
        )

    # ── Routers ────────────────────────────────────────────────────────────
    app.include_router(api_router, prefix=settings.API_PREFIX)
    app.include_router(ws_router)

    # ── Health check ───────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health_check():
        return {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "env": settings.APP_ENV,
        }

    return app


app = create_app()
