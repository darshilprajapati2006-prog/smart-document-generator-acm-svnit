import pytest
import os
os.environ.setdefault("JWT_SECRET_KEY", "smartdocs-test-secret-key-for-unit-tests-only-2026")
from app.core import firebase_auth
from app.core.security import decode_access_token
from app.db.seed import seed_database


def _test_firebase_token(token):
    payload = decode_access_token(token)
    if payload:
        return {"uid": payload["sub"], "email": payload["email"], "email_verified": True}
    if isinstance(token, str) and token.startswith("test-firebase:"):
        _, uid, email, verified = token.split(":", 3)
        project_id = os.getenv("FIREBASE_PROJECT_ID", "smartdocs-svnit-6904c")
        return {
            "uid": uid,
            "sub": uid,
            "email": email,
            "email_verified": verified == "1",
            "aud": project_id,
            "iss": f"https://securetoken.google.com/{project_id}",
        }
    raise ValueError("invalid test Firebase token")

@pytest.fixture(autouse=True)
def configure_test_firebase_environment(monkeypatch, request):
    """Replace Firebase's network-backed verifier with deterministic test token fixtures."""
    monkeypatch.setattr(firebase_auth, "verify_firebase_id_token", _test_firebase_token)
    # TestClient does not run the ASGI lifespan unless used as a context manager.
    # Initialize the isolated test database here so route tests exercise the app schema.
    seed_database()


@pytest.fixture(scope="session", autouse=True)
def isolate_test_database(tmp_path_factory):
    """Keep all test-side mutations, including bootstrap markers, out of app data."""
    patch = pytest.MonkeyPatch()
    path = tmp_path_factory.mktemp("smartdocs-tests") / "smartdocs-test.db"
    patch.setenv("SMARTDOCS_DATABASE_PATH", str(path))
    patch.setenv("SMARTDOCS_DB_BACKEND", "sqlite")
    patch.setenv("SMARTDOCS_STORAGE_BACKEND", "local")
    yield path
    patch.undo()
