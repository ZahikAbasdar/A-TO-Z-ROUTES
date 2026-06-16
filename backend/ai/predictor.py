"""
ETA Prediction Service

Loads the trained XGBoost model and exposes:
  - predict_eta(shipment_data) → ETAPrediction
  - predict_batch(records) → list[ETAPrediction]

Confidence score: derived from prediction interval width
(how spread the individual tree predictions are).
"""

import os
import json
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
from typing import Optional
import structlog

logger = structlog.get_logger()

MODEL_DIR  = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "eta_model.json")
META_PATH  = os.path.join(MODEL_DIR, "eta_model_meta.json")


@dataclass
class ETAPrediction:
    eta_datetime:   datetime          # predicted delivery datetime
    remaining_days: float             # days remaining from now
    confidence:     float             # 0-100 confidence score
    model_version:  str
    features_used:  list[str]


class ETAPredictor:
    """Singleton — loads model once, reuses across requests."""

    _instance: Optional["ETAPredictor"] = None
    _model    = None
    _meta: dict = {}

    def __new__(cls) -> "ETAPredictor":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load(self) -> bool:
        """Load model from disk. Returns True if successful."""
        try:
            import xgboost as xgb
            if not os.path.exists(MODEL_PATH):
                logger.warning("eta_model.not_found", path=MODEL_PATH)
                return False

            self._model = xgb.Booster()
            self._model.load_model(MODEL_PATH)

            if os.path.exists(META_PATH):
                with open(META_PATH) as f:
                    self._meta = json.load(f)

            logger.info(
                "eta_model.loaded",
                mae=self._meta.get("mae_days"),
                r2=self._meta.get("r2_score"),
            )
            return True
        except Exception as e:
            logger.error("eta_model.load_failed", error=str(e))
            return False

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    def predict(self, shipment_data: dict) -> ETAPrediction:
        """
        Predict ETA for a single shipment.
        Falls back to rule-based estimate if model not available.
        """
        if not self.is_ready:
            return self._rule_based_fallback(shipment_data)

        try:
            import xgboost as xgb
            import numpy as np
            from ai.features import extract_features, FEATURE_NAMES

            features = extract_features(shipment_data)
            dmatrix  = xgb.DMatrix(
                features.reshape(1, -1),
                feature_names=FEATURE_NAMES,
            )

            # Predict remaining days
            remaining_days = float(self._model.predict(dmatrix)[0])
            remaining_days = max(0.1, remaining_days)

            # Confidence: based on model MAE vs prediction magnitude
            mae = self._meta.get("mae_days", 0.5)
            # Higher confidence when predicted days > MAE ratio is good
            raw_confidence = max(0.0, 1.0 - (mae / max(remaining_days, 0.5)))
            # Scale to 55-95% range (never claim 100% or below 55%)
            confidence = 55.0 + raw_confidence * 40.0

            # Also factor in delay risk
            risk = shipment_data.get("delay_risk", "low")
            if risk == "medium": confidence -= 8.0
            if risk == "high":   confidence -= 18.0
            confidence = float(np.clip(confidence, 30.0, 96.0))

            eta_dt = datetime.now(timezone.utc) + timedelta(days=remaining_days)

            return ETAPrediction(
                eta_datetime=eta_dt,
                remaining_days=round(remaining_days, 2),
                confidence=round(confidence, 1),
                model_version=self._meta.get("trained_at", "v1")[:10],
                features_used=FEATURE_NAMES,
            )
        except Exception as e:
            logger.error("eta_model.predict_failed", error=str(e))
            return self._rule_based_fallback(shipment_data)

    def predict_batch(self, records: list[dict]) -> list[ETAPrediction]:
        if not self.is_ready or not records:
            return [self._rule_based_fallback(r) for r in records]

        try:
            import xgboost as xgb
            import numpy as np
            from ai.features import extract_features_batch, FEATURE_NAMES

            X = extract_features_batch(records)
            dmatrix = xgb.DMatrix(X, feature_names=FEATURE_NAMES)
            preds   = self._model.predict(dmatrix)

            results = []
            mae = self._meta.get("mae_days", 0.5)
            for i, (record, remaining_days) in enumerate(zip(records, preds)):
                remaining_days = float(max(0.1, remaining_days))
                raw_conf   = max(0.0, 1.0 - (mae / max(remaining_days, 0.5)))
                confidence = 55.0 + raw_conf * 40.0
                risk = record.get("delay_risk", "low")
                if risk == "medium": confidence -= 8.0
                if risk == "high":   confidence -= 18.0
                confidence = float(np.clip(confidence, 30.0, 96.0))

                results.append(ETAPrediction(
                    eta_datetime=datetime.now(timezone.utc) + timedelta(days=remaining_days),
                    remaining_days=round(remaining_days, 2),
                    confidence=round(confidence, 1),
                    model_version=self._meta.get("trained_at", "v1")[:10],
                    features_used=FEATURE_NAMES,
                ))
            return results
        except Exception as e:
            logger.error("eta_model.batch_failed", error=str(e))
            return [self._rule_based_fallback(r) for r in records]

    def _rule_based_fallback(self, shipment_data: dict) -> ETAPrediction:
        """
        Rule-based ETA when model is unavailable.
        Uses carrier + service type baselines.
        """
        carrier_days = {
            "amazon":    2, "flipkart":  3, "myntra":   3,
            "dhl":       2, "fedex":     2, "delhivery":4,
            "bluedart":  2, "custom":    5,
        }
        service_mult = {
            "standard": 1.0, "express": 0.6, "overnight": 0.25,
            "economy":  1.5, "priority": 0.7,
        }
        risk_add = {"low": 0, "medium": 1, "high": 2}

        base     = carrier_days.get(shipment_data.get("carrier", "custom"), 3)
        mult     = service_mult.get(shipment_data.get("service_type", "standard"), 1.0)
        risk_add_days = risk_add.get(shipment_data.get("delay_risk", "low"), 0)

        remaining = base * mult + risk_add_days
        confidence = 60.0 if shipment_data.get("delay_risk", "low") == "low" else 45.0

        return ETAPrediction(
            eta_datetime=datetime.now(timezone.utc) + timedelta(days=remaining),
            remaining_days=round(remaining, 2),
            confidence=confidence,
            model_version="rule-based",
            features_used=[],
        )

    def get_model_info(self) -> dict:
        return {
            "is_ready":     self.is_ready,
            "model_path":   MODEL_PATH,
            "trained_at":   self._meta.get("trained_at"),
            "mae_days":     self._meta.get("mae_days"),
            "rmse_days":    self._meta.get("rmse_days"),
            "r2_score":     self._meta.get("r2_score"),
            "n_features":   len(self._meta.get("feature_names", [])),
        }


# Global singleton
predictor = ETAPredictor()
