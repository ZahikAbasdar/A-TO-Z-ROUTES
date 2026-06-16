from fastapi import APIRouter
from app.api.v1 import (
    auth,
    shipments,
    tracking,
    drivers,
    analytics,
    notifications,
    admin,
    eta,
)

api_router = APIRouter()

api_router.include_router(auth.router,          prefix="/auth",          tags=["Authentication"])
api_router.include_router(shipments.router,     prefix="/shipments",     tags=["Shipments"])
api_router.include_router(tracking.router,      prefix="/tracking",      tags=["Tracking"])
api_router.include_router(drivers.router,       prefix="/drivers",       tags=["Drivers"])
api_router.include_router(analytics.router,     prefix="/analytics",     tags=["Analytics"])
api_router.include_router(notifications.router, prefix="/notifications",  tags=["Notifications"])
api_router.include_router(admin.router,         prefix="/admin",         tags=["Admin"])
api_router.include_router(eta.router,           prefix="/eta",           tags=["AI ETA"])
