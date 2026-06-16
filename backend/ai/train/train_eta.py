"""
ETA Model Training Script
Run: python -m ai.train.train_eta

Trains an XGBoost regressor to predict delivery time (days).
Uses synthetic data seeded from realistic logistics distributions.
Replace with real shipment data from PostgreSQL for production.
"""

import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler
import joblib
import json
import os
from datetime import datetime, timezone, timedelta
import random

from ai.features import (
    CARRIER_MAP, SERVICE_MAP, STATUS_MAP, RISK_MAP,
    haversine_km, FEATURE_NAMES,
)

MODEL_DIR  = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "eta_model.json")
META_PATH  = os.path.join(MODEL_DIR, "eta_model_meta.json")


def generate_training_data(n_samples: int = 15_000) -> tuple:
    """
    Generates synthetic but realistic shipment training data.
    
    Ground truth: delivery_days is derived from:
      - base days by carrier/service
      - distance factor
      - weight factor
      - delay risk factor
      - weekend penalty
      - random noise
    """
    rng = np.random.RandomState(42)

    carriers     = list(CARRIER_MAP.keys())
    services     = list(SERVICE_MAP.keys())
    statuses     = ["pending", "picked_up", "in_transit", "out_for_delivery"]
    risks        = ["low", "medium", "high"]

    # Carrier base delivery days
    carrier_base = {
        "amazon":    2.0, "flipkart": 3.0, "myntra":    3.5,
        "dhl":       2.5, "fedex":    2.0, "delhivery": 4.0,
        "bluedart":  2.5, "custom":   5.0,
    }
    # Service multipliers
    service_mult = {
        "standard": 1.0, "express": 0.6, "overnight": 0.3,
        "economy":  1.5, "priority": 0.7,
    }
    risk_add = {"low": 0.0, "medium": 0.8, "high": 2.0}

    # Indian warehouse coordinates (lat, lng)
    warehouses = [
        (28.7041, 77.1025),   # Delhi
        (19.0760, 72.8777),   # Mumbai
        (12.9716, 77.5946),   # Bangalore
        (22.5726, 88.3639),   # Kolkata
        (13.0827, 80.2707),   # Chennai
        (17.3850, 78.4867),   # Hyderabad
        (23.0225, 72.5714),   # Ahmedabad
        (18.5204, 73.8567),   # Pune
    ]

    X_list = []
    y_list = []

    for _ in range(n_samples):
        carrier      = rng.choice(carriers)
        service      = rng.choice(services)
        risk         = rng.choice(risks, p=[0.6, 0.3, 0.1])
        status       = rng.choice(statuses)
        weight_kg    = float(np.clip(rng.exponential(2.0), 0.1, 50.0))
        event_count  = rng.randint(0, 8)
        day_of_week  = rng.randint(0, 7)
        hour_of_day  = rng.randint(6, 22)
        is_weekend   = 1 if day_of_week >= 5 else 0
        is_biz_hour  = 1 if 9 <= hour_of_day <= 18 else 0

        orig_lat, orig_lng = warehouses[rng.randint(0, len(warehouses))]
        dest_lat, dest_lng = warehouses[rng.randint(0, len(warehouses))]
        dist_km = haversine_km(orig_lat, orig_lng, dest_lat, dest_lng)

        hours_since = float(rng.uniform(0, 48))

        # Build target: delivery days
        base     = carrier_base[carrier] * service_mult[service]
        dist_add = dist_km / 1500.0        # every 1500km adds ~1 day
        wt_add   = weight_kg / 30.0 * 0.5  # heavy adds up to 0.5 day
        wknd_add = 0.5 if is_weekend else 0.0
        risk_penalty = risk_add[risk]
        noise    = float(rng.normal(0, 0.3))

        delivery_days = max(
            0.3,
            base + dist_add + wt_add + wknd_add + risk_penalty + noise
        )

        # Status shortcut: partially elapsed
        status_elapsed = {"pending":0, "picked_up":0.3, "in_transit":0.5, "out_for_delivery":0.8}
        remaining_days = delivery_days * (1 - status_elapsed.get(status, 0))

        from ai.features import _region
        X_list.append([
            CARRIER_MAP[carrier],
            SERVICE_MAP[service],
            weight_kg,
            day_of_week,
            hour_of_day,
            _region(orig_lat),
            _region(dest_lat),
            min(dist_km, 5000.0),
            event_count,
            STATUS_MAP[status],
            min(hours_since, 720.0),
            RISK_MAP[risk],
            is_weekend,
            is_biz_hour,
        ])
        y_list.append(remaining_days)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    return X, y


def train():
    os.makedirs(MODEL_DIR, exist_ok=True)
    print("Generating training data...")
    X, y = generate_training_data(n_samples=20_000)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=FEATURE_NAMES)
    dtest  = xgb.DMatrix(X_test,  label=y_test,  feature_names=FEATURE_NAMES)

    params = {
        "objective":        "reg:squarederror",
        "eval_metric":      ["rmse", "mae"],
        "max_depth":        6,
        "eta":              0.05,
        "subsample":        0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "gamma":            0.1,
        "lambda":           1.5,
        "alpha":            0.1,
        "seed":             42,
        "tree_method":      "hist",
    }

    print("Training XGBoost model...")
    model = xgb.train(
        params,
        dtrain,
        num_boost_round=500,
        evals=[(dtrain, "train"), (dtest, "test")],
        early_stopping_rounds=30,
        verbose_eval=50,
    )

    # Evaluate
    y_pred = model.predict(dtest)
    mae  = mean_absolute_error(y_test, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2   = r2_score(y_test, y_pred)

    print(f"\nTest MAE:  {mae:.3f} days")
    print(f"Test RMSE: {rmse:.3f} days")
    print(f"Test R²:   {r2:.3f}")

    model.save_model(MODEL_PATH)

    meta = {
        "trained_at":    datetime.now(timezone.utc).isoformat(),
        "n_samples":     20_000,
        "mae_days":      round(mae,  3),
        "rmse_days":     round(rmse, 3),
        "r2_score":      round(r2,   3),
        "feature_names": FEATURE_NAMES,
        "model_path":    MODEL_PATH,
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nModel saved to {MODEL_PATH}")
    print(f"Metadata saved to {META_PATH}")
    return model, meta


if __name__ == "__main__":
    train()
