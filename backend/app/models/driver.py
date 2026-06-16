from sqlalchemy import String, Numeric, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional, List
import uuid

from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Driver(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "drivers"

    user_id:        Mapped[uuid.UUID]      = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    vehicle_type:   Mapped[str]            = mapped_column(String(50), nullable=False)
    license_number: Mapped[str]            = mapped_column(String(100), unique=True, nullable=False)
    current_lat:    Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    current_lng:    Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    status:         Mapped[str]            = mapped_column(String(50), default="offline", nullable=False, index=True)
    rating:         Mapped[float]          = mapped_column(Numeric(3, 2), default=5.00, nullable=False)

    user:      Mapped["User"]             = relationship("User")  # noqa: F821
    shipments: Mapped[List["Shipment"]]   = relationship("Shipment", back_populates="driver")  # noqa: F821
