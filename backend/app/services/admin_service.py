from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple
import uuid
import structlog

from app.models.user import User, Role
from app.models.shipment import Shipment
from app.models.driver import Driver
from app.models.audit import AuditLog
from app.core.responses import NotFoundException
from app.core.redis import RedisCache
from app.websockets.manager import manager

logger = structlog.get_logger()

class AdminService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db = db
        self.cache = cache

    async def get_platform_stats(self) -> dict:
        cached = await self.cache.get("admin:platform_stats")
        if cached:
            return cached
        total_users = (await self.db.execute(select(func.count(User.id)).where(User.deleted_at.is_(None)))).scalar_one()
        status_rows = await self.db.execute(select(Shipment.status, func.count().label("cnt")).where(Shipment.deleted_at.is_(None)).group_by(Shipment.status))
        status_map = {r.status: r.cnt for r in status_rows}
        total_shipments = sum(status_map.values())
        active_drivers = (await self.db.execute(select(func.count(Driver.id)).where(Driver.status.in_(["online","on_delivery"])))).scalar_one()
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        new_24h = (await self.db.execute(select(func.count(Shipment.id)).where(Shipment.created_at >= since, Shipment.deleted_at.is_(None)))).scalar_one()
        delivered = status_map.get("delivered", 0)
        on_time_q = (await self.db.execute(select(func.count(Shipment.id)).where(Shipment.status=="delivered", Shipment.actual_delivery<=Shipment.estimated_delivery, Shipment.estimated_delivery.isnot(None)))).scalar_one()
        on_time_rate = round(on_time_q / delivered * 100, 1) if delivered else 0
        stats = {"total_users": total_users, "total_shipments": total_shipments, "active_drivers": active_drivers, "new_last_24h": new_24h, "on_time_rate": on_time_rate, "ws_connections": manager.total_connections, "status_breakdown": status_map}
        await self.cache.set("admin:platform_stats", stats, expire=60)
        return stats

    async def list_users(self, page=1, per_page=20, search=None, role=None) -> Tuple[List[User], int]:
        query = select(User).options(selectinload(User.role)).where(User.deleted_at.is_(None))
        if search:
            query = query.where(User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%"))
        if role:
            role_sub = select(Role.id).where(Role.name == role)
            query = query.where(User.role_id.in_(role_sub))
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        users = (await self.db.execute(query.order_by(desc(User.created_at)).offset((page-1)*per_page).limit(per_page))).scalars().all()
        return users, total

    async def toggle_user_active(self, user_id: uuid.UUID, admin: User) -> User:
        result = await self.db.execute(select(User).options(selectinload(User.role)).where(User.id==user_id, User.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException("User")
        user.is_active = not user.is_active
        return user

    async def list_all_shipments(self, page=1, per_page=20, status=None, search=None) -> Tuple[List[Shipment], int]:
        query = select(Shipment).options(selectinload(Shipment.user), selectinload(Shipment.driver), selectinload(Shipment.origin_warehouse), selectinload(Shipment.dest_warehouse)).where(Shipment.deleted_at.is_(None))
        if status:
            query = query.where(Shipment.status == status)
        if search:
            query = query.where(Shipment.tracking_number.ilike(f"%{search}%"))
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        shipments = (await self.db.execute(query.order_by(desc(Shipment.created_at)).offset((page-1)*per_page).limit(per_page))).scalars().all()
        return shipments, total

    async def assign_driver(self, shipment_id: uuid.UUID, driver_id: uuid.UUID) -> Shipment:
        ship = (await self.db.execute(select(Shipment).where(Shipment.id==shipment_id))).scalar_one_or_none()
        if not ship: raise NotFoundException("Shipment")
        drv = (await self.db.execute(select(Driver).where(Driver.id==driver_id))).scalar_one_or_none()
        if not drv: raise NotFoundException("Driver")
        ship.driver_id = driver_id
        return ship

    async def get_audit_logs(self, page=1, per_page=50) -> Tuple[List[AuditLog], int]:
        query = select(AuditLog).order_by(desc(AuditLog.created_at))
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        logs = (await self.db.execute(query.offset((page-1)*per_page).limit(per_page))).scalars().all()
        return logs, total
