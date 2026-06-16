"""
Comprehensive auth tests.

Uses the real database (same seeded admin user).  Tests that require a client
user create one via the repository and clean up in teardown.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.user import User, UserRole
from app.repositories.user import UserRepository

PREFIX = settings.API_V1_PREFIX
ADMIN_EMAIL = settings.SEED_ADMIN_EMAIL
ADMIN_PASSWORD = settings.SEED_ADMIN_PASSWORD

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client_user(db: Session) -> User:
    """Create a temporary CLIENT user and remove it after the test."""
    repo = UserRepository(db)
    email = "_test_client@truedata.test"
    existing = repo.get_by_email(email, include_deleted=True)
    if existing:
        db.delete(existing)
        db.commit()

    user = User(
        email=email,
        password_hash=hash_password("Test@1234!"),
        role=UserRole.CLIENT,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    yield user

    db.delete(user)
    db.commit()


def _login(email: str, password: str) -> dict:
    r = client.post(f"{PREFIX}/auth/login", json={"email": email, "password": password})
    return r


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


def test_login_success():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["role"] == "SUPERADMIN"


def test_login_invalid_password():
    r = _login(ADMIN_EMAIL, "WrongPassword!")
    assert r.status_code == 401
    assert "Invalid" in r.json()["detail"]


def test_login_unknown_email():
    r = _login("nobody@truedata.local", ADMIN_PASSWORD)
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------


def test_me_requires_auth():
    r = client.get(f"{PREFIX}/auth/me")
    assert r.status_code == 401


def test_me_returns_current_user():
    at = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()["access_token"]
    r = client.get(f"{PREFIX}/auth/me", headers=_bearer(at))
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


# ---------------------------------------------------------------------------
# Token refresh + rotation
# ---------------------------------------------------------------------------


def test_refresh_returns_new_tokens():
    body = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()
    rt = body["refresh_token"]

    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 200
    new_body = r.json()
    assert "access_token" in new_body
    assert "refresh_token" in new_body
    assert new_body["refresh_token"] != rt  # must be a new token


def test_refresh_rotated_old_token_is_revoked():
    rt = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()["refresh_token"]

    # First refresh — succeeds and rotates the token
    client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": rt})

    # Second use of the original token — must fail (revoked)
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 401


def test_refresh_invalid_token():
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": "not.a.token"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


def test_logout_revokes_session():
    body = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()
    at, rt = body["access_token"], body["refresh_token"]

    r = client.post(
        f"{PREFIX}/auth/logout",
        json={"refresh_token": rt},
        headers=_bearer(at),
    )
    assert r.status_code == 200

    # Revoked token can no longer be refreshed
    r2 = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": rt})
    assert r2.status_code == 401


def test_logout_requires_auth():
    r = client.post(f"{PREFIX}/auth/logout", json={})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Role restrictions
# ---------------------------------------------------------------------------


def test_admin_test_route_superadmin():
    at = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()["access_token"]
    r = client.get(f"{PREFIX}/admin/test", headers=_bearer(at))
    assert r.status_code == 200


def test_admin_test_route_client_is_forbidden(client_user: User):
    body = _login(client_user.email, "Test@1234!").json()
    at = body["access_token"]
    r = client.get(f"{PREFIX}/admin/test", headers=_bearer(at))
    assert r.status_code == 403


def test_client_test_route_client(client_user: User):
    body = _login(client_user.email, "Test@1234!").json()
    at = body["access_token"]
    r = client.get(f"{PREFIX}/client/test", headers=_bearer(at))
    assert r.status_code == 200


def test_client_test_route_superadmin_is_forbidden():
    at = _login(ADMIN_EMAIL, ADMIN_PASSWORD).json()["access_token"]
    r = client.get(f"{PREFIX}/client/test", headers=_bearer(at))
    assert r.status_code == 403


def test_protected_route_unauthenticated():
    assert client.get(f"{PREFIX}/admin/test").status_code == 401
    assert client.get(f"{PREFIX}/client/test").status_code == 401


# ---------------------------------------------------------------------------
# Password change
# ---------------------------------------------------------------------------


def test_change_password_wrong_old_password(client_user: User):
    at = _login(client_user.email, "Test@1234!").json()["access_token"]
    r = client.post(
        f"{PREFIX}/auth/change-password",
        json={"old_password": "Wrong@1234!", "new_password": "NewValid@9!"},
        headers=_bearer(at),
    )
    assert r.status_code == 400
    assert "incorrect" in r.json()["detail"].lower()


def test_change_password_weak_new_password(client_user: User):
    at = _login(client_user.email, "Test@1234!").json()["access_token"]
    r = client.post(
        f"{PREFIX}/auth/change-password",
        json={"old_password": "Test@1234!", "new_password": "weak"},
        headers=_bearer(at),
    )
    assert r.status_code == 422
    assert "violations" in r.json()["detail"]


def test_change_password_success(client_user: User):
    at = _login(client_user.email, "Test@1234!").json()["access_token"]
    new_pw = "NewSecure@99!"

    r = client.post(
        f"{PREFIX}/auth/change-password",
        json={"old_password": "Test@1234!", "new_password": new_pw},
        headers=_bearer(at),
    )
    assert r.status_code == 200

    # Old password no longer works
    assert _login(client_user.email, "Test@1234!").status_code == 401

    # New password works
    assert _login(client_user.email, new_pw).status_code == 200
