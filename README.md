# A to Z Routes 🚀

**Track Every Mile, From A to Z**

A premium logistics intelligence platform combining real-time package tracking, AI-powered ETA prediction, live route visualization, and a driver delivery module — built as a production-ready full-stack application.

> **Built by Zahik Abas** · [Portfolio Project]

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 · TypeScript · Tailwind CSS · Shadcn UI · Framer Motion |
| **Maps** | Mapbox GL JS · react-map-gl |
| **State** | Zustand · React Query (TanStack) |
| **Backend** | FastAPI · Python 3.11 · Pydantic v2 |
| **Database** | PostgreSQL 15 · SQLAlchemy 2.0 (async) · Alembic |
| **Cache** | Redis 7 · hiredis |
| **Real-time** | WebSocket (FastAPI native) |
| **AI/ML** | XGBoost · Scikit-learn · NumPy · Pandas |
| **Infrastructure** | Docker · Docker Compose · Nginx |
| **Cloud** | AWS ECS · RDS · ElastiCache · ECR |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose v2
- Make (optional but recommended)
- Node.js 20+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### 1. Clone and configure
```bash
git clone https://github.com/zahikabas/a-to-z-routes.git
cd a-to-z-routes

# Copy environment template
cp infrastructure/.env.production.example infrastructure/.env
# Edit .env with your values (Mapbox token at minimum)
```

### 2. Start everything
```bash
make up          # Builds and starts all 5 services
make migrate     # Applies Alembic DB migrations
make seed        # Populates with sample data
make train-ai    # Trains the XGBoost ETA model (~30s)
```

### 3. Open the app
| Service | URL |
|---|---|
| **Application** | http://localhost |
| **API Docs** | http://localhost/docs |
| **Backend direct** | http://localhost:8000 |

### Default credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@atozroutes.com | Admin123 |
| User | user1@example.com | User1234 |
| Driver | driver1@atozroutes.com | Driver123 |

---

## Project Structure

```
a-to-z-routes/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── api/v1/            # REST endpoints (8 routers)
│   │   ├── core/              # Config, DB, Redis, Security
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   └── websockets/        # WS connection manager + endpoint
│   ├── ai/                    # Machine learning
│   │   ├── features.py        # Feature engineering (14 features)
│   │   ├── predictor.py       # XGBoost ETA predictor singleton
│   │   ├── delay_predictor.py # Rule-based delay risk scorer
│   │   └── train/             # Training scripts
│   ├── scripts/               # Seed data, utilities
│   └── tests/                 # Unit + integration tests
│
├── frontend/                   # Next.js 14 application
│   ├── app/
│   │   ├── (auth)/            # Login, Register pages
│   │   ├── (dashboard)/       # Overview, Shipments, Tracking, Analytics
│   │   ├── (driver)/          # Driver dashboard
│   │   ├── (admin)/           # Admin dashboard
│   │   └── track/             # Public tracking page (no login)
│   ├── components/
│   │   ├── maps/              # Mapbox route map, mini map
│   │   ├── tracking/          # Timeline, ETA card, delay risk card
│   │   └── shared/            # Sidebar, Topbar, Providers
│   └── lib/
│       ├── api/               # Axios client + API functions
│       ├── hooks/             # React Query + WS hooks
│       ├── store/             # Zustand auth store
│       └── utils/             # Formatters, status config
│
└── infrastructure/
    ├── docker/                # Dockerfiles (backend + frontend)
    ├── nginx/                 # Reverse proxy config
    ├── aws/                   # ECS task definitions, deploy script
    ├── docker-compose.yml     # Development stack
    └── docker-compose.prod.yml # Production stack
```

---

## Features

### Core Platform
- JWT authentication with refresh token rotation and Redis blacklisting
- Role-based access control (Admin / User / Driver)
- Soft deletes on critical tables
- Audit logging on all sensitive actions

