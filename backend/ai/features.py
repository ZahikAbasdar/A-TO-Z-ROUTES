"""
Feature Engineering for ETA Prediction.

Features used:
  - carrier (encoded)
  - service_type (encoded)
  - weight_kg (normalized)
  - day_of_week shipment was created
  - hour_of_day shipment was created
  - origin/dest warehouse region (encoded)
  - distance_km between warehouses (haversine)
  - number of tracking events so far
  - current status (encoded)
  - hours_since_created
  - delay_risk (encoded)
"""

import numpy as np
from math import radians, cos, sin, asin, sqrt
from datetime import datetime, timezone
from typing import Optional


# ── Vocabulary maps ───────────────────────────────────────────────────────────

CARRIER_MAP = {
    "amazon":    0, "flipkart": 1, "myntra":    2, "dhl":      3,
    "fedex":     4, "delhivery":5, "bluedart":  6, "custom":   7,
}

SERVICE_MAP = {
    "standard": 0, "express":  1, "overnight": 2,
    "economy":  3, "priority": 4,
}

STATUS_MAP = {
    "pending":           0,
    "picked_up":         1,
    "in_transit":        2,
    "out_for_delivery":  3,
    "delivered":         4,
    "failed":            5,
    "returned":          6,
}

RISK_MAP = {"low": 0, "medium": 1, "high": 2}

# Indian region clusters (lat ranges)
def _region(lat: Optional[float]) -> int:
    if lat is None: return 0
    if lat > 28:    return 1   # North India
    if lat > 22:    return 2   # Central India
    if lat > 15:    return 3   # South India (north)
    return 4                   # South India (south)

FEATURE_NAMES = [
    "carrier",
    "service_type",
    "weight_kg",
    "day_of_week",
    "hour_of_day",
    "origin_region",
    "dest_region",
    "distance_km",
    "event_count",
    "current_status",
    "hours_since_created",
    "delay_risk",
    "is_weekend",
    "is_business_hour",
]


def haversine_km(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Great-circle distance between two lat/lng points in kilometres."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def extract_features(shipment_data: dict) -> np.ndarray:
    """
    Accepts a dict with shipment + warehouse + tracking_event fields.
    Returns a 1-D numpy array of features ready for XGBoost inference.
    """
    created_at = shipment_data.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at is None:
        created_at = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    hours_since_created = max(
        (now - created_at.replace(tzinfo=timezone.utc if created_at.tzinfo is None else created_at.tzinfo)).total_seconds() / 3600,
        0.0,
    )

    day_of_week  = created_at.weekday()          # 0=Mon, 6=Sun
    hour_of_day  = created_at.hour
    is_weekend   = 1 if day_of_week >= 5 else 0
    is_biz_hour  = 1 if 9 <= hour_of_day <= 18 else 0

    origin = shipment_data.get("origin_warehouse") or {}
    dest   = shipment_data.get("dest_warehouse")   or {}

    orig_lat = origin.get("latitude")
    orig_lng = origin.get("longitude")
    dest_lat = dest.get("latitude")
    dest_lng = dest.get("longitude")

    if orig_lat and orig_lng and dest_lat and dest_lng:
        dist_km = haversine_km(orig_lat, orig_lng, dest_lat, dest_lng)
    else:
        dist_km = 500.0   # default median distance

    features = np.array([
        CARRIER_MAP.get(shipment_data.get("carrier", "custom"), 7),
        SERVICE_MAP.get(shipment_data.get("service_type", "standard"), 0),
        min(float(shipment_data.get("weight_kg") or 1.0), 100.0),
        day_of_week,
        hour_of_day,
        _region(orig_lat),
        _region(dest_lat),
        min(dist_km, 5000.0),
        min(int(shipment_data.get("event_count", 0)), 20),
        STATUS_MAP.get(shipment_data.get("status", "pending"), 0),
        min(hours_since_created, 720.0),   # cap at 30 days
        RISK_MAP.get(shipment_data.get("delay_risk", "low"), 0),
        is_weekend,
        is_biz_hour,
    ], dtype=np.float32)

    return features


def extract_features_batch(records: list[dict]) -> np.ndarray:
    """Vectorised batch feature extraction."""
    return np.vstack([extract_features(r) for r in records])
