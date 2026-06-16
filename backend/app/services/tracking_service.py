from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import structlog

from app.models.shipment import Shipment, TrackingEvent, Warehouse
from app.models.driver import Driver
from app.models.user import User
from app.core.responses import NotFoundException, ForbiddenException
from app.core.redis import RedisCache, CacheKeys

logger = structlog.get_logger()

# Status progression order for timeline display
STATUS_ORDER = [
    "pending",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
]

FAILED_STATUSES = {"failed", "returned"}


class TrackingService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    # ── Public tracking by tracking number ───────────────────────────────────
    async def track_by_number(self, tracking_number: str) -> dict:
        """Public endpoint — no auth required. Returns safe tracking info."""
        cached = await self.cache.get(f"track:public:{tracking_number}")
        if cached:
            return cached

        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
            )
            .where(
                Shipment.tracking_number == tracking_number.upper().strip(),
                Shipment.deleted_at.is_(None),
            )
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Tracking number not found")

        data = self._build_public_tracking(shipment)
        await self.cache.set(f"track:public:{tracking_number}", data, expire=60)
        return data

    # ── Full tracking detail (authenticated) ──────────────────────────────────
    async def get_tracking_detail(
        self, shipment_id: uuid.UUID, user: User
    ) -> dict:
        cached = await self.cache.get(CacheKeys.tracking_events(str(shipment_id)))
        if cached:
            return cached

        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.driver),
            )
            .where(Shipment.id == shipment_id, Shipment.deleted_at.is_(None))
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        data = self._build_full_tracking(shipment)
        await self.cache.set(
            CacheKeys.tracking_events(str(shipment_id)), data, expire=30
        )
        return data

    # ── Add tracking event (driver / admin) ───────────────────────────────────
    async def add_event(
        self,
        shipment_id: uuid.UUID,
        status: str,
        description: Optional[str],
        latitude: Optional[float],
        longitude: Optional[float],
        location_name: Optional[str],
        driver_id: Optional[uuid.UUID],
        user: User,
    ) -> TrackingEvent:
        result = await self.db.execute(
            select(Shipment).where(
                Shipment.id == shipment_id, Shipment.deleted_at.is_(None)
            )
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        # Only admin or assigned driver can add events
        if not user.is_admin:
            if not user.is_driver:
                raise ForbiddenException("Only drivers and admins can add tracking events")
            # Verify driver is assigned to this shipment
            driver_result = await self.db.execute(
                select(Driver).where(Driver.user_id == user.id)
            )
            driver = driver_result.scalar_one_or_none()
            if not driver or shipment.driver_id != driver.id:
                raise ForbiddenException("You are not assigned to this shipment")

        event = TrackingEvent(
            shipment_id=shipment_id,
            driver_id=driver_id,
            status=status,
            description=description,
            latitude=latitude,
            longitude=longitude,
            location_name=location_name,
        )
        self.db.add(event)

        # Update shipment status if it's a progression
        if status in STATUS_ORDER or status in FAILED_STATUSES:
            shipment.status = status
            if status == "delivered":
                shipment.actual_delivery = datetime.now(timezone.utc)

        # Invalidate caches
        await self.cache.delete(CacheKeys.tracking_events(str(shipment_id)))
        await self.cache.delete(CacheKeys.shipment(str(shipment_id)))

        # Broadcast real-time update to all subscribers
        from app.websockets.manager import manager
        await manager.emit_tracking_update(
            shipment_id=str(shipment_id),
            status=status,
            description=description,
            location_name=location_name,
            latitude=latitude,
            longitude=longitude,
        )
        # Notify shipment owner
        await manager.emit_notification(
            user_id=str(shipment.user_id),
            title=f"Shipment {self._status_description(status)}",
            body=f"Tracking #{shipment.tracking_number}",
            shipment_id=str(shipment_id),
        )

        logger.info("tracking.event_added", shipment_id=str(shipment_id), status=status)
        return event

    # ── List all events for a shipment ────────────────────────────────────────
    async def list_events(
        self, shipment_id: uuid.UUID, user: User
    ) -> List[TrackingEvent]:
        # Verify access
        shipment_result = await self.db.execute(
            select(Shipment).where(
                Shipment.id == shipment_id, Shipment.deleted_at.is_(None)
            )
        )
        shipment = shipment_result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        result = await self.db.execute(
            select(TrackingEvent)
            .where(TrackingEvent.shipment_id == shipment_id)
            .order_by(desc(TrackingEvent.occurred_at))
        )
        return result.scalars().all()

    # ── Timeline builder ──────────────────────────────────────────────────────
    def _build_timeline(self, shipment: Shipment) -> list:
        """
        Builds an ordered timeline merging the standard status progression
        with actual tracking events. Each step has: status, label, done,
        active, timestamp, description, location.
        """
        events_by_status: dict = {}
        for event in sorted(
            shipment.tracking_events or [],
            key=lambda e: e.occurred_at
        ):
            events_by_status[event.status] = event

        current_status = shipment.status
        is_failed = current_status in FAILED_STATUSES

        timeline = []

        if is_failed:
            # Show progression up to last known good status, then failure
            for step_status in STATUS_ORDER:
                event = events_by_status.get(step_status)
                done  = step_status in events_by_status
                timeline.append(self._timeline_step(step_status, event, done=done, active=False))

            # Add the failure event
            fail_event = events_by_status.get(current_status)
            timeline.append(
                self._timeline_step(current_status, fail_event, done=True, active=True, is_failure=True)
            )
        else:
            current_idx = STATUS_ORDER.index(current_status) if current_status in STATUS_ORDER else 0
            for i, step_status in enumerate(STATUS_ORDER):
                event  = events_by_status.get(step_status)
                done   = i <= current_idx
                active = i == current_idx
                timeline.append(self._timeline_step(step_status, event, done=done, active=active))

        return timeline

    def _timeline_step(
        self,
        status: str,
        event: Optional[TrackingEvent],
        done: bool,
        active: bool,
        is_failure: bool = False,
    ) -> dict:
        labels = {
            "pending":           "Order Registered",
            "picked_up":         "Picked Up",
            "in_transit":        "In Transit",
            "out_for_delivery":  "Out for Delivery",
            "delivered":         "Delivered",
            "failed":            "Delivery Failed",
            "returned":          "Returning to Sender",
        }
        return {
            "status":      status,
            "label":       labels.get(status, status.replace("_", " ").title()),
            "done":        done,
            "active":      active,
            "is_failure":  is_failure,
            "timestamp":   event.occurred_at.isoformat() if event else None,
            "description": event.description if event else None,
            "location":    event.location_name if event else None,
            "latitude":    float(event.latitude) if event and event.latitude else None,
            "longitude":   float(event.longitude) if event and event.longitude else None,
        }

    def _build_public_tracking(self, shipment: Shipment) -> dict:
        return {
            "tracking_number": shipment.tracking_number,
            "carrier":         shipment.carrier,
            "status":          shipment.status,
            "origin":          shipment.origin_warehouse.city if shipment.origin_warehouse else None,
            "destination":     shipment.dest_warehouse.city if shipment.dest_warehouse else None,
            "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
            "ai_eta":          shipment.ai_eta.isoformat() if shipment.ai_eta else None,
            "delay_risk":      shipment.delay_risk,
            "timeline":        self._build_timeline(shipment),
        }

    def _build_full_tracking(self, shipment: Shipment) -> dict:
        base = self._build_public_tracking(shipment)
        base.update({
            "shipment_id":     str(shipment.id),
            "ai_confidence":   float(shipment.ai_confidence) if shipment.ai_confidence else None,
            "actual_delivery": shipment.actual_delivery.isoformat() if shipment.actual_delivery else None,
            "weight_kg":       float(shipment.weight_kg) if shipment.weight_kg else None,
            "service_type":    shipment.service_type,
            "driver": {
                "id":           str(shipment.driver.id),
                "vehicle_type": shipment.driver.vehicle_type,
                "rating":       float(shipment.driver.rating),
                "current_lat":  float(shipment.driver.current_lat) if shipment.driver.current_lat else None,
                "current_lng":  float(shipment.driver.current_lng) if shipment.driver.current_lng else None,
            } if shipment.driver else None,
            "origin_warehouse": {
                "name":      shipment.origin_warehouse.name,
                "city":      shipment.origin_warehouse.city,
                "latitude":  float(shipment.origin_warehouse.latitude),
                "longitude": float(shipment.origin_warehouse.longitude),
            } if shipment.origin_warehouse else None,
            "dest_warehouse": {
                "name":      shipment.dest_warehouse.name,
                "city":      shipment.dest_warehouse.city,
                "latitude":  float(shipment.dest_warehouse.latitude),
                "longitude": float(shipment.dest_warehouse.longitude),
            } if shipment.dest_warehouse else None,
        })
        return base
