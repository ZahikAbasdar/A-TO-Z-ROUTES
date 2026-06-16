from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import structlog

from app.models.shipment import Shipment, TrackingEvent
from app.models.user import User
from app.core.responses import NotFoundException, ForbiddenException
from app.core.redis import RedisCache
from ai.predictor import predictor, ETAPrediction

logger = structlog.get_logger()


class ETAService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    async def predict_and_save(
        self, shipment_id: uuid.UUID, user: User
    ) -> dict:
        """
        Run ETA prediction for a shipment and persist results to DB.
        Returns prediction dict.
        """
        cache_key = f"eta:{shipment_id}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        # Load shipment with related data
        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.tracking_events),
            )
            .where(Shipment.id == shipment_id, Shipment.deleted_at.is_(None))
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        # Don't predict for already-delivered/failed shipments
        if shipment.status in ("delivered", "failed", "returned"):
            return {
                "shipment_id":    str(shipment_id),
                "status":         shipment.status,
                "eta":            shipment.actual_delivery.isoformat() if shipment.actual_delivery else None,
                "confidence":     100.0 if shipment.status == "delivered" else None,
                "remaining_days": 0,
                "model_version":  "n/a",
                "message":        f"Shipment already {shipment.status}",
            }

        shipment_data = self._build_input(shipment)
        prediction: ETAPrediction = predictor.predict(shipment_data)

        # Persist to DB
        shipment.ai_eta        = prediction.eta_datetime
        shipment.ai_confidence = prediction.confidence
        self.db.add(shipment)

        result_dict = {
            "shipment_id":    str(shipment_id),
            "tracking_number":shipment.tracking_number,
            "status":         shipment.status,
            "eta":            prediction.eta_datetime.isoformat(),
            "remaining_days": prediction.remaining_days,
            "confidence":     prediction.confidence,
            "model_version":  prediction.model_version,
            "delay_risk":     shipment.delay_risk,
            "features_used":  prediction.features_used,
        }

        await self.cache.set(cache_key, result_dict, expire=300)
        logger.info(
            "eta.predicted",
            shipment_id=str(shipment_id),
            eta=prediction.eta_datetime.isoformat(),
            confidence=prediction.confidence,
        )
        return result_dict

    async def bulk_predict(self, user: User, limit: int = 50) -> List[dict]:
        """
        Run ETA prediction for all active shipments of a user.
        Efficient batch inference.
        """
        if user.is_admin:
            query_filter = Shipment.deleted_at.is_(None)
        else:
            query_filter = (Shipment.user_id == user.id) & Shipment.deleted_at.is_(None)

        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.tracking_events),
            )
            .where(
                query_filter,
                Shipment.status.notin_(["delivered", "failed", "returned"]),
            )
            .limit(limit)
        )
        shipments = result.scalars().all()

        if not shipments:
            return []

        records = [self._build_input(s) for s in shipments]
        predictions = predictor.predict_batch(records)

        results = []
        for shipment, pred in zip(shipments, predictions):
            shipment.ai_eta        = pred.eta_datetime
            shipment.ai_confidence = pred.confidence
            self.db.add(shipment)
            results.append({
                "shipment_id":     str(shipment.id),
                "tracking_number": shipment.tracking_number,
                "eta":             pred.eta_datetime.isoformat(),
                "remaining_days":  pred.remaining_days,
                "confidence":      pred.confidence,
                "model_version":   pred.model_version,
            })

        logger.info("eta.bulk_predicted", count=len(results))
        return results

    def _build_input(self, shipment: Shipment) -> dict:
        origin = shipment.origin_warehouse
        dest   = shipment.dest_warehouse
        events = shipment.tracking_events or []

        return {
            "carrier":      shipment.carrier,
            "service_type": shipment.service_type or "standard",
            "weight_kg":    float(shipment.weight_kg) if shipment.weight_kg else 1.0,
            "status":       shipment.status,
            "delay_risk":   shipment.delay_risk,
            "created_at":   shipment.created_at.isoformat() if shipment.created_at else None,
            "event_count":  len(events),
            "origin_warehouse": {
                "latitude":  float(origin.latitude)  if origin else None,
                "longitude": float(origin.longitude) if origin else None,
            } if origin else None,
            "dest_warehouse": {
                "latitude":  float(dest.latitude)  if dest else None,
                "longitude": float(dest.longitude) if dest else None,
            } if dest else None,
        }
