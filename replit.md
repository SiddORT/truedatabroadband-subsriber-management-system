# True Data Broadband Pvt. Ltd. — Broadband Management System

## Overview
Phase 1 (Foundation & Authentication) of a broadband management system. This phase
contains ONLY architecture, authentication scaffolding, shared layouts, and reusable
infrastructure. No business modules (customers, plans, subscriptions, invoices,
payments, reports, tickets) are implemented.

Monorepo:
- `backend/` — Python 3.12, FastAPI, PostgreSQL, SQLAlchemy 2.0, Alembic, Pydantic v2, JWT, bcrypt.
- `frontend/` — React, TypeScript, Vite, Tailwind CSS, shadcn-style UI, React Router, TanStack Query, Axios.

## Running on Replit
Two workflows (the app runs natively — Replit cannot run Docker):
- **Backend API** — `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- **Start application** — `cd frontend && ../node_modules/.bin/vite` (port 5000, webview)

The Vite dev server proxies `/api` → `localhost:8000`.

Default SUPERADMIN (seeded): `admin@truedata.local` / `TrueData@123`.

## Environment / Architecture Notes
- Node packages are installed at the repo ROOT (`node_modules/`), not in `frontend/`.
  `frontend/package.json` is authored for Docker; Vite run from `frontend/` resolves the root `node_modules`.
- PostgreSQL is the Replit-provisioned DB via `DATABASE_URL`.
- Soft deletes only (BaseModel mixin: UUID PK + created/updated/deleted timestamps).
- Storage uses a `StorageService` interface (local filesystem impl); S3/R2 can be added later.
- Docker files (`docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`) are deliverables for local/prod use, not used on Replit.

## User Preferences
- Phase 1 scope is strict: foundation/auth only. Do NOT add business modules unless explicitly requested.
- Footer must read "Powered by ORT".
- Theme: Primary #1F4959, PrimaryDark #011425, Secondary #5C7C89, bg #F5F7F8; rounded 12px, soft shadows; dark sidebar (#011425, active #1F4959).
