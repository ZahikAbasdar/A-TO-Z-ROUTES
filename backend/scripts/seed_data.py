"""
Seed script — populates the database with realistic sample data for development.
Run: python -m scripts.seed_data
Or:  docker compose exec backend python -m scripts.seed_data
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from random import choice, uniform, randint

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, Role
from app.models.driver import Driver
from app.models.shipment import Shipment, Warehouse, TrackingEvent, Notification
from app.models.audit import AuditLog

engine  = create_async_engine(settings.DATABASE_URL, echo=False)
Session = async_sessionmaker(engine, expire_on_commit=False)

INDIAN_CITIES = [
    ("Mumbai",    "Maharashtra", 19.0760, 72.8777),
    ("Delhi",     "Delhi",       28.7041, 77.1025),
    ("Bangalore", "Karnataka",   12.9716, 77.5946),
    ("Chennai",   "Tamil Nadu",  13.0827, 80.2707),
    ("Kolkata",   "West Bengal", 22.5726, 88.3639),
    ("Hyderabad", "Telangana",   17.3850, 78.4867),
    ("Pune",      "Maharashtra", 18.5204, 73.8567),
    ("Ahmedabad", "Gujarat",     23.0225, 72.5714),
]

CARRIERS    = ["amazon", "flipkart", "dhl", "fedex", "delhivery", "bluedart", "myntra", "custom"]
STATUSES    = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed"]
RISK_LEVELS = ["low", "low", "low", "medium", "medium", "high"]


async def seed(db: AsyncSession):
    print("🌱 Seeding database...")

    # ── Roles ──────────────────────────────────────────────────────────────────
    roles = {}
    for name, perms in [
        ("admin",  {"all": True}),
        ("user",   {"shipments": ["read","create"], "tracking": ["read"]}),
        ("driver", {"deliveries": ["read","update"], "tracking": ["create"]}),
    ]:
        role = Role(id=uuid.uuid4(), name=name, permissions=perms,
                    created_at=datetime.now(timezone.utc))
        db.add(role)
        roles[name] = role
    await db.flush()
    print("   ✓ Roles created")

    # ── Admin user ─────────────────────────────────────────────────────────────
    admin = User(
        id=uuid.uuid4(), email="admin@atozroutes.com",
        password_hash=hash_password("Admin123"),
        full_name="Zahik Abas", phone="+919876543210",
        role_id=roles["admin"].id, is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(admin)

    # ── Regular users ──────────────────────────────────────────────────────────
    regular_users = []
    for i in range(5):
        u = User(
            id=uuid.uuid4(),
            email=f"user{i+1}@example.com",
            password_hash=hash_password("User1234"),
            full_name=f"Test User {i+1}",
            phone=f"+9198765{i:05d}",
            role_id=roles["user"].id,
            is_active=True,
            created_at=datetime.now(timezone.utc) - timedelta(days=randint(1, 60)),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(u)
        regular_users.append(u)
    await db.flush()
    print("   ✓ Users created (admin + 5 regular)")

    # ── Driver users ───────────────────────────────────────────────────────────
    driver_users = []
    drivers      = []
    for i in range(3):
        du = User(
            id=uuid.uuid4(),
            email=f"driver{i+1}@atozroutes.com",
            password_hash=hash_password("Driver123"),
            full_name=f"Driver {i+1}",
            role_id=roles["driver"].id,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(du)
        driver_users.append(du)

    await db.flush()

    for i, du in enumerate(driver_users):
        city_lat, city_lng = INDIAN_CITIES[i][2], INDIAN_CITIES[i][3]
        d = Driver(
            id=uuid.uuid4(), user_id=du.id,
            vehicle_type=choice(["bike","van","truck"]),
            license_number=f"MH{i+1:02d}AB{1000+i}",
            current_lat=city_lat + uniform(-0.05, 0.05),
            current_lng=city_lng + uniform(-0.05, 0.05),
            status=choice(["online","on_delivery","offline"]),
            rating=round(uniform(3.8, 5.0), 2),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(d)
        drivers.append(d)
    await db.flush()
    print("   ✓ Drivers created (3)")

    # ── Warehouses ─────────────────────────────────────────────────────────────
    warehouses = []
    for city, state, lat, lng in INDIAN_CITIES:
        w = Warehouse(
            id=uuid.uuid4(), name=f"{city} Fulfillment Center",
            city=city, country="India",
            latitude=lat, longitude=lng,
            type=choice(["hub","origin","transit","destination"]),
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(w)
        warehouses.append(w)
    await db.flush()
    print("   ✓ Warehouses created (8 cities)")

    # ── Shipments with events ──────────────────────────────────────────────────
    tracking_prefixes = {"amazon":"AZ","flipkart":"FK","dhl":"DHL","fedex":"FX",
                         "delhivery":"DL","bluedart":"BD","myntra":"MY","custom":"CS"}

    for i in range(30):
        user    = choice(regular_users)
        carrier = choice(CARRIERS)
        status  = choice(STATUSES)
        origin  = choice(warehouses)
        dest    = choice([w for w in warehouses if w.id != origin.id])
        days_ago = randint(1, 30)
        created  = datetime.now(timezone.utc) - timedelta(days=days_ago)
        est_del  = created + timedelta(days=randint(2, 7))
        act_del  = est_del if status == "delivered" else None

        prefix = tracking_prefixes.get(carrier, "TRK")
        tracking_num = f"{prefix}{uuid.uuid4().hex[:10].upper()}"

        s = Shipment(
            id=uuid.uuid4(),
            tracking_number=tracking_num,
            user_id=user.id,
            driver_id=choice(drivers).id if status in ["out_for_delivery","delivered"] else None,
            origin_warehouse_id=origin.id,
            dest_warehouse_id=dest.id,
            carrier=carrier, status=status,
            service_type=choice(["standard","express","overnight","economy"]),
            weight_kg=round(uniform(0.2, 15.0), 2),
            description=f"Shipment {i+1} — {carrier.title()} package",
            estimated_delivery=est_del,
            actual_delivery=act_del,
            ai_eta=est_del + timedelta(hours=randint(-12,12)),
            ai_confidence=round(uniform(55, 95), 1),
            delay_risk=choice(RISK_LEVELS),
            created_at=created,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s)
        await db.flush()

        # Add tracking events based on status
        status_chain = ["pending","picked_up","in_transit","out_for_delivery","delivered"]
        if status in status_chain:
            idx = status_chain.index(status)
            for j, st in enumerate(status_chain[:idx+1]):
                event_time = created + timedelta(hours=j*8 + randint(0,4))
                te = TrackingEvent(
                    id=uuid.uuid4(), shipment_id=s.id,
                    status=st,
                    description=f"Package {st.replace('_',' ')}",
                    latitude=origin.latitude + uniform(-0.1, 0.1),
                    longitude=origin.longitude + uniform(-0.1, 0.1),
                    location_name=choice(INDIAN_CITIES)[0],
                    occurred_at=event_time,
                    created_at=event_time,
                )
                db.add(te)

    await db.flush()
    print("   ✓ Shipments created (30) with tracking events")

    await db.commit()
    print("\n✅ Database seeded successfully!")
    print(f"   Admin login: admin@atozroutes.com / Admin123")
    print(f"   User login:  user1@example.com / User1234")
    print(f"   Driver login: driver1@atozroutes.com / Driver123")


async def main():
    async with Session() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
