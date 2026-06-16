from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid, math

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.schemas.shipment import (
    ShipmentSchema, ShipmentDetailSchema, CreateShipmentRequest,
    UpdateShipmentRequest, DashboardStatsSchema, ShipmentTrendSchema, CarrierBreakdownSchema,
)
from app.services.shipment_service import ShipmentService
from app.api.v1.dependencies import get_current_user, require_admin
from app.models.user import User

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)) -> ShipmentService:
    return ShipmentService(db=db, cache=RedisCache(redis))

@router.get("/dashboard/stats", response_model=APIResponse[DashboardStatsSchema])
async def dashboard_stats(user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    stats = await svc.get_dashboard_stats(user)
    return success_response(data=stats)

@router.get("/dashboard/trends", response_model=APIResponse[list[ShipmentTrendSchema]])
async def dashboard_trends(days: int = Query(30, ge=7, le=90), user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    trends = await svc.get_shipment_trends(user, days=days)
    return success_response(data=trends)

@router.get("/dashboard/carriers", response_model=APIResponse[list[CarrierBreakdownSchema]])
async def carrier_breakdown(user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    data = await svc.get_carrier_breakdown(user)
    return success_response(data=data)

@router.get("", response_model=APIResponse)
async def list_shipments(
    page:    int           = Query(1, ge=1),
    per_page: int          = Query(20, ge=1, le=100),
    status:  Optional[str] = None,
    carrier: Optional[str] = None,
    search:  Optional[str] = None,
    user:    User          = Depends(get_current_user),
    svc:     ShipmentService = Depends(_svc),
):
    shipments, total = await svc.list_shipments(user, page, per_page, status, carrier, search)
    return {
        "success": True, "message": "OK",
        "data":    [ShipmentSchema.model_validate(s) for s in shipments],
        "total":   total, "page": page, "per_page": per_page,
        "pages":   math.ceil(total / per_page),
    }

@router.post("", status_code=status.HTTP_201_CREATED, response_model=APIResponse[ShipmentSchema])
async def create_shipment(data: CreateShipmentRequest, user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    shipment = await svc.create_shipment(data, user)
    return success_response(data=ShipmentSchema.model_validate(shipment), message="Shipment created")

@router.get("/{shipment_id}", response_model=APIResponse[ShipmentDetailSchema])
async def get_shipment(shipment_id: uuid.UUID, user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    shipment = await svc.get_shipment(shipment_id, user)
    return success_response(data=ShipmentDetailSchema.model_validate(shipment))

@router.patch("/{shipment_id}", response_model=APIResponse[ShipmentSchema])
async def update_shipment(shipment_id: uuid.UUID, data: UpdateShipmentRequest, user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    shipment = await svc.update_shipment(shipment_id, data, user)
    return success_response(data=ShipmentSchema.model_validate(shipment), message="Shipment updated")

@router.delete("/{shipment_id}", response_model=APIResponse)
async def delete_shipment(shipment_id: uuid.UUID, user: User = Depends(get_current_user), svc: ShipmentService = Depends(_svc)):
    await svc.delete_shipment(shipment_id, user)
    return success_response(message="Shipment deleted")

@router.get("/ping")
async def ping():
    return {"module": "shipments", "status": "ready"}
