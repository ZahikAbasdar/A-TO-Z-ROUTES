import pytest
import numpy as np
from datetime import datetime, timezone, timedelta


# ── Security tests ────────────────────────────────────────────────────────────

class TestSecurity:
    def test_password_hash_and_verify(self):
        from app.core.security import hash_password, verify_password
        hashed = hash_password("MySecure1")
        assert verify_password("MySecure1", hashed)
        assert not verify_password("Wrong1234", hashed)

    def test_hash_is_not_plaintext(self):
        from app.core.security import hash_password
        hashed = hash_password("Password1")
        assert hashed != "Password1"
        assert len(hashed) > 20

    def test_access_token_create_and_decode(self):
        from app.core.security import create_access_token, decode_token
        token, jti = create_access_token("user-123", "user")
        assert token
        assert jti
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["role"] == "user"
        assert payload["type"] == "access"
        assert payload["jti"] == jti

    def test_refresh_token_type(self):
        from app.core.security import create_refresh_token, decode_token
        token, _ = create_refresh_token("user-123")
        payload = decode_token(token)
        assert payload["type"] == "refresh"
        assert payload["sub"] == "user-123"

    def test_access_token_different_from_refresh(self):
        from app.core.security import create_access_token, create_refresh_token
        access, _  = create_access_token("user-123", "user")
        refresh, _ = create_refresh_token("user-123")
        assert access != refresh

    def test_unique_jtis(self):
        from app.core.security import create_access_token
        _, jti1 = create_access_token("user-1", "user")
        _, jti2 = create_access_token("user-1", "user")
        assert jti1 != jti2


# ── Feature engineering tests ─────────────────────────────────────────────────

class TestFeatureEngineering:
    def _base_shipment(self, **kwargs):
        base = {
            "carrier":      "amazon",
            "service_type": "standard",
            "weight_kg":    2.0,
            "status":       "in_transit",
            "delay_risk":   "low",
            "created_at":   datetime.now(timezone.utc).isoformat(),
            "event_count":  2,
        }
        base.update(kwargs)
        return base

    def test_feature_vector_length(self):
        from ai.features import extract_features, FEATURE_NAMES
        data     = self._base_shipment()
        features = extract_features(data)
        assert len(features) == len(FEATURE_NAMES)

    def test_feature_dtype(self):
        from ai.features import extract_features
        features = extract_features(self._base_shipment())
        assert features.dtype == np.float32

    def test_carrier_encoding(self):
        from ai.features import extract_features, CARRIER_MAP
        for carrier, code in CARRIER_MAP.items():
            f = extract_features(self._base_shipment(carrier=carrier))
            assert f[0] == code

    def test_unknown_carrier_defaults_to_custom(self):
        from ai.features import extract_features
        f = extract_features(self._base_shipment(carrier="unknown_carrier"))
        assert f[0] == 7   # custom

    def test_weight_capped_at_100(self):
        from ai.features import extract_features
        f = extract_features(self._base_shipment(weight_kg=999))
        assert f[2] == 100.0

    def test_batch_matches_individual(self):
        from ai.features import extract_features, extract_features_batch
        records = [self._base_shipment() for _ in range(5)]
        batch   = extract_features_batch(records)
        for i, r in enumerate(records):
            individual = extract_features(r)
            np.testing.assert_array_equal(batch[i], individual)

    def test_haversine_delhi_to_mumbai(self):
        from ai.features import haversine_km
        dist = haversine_km(28.7041, 77.1025, 19.0760, 72.8777)
        assert 1100 < dist < 1250   # ~1150km

    def test_haversine_same_point(self):
        from ai.features import haversine_km
        assert haversine_km(12.9, 77.5, 12.9, 77.5) == 0.0

    def test_with_warehouse_coords(self):
        from ai.features import extract_features
        data = self._base_shipment(
            origin_warehouse={"latitude": 28.7, "longitude": 77.1},
            dest_warehouse={"latitude":   12.9, "longitude": 77.5},
        )
        f = extract_features(data)
        assert f[7] > 0   # distance_km > 0


# ── Delay predictor tests ─────────────────────────────────────────────────────

