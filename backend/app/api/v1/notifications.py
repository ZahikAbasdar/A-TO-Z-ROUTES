from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from pydantic import BaseModel
from typing import Optional
import math

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.notification_service import NotificationService
from app.services.delay_service import DelayService
from app.api.v1.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

def _nsvc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return NotificationService(db=db, cache=RedisCache(redis))

def _dsvc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return DelayService(db=db, cache=RedisCache(redis))

# ── Notifications ─────────────────────────────────────────────────────────────
@router.get("", response_model=APIResponse)
async def list_notifications(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    user: User = Depends(get_current_user), svc: NotificationService = Depends(_nsvc),
):
    notifs, total, unread = await svc.list_notifications(user, page, per_page, unread_only)
    return {
        "success": True, "message": "OK",
        "data": [{
            "id": str(n.id), "title": n.title, "body": n.body,
            "type": n.type, "channel": n.channel, "is_read": n.is_read,
            "shipment_id": str(n.shipment_id) if n.shipment_id else None,
            "created_at": n.created_at.isoformat(),
        } for n in notifs],
        "total": total, "unread_count": unread,
        "page": page, "per_page": per_page, "pages": math.ceil(total/per_page),
    }

@router.post("/{notification_id}/read", response_model=APIResponse)
async def mark_read(notification_id: uuid.UUID, user: User = Depends(get_current_user), svc: NotificationService = Depends(_nsvc)):
    await svc.mark_read(notification_id, user)
    return success_response(message="Marked as read")

@router.post("/read-all", response_model=APIResponse)
async def mark_all_read(user: User = Depends(get_current_user), svc: NotificationService = Depends(_nsvc)):
    count = await svc.mark_all_read(user)
    return success_response(data={"updated": count}, message=f"Marked {count} notifications as read")

@router.delete("/{notification_id}", response_model=APIResponse)
async def delete_notification(notification_id: uuid.UUID, user: User = Depends(get_current_user), svc: NotificationService = Depends(_nsvc)):
    await svc.delete_notification(notification_id, user)
    return success_response(message="Notification deleted")

# ── Delay prediction ──────────────────────────────────────────────────────────
@router.post("/delay/{shipment_id}/predict", response_model=APIResponse)
async def predict_delay(shipment_id: uuid.UUID, user: User = Depends(get_current_user), svc: DelayService = Depends(_dsvc)):
    result = await svc.predict_delay(shipment_id, user)
    return success_response(data=result, message="Delay risk assessed")

@router.post("/delay/bulk-predict", response_model=APIResponse)
async def bulk_predict_delay(limit: int = Query(100, ge=1, le=500), user: User = Depends(get_current_user), svc: DelayService = Depends(_dsvc)):
    results = await svc.bulk_predict_delay(user, limit)
    return success_response(data=results, message=f"Assessed {len(results)} shipments")

@router.get("/ping")
async def ping():
    return {"module": "notifications", "status": "ready"}
