from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import structlog

from app.models.shipment import Shipment, TrackingEvent
from app.models.driver import Driver
from app.models.user import User
from app.core.responses import NotFoundException, ForbiddenException
from app.core.redis import RedisCache, CacheKeys
from app.websockets.manager import manager

logger = structlog.get_logger()


class DriverService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    # ── Get driver profile ────────────────────────────────────────────────────
    async def get_driver_profile(self, user: User) -> Driver:
        result = await self.db.execute(
            select(Driver).where(Driver.user_id == user.id)
        )
        driver = result.scalar_one_or_none()
        if not driver:
            raise NotFoundException("Driver profile")
        return driver

    # ── Active deliveries ─────────────────────────────────────────────────────
    async def get_active_deliveries(self, user: User) -> List[Shipment]:
        driver = await self.get_driver_profile(user)
        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.user),
            )
            .where(
                Shipment.driver_id == driver.id,
                Shipment.status.in_(["picked_up", "in_transit", "out_for_delivery"]),
                Shipment.deleted_at.is_(None),
            )
            .order_by(desc(Shipment.updated_at))
        )
        return result.scalars().all()

    # ── All assigned shipments ────────────────────────────────────────────────
    async def get_assigned_shipments(
        self, user: User, page: int = 1, per_page: int = 20
    ):
        driver = await self.get_driver_profile(user)
        query = (
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
            )
            .where(Shipment.driver_id == driver.id, Shipment.deleted_at.is_(None))
            .order_by(desc(Shipment.created_at))
        )
        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()
        shipments = (await self.db.execute(
            query.offset((page - 1) * per_page).limit(per_page)
        )).scalars().all()
        return shipments, total

    # ── Update GPS location ───────────────────────────────────────────────────
    async def update_location(
        self, user: User, lat: float, lng: float,
        shipment_id: Optional[str] = None,
    ) -> Driver:
        driver = await self.get_driver_profile(user)
        driver.current_lat = lat
        driver.current_lng = lng
        self.db.add(driver)

        await self.cache.set(
            CacheKeys.driver_location(str(driver.id)),
            {"lat": lat, "lng": lng},
            expire=600,
        )

        if shipment_id:
            await manager.emit_driver_location(
                driver_id=str(driver.id),
                shipment_id=shipment_id,
                lat=lat, lng=lng,
            )
        return driver

    # ── Update delivery status ────────────────────────────────────────────────
    async def update_delivery_status(
        self,
        user: User,
        shipment_id: uuid.UUID,
        status: str,
        description: Optional[str] = None,
        location_name: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
    ) -> Shipment:
        driver = await self.get_driver_profile(user)

        result = await self.db.execute(
            select(Shipment).where(
                Shipment.id == shipment_id,
                Shipment.driver_id == driver.id,
                Shipment.deleted_at.is_(None),
            )
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment or not assigned to you")

        valid_transitions = {
            "picked_up":        ["in_transit"],
            "in_transit":       ["out_for_delivery"],
            "out_for_delivery": ["delivered", "failed"],
            "pending":          ["picked_up"],
        }
        allowed = valid_transitions.get(shipment.status, [])
        if status not in allowed:
            raise ForbiddenException(
                f"Cannot transition from '{shipment.status}' to '{status}'"
            )

        shipment.status = status
        if status == "delivered":
            shipment.actual_delivery = datetime.now(timezone.utc)

        event = TrackingEvent(
            shipment_id=shipment.id,
            driver_id=driver.id,
            status=status,
            description=description or self._default_description(status),
            latitude=lat,
            longitude=lng,
            location_name=location_name,
        )
        self.db.add(event)

        await self.cache.delete(CacheKeys.shipment(str(shipment_id)))
        await self.cache.delete(CacheKeys.tracking_events(str(shipment_id)))

        await manager.emit_tracking_update(
            shipment_id=str(shipment_id),
            status=status,
            description=event.description,
            location_name=location_name,
            latitude=lat,
            longitude=lng,
        )
        await manager.emit_notification(
            user_id=str(shipment.user_id),
            title=self._default_description(status),
            body=f"Tracking #{shipment.tracking_number}",
            shipment_id=str(shipment_id),
        )

        logger.info("driver.status_updated", shipment_id=str(shipment_id), status=status)
        return shipment

    # ── Driver stats ──────────────────────────────────────────────────────────
    async def get_driver_stats(self, user: User) -> dict:
        driver = await self.get_driver_profile(user)
        base   = and_(Shipment.driver_id == driver.id, Shipment.deleted_at.is_(None))

        counts = await self.db.execute(
            select(Shipment.status, func.count().label("cnt"))
            .where(base).group_by(Shipment.status)
        )
        status_map = {r.status: r.cnt for r in counts}

        on_time_q = await self.db.execute(
            select(func.count()).where(
                base,
                Shipment.status == "delivered",
                Shipment.actual_delivery <= Shipment.estimated_delivery,
                Shipment.estimated_delivery.isnot(None),
            )
        )
        on_time   = on_time_q.scalar_one()
        delivered = status_map.get("delivered", 0)

        return {
            "total_assigned": sum(status_map.values()),
            "active":         status_map.get("in_transit", 0) + status_map.get("out_for_delivery", 0) + status_map.get("picked_up", 0),
            "delivered":      delivered,
            "failed":         status_map.get("failed", 0),
            "on_time_rate":   round(on_time / delivered * 100, 1) if delivered else 0,
            "rating":         float(driver.rating),
            "status":         driver.status,
            "vehicle_type":   driver.vehicle_type,
        }

    def _default_description(self, status: str) -> str:
        return {
            "picked_up":        "Package picked up by driver",
            "in_transit":       "Package in transit",
            "out_for_delivery": "Out for delivery",
            "delivered":        "Package delivered successfully",
            "failed":           "Delivery attempt failed",
        }.get(status, f"Status: {status}")
