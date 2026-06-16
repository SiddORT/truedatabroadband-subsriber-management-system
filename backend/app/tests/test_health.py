from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get(f"{settings.API_V1_PREFIX}/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_me_requires_auth():
    response = client.get(f"{settings.API_V1_PREFIX}/auth/me")
    assert response.status_code == 401
