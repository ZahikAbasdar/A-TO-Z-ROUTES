-- ─────────────────────────────────────────────────────────────────────────────
-- A TO Z ROUTES — PostgreSQL Initialization Script
-- Runs once when the postgres container first starts
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fast ILIKE search on tracking numbers

-- Ensure UTF-8
SET client_encoding = 'UTF8';

-- ── Seed roles (idempotent) ──────────────────────────────────────────────────
-- Note: Tables are created by Alembic migrations.
-- This script only seeds reference data that must exist before the app starts.
-- The INSERT is deferred to after Alembic runs via the migrate service.

-- Nothing else needed here — Alembic handles schema creation.
-- Role seeding happens in AuthService._get_role_by_name() fallback.

SELECT 'Database initialized' AS status;