class TestDelayPredictor:
    def _shipment(self, **kwargs):
        base = {
            "carrier":      "amazon",
            "service_type": "standard",
            "weight_kg":    1.0,
            "status":       "in_transit",
            "estimated_delivery": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            "created_at":   (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat(),
            "last_event_at":(datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
            "distance_km":  500.0,
        }
        base.update(kwargs)
        return base

    def test_low_risk_on_track_shipment(self):
        from ai.delay_predictor import compute_delay_risk
        result = compute_delay_risk(self._shipment())
        assert result["risk_level"] in ("low", "medium")
        assert 0 <= result["risk_score"] <= 100

    def test_past_due_is_high_risk(self):
        from ai.delay_predictor import compute_delay_risk
        result = compute_delay_risk(self._shipment(
            estimated_delivery=(datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
        ))
        assert result["risk_score"] >= 30
        assert result["risk_level"] in ("medium", "high")

    def test_stale_tracking_raises_risk(self):
        from ai.delay_predictor import compute_delay_risk
        result = compute_delay_risk(self._shipment(
            last_event_at=(datetime.now(timezone.utc) - timedelta(hours=60)).isoformat()
        ))
        # 60h stale + base risk should be >= medium
        assert result["risk_score"] >= 20

    def test_custom_carrier_higher_risk(self):
        from ai.delay_predictor import compute_delay_risk
        amazon = compute_delay_risk(self._shipment(carrier="amazon"))
        custom = compute_delay_risk(self._shipment(carrier="custom"))
        assert custom["risk_score"] > amazon["risk_score"]

    def test_output_structure(self):
        from ai.delay_predictor import compute_delay_risk
        result = compute_delay_risk(self._shipment())
        assert "risk_score"  in result
        assert "risk_level"  in result
        assert "factors"     in result
        assert "confidence"  in result
        assert result["risk_level"] in ("low", "medium", "high")
        assert isinstance(result["factors"], list)

    def test_batch_consistency(self):
        from ai.delay_predictor import compute_delay_risk, batch_compute_delay_risk
        records = [self._shipment() for _ in range(3)]
        batch   = batch_compute_delay_risk(records)
        for r, b in zip(records, batch):
            single = compute_delay_risk(r)
            assert single["risk_score"] == b["risk_score"]


# ── Auth schema validation tests ──────────────────────────────────────────────

class TestAuthSchemas:
    def test_valid_registration(self):
        from app.schemas.auth import RegisterRequest
        r = RegisterRequest(email="user@test.com", password="Secure123", full_name="Test User")
        assert r.email == "user@test.com"

    def test_weak_password_rejected(self):
        from app.schemas.auth import RegisterRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="weak", full_name="T")

    def test_no_uppercase_rejected(self):
        from app.schemas.auth import RegisterRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="nouppercase1", full_name="Test")

    def test_no_digit_rejected(self):
        from app.schemas.auth import RegisterRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="NoDigitHere", full_name="Test")

    def test_password_mismatch(self):
        from app.schemas.auth import ChangePasswordRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ChangePasswordRequest(current_password="Old1", new_password="New1A", confirm_password="Diff1B")

    def test_short_name_rejected(self):
        from app.schemas.auth import RegisterRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="Password1", full_name="X")


# ── Response model tests ──────────────────────────────────────────────────────

class TestResponseModels:
    def test_success_response(self):
        from app.core.responses import success_response
        r = success_response(data={"key": "val"}, message="OK")
        assert r["success"] is True
        assert r["data"]["key"] == "val"
        assert r["message"] == "OK"

    def test_error_response(self):
        from app.core.responses import error_response
        r = error_response("Something failed")
        assert r["success"] is False
        assert r["message"] == "Something failed"

    def test_not_found_exception(self):
        from app.core.responses import NotFoundException
        exc = NotFoundException("Shipment")
        assert exc.status_code == 404
        assert "not found" in exc.message.lower()

    def test_unauthorized_exception(self):
        from app.core.responses import UnauthorizedException
        exc = UnauthorizedException()
        assert exc.status_code == 401

    def test_conflict_exception(self):
        from app.core.responses import ConflictException
        exc = ConflictException("Already exists")
        assert exc.status_code == 409
