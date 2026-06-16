import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect
import json
import structlog
from datetime import datetime, timezone

logger = structlog.get_logger()


class ConnectionManager:
    """
    Room-based WebSocket manager.

    Rooms:
      - shipment:{shipment_id}  → subscribers watching a single shipment
      - user:{user_id}          → user's personal notification channel
      - driver:{driver_id}      → driver's delivery channel
      - admin                   → admin broadcast room
    """

    def __init__(self):
        # room_id → set of WebSocket connections
        self._rooms: Dict[str, Set[WebSocket]] = {}
        # websocket → set of room_ids (for cleanup on disconnect)
        self._conn_rooms: Dict[WebSocket, Set[str]] = {}
        # websocket → metadata
        self._conn_meta: Dict[WebSocket, dict] = {}

    # ── Connect / Disconnect ──────────────────────────────────────────────────

    async def connect(
        self,
        ws: WebSocket,
        user_id: str,
        role: str = "user",
    ) -> None:
        await ws.accept()
        self._conn_rooms[ws] = set()
        self._conn_meta[ws]  = {
            "user_id":    user_id,
            "role":       role,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("ws.connected", user_id=user_id, total=self.total_connections)

    async def disconnect(self, ws: WebSocket) -> None:
        meta = self._conn_meta.pop(ws, {})
        rooms = self._conn_rooms.pop(ws, set())

        for room_id in rooms:
            self._rooms.get(room_id, set()).discard(ws)
            if room_id in self._rooms and not self._rooms[room_id]:
                del self._rooms[room_id]

        logger.info(
            "ws.disconnected",
            user_id=meta.get("user_id"),
            total=self.total_connections,
        )

    # ── Room management ───────────────────────────────────────────────────────

    def join_room(self, ws: WebSocket, room_id: str) -> None:
        if room_id not in self._rooms:
            self._rooms[room_id] = set()
        self._rooms[room_id].add(ws)
        self._conn_rooms.get(ws, set()).add(room_id)
        logger.debug("ws.room_joined", room=room_id)

    def leave_room(self, ws: WebSocket, room_id: str) -> None:
        self._rooms.get(room_id, set()).discard(ws)
        self._conn_rooms.get(ws, set()).discard(room_id)

    def get_room_size(self, room_id: str) -> int:
        return len(self._rooms.get(room_id, set()))

    # ── Send helpers ──────────────────────────────────────────────────────────

    async def send_personal(self, ws: WebSocket, message: dict) -> bool:
        """Send to a single connection. Returns False if connection is dead."""
        try:
            await ws.send_text(json.dumps(message, default=str))
            return True
        except Exception:
            await self.disconnect(ws)
            return False

    async def broadcast_room(
        self,
        room_id: str,
        message: dict,
        exclude: Optional[WebSocket] = None,
    ) -> int:
        """Broadcast to all connections in a room. Returns send count."""
        connections = list(self._rooms.get(room_id, set()))
        if not connections:
            return 0

        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        sent = 0

        results = await asyncio.gather(
            *[ws.send_text(payload) for ws in connections if ws != exclude],
            return_exceptions=True,
        )
        for ws, result in zip(
            [ws for ws in connections if ws != exclude], results
        ):
            if isinstance(result, Exception):
                dead.append(ws)
            else:
                sent += 1

        for ws in dead:
            await self.disconnect(ws)

        return sent

    async def broadcast_global(self, message: dict) -> int:
        """Broadcast to every connected client."""
        all_ws = list(self._conn_meta.keys())
        if not all_ws:
            return 0
        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        sent = 0
        results = await asyncio.gather(
            *[ws.send_text(payload) for ws in all_ws],
            return_exceptions=True,
        )
        for ws, result in zip(all_ws, results):
            if isinstance(result, Exception):
                dead.append(ws)
            else:
                sent += 1
        for ws in dead:
            await self.disconnect(ws)
        return sent

    # ── Event emitters (typed helpers) ────────────────────────────────────────

    async def emit_tracking_update(
        self,
        shipment_id: str,
        status: str,
        description: Optional[str],
        location_name: Optional[str],
        latitude: Optional[float],
        longitude: Optional[float],
    ) -> int:
        return await self.broadcast_room(
            f"shipment:{shipment_id}",
            {
                "type":    "tracking_update",
                "payload": {
                    "shipment_id":  shipment_id,
                    "status":       status,
                    "description":  description,
                    "location_name": location_name,
                    "latitude":     latitude,
                    "longitude":    longitude,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def emit_driver_location(
        self,
        driver_id: str,
        shipment_id: str,
        lat: float,
        lng: float,
    ) -> int:
        sent = await self.broadcast_room(
            f"shipment:{shipment_id}",
            {
                "type":    "driver_location",
                "payload": {
                    "driver_id":   driver_id,
                    "shipment_id": shipment_id,
                    "latitude":    lat,
                    "longitude":   lng,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        # Also broadcast to driver's own room
        await self.broadcast_room(
            f"driver:{driver_id}",
            {
                "type":    "location_ack",
                "payload": {"lat": lat, "lng": lng},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        return sent

    async def emit_notification(
        self,
        user_id: str,
        title: str,
        body: str,
        shipment_id: Optional[str] = None,
        notif_type: str = "shipment_update",
    ) -> int:
        return await self.broadcast_room(
            f"user:{user_id}",
            {
                "type":    "notification",
                "payload": {
                    "title":       title,
                    "body":        body,
                    "type":        notif_type,
                    "shipment_id": shipment_id,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    # ── Stats ─────────────────────────────────────────────────────────────────

    @property
    def total_connections(self) -> int:
        return len(self._conn_meta)

    @property
    def stats(self) -> dict:
        return {
            "total_connections": self.total_connections,
            "total_rooms":       len(self._rooms),
            "rooms": {
                room_id: len(conns)
                for room_id, conns in self._rooms.items()
            },
        }


# Singleton — shared across all requests
manager = ConnectionManager()
