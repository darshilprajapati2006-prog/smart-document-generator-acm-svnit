import pytest
from app.core import firebase_auth
from app.core.security import decode_access_token


def _test_firebase_token(token):
    payload = decode_access_token(token)
    if payload:
        return {"uid": payload["sub"], "email": payload["email"], "email_verified": True}
    if isinstance(token, str) and token.startswith("test-firebase:"):
        _, uid, email, verified = token.split(":", 3)
        return {"uid": uid, "email": email, "email_verified": verified == "1"}
    raise ValueError("invalid test Firebase token")

@pytest.fixture(autouse=True)
def configure_test_firebase_environment(monkeypatch, request):
    """Replace Firebase's network-backed verifier with deterministic test token fixtures."""
    monkeypatch.setattr(firebase_auth, "verify_firebase_id_token", _test_firebase_token)
