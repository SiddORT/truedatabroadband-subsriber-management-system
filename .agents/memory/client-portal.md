---
name: Client portal architecture
description: Key decisions and gotchas for the client self-service portal
---

## User → Customer link
`Customer.user_id` (FK, unique) is the authoritative link — no `customer_id` on `User`.
Backend helper: `CustomerRepository(db).get_by_user_id(current_user.id)`.
NEVER add a circular `customer_id` FK to users; the existing one-to-one via `user_id` on customers is sufficient.

## JWT claims
- Access token (`type=access`): has `sub`, `type`, `iat`, `exp` — **NO `jti`**.
- Refresh token (`type=refresh`): has `sub`, `jti`, `type`, `iat`, `exp`.
- Session "current device" detection from the access token is not possible without adding jti to access tokens.

## ToastContext API
`showToast(message: string, type?: "success" | "error" | "info")` — not addToast, not toast().

## TanStack Query v5
`onSuccess` was removed from `useQuery` options. Use `useEffect` watching the query data instead.

**Why:** TanStack Query v5 removed all side-effect callbacks from useQuery to enforce a cleaner data-fetching model.
**How to apply:** `useEffect(() => { if (data) { setLocalState(data.field); } }, [data]);`

## Client API namespace
All client endpoints live under `/api/v1/client/` with `require_client` dependency.
Ownership enforced via `_get_customer_or_403(user, db, request)` helper in client.py.
Unauthorized access logged to audit_log with action `unauthorized_client_access_attempt`.

## Routes
- `/client/connections` → subscription detail
- `/client/billing` → invoices; `/client/billing/payments` → payments
- `/client/profile` → profile management
- `/client/sessions` → session management
- Legacy paths redirect: `/client/subscription` → `/client/connections`, `/client/invoices` → `/client/billing`
