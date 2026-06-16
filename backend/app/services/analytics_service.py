from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, case, and_
from datetime import datetime, timezone, timedelta
from typing import List
import structlog

from app.models.shipment import Shipment
from app.models.user import User
from app.core.redis import RedisCache

logger = structlog.get_logger()


class AnalyticsService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    async def get_delivery_performance(self, user: User, days: int = 30) -> dict:
        cache_key = f"analytics:perf:{user.id}:{days}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        since = datetime.now(timezone.utc) - timedelta(days=days)
        base  = and_(Shipment.deleted_at.is_(None), Shipment.created_at >= since)
        if not user.is_admin:
            base = and_(base, Shipment.user_id == user.id)

        # Daily delivery rate
        rows = await self.db.execute(
            select(
                func.date_trunc("day", Shipment.created_at).label("day"),
                func.count().label("total"),
                func.sum(case((Shipment.status == "delivered", 1), else_=0)).label("delivered"),
                func.sum(case((Shipment.status == "failed",    1), else_=0)).label("failed"),
                func.sum(case((Shipment.status == "in_transit",1), else_=0)).label("in_transit"),
            )
            .where(base)
            .group_by("day")
            .order_by("day")
        )
        daily = [
            {
                "date":      r.day.strftime("%Y-%m-%d"),
                "total":     r.total,
                "delivered": r.delivered,
                "failed":    r.failed,
                "in_transit":r.in_transit,
            }
            for r in rows
        ]

        # Status distribution
        status_rows = await self.db.execute(
            select(Shipment.status, func.count().label("cnt"))
            .where(base).group_by(Shipment.status)
        )
        status_dist = [{"status": r.status, "count": r.cnt} for r in status_rows]

        # Carrier performance
        carrier_rows = await self.db.execute(
            select(
                Shipment.carrier,
                func.count().label("total"),
                func.sum(case((Shipment.status == "delivered", 1), else_=0)).label("delivered"),
                func.avg(
                    func.extract("epoch", Shipment.actual_delivery - Shipment.created_at) / 86400
                ).label("avg_days"),
            )
            .where(base)
            .group_by(Shipment.carrier)
            .order_by(desc("total"))
        )
        carrier_perf = [
            {
                "carrier":   r.carrier,
                "total":     r.total,
                "delivered": r.delivered,
                "success_rate": round(r.delivered / r.total * 100, 1) if r.total else 0,
                "avg_delivery_days": round(float(r.avg_days or 0), 1),
            }
            for r in carrier_rows
        ]

        # Delay risk distribution
        risk_rows = await self.db.execute(
            select(Shipment.delay_risk, func.count().label("cnt"))
            .where(base).group_by(Shipment.delay_risk)
        )
        risk_dist = {r.delay_risk: r.cnt for r in risk_rows}

        # Hour-of-day pattern (when shipments are created)
        hour_rows = await self.db.execute(
            select(
                func.extract("hour", Shipment.created_at).label("hour"),
                func.count().label("cnt"),
            )
            .where(base).group_by("hour").order_by("hour")
        )
        hour_pattern = [{"hour": int(r.hour), "count": r.cnt} for r in hour_rows]

        result = {
            "daily":         daily,
            "status_dist":   status_dist,
            "carrier_perf":  carrier_perf,
            "risk_dist":     risk_dist,
            "hour_pattern":  hour_pattern,
            "period_days":   days,
        }
        await self.cache.set(cache_key, result, expire=300)
        return result
