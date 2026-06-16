---
name: EmailStr rejects .local domains
description: Why login/user email fields use plain str instead of Pydantic EmailStr
---

Pydantic v2's `EmailStr` (via `email-validator`) rejects special-use / reserved
TLDs like `.local`. The seeded SUPERADMIN is `admin@truedata.local`, so using
`EmailStr` on `LoginRequest.email` / `UserOut.email` causes a 422 on valid logins.

**Rule:** Email fields that must accept `.local` (or other reserved) domains use
plain `str`, not `EmailStr`.

**Why:** The default seed account domain is `truedata.local`; validation must not
block it.

**How to apply:** If adding new schemas with email fields used by internal/seed
accounts, prefer `str` (optionally with a light custom check) over `EmailStr`.
