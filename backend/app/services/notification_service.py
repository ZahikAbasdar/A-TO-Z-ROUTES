from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional, List, Tuple
import uuid
import structlog

from app.models.shipment import Notification
from app.models.user import User
from app.core.responses import NotFoundException, ForbiddenException
from app.core.redis import RedisCache
from app.websockets.manager import manager

logger = structlog.get_logger()


class NotificationService:
    def __init__(self, db: AsyncSession, cache: RedisCache):
        self.db    = db
        self.cache = cache

    # ── Create notification ───────────────────────────────────────────────────
    async def create(
        self,
        user_id: uuid.UUID,
        title: str,
        body: str,
        notif_type: str = "shipment_update",
        channel: str = "push",
        shipment_id: Optional[uuid.UUID] = None,
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            shipment_id=shipment_id,
            type=notif_type,
            channel=channel,
            title=title,
            body=body,
            sent_at=datetime.now(timezone.utc),
        )
        self.db.add(notif)
        await self.db.flush()

        # Push via WebSocket
        await manager.emit_notification(
            user_id=str(user_id),
            title=title,
            body=body,
            shipment_id=str(shipment_id) if shipment_id else None,
            notif_type=notif_type,
        )

        # Invalidate notification cache
        await self.cache.delete(f"notifs:{user_id}")
        logger.info("notification.sent", user_id=str(user_id), type=notif_type)
        return notif

    # ── List notifications ────────────────────────────────────────────────────
    async def list_notifications(
        self,
        user: User,
        page: int = 1,
        per_page: int = 20,
        unread_only: bool = False,
    ) -> Tuple[List[Notification], int, int]:
        """Returns (notifications, total, unread_count)."""
        base = Notification.user_id == user.id
        query = select(Notification).where(base)
        if unread_only:
            query = query.where(Notification.is_read == False)

        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()

        unread_count = (await self.db.execute(
            select(func.count()).where(base, Notification.is_read == False)
        )).scalar_one()

        notifs = (await self.db.execute(
            query.order_by(desc(Notification.created_at))
            .offset((page - 1) * per_page)
            .limit(per_page)
        )).scalars().all()

        return notifs, total, unread_count

    # ── Mark as read ──────────────────────────────────────────────────────────
    async def mark_read(
        self,
        notification_id: uuid.UUID,
        user: User,
    ) -> Notification:
        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user.id,
            )
        )
        notif = result.scalar_one_or_none()
        if not notif:
            raise NotFoundException("Notification")
        notif.is_read = True
        await self.cache.delete(f"notifs:{user.id}")
        return notif

    async def mark_all_read(self, user: User) -> int:
        """Mark all notifications as read. Returns count updated."""
        result = await self.db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.is_read == False,
            )
        )
        notifs = result.scalars().all()
        for n in notifs:
            n.is_read = True
        await self.cache.delete(f"notifs:{user.id}")
        return len(notifs)

    # ── Delete ────────────────────────────────────────────────────────────────
    async def delete_notification(
        self,
        notification_id: uuid.UUID,
        user: User,
    ) -> None:
        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user.id,
            )
        )
        notif = result.scalar_one_or_none()
        if not notif:
            raise NotFoundException("Notification")
        await self.db.delete(notif)
        await self.cache.delete(f"notifs:{user.id}")

    # ── Shipment event helpers ────────────────────────────────────────────────
    async def notify_status_change(
        self,
        user_id: uuid.UUID,
        tracking_number: str,
        new_status: str,
        shipment_id: Optional[uuid.UUID] = None,
    ) -> None:
        status_messages = {
            "picked_up":        ("Package Picked Up 📦", f"Your package {tracking_number} has been picked up"),
            "in_transit":       ("In Transit 🚚",         f"{tracking_number} is on the way"),
            "out_for_delivery": ("Out for Delivery! 🏠",  f"{tracking_number} will arrive today"),
            "delivered":        ("Delivered ✅",           f"{tracking_number} has been delivered successfully"),
            "failed":           ("Delivery Failed ⚠️",    f"Delivery of {tracking_number} was unsuccessful"),
            "returned":         ("Being Returned 🔄",     f"{tracking_number} is being returned to sender"),
        }
        title, body = status_messages.get(
            new_status,
            ("Shipment Update", f"Status update for {tracking_number}")
        )
        await self.create(
            user_id=user_id,
            title=title,
            body=body,
            notif_type="shipment_update",
            shipment_id=shipment_id,
        )

    async def notify_delay_risk(
        self,
        user_id: uuid.UUID,
        tracking_number: str,
        risk_level: str,
        factors: List[str],
        shipment_id: Optional[uuid.UUID] = None,
    ) -> None:
        if risk_level == "low":
            return  # Don't spam low-risk notifications
        emoji = "🔴" if risk_level == "high" else "🟡"
        title = f"{emoji} Delay Risk: {risk_level.title()} — {tracking_number}"
        body  = factors[0] if factors else f"Your shipment may be delayed"
        await self.create(
            user_id=user_id,
            title=title,
            body=body,
            notif_type="delay_alert",
            shipment_id=shipment_id,
        )
