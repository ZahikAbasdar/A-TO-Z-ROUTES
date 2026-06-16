from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.analytics_service import AnalyticsService
from app.api.v1.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return AnalyticsService(db=db, cache=RedisCache(redis))

@router.get("/performance", response_model=APIResponse)
async def delivery_performance(
    days: int = Query(30, ge=7, le=90),
    user: User = Depends(get_current_user),
    svc: AnalyticsService = Depends(_svc),
):
    data = await svc.get_delivery_performance(user, days)
    return success_response(data=data)

@router.get("/ping")
async def ping():
    return {"module": "analytics", "status": "ready"}