### Package Tracking
- Amazon, Flipkart, Myntra, DHL, FedEx, Delhivery, Blue Dart, Custom
- Visual 5-step timeline (Registered → Picked Up → In Transit → Out for Delivery → Delivered)
- Public tracking page — no login required
- 30-second auto-refresh on tracking pages

### Live Maps
- Mapbox dark-theme map embedded in tracking detail
- Warehouse origin/destination markers
- Animated route line (glow + dash overlay)
- Live driver location with pulsing ping animation
- Expand to fullscreen, re-center controls

### Real-time WebSockets
- Room-based pub/sub (`shipment:{id}`, `user:{id}`, `driver:{id}`, `admin`)
- Exponential backoff reconnect on client (1s → 30s max)
- Heartbeat ping every 25 seconds
- Live event feed on tracking page
- Push notifications to notification bell

### AI / ML
- **ETA Prediction**: XGBoost regressor, 14 engineered features, trained on 20,000 synthetic samples. Falls back to rule-based prediction when model file is absent.
- **Delay Risk**: 8-factor heuristic scorer (carrier reliability, staleness, distance, peak season, etc.) → 0–100 score → low/medium/high classification

### Analytics
- 30-day shipment activity area chart
- Carrier success rate bar chart
- Delay risk donut chart
- Hour-of-day shipment creation pattern
- Carrier detail table with inline progress bars

### Admin
- Platform-wide stats with live WS connection count
- User management (search, filter by role, suspend/activate)
- All-shipments oversight with driver assignment
- Timestamped audit log with IP tracking

---

## Development

### Backend only (no Docker)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

### Frontend only (no Docker)
```bash
cd frontend
npm install
cp .env.example .env.local   # add your Mapbox token
npm run dev
```

### Train the AI model
```bash
cd backend
python -m ai.train.train_eta
# Outputs: ai/models/eta_model.json + eta_model_meta.json
# Typical metrics: MAE ~0.4 days, R² ~0.85
```

### Run tests
```bash
cd backend
pytest tests/ -v
```

---

## API Reference

Base URL: `http://localhost/api/v1`

| Module | Prefix | Endpoints |
|---|---|---|
| Auth | `/auth` | register, login, logout, refresh, me, change-password |
| Shipments | `/shipments` | CRUD + dashboard stats/trends/carriers |
| Tracking | `/tracking` | public track, detail, events, route GeoJSON |
| Drivers | `/drivers` | stats, active, location update, status update |
| Analytics | `/analytics` | performance metrics (7/30/90 day) |
| Notifications | `/notifications` | list, mark read, delete + delay prediction |
| Admin | `/admin` | platform stats, users, shipments, audit logs |
| AI ETA | `/eta` | predict, bulk-predict, model info |
| WebSocket | `/ws` | real-time tracking + notifications |

Full interactive docs: `http://localhost/docs`

---

## Production Deployment

### AWS Architecture
```
Internet → Route 53 → ACM (TLS) → ALB
                                    ├── ECS Fargate (backend × 2)
                                    └── ECS Fargate (frontend × 1)

ECS Backend → RDS PostgreSQL 15 (db.t3.medium)
           → ElastiCache Redis 7 (cache.t3.micro)
           → EFS (AI model storage)
           → Secrets Manager (credentials)
           → CloudWatch Logs
```

### Deploy
```bash
# Set secrets in GitHub → Settings → Secrets:
# AWS_ACCOUNT_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_MAPBOX_TOKEN
# ECS_SUBNET, ECS_SG, APP_URL

# Push to main branch → GitHub Actions runs:
# 1. Backend tests (pytest + coverage)
# 2. Frontend type-check + lint
# 3. Build & push Docker images to ECR
# 4. Run Alembic migrations on ECS
# 5. Deploy backend + frontend to ECS Fargate
# 6. Wait for services to stabilize
```

---

## License

MIT — built as a portfolio project by Zahik Abas.
