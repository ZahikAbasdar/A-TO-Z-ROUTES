from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.tracking_service import TrackingService
from app.api.v1.dependencies import get_current_user, require_admin_or_driver
from app.models.user import User
from pydantic import BaseModel

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)) -> TrackingService:
    return TrackingService(db=db, cache=RedisCache(redis))


class AddEventRequest(BaseModel):
    status: str
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    driver_id: Optional[uuid.UUID] = None


# ── Public — no auth ──────────────────────────────────────────────────────────
@router.get("/public/{tracking_number}", response_model=APIResponse)
async def public_track(tracking_number: str, svc: TrackingService = Depends(_svc)):
    data = await svc.track_by_number(tracking_number)
    return success_response(data=data)


# ── Authenticated full detail ─────────────────────────────────────────────────
@router.get("/{shipment_id}", response_model=APIResponse)
async def get_tracking_detail(
    shipment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    svc: TrackingService = Depends(_svc),
):
    data = await svc.get_tracking_detail(shipment_id, user)
    return success_response(data=data)


# ── List all events ───────────────────────────────────────────────────────────
@router.get("/{shipment_id}/events", response_model=APIResponse)
async def list_events(
    shipment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    svc: TrackingService = Depends(_svc),
):
    events = await svc.list_events(shipment_id, user)
    return success_response(data=[
        {
            "id": str(e.id),
            "status": e.status,
            "description": e.description,
            "location_name": e.location_name,
            "latitude": float(e.latitude) if e.latitude else None,
            "longitude": float(e.longitude) if e.longitude else None,
            "occurred_at": e.occurred_at.isoformat(),
        }
        for e in events
    ])


# ── Add event (driver / admin) ────────────────────────────────────────────────
@router.post("/{shipment_id}/events", response_model=APIResponse)
async def add_event(
    shipment_id: uuid.UUID,
    data: AddEventRequest,
    user: User = Depends(get_current_user),
    svc: TrackingService = Depends(_svc),
):
    event = await svc.add_event(
        shipment_id=shipment_id,
        status=data.status,
        description=data.description,
        latitude=data.latitude,
        longitude=data.longitude,
        location_name=data.location_name,
        driver_id=data.driver_id,
        user=user,
    )
    return success_response(
        data={"id": str(event.id), "status": event.status, "occurred_at": event.occurred_at.isoformat()},
        message="Tracking event added",
    )


@router.get("/ping")
async def ping():
    return {"module": "tracking", "status": "ready"}


# ── Route GeoJSON ─────────────────────────────────────────────────────────────
from app.services.route_service import RouteService

@router.get("/{shipment_id}/route", response_model=APIResponse)
async def get_route_geojson(
    shipment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = RouteService(db=db)
    geojson = await svc.get_shipment_route_geojson(shipment_id, user)
    return success_response(data=geojson)
