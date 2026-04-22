"""Shared fixtures for ZapFlow backend tests."""
import os
import uuid
import pytest
import requests
from pathlib import Path

# Load backend .env-style REACT_APP_BACKEND_URL from frontend/.env
FRONTEND_ENV = Path("/app/frontend/.env")
BASE_URL = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set in /app/frontend/.env")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def test_user():
    uniq = uuid.uuid4().hex[:8]
    return {
        "name": "TEST User",
        "email": f"test_{uniq}@zapflow-qa.com",
        "password": "Test@12345",
    }


@pytest.fixture(scope="session")
def auth_token(api_client, test_user):
    """Register new user and return access_token."""
    r = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Register failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
