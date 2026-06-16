# True Data Broadband Services Pvt. Ltd.

Production-ready broadband management system — **Phase 1: Foundation & Authentication**.

This phase delivers architecture, authentication scaffolding, shared layouts, and
reusable infrastructure only. No business modules (customers, plans, invoices,
payments, reports, tickets) are implemented yet.

---

## Tech Stack

**Backend:** Python 3.12 · FastAPI · PostgreSQL · SQLAlchemy 2.0 · Alembic ·
Pydantic v2 · JWT · Passlib/Bcrypt · Structured logging (structlog)

**Frontend:** React · TypeScript · Vite · Tailwind CSS · shadcn-style UI ·
React Router · TanStack Query · Axios

**Infrastructure:** Docker · Docker Compose

---

## Project Structure

```
/
├── backend/            FastAPI application
│   ├── app/
│   │   ├── api/        Versioned routes (/api/v1)
│   │   ├── core/       Config, database, security, logging
│   │   ├── dependencies/  Auth & role-based dependencies
│   │   ├── models/     SQLAlchemy models + BaseModel mixin
│   │   ├── repositories/  Data-access layer (soft deletes)
│   │   ├── schemas/    Pydantic schemas
│   │   ├── services/   Business/auth services
│   │   ├── storage/    StorageService interface (local/S3/R2)
│   │   ├── utils/      Seed script
│   │   └── tests/      Pytest suite
│   ├── alembic/        Migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/           React + Vite application
│   ├── src/
│   │   ├── components/ UI primitives + DataTable scaffold
│   │   ├── contexts/   AuthContext
│   │   ├── hooks/      useAuth
│   │   ├── layouts/    AppLayout (sidebar/header/content/footer)
│   │   ├── pages/      Login + admin/client dashboards
│   │   ├── routes/     Role-based ProtectedRoute
│   │   ├── services/   Axios client + auth service
│   │   └── types/
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Quick Start (Docker)

The whole stack runs with a single command:

```bash
docker compose up --build
```

This starts three services:

| Service   | URL                              | Notes                          |
|-----------|----------------------------------|--------------------------------|
| frontend  | http://localhost:5173            | React app (nginx)              |
| backend   | http://localhost:8000            | FastAPI                        |
| postgres  | localhost:5432                   | PostgreSQL 16                  |

On startup the backend automatically runs migrations and seeds the default
SUPERADMIN user.

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health: http://localhost:8000/api/v1/health

### Default credentials

```
Email:    admin@truedata.local
Password: ChangeMe@123
Role:     SUPERADMIN
```

A password change is forced on first login (`must_change_password = true`).

---

## Local Development (without Docker)

### Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env   # then edit DATABASE_URL etc.

# Run migrations
python -m alembic upgrade head

# Seed the default SUPERADMIN
python -m app.utils.seed

# Start the API (http://localhost:8000)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
python -m pytest
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start the dev server (http://localhost:5000)
npm run dev

# Production build
npm run build
```

The Vite dev server proxies `/api` to the backend (configurable via
`VITE_PROXY_TARGET`).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable                    | Description                                   | Default                              |
|-----------------------------|-----------------------------------------------|--------------------------------------|
| `ENVIRONMENT`               | `development` or `production`                  | `development`                        |
| `DATABASE_URL`              | PostgreSQL connection string                  | —                                    |
| `SECRET_KEY`                | JWT signing secret                            | —                                    |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime                       | `30`                                 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime                        | `7`                                  |
| `BACKEND_CORS_ORIGINS`      | Comma-separated origins, or `*`               | `*`                                  |
| `STORAGE_BACKEND`           | `local` (`s3`/`r2` planned)                   | `local`                              |
| `STORAGE_ROOT`              | Storage root directory                        | `storage`                            |
| `SEED_ADMIN_EMAIL`          | Default SUPERADMIN email                       | `admin@truedata.local`               |
| `SEED_ADMIN_PASSWORD`       | Default SUPERADMIN password                    | `ChangeMe@123`                       |

### Frontend (`frontend/.env`)

| Variable             | Description                          | Default                  |
|----------------------|--------------------------------------|--------------------------|
| `VITE_API_BASE_URL`  | API base path                        | `/api/v1`                |
| `VITE_PROXY_TARGET`  | Dev proxy target for `/api`          | `http://localhost:8000`  |

---

## Migration Commands

```bash
cd backend

# Apply all migrations
python -m alembic upgrade head

# Create a new (autogenerated) migration
python -m alembic revision --autogenerate -m "describe change"

# Roll back the latest migration
python -m alembic downgrade -1
```

---

## Seed Commands

```bash
cd backend
python -m app.utils.seed
```

Idempotent: it will not create a duplicate if the SUPERADMIN already exists.

---

## API Reference

| Method | Endpoint                  | Auth        | Description                  |
|--------|---------------------------|-------------|------------------------------|
| GET    | `/api/v1/health`          | Public      | Health check                 |
| POST   | `/api/v1/auth/login`      | Public      | Login → access + refresh JWT |
| POST   | `/api/v1/auth/refresh`    | Public      | Exchange refresh for access  |
| POST   | `/api/v1/auth/logout`     | Bearer      | Logout placeholder           |
| GET    | `/api/v1/auth/me`         | Bearer      | Current user                 |

---

## Architecture Notes

- **BaseModel mixin:** UUID primary keys + `created_at` / `updated_at` /
  `deleted_at` timestamps. **Soft deletes only** — rows are never physically removed.
- **Auth:** Stateless JWT access + refresh tokens, bcrypt password hashing,
  role-based dependencies (`SUPERADMIN`, `CLIENT`).
- **Storage:** `StorageService` interface with a local filesystem implementation;
  AWS S3 and Cloudflare R2 backends can be added without touching callers. Upload
  logic is intentionally deferred to a later phase.
- **DataTable:** Reusable, controlled, server-side-ready table scaffold
  (pagination, search, sorting). Default page size `10`; options `10/25/50/100`.

---

*Powered by ORT*
