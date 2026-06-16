from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
import uuid
import httpx
import structlog

from app.models.shipment import Shipment, Route
from app.core.config import settings
from app.core.responses import NotFoundException, ForbiddenException
from app.models.user import User

logger = structlog.get_logger()


class RouteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_shipment_route_geojson(
        self, shipment_id: uuid.UUID, user: User
    ) -> dict:
        """
        Returns GeoJSON for the shipment route.
        If Mapbox token is available, fetches driving directions.
        Otherwise returns straight-line geometry from warehouse coords.
        """
        result = await self.db.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.origin_warehouse),
                selectinload(Shipment.dest_warehouse),
                selectinload(Shipment.route),
                selectinload(Shipment.tracking_events),
            )
            .where(Shipment.id == shipment_id, Shipment.deleted_at.is_(None))
        )
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundException("Shipment")

        if not user.is_admin and shipment.user_id != user.id:
            raise ForbiddenException()

        coords = self._collect_coords(shipment)
        if len(coords) < 2:
            return {"type": "FeatureCollection", "features": []}

        # Try Mapbox Directions API for road-snapped route
        if settings.MAPBOX_ACCESS_TOKEN and len(coords) <= 25:
            try:
                geojson = await self._fetch_mapbox_route(coords)
                if geojson:
                    return geojson
            except Exception as e:
                logger.warning("mapbox.directions_failed", error=str(e))

        # Fallback: straight-line GeoJSON
        return self._build_straight_line(coords, shipment)

    def _collect_coords(self, shipment: Shipment) -> list:
        """Collect ordered coordinates: origin → tracking events → destination."""
        coords = []

        if shipment.origin_warehouse:
            coords.append({
                "lng": float(shipment.origin_warehouse.longitude),
                "lat": float(shipment.origin_warehouse.latitude),
                "name": shipment.origin_warehouse.city,
                "type": "origin",
            })

        # Add route waypoints if route is attached
        if shipment.route and shipment.route.waypoints:
            for wp in shipment.route.waypoints:
                coords.append({
                    "lng": wp.get("lng") or wp.get("lon", 0),
                    "lat": wp.get("lat", 0),
                    "name": wp.get("name", ""),
                    "type": "waypoint",
                })

        # Add tracking event locations (in order)
        events_with_coords = [
            e for e in sorted(shipment.tracking_events, key=lambda x: x.occurred_at)
            if e.latitude and e.longitude
        ]
        for event in events_with_coords:
            coords.append({
                "lng": float(event.longitude),
                "lat": float(event.latitude),
                "name": event.location_name or "",
                "type": "event",
            })

        if shipment.dest_warehouse:
            coords.append({
                "lng": float(shipment.dest_warehouse.longitude),
                "lat": float(shipment.dest_warehouse.latitude),
                "name": shipment.dest_warehouse.city,
                "type": "destination",
            })

        return coords

    async def _fetch_mapbox_route(self, coords: list) -> Optional[dict]:
        """Calls Mapbox Directions API and returns GeoJSON FeatureCollection."""
        coord_str = ";".join(f"{c['lng']},{c['lat']}" for c in coords)
        url = (
            f"https://api.mapbox.com/directions/v5/mapbox/driving/{coord_str}"
            f"?geometries=geojson&overview=full&access_token={settings.MAPBOX_ACCESS_TOKEN}"
        )
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()

        if not data.get("routes"):
            return None

        route_geometry = data["routes"][0]["geometry"]
        markers = [
            {
                "type":        c["type"],
                "coordinates": [c["lng"], c["lat"]],
                "name":        c["name"],
            }
            for c in coords
        ]

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type":     "Feature",
                    "geometry": route_geometry,
                    "properties": {
                        "source": "mapbox_directions",
                        "distance_m": data["routes"][0]["distance"],
                        "duration_s": data["routes"][0]["duration"],
                    },
                },
                *[
                    {
                        "type":       "Feature",
                        "geometry":   {"type": "Point", "coordinates": m["coordinates"]},
                        "properties": {"marker_type": m["type"], "name": m["name"]},
                    }
                    for m in markers
                ],
            ],
        }

    def _build_straight_line(self, coords: list, shipment: Shipment) -> dict:
        """Fallback: straight line between all coordinates."""
        line_coords = [[c["lng"], c["lat"]] for c in coords]
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": line_coords},
                    "properties": {"source": "straight_line"},
                },
                *[
                    {
                        "type":       "Feature",
                        "geometry":   {"type": "Point", "coordinates": [c["lng"], c["lat"]]},
                        "properties": {"marker_type": c["type"], "name": c["name"]},
                    }
                    for c in coords
                ],
            ],
        }
