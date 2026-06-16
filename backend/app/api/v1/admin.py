from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid, math
from pydantic import BaseModel

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.admin_service import AdminService
from app.schemas.auth import UserSchema
from app.schemas.shipment import ShipmentSchema
from app.api.v1.dependencies import require_admin
from app.models.user import User
from app.websockets.manager import manager

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return AdminService(db=db, cache=RedisCache(redis))

class AssignDriverRequest(BaseModel):
    driver_id: uuid.UUID

@router.get("/stats", response_model=APIResponse)
async def platform_stats(_: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    return success_response(data=await svc.get_platform_stats())

@router.get("/ws-stats", response_model=APIResponse)
async def ws_stats(_: User = Depends(require_admin)):
    return success_response(data=manager.stats)

@router.get("/users", response_model=APIResponse)
async def list_users(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None, role: Optional[str] = None,
    _: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    users, total = await svc.list_users(page, per_page, search, role)
    return {"success": True, "message": "OK", "data": [UserSchema.model_validate(u) for u in users],
            "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total/per_page)}

@router.post("/users/{user_id}/toggle", response_model=APIResponse[UserSchema])
async def toggle_user(user_id: uuid.UUID, admin: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    user = await svc.toggle_user_active(user_id, admin)
    return success_response(data=UserSchema.model_validate(user))

@router.get("/shipments", response_model=APIResponse)
async def list_shipments(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, search: Optional[str] = None,
    _: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    shipments, total = await svc.list_all_shipments(page, per_page, status, search)
    return {"success": True, "message": "OK", "data": [ShipmentSchema.model_validate(s) for s in shipments],
            "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total/per_page)}

@router.post("/shipments/{shipment_id}/assign-driver", response_model=APIResponse[ShipmentSchema])
async def assign_driver(shipment_id: uuid.UUID, data: AssignDriverRequest,
    _: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    shipment = await svc.assign_driver(shipment_id, data.driver_id)
    return success_response(data=ShipmentSchema.model_validate(shipment))

@router.get("/audit-logs", response_model=APIResponse)
async def audit_logs(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_admin), svc: AdminService = Depends(_svc)):
    logs, total = await svc.get_audit_logs(page, per_page)
    return {"success": True, "message": "OK",
            "data": [{"id": str(l.id), "action": l.action, "user_id": str(l.user_id) if l.user_id else None,
                      "resource_type": l.resource_type, "ip_address": l.ip_address,
                      "created_at": l.created_at.isoformat()} for l in logs],
            "total": total, "page": page, "per_page": per_page}

@router.get("/ping")
async def ping():
    return {"module": "admin", "status": "ready"}
