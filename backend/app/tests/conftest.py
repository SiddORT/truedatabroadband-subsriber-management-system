"""
Shared test fixtures.

Creates a dedicated SUPERADMIN test user per session so tests remain
independent of the seeded admin account (whose password may be changed
in real usage).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.user import User, UserRole
from app.repositories.user import UserRepository

TEST_ADMIN_EMAIL = "_test_superadmin@truedata.test"
TEST_ADMIN_PASSWORD = "TestAdmin@9999!"

http_client = TestClient(app)


@pytest.fixture(scope="session")
def test_admin(tmp_path_factory) -> User:
    """
    Session-scoped: create a throw-away SUPERADMIN at the start of the
    test run and hard-delete it at the end.
    """
    db: Session = SessionLocal()
    repo = UserRepository(db)

    # Remove any leftover from a previous interrupted run
    existing = repo.get_by_email(TEST_ADMIN_EMAIL, include_deleted=True)
    if existing:
        db.delete(existing)
        db.commit()

    user = User(
        email=TEST_ADMIN_EMAIL,
        password_hash=hash_password(TEST_ADMIN_PASSWORD),
        role=UserRole.SUPERADMIN,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    yield user

    db.delete(user)
    db.commit()
    db.close()


@pytest.fixture(scope="session")
def admin_token(test_admin: User) -> str:
    """Return a Bearer token for the test SUPERADMIN (session-scoped)."""
    r = http_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Test admin login failed: {r.json()}"
    return r.json()["access_token"]
