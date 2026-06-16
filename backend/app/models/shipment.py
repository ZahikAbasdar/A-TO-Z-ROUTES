from sqlalchemy import String, ForeignKey, Numeric, DateTime, Text, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional, List
import uuid

from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Warehouse(Base, UUIDMixin):
    __tablename__ = "warehouses"

    name:      Mapped[str]           = mapped_column(String(255), nullable=False)
    city:      Mapped[str]           = mapped_column(String(100), nullable=False)
    country:   Mapped[str]           = mapped_column(String(100), nullable=False, index=True)
    latitude:  Mapped[float]         = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[float]         = mapped_column(Numeric(10, 7), nullable=False)
    type:      Mapped[str]           = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool]          = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())

    shipments_as_origin: Mapped[List["Shipment"]] = relationship(
        "Shipment", back_populates="origin_warehouse", foreign_keys="Shipment.origin_warehouse_id"
    )
    shipments_as_dest: Mapped[List["Shipment"]] = relationship(
        "Shipment", back_populates="dest_warehouse", foreign_keys="Shipment.dest_warehouse_id"
    )


class Route(Base, UUIDMixin):
    __tablename__ = "routes"

    name:               Mapped[str]           = mapped_column(String(255), nullable=False)
    waypoints:          Mapped[dict]          = mapped_column(nullable=False, default=list)
    distance_km:        Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    estimated_minutes:  Mapped[Optional[int]]   = mapped_column(nullable=True)
    status:             Mapped[str]             = mapped_column(String(50), default="active", nullable=False)
    created_at:         Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    shipments: Mapped[List["Shipment"]] = relationship("Shipment", back_populates="route")


class Shipment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "shipments"

    tracking_number:      Mapped[str]            = mapped_column(String(50), unique=True, nullable=False, index=True)
    user_id:              Mapped[uuid.UUID]       = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    driver_id:            Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("drivers.id"), nullable=True, index=True)
    origin_warehouse_id:  Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    dest_warehouse_id:    Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    route_id:             Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("routes.id"), nullable=True)

    carrier:              Mapped[str]            = mapped_column(String(100), nullable=False, index=True)
    status:               Mapped[str]            = mapped_column(String(50), default="pending", nullable=False, index=True)
    service_type:         Mapped[Optional[str]]  = mapped_column(String(50), nullable=True)
    weight_kg:            Mapped[Optional[float]] = mapped_column(Numeric(8, 3), nullable=True)
    description:          Mapped[Optional[str]]  = mapped_column(Text, nullable=True)

    estimated_delivery:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_delivery:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_eta:               Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_confidence:        Mapped[Optional[float]]    = mapped_column(Numeric(5, 2), nullable=True)
    delay_risk:           Mapped[str]                = mapped_column(String(20), default="low", nullable=False)

    deleted_at:           Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user:             Mapped["User"]               = relationship("User", back_populates="shipments")  # noqa: F821
    driver:           Mapped[Optional["Driver"]]   = relationship("Driver", back_populates="shipments")  # noqa: F821
    origin_warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse", back_populates="shipments_as_origin", foreign_keys=[origin_warehouse_id])
    dest_warehouse:   Mapped[Optional["Warehouse"]] = relationship("Warehouse", back_populates="shipments_as_dest",   foreign_keys=[dest_warehouse_id])
    route:            Mapped[Optional["Route"]]    = relationship("Route", back_populates="shipments")
    tracking_events:  Mapped[List["TrackingEvent"]] = relationship("TrackingEvent", back_populates="shipment", cascade="all, delete-orphan")  # noqa: F821
    notifications:    Mapped[List["Notification"]]  = relationship("Notification", back_populates="shipment")  # noqa: F821

    __table_args__ = (
        Index("idx_shipments_deleted", "deleted_at", postgresql_where="deleted_at IS NULL"),
    )


class TrackingEvent(Base, UUIDMixin):
    __tablename__ = "tracking_events"

    shipment_id:   Mapped[uuid.UUID]       = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    driver_id:     Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    status:        Mapped[str]             = mapped_column(String(50), nullable=False, index=True)
    description:   Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    latitude:      Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    longitude:     Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    location_name: Mapped[Optional[str]]  = mapped_column(String(255), nullable=True)
    occurred_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    shipment: Mapped["Shipment"]         = relationship("Shipment", back_populates="tracking_events")
    driver:   Mapped[Optional["Driver"]] = relationship("Driver")  # noqa: F821


class Notification(Base, UUIDMixin):
    __tablename__ = "notifications"

    user_id:     Mapped[uuid.UUID]           = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    shipment_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("shipments.id"), nullable=True)
    type:        Mapped[str]                 = mapped_column(String(50), nullable=False)
    channel:     Mapped[str]                 = mapped_column(String(20), nullable=False)
    title:       Mapped[str]                 = mapped_column(String(255), nullable=False)
    body:        Mapped[str]                 = mapped_column(Text, nullable=False)
    is_read:     Mapped[bool]                = mapped_column(default=False, nullable=False)
    sent_at:     Mapped[Optional[datetime]]  = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:  Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user:     Mapped["User"]                  = relationship("User", back_populates="notifications")  # noqa: F821
    shipment: Mapped[Optional["Shipment"]]    = relationship("Shipment", back_populates="notifications")

    __table_args__ = (
        Index("idx_notifications_unread", "is_read", postgresql_where="is_read = false"),
    )
