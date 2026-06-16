---
name: Phase completion tracker
description: Which phases are complete and key patterns established per phase.
---

## Phase 1 — Foundation & Auth (complete)
- JWT auth, SUPERADMIN seeder, role-based ProtectedRoute, AppLayout with dark sidebar.
- Vite proxy `/api` → `localhost:8000`.

## Phase 2 — Plans (complete)
- CRUD for Plan + PlanPricing (monthly/quarterly/semi-annual/annual intervals).
- Alembic migrations 0001–0007.

## Phase 3 — Subscriptions (complete)
- Subscription model; status enum (ACTIVE/SUSPENDED/EXPIRED/CANCELLED/PENDING).
- Migration 0008. 13 tests pass.
- Unified list-page pattern: CardHeader toolbar (count left, filter right h-9 rounded-lg), CardContent p-0.

## Phase 4 — Company Settings & Invoice Settings (complete)
- Singleton `company_settings` table (no soft-delete, no BaseModelMixin).
- `get_or_create()` pattern in repo — at most one row ever; enforced at app layer.
- Storage bucket "company"; logo saved as `logo/logo{ext}`, served at GET /api/v1/settings/company/logo (no auth).
- Audit actions: `settings_updated`, `settings_logo_uploaded`.
- Migration 0009. 14 tests pass.
- Frontend: SettingsPage at `/admin/settings` (4 tabs: Company Info, Address, Invoice, Branding). SUPERADMIN only.

**Why singleton**: Company profile is system-wide config; multiple rows would be ambiguous.
**How to apply**: Any future "global config" table should follow the same get_or_create repo pattern.
