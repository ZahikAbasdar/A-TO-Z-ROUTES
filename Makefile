# ─────────────────────────────────────────────────────────────────────────────
# A TO Z ROUTES — Makefile
# Usage: make <target>
# ─────────────────────────────────────────────────────────────────────────────

COMPOSE     = docker compose -f infrastructure/docker-compose.yml
COMPOSE_PROD= docker compose -f infrastructure/docker-compose.prod.yml
BACKEND     = cd backend &&
FRONTEND    = cd frontend &&

.PHONY: help up down logs ps build migrate seed train-ai \
        dev-backend dev-frontend lint typecheck test clean

# ── Default ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  A to Z Routes — Available Commands"
	@echo "  ────────────────────────────────────"
	@echo "  make up           Start all services (dev)"
	@echo "  make down         Stop all services"
	@echo "  make build        Build all Docker images"
	@echo "  make migrate      Run Alembic DB migrations"
	@echo "  make seed         Seed database with sample data"
	@echo "  make train-ai     Train the ETA prediction model"
	@echo "  make logs         Tail all service logs"
	@echo "  make ps           Show running containers"
	@echo "  make dev-backend  Run backend locally (no Docker)"
	@echo "  make dev-frontend Run frontend locally (no Docker)"
	@echo "  make lint         Run linters"
	@echo "  make typecheck    Run TypeScript type check"
	@echo "  make test         Run all tests"
	@echo "  make clean        Remove containers, volumes, images"
	@echo ""

# ── Docker ────────────────────────────────────────────────────────────────────
up:
	$(COMPOSE) up -d
	@echo "\n✅ A to Z Routes is running!"
	@echo "   Frontend → http://localhost"
	@echo "   Backend  → http://localhost/api/v1"
	@echo "   API Docs → http://localhost/docs\n"

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build --no-cache

logs:
	$(COMPOSE) logs -f --tail=50

ps:
	$(COMPOSE) ps

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	$(COMPOSE) run --rm migrate
	@echo "✅ Migrations applied"

seed:
	$(COMPOSE) exec backend python -m scripts.seed_data
	@echo "✅ Sample data seeded"

# ── AI Model ──────────────────────────────────────────────────────────────────
train-ai:
	$(COMPOSE) --profile train run --rm ai_trainer
	@echo "✅ ETA model trained and saved"

# Shortcut: train locally without Docker
train-ai-local:
	$(BACKEND) python -m ai.train.train_eta

# ── Local dev (without Docker) ────────────────────────────────────────────────
dev-backend:
	$(BACKEND) pip install -r requirements.txt && \
	uvicorn app.main:app --reload --port 8000

dev-frontend:
	$(FRONTEND) npm install && npm run dev

# ── Quality ───────────────────────────────────────────────────────────────────
lint:
	$(BACKEND) ruff check . --fix
	$(FRONTEND) npm run lint

typecheck:
	$(FRONTEND) npm run type-check

test:
	$(BACKEND) pytest tests/ -v --tb=short

# ── Production ────────────────────────────────────────────────────────────────
prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f --tail=100

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean:
	$(COMPOSE) down -v --rmi local --remove-orphans
	@echo "✅ All containers, volumes and local images removed"
