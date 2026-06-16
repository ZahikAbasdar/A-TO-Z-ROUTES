from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
import json
import structlog
import uuid

from app.websockets.manager import manager
from app.core.security import decode_token
from app.core.database import get_db
from app.core.redis import get_redis, RedisCache, CacheKeys
from app.models.user import User
from app.models.driver import Driver
from app.models.shipment import Shipment

logger = structlog.get_logger()
router = APIRouter()


async def _authenticate_ws(
    token: str,
    db: AsyncSession,
    redis_cache: RedisCache,
) -> User | None:
    """Validate JWT for WebSocket connection. Returns User or None."""
    try:
        payload = decode_token(token)
    except JWTError:
        return None

    if payload.get("type") != "access":
        return None

    jti     = payload.get("jti")
    user_id = payload.get("sub")

    if not jti or not user_id:
        return None

    # Check blacklist
    if await redis_cache.exists(CacheKeys.user_token_blacklist(jti)):
        return None

    result = await db.execute(
        select(User).where(
            User.id == uuid.UUID(user_id),
            User.deleted_at.is_(None),
            User.is_active == True,
        )
    )
    return result.scalar_one_or_none()


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """
    Main WebSocket endpoint.

    Query params:
      - token: JWT access token

    Client messages (JSON):
      { "action": "subscribe",   "room": "shipment:<id>" }
      { "action": "unsubscribe", "room": "shipment:<id>" }
      { "action": "driver_location", "shipment_id": "<id>", "lat": 0.0, "lng": 0.0 }
      { "action": "ping" }

    Server messages:
      { "type": "tracking_update", "payload": {...}, "timestamp": "..." }
      { "type": "driver_location",  "payload": {...}, "timestamp": "..." }
      { "type": "notification",     "payload": {...}, "timestamp": "..." }
      { "type": "pong" }
      { "type": "error", "message": "..." }
    """
    cache = RedisCache(redis)
    user  = await _authenticate_ws(token, db, cache)

    if not user:
        await ws.accept()
        await ws.send_text(json.dumps({"type": "error", "message": "Unauthorized"}))
        await ws.close(code=4001)
        return

    # Load role
    await db.refresh(user, ["role"])
    role = user.role.name if user.role else "user"

    await manager.connect(ws, str(user.id), role)

    # Auto-join personal notification room
    manager.join_room(ws, f"user:{user.id}")

    # If driver — auto-join driver room
    driver = None
    if role == "driver":
        driver_result = await db.execute(
            select(Driver).where(Driver.user_id == user.id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            manager.join_room(ws, f"driver:{driver.id}")

    # If admin — join admin room
    if role == "admin":
        manager.join_room(ws, "admin")

    # Send connection confirmation
    await manager.send_personal(ws, {
        "type":    "connected",
        "payload": {
            "user_id": str(user.id),
            "role":    role,
            "rooms":   list(manager._conn_rooms.get(ws, set())),
        },
        "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    })

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(ws, {"type": "error", "message": "Invalid JSON"})
                continue

            action = msg.get("action")

            # ── Ping ────────────────────────────────────────────────────────
            if action == "ping":
                await manager.send_personal(ws, {"type": "pong"})

            # ── Subscribe to a room ──────────────────────────────────────────
            elif action == "subscribe":
                room = msg.get("room", "")
                allowed = await _can_join_room(room, user, driver, db)
                if allowed:
                    manager.join_room(ws, room)
                    await manager.send_personal(ws, {
                        "type":    "subscribed",
                        "payload": {"room": room, "size": manager.get_room_size(room)},
                    })
                else:
                    await manager.send_personal(ws, {
                        "type":    "error",
                        "message": f"Cannot subscribe to room: {room}",
                    })

            # ── Unsubscribe ──────────────────────────────────────────────────
            elif action == "unsubscribe":
                room = msg.get("room", "")
                manager.leave_room(ws, room)
                await manager.send_personal(ws, {"type": "unsubscribed", "payload": {"room": room}})

            # ── Driver location update ───────────────────────────────────────
            elif action == "driver_location":
                if role not in ("driver", "admin"):
                    await manager.send_personal(ws, {"type": "error", "message": "Not a driver"})
                    continue

                lat         = msg.get("lat")
                lng         = msg.get("lng")
                shipment_id = msg.get("shipment_id")

                if lat is None or lng is None or not shipment_id:
                    await manager.send_personal(ws, {"type": "error", "message": "Missing lat/lng/shipment_id"})
                    continue

                # Persist driver's last known location in Redis (TTL 10 min)
                if driver:
                    await cache.set(
                        CacheKeys.driver_location(str(driver.id)),
                        {"lat": lat, "lng": lng},
                        expire=600,
                    )

                    # Update driver in DB (non-blocking — fire and forget for latency)
                    driver.current_lat = lat
                    driver.current_lng = lng
                    db.add(driver)

                driver_id = str(driver.id) if driver else str(user.id)
                await manager.emit_driver_location(driver_id, shipment_id, lat, lng)

            else:
                await manager.send_personal(ws, {
                    "type": "error", "message": f"Unknown action: {action}"
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws.error", error=str(e), user_id=str(user.id))
    finally:
        await manager.disconnect(ws)


async def _can_join_room(
    room: str,
    user: User,
    driver,
    db: AsyncSession,
) -> bool:
    """Check if a user is allowed to subscribe to a room."""
    if not room:
        return False

    # Admin can join anything
    if user.is_admin:
        return True

    # Personal notification room
    if room == f"user:{user.id}":
        return True

    # Shipment room — verify ownership
    if room.startswith("shipment:"):
        try:
            shipment_id = uuid.UUID(room.split(":", 1)[1])
        except ValueError:
            return False

        result = await db.execute(
            select(Shipment).where(
                Shipment.id == shipment_id,
                Shipment.deleted_at.is_(None),
            )
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            return False

        # Owner or assigned driver
        if shipment.user_id == user.id:
            return True
        if driver and shipment.driver_id == driver.id:
            return True

        return False

    # Driver room — only the driver themselves
    if room.startswith("driver:"):
        if driver and room == f"driver:{driver.id}":
            return True
        return False

    return False
