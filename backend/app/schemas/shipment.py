from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import uuid


class WarehouseSchema(BaseModel):
    id: uuid.UUID
    name: str
    city: str
    country: str
    latitude: float
    longitude: float
    type: str
    is_active: bool
    model_config = {"from_attributes": True}


class TrackingEventSchema(BaseModel):
    id: uuid.UUID
    shipment_id: uuid.UUID
    driver_id: Optional[uuid.UUID]
    status: str
    description: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    location_name: Optional[str]
    occurred_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


class ShipmentSchema(BaseModel):
    id: uuid.UUID
    tracking_number: str
    user_id: uuid.UUID
    driver_id: Optional[uuid.UUID]
    carrier: str
    status: str
    service_type: Optional[str]
    weight_kg: Optional[float]
    description: Optional[str]
    estimated_delivery: Optional[datetime]
    actual_delivery: Optional[datetime]
    ai_eta: Optional[datetime]
    ai_confidence: Optional[float]
    delay_risk: str
    origin_warehouse: Optional[WarehouseSchema]
    dest_warehouse: Optional[WarehouseSchema]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ShipmentDetailSchema(ShipmentSchema):
    tracking_events: List[TrackingEventSchema] = []


class CreateShipmentRequest(BaseModel):
    tracking_number: str
    carrier: str
    description: Optional[str] = None
    weight_kg: Optional[float] = None
    service_type: Optional[str] = None
    origin_warehouse_id: Optional[uuid.UUID] = None
    dest_warehouse_id: Optional[uuid.UUID] = None

    @field_validator("carrier")
    @classmethod
    def validate_carrier(cls, v: str) -> str:
        valid = {"amazon", "flipkart", "myntra", "dhl", "fedex", "delhivery", "bluedart", "custom"}
        if v.lower() not in valid:
            raise ValueError(f"Invalid carrier. Must be one of: {', '.join(sorted(valid))}")
        return v.lower()

    @field_validator("tracking_number")
    @classmethod
    def validate_tracking(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) < 5:
            raise ValueError("Tracking number too short")
        return v


class UpdateShipmentRequest(BaseModel):
    status: Optional[str] = None
    description: Optional[str] = None
    estimated_delivery: Optional[datetime] = None
    driver_id: Optional[uuid.UUID] = None


class DashboardStatsSchema(BaseModel):
    total_shipments: int
    in_transit: int
    delivered: int
    pending: int
    failed: int
    on_time_rate: float
    avg_delivery_days: float
    delay_risk_distribution: dict

class ShipmentTrendSchema(BaseModel):
    date: str
    created: int
    delivered: int
    failed: int

class CarrierBreakdownSchema(BaseModel):
    carrier: str
    count: int
    percentage: float
