from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.core.database import get_db
from app.core.redis import get_redis, RedisCache
from app.core.responses import success_response, APIResponse
from app.services.eta_service import ETAService
from app.api.v1.dependencies import get_current_user, require_admin
from app.models.user import User
from ai.predictor import predictor

router = APIRouter()

def _svc(db: AsyncSession = Depends(get_db), redis=Depends(get_redis)):
    return ETAService(db=db, cache=RedisCache(redis))

@router.get("/model-info", response_model=APIResponse)
async def model_info(_: User = Depends(require_admin)):
    return success_response(data=predictor.get_model_info())

@router.post("/{shipment_id}/predict", response_model=APIResponse)
async def predict_eta(
    shipment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    svc: ETAService = Depends(_svc),
):
    result = await svc.predict_and_save(shipment_id, user)
    return success_response(data=result, message="ETA predicted")

@router.post("/bulk-predict", response_model=APIResponse)
async def bulk_predict(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    svc: ETAService = Depends(_svc),
):
    results = await svc.bulk_predict(user, limit)
    return success_response(data=results, message=f"Predicted ETA for {len(results)} shipments")
