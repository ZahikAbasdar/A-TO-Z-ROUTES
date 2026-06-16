from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
import uuid
import structlog

from app.models.shipment import Shipment, TrackingEvent
from app.models.user import User
from app.core.responses import NotFoundException, ForbiddenException
from app.core.redis import RedisCache
from ai.delay_predictor import compute_delay_risk, batch_compute_delay_risk

logger = structlog.get_logger()


class DelayService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    async def predict_delay(
        self, shipment_id: uuid.UUID, user: User
    ) -> dict:
        cache_key = f"delay:{shipment_id}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
            )
            .where(Shipment.id == shipment_id, Shipment.deleted_at.is_(None))
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        data    = self._build_input(shipment)
        outcome = compute_delay_risk(data)

        # Persist updated delay_risk back to shipment
        old_risk = shipment.delay_risk
        shipment.delay_risk = outcome["risk_level"]
        self.db.add(shipment)

        # Clear related caches
        if old_risk != outcome["risk_level"]:
            await self.cache.delete(f"shipment:{shipment_id}")
            await self.cache.delete(f"dashboard:stats:{shipment.user_id}")

        result_dict = {
            "shipment_id":     str(shipment_id),
            "tracking_number": shipment.tracking_number,
            **outcome,
        }
        await self.cache.set(cache_key, result_dict, expire=300)
        return result_dict

    async def bulk_predict_delay(self, user: User, limit: int = 100) -> List[dict]:
        if user.is_admin:
            q_filter = Shipment.deleted_at.is_(None)
        else:
            q_filter = (Shipment.user_id == user.id) & Shipment.deleted_at.is_(None)

        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
            )
            .where(q_filter, Shipment.status.notin_(["delivered","failed","returned"]))
            .limit(limit)
        )
        shipments = result.scalars().all()
        if not shipments:
            return []

        records  = [self._build_input(s) for s in shipments]
        outcomes = batch_compute_delay_risk(records)

        results = []
        for shipment, outcome in zip(shipments, outcomes):
            shipment.delay_risk = outcome["risk_level"]
            self.db.add(shipment)
            results.append({
                "shipment_id":     str(shipment.id),
                "tracking_number": shipment.tracking_number,
                **outcome,
            })

        logger.info("delay.bulk_predicted", count=len(results))
        return results

    def _build_input(self, shipment: Shipment) -> dict:
        events = sorted(
            shipment.tracking_events or [],
            key=lambda e: e.occurred_at,
            reverse=True,
        )
        last_event_at = events[0].occurred_at.isoformat() if events else None

        origin = shipment.origin_warehouse
        dest   = shipment.dest_warehouse

        # Compute haversine if both warehouses exist
        distance_km = 0.0
        if origin and dest:
            from ai.features import haversine_km
            distance_km = haversine_km(
                float(origin.latitude),  float(origin.longitude),
                float(dest.latitude),    float(dest.longitude),
            )

        return {
            "carrier":            shipment.carrier,
            "service_type":       shipment.service_type or "standard",
            "weight_kg":          float(shipment.weight_kg) if shipment.weight_kg else 1.0,
            "status":             shipment.status,
            "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
            "created_at":         shipment.created_at.isoformat() if shipment.created_at else None,
            "last_event_at":      last_event_at,
            "distance_km":        distance_km,
        }
