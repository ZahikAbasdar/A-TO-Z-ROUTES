from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid
from pydantic import BaseModel

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.driver_service import DriverService
from app.schemas.shipment import ShipmentSchema
from app.api.v1.dependencies import get_current_user, require_driver
from app.models.user import User

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return DriverService(db=db, cache=RedisCache(redis))

class LocationUpdate(BaseModel):
    lat: float
    lng: float
    shipment_id: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str
    description: Optional[str] = None
    location_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

@router.get("/me/stats", response_model=APIResponse)
async def driver_stats(user: User = Depends(require_driver), svc: DriverService = Depends(_svc)):
    stats = await svc.get_driver_stats(user)
    return success_response(data=stats)

@router.get("/me/active", response_model=APIResponse)
async def active_deliveries(user: User = Depends(require_driver), svc: DriverService = Depends(_svc)):
    shipments = await svc.get_active_deliveries(user)
    return success_response(data=[ShipmentSchema.model_validate(s) for s in shipments])

@router.get("/me/shipments", response_model=APIResponse)
async def assigned_shipments(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_driver), svc: DriverService = Depends(_svc),
):
    shipments, total = await svc.get_assigned_shipments(user, page, per_page)
    return {"success": True, "message": "OK",
            "data": [ShipmentSchema.model_validate(s) for s in shipments],
            "total": total, "page": page, "per_page": per_page}

@router.post("/me/location", response_model=APIResponse)
async def update_location(data: LocationUpdate, user: User = Depends(require_driver), svc: DriverService = Depends(_svc)):
    await svc.update_location(user, data.lat, data.lng, data.shipment_id)
    return success_response(message="Location updated")

@router.post("/me/shipments/{shipment_id}/status", response_model=APIResponse[ShipmentSchema])
async def update_status(
    shipment_id: uuid.UUID, data: StatusUpdate,
    user: User = Depends(require_driver), svc: DriverService = Depends(_svc),
):
    shipment = await svc.update_delivery_status(
        user, shipment_id, data.status, data.description,
        data.location_name, data.lat, data.lng,
    )
    return success_response(data=ShipmentSchema.model_validate(shipment), message="Status updated")

@router.get("/ping")
async def ping():
    return {"module": "drivers", "status": "ready"}
