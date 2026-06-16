"""
Delay Prediction Service

Computes a delay risk score (0-100) and classifies it as low/medium/high.
Uses a combination of:
  - Carrier historical reliability
  - Service type expectations
  - Distance vs estimated time
  - Current tracking event lag
  - Time of year / peak season
  - Weight class
  - Hours since last tracking event (staleness)
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
import math


# ── Carrier reliability scores (0-1, historical on-time rates) ────────────────
CARRIER_RELIABILITY = {
    "amazon":    0.94,
    "fedex":     0.91,
    "dhl":       0.89,
    "bluedart":  0.87,
    "flipkart":  0.82,
    "delhivery": 0.79,
    "myntra":    0.77,
    "custom":    0.65,
}

# ── Service type buffer (days) ────────────────────────────────────────────────
SERVICE_BUFFER = {
    "overnight": 0.2,
    "express":   0.5,
    "priority":  0.6,
    "standard":  1.5,
    "economy":   2.5,
}

# ── Peak season months (higher delay probability) ─────────────────────────────
PEAK_MONTHS = {10, 11, 12, 1}   # Oct-Jan (Diwali, Christmas, New Year)

# ── Status progress weights ───────────────────────────────────────────────────
STATUS_PROGRESS = {
    "pending":           0.0,
    "picked_up":         0.25,
    "in_transit":        0.55,
    "out_for_delivery":  0.85,
    "delivered":         1.0,
    "failed":            1.0,
    "returned":          1.0,
}


def compute_delay_risk(shipment_data: dict) -> dict:
    """
    Compute delay risk for a shipment.

    Returns:
      {
        "risk_score": float (0-100),
        "risk_level": "low" | "medium" | "high",
        "factors": list[str],   # human-readable risk factors
        "confidence": float,
      }
    """
    factors   = []
    risk_score = 0.0
    now        = datetime.now(timezone.utc)

    # ── 1. Carrier reliability ────────────────────────────────────────────────
    carrier     = shipment_data.get("carrier", "custom")
    reliability = CARRIER_RELIABILITY.get(carrier, 0.65)
    carrier_risk = (1.0 - reliability) * 25.0   # max 25 pts
    risk_score  += carrier_risk
    if reliability < 0.80:
        factors.append(f"Carrier ({carrier}) has lower reliability ({int(reliability*100)}%)")

    # ── 2. Service type buffer ────────────────────────────────────────────────
    service = shipment_data.get("service_type", "standard")
    buffer  = SERVICE_BUFFER.get(service, 1.5)
    # Tight buffer → higher risk
    if buffer <= 0.3:
        risk_score += 12.0
        factors.append("Overnight/express has minimal time buffer")
    elif buffer <= 0.6:
        risk_score += 6.0

    # ── 3. Estimated delivery vs. now ────────────────────────────────────────
    estimated_str = shipment_data.get("estimated_delivery")
    if estimated_str:
        try:
            if isinstance(estimated_str, str):
                est = datetime.fromisoformat(estimated_str.replace("Z", "+00:00"))
            else:
                est = estimated_str
            if est.tzinfo is None:
                est = est.replace(tzinfo=timezone.utc)

            hours_remaining = (est - now).total_seconds() / 3600

            if hours_remaining < 0:
                risk_score += 30.0
                factors.append("Past estimated delivery date")
            elif hours_remaining < 12:
                risk_score += 18.0
                factors.append("Less than 12 hours to estimated delivery")
            elif hours_remaining < 24:
                risk_score += 10.0
                factors.append("Less than 24 hours to estimated delivery")
        except (ValueError, TypeError):
            pass

    # ── 4. Tracking event staleness ───────────────────────────────────────────
    last_event_str = shipment_data.get("last_event_at")
    status         = shipment_data.get("status", "pending")
    if last_event_str and status not in ("delivered", "failed", "returned"):
        try:
            if isinstance(last_event_str, str):
                last_event = datetime.fromisoformat(last_event_str.replace("Z", "+00:00"))
            else:
                last_event = last_event_str
            if last_event.tzinfo is None:
                last_event = last_event.replace(tzinfo=timezone.utc)

            hours_since_event = (now - last_event).total_seconds() / 3600
            if hours_since_event > 48:
                risk_score += 20.0
                factors.append(f"No tracking update for {int(hours_since_event)}h")
            elif hours_since_event > 24:
                risk_score += 10.0
                factors.append(f"No tracking update for {int(hours_since_event)}h")
        except (ValueError, TypeError):
            pass

    # ── 5. Weight class ───────────────────────────────────────────────────────
    weight_kg = float(shipment_data.get("weight_kg") or 1.0)
    if weight_kg > 20:
        risk_score += 8.0
        factors.append(f"Heavy shipment ({weight_kg:.1f}kg) may face handling delays")
    elif weight_kg > 10:
        risk_score += 3.0

    # ── 6. Peak season ────────────────────────────────────────────────────────
    current_month = now.month
    if current_month in PEAK_MONTHS:
        risk_score += 10.0
        factors.append("Peak shipping season — higher network congestion")

    # ── 7. Distance factor ────────────────────────────────────────────────────
    distance_km = float(shipment_data.get("distance_km") or 0)
    if distance_km > 2000:
        risk_score += 8.0
        factors.append(f"Long distance shipment ({int(distance_km)}km)")
    elif distance_km > 1000:
        risk_score += 4.0

    # ── 8. Status progress vs time elapsed ───────────────────────────────────
    created_str = shipment_data.get("created_at")
    if created_str and estimated_str:
        try:
            if isinstance(created_str, str):
                created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            else:
                created = created_str
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)

            est_obj = datetime.fromisoformat(str(estimated_str).replace("Z", "+00:00")) if isinstance(estimated_str, str) else estimated_str
            if est_obj.tzinfo is None:
                est_obj = est_obj.replace(tzinfo=timezone.utc)

            total_window    = (est_obj - created).total_seconds()
            elapsed         = (now - created).total_seconds()
            expected_progress = elapsed / total_window if total_window > 0 else 0
            actual_progress   = STATUS_PROGRESS.get(status, 0)

            lag = expected_progress - actual_progress
            if lag > 0.3:
                risk_score += 15.0
                factors.append("Shipment significantly behind expected progress")
            elif lag > 0.15:
                risk_score += 7.0
                factors.append("Shipment slightly behind expected schedule")
        except (ValueError, TypeError, ZeroDivisionError):
            pass

    # ── Clamp and classify ────────────────────────────────────────────────────
    risk_score = min(100.0, max(0.0, risk_score))

    if risk_score >= 55:
        risk_level = "high"
    elif risk_score >= 28:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Confidence in the prediction (higher when we have more data points)
    data_points = sum([
        1 if shipment_data.get("estimated_delivery") else 0,
        1 if shipment_data.get("last_event_at") else 0,
        1 if shipment_data.get("created_at") else 0,
        1 if distance_km > 0 else 0,
    ])
    confidence = 50.0 + (data_points / 4.0) * 45.0

    return {
        "risk_score": round(risk_score, 1),
        "risk_level": risk_level,
        "factors":    factors if factors else ["No significant risk factors detected"],
        "confidence": round(confidence, 1),
    }


def batch_compute_delay_risk(records: list) -> list:
    return [compute_delay_risk(r) for r in records]
