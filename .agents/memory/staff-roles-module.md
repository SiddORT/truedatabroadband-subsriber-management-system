---
name: Staff/Roles module design
description: Key decisions for Users, Roles & Permissions module (migrations 0027-0028, STAFF invite flow)
---

## Invite flow
- STAFF users are invite-only: password_hash set to `hash_password("!INVITE_PENDING!")` at creation; cleared and replaced on `/auth/accept-invite` (public, no auth).
- `invite_token` is `secrets.token_hex(32)` (64 chars), expires in 48 hours.
- After accepting, `invite_token` is set to None and `invite_accepted_at` is set.
- `User.invite_status` is a Python `@property` (not a DB column); Pydantic v2 `from_attributes=True` reads it fine.

## ProtectedRoute multi-role
- `ProtectedRoute` now accepts `role: UserRole | UserRole[]`; AdminRoute uses `["SUPERADMIN", "STAFF"]`; SuperAdminRoute wraps settings/users/roles pages.

## Data scope
- `Role.data_scope` = "ALL" | "ASSIGNED" | "REFERENCE"
- Customer now has `assigned_staff_id` and `reference_partner_id` FK→users with SET NULL.

## Frontend api export name
- `"@/services/api"` exports `api` (not `apiClient`); import as `import { api as apiClient } from "./api"` in new service files.

## ALTER TYPE ADD VALUE
- `op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STAFF'"))` works in a transaction on PG12+.

**Why:** Tried `requests` module in smoke test — not installed in Replit backend env; use `curl` instead.
