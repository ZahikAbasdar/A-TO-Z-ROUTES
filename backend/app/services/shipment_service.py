from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc, case
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple
import uuid
import structlog

from app.models.shipment import Shipment, TrackingEvent, Warehouse
from app.models.user import User
from app.schemas.shipment import (
    CreateShipmentRequest, UpdateShipmentRequest,
    DashboardStatsSchema, ShipmentTrendSchema, CarrierBreakdownSchema,
)
from app.core.responses import NotFoundException, ConflictException, ForbiddenException
from app.core.redis import RedisCache, CacheKeys

logger = structlog.get_logger()


class ShipmentService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    # ── Create ────────────────────────────────────────────────────────────────
    async def create_shipment(self, data: CreateShipmentRequest, user: User) -> Shipment:
        # Check tracking number uniqueness
        existing = await self.db.execute(
            select(Shipment).where(Shipment.tracking_number == data.tracking_number)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"Tracking number {data.tracking_number} already exists")

        shipment = Shipment(
            tracking_number=data.tracking_number,
            user_id=user.id,
            carrier=data.carrier,
            description=data.description,
            weight_kg=data.weight_kg,
            service_type=data.service_type,
            origin_warehouse_id=data.origin_warehouse_id,
            dest_warehouse_id=data.dest_warehouse_id,
            status="pending",
        )
        self.db.add(shipment)
        await self.db.flush()

        # Initial tracking event
        event = TrackingEvent(
            shipment_id=shipment.id,
            status="pending",
            description="Shipment registered on A to Z Routes",
        )
        self.db.add(event)

        await self.cache.delete(CacheKeys.shipment_list(str(user.id)))
        logger.info("shipment.created", id=str(shipment.id), tracking=data.tracking_number)
        return shipment

    # ── List (user's own) ─────────────────────────────────────────────────────
    async def list_shipments(
        self,
        user: User,
        page: int = 1,
        per_page: int = 20,
        status: Optional[str] = None,
        carrier: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Shipment], int]:
        query = (
            select(Shipment)
            .options(selectinload(Shipment.origin_warehouse), selectinload(Shipment.dest_warehouse))
            .where(Shipment.user_id == user.id, Shipment.deleted_at.is_(None))
        )
        if status:
            query = query.where(Shipment.status == status)
        if carrier:
            query = query.where(Shipment.carrier == carrier)
        if search:
            query = query.where(Shipment.tracking_number.ilike(f"%{search}%"))

        count_q = select(func.count()).select_from(query.subquery())
        total   = (await self.db.execute(count_q)).scalar_one()

        query   = query.order_by(desc(Shipment.created_at)).offset((page - 1) * per_page).limit(per_page)
        result  = await self.db.execute(query)
        return result.scalars().all(), total

    # ── Get single ────────────────────────────────────────────────────────────
    async def get_shipment(self, shipment_id: uuid.UUID, user: User) -> Shipment:
        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.tracking_events),
                selectinload(Shipment.driver),
            )
            .where(Shipment.id == shipment_id, Shipment.deleted_at.is_(None))
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        # Non-admins can only see their own
        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        return shipment

    # ── Update ────────────────────────────────────────────────────────────────
    async def update_shipment(
        self, shipment_id: uuid.UUID, data: UpdateShipmentRequest, user: User
    ) -> Shipment:
        shipment = await self.get_shipment(shipment_id, user)
        old_status = shipment.status

        if data.status:
            shipment.status = data.status
        if data.description:
            shipment.description = data.description
        if data.estimated_delivery:
            shipment.estimated_delivery = data.estimated_delivery
        if data.driver_id and user.is_admin:
            shipment.driver_id = data.driver_id

        # Auto-set actual_delivery when delivered
        if data.status == "delivered" and not shipment.actual_delivery:
            shipment.actual_delivery = datetime.now(timezone.utc)

        # Add tracking event on status change
        if data.status and data.status != old_status:
            event = TrackingEvent(
                shipment_id=shipment.id,
                status=data.status,
                description=self._status_description(data.status),
            )
            self.db.add(event)

        await self.cache.delete(CacheKeys.shipment(str(shipment_id)))
        await self.cache.delete(CacheKeys.shipment_list(str(user.id)))
        return shipment

    # ── Soft delete ───────────────────────────────────────────────────────────
    async def delete_shipment(self, shipment_id: uuid.UUID, user: User) -> None:
        shipment = await self.get_shipment(shipment_id, user)
        shipment.deleted_at = datetime.now(timezone.utc)
        await self.cache.delete(CacheKeys.shipment(str(shipment_id)))
        await self.cache.delete(CacheKeys.shipment_list(str(user.id)))

    # ── Dashboard stats ───────────────────────────────────────────────────────
    async def get_dashboard_stats(self, user: User) -> DashboardStatsSchema:
        cache_key = f"dashboard:stats:{user.id}"
        cached = await self.cache.get(cache_key)
        if cached:
            return DashboardStatsSchema(**cached)

        base = and_(Shipment.user_id == user.id, Shipment.deleted_at.is_(None))
        if user.is_admin:
            base = Shipment.deleted_at.is_(None)

        # Status counts
        counts = await self.db.execute(
            select(Shipment.status, func.count().label("cnt"))
            .where(base)
            .group_by(Shipment.status)
        )
        status_map = {row.status: row.cnt for row in counts}
        total = sum(status_map.values())

        # On-time rate (delivered before estimated)
        on_time_q = await self.db.execute(
            select(func.count())
            .where(
                base,
                Shipment.status == "delivered",
                Shipment.actual_delivery <= Shipment.estimated_delivery,
                Shipment.estimated_delivery.isnot(None),
            )
        )
        on_time_count = on_time_q.scalar_one()
        delivered_total = status_map.get("delivered", 0)
        on_time_rate = (on_time_count / delivered_total * 100) if delivered_total > 0 else 0

        # Avg delivery days
        avg_q = await self.db.execute(
            select(
                func.avg(
                    func.extract("epoch", Shipment.actual_delivery - Shipment.created_at) / 86400
                )
            ).where(base, Shipment.status == "delivered", Shipment.actual_delivery.isnot(None))
        )
        avg_days = float(avg_q.scalar_one() or 0)

        # Delay risk distribution
        risk_q = await self.db.execute(
            select(Shipment.delay_risk, func.count().label("cnt"))
            .where(base)
            .group_by(Shipment.delay_risk)
        )
        risk_map = {row.delay_risk: row.cnt for row in risk_q}

        stats = DashboardStatsSchema(
            total_shipments=total,
            in_transit=status_map.get("in_transit", 0) + status_map.get("out_for_delivery", 0) + status_map.get("picked_up", 0),
            delivered=status_map.get("delivered", 0),
            pending=status_map.get("pending", 0),
            failed=status_map.get("failed", 0) + status_map.get("returned", 0),
            on_time_rate=round(on_time_rate, 1),
            avg_delivery_days=round(avg_days, 1),
            delay_risk_distribution=risk_map,
        )
        await self.cache.set(cache_key, stats.model_dump(), expire=120)
        return stats

    # ── 30-day trend ──────────────────────────────────────────────────────────
    async def get_shipment_trends(self, user: User, days: int = 30) -> List[ShipmentTrendSchema]:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        base  = and_(Shipment.user_id == user.id, Shipment.created_at >= since, Shipment.deleted_at.is_(None))
        if user.is_admin:
            base = and_(Shipment.created_at >= since, Shipment.deleted_at.is_(None))

        result = await self.db.execute(
            select(
                func.date_trunc("day", Shipment.created_at).label("day"),
                func.count().label("created"),
                func.sum(case((Shipment.status == "delivered", 1), else_=0)).label("delivered"),
                func.sum(case((Shipment.status == "failed",    1), else_=0)).label("failed"),
            )
            .where(base)
            .group_by("day")
            .order_by("day")
        )
        return [
            ShipmentTrendSchema(
                date=row.day.strftime("%Y-%m-%d"),
                created=row.created,
                delivered=row.delivered,
                failed=row.failed,
            )
            for row in result
        ]

    # ── Carrier breakdown ─────────────────────────────────────────────────────
    async def get_carrier_breakdown(self, user: User) -> List[CarrierBreakdownSchema]:
        base = and_(Shipment.user_id == user.id, Shipment.deleted_at.is_(None))
        if user.is_admin:
            base = Shipment.deleted_at.is_(None)

        result = await self.db.execute(
            select(Shipment.carrier, func.count().label("cnt"))
            .where(base)
            .group_by(Shipment.carrier)
            .order_by(desc("cnt"))
        )
        rows  = result.all()
        total = sum(r.cnt for r in rows)
        return [
            CarrierBreakdownSchema(
                carrier=r.carrier,
                count=r.cnt,
                percentage=round(r.cnt / total * 100, 1) if total > 0 else 0,
            )
            for r in rows
        ]

    def _status_description(self, status: str) -> str:
        descriptions = {
            "picked_up":        "Package has been picked up",
            "in_transit":       "Package is in transit",
            "out_for_delivery": "Package is out for delivery",
            "delivered":        "Package has been delivered",
            "failed":           "Delivery attempt failed",
            "returned":         "Package is being returned",
        }
        return descriptions.get(status, f"Status updated to {status}")
