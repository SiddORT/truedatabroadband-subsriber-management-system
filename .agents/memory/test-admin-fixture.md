---
name: Test admin fixture
description: Why tests need their own SUPERADMIN account and how to set it up.
---

## Rule
Never rely on the seeded `admin@truedata.local` account in automated tests. Its password can be changed by real users through the application UI, causing every test that calls the login endpoint to fail with 401.

## How to apply
Create `backend/app/tests/conftest.py` with a **session-scoped** fixture that:
1. Creates a disposable SUPERADMIN user (`_test_superadmin@truedata.test`, known password).
2. Yields an access token derived from that user.
3. Hard-deletes the user in the fixture teardown.

The `admin_token` fixture is then safe to share across the entire test session.

**Why:** The session fixture creates and logs in once, keeping tests fast, and the dedicated account is never touched by real traffic.

## Key detail
Test mobile numbers must be **numeric-only** — the customer validator is `^\d{10}$`. Generating mobile numbers from UUID hex (which contains a–f) causes 422 rejections. Use `str(uuid.uuid4().int)[:9]` to get 9 decimal digits, then prefix with `"9"`.
