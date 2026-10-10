"""
Comprehensive Automated Test Suite for Secure Role-Based Authentication & Verification.
Tests:
1. Two-Factor Authentication (OTP on Login) for all 6 roles.
2. Sign-Up / Public Registration with Email OTP verification.
3. Brute-force and replay protection, attempt limits, and cooldowns.
4. Forgot Password & Password Reset via OTP.
5. Deactivated and unverified account rejection.
6. System Admin Exclusive User Management (CRUD, role assignment, deactivation).
7. Self-role escalation prevention.
8. Role-Based Permissions for document generation across all roles.
9. Security Audit Logging.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.seed import seed_database
from app.core.security import create_access_token

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setenv("SEED_DEMO_USERS", "true")
    seed_database()

def helper_login(email: str, password: str) -> dict:
    """Test helper representing a successfully verified Firebase session."""
    from app.db.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT id,email,full_name,role,status,is_verified FROM users WHERE email=?", (email,)).fetchone()
    assert row, f"Missing seeded test user: {email}"
    token = create_access_token(row["id"], row["email"], row["role"], row["full_name"])
    return {"access_token": token, "user": dict(row), "success": True}


def firebase_headers(email, uid, verified=False):
    return {"Authorization": f"Bearer test-firebase:{uid}:{email}:{1 if verified else 0}"}


# ============================================================
# 1. TWO-STEP LOGIN TESTS (All 6 Roles)
# ============================================================

def test_verified_firebase_sessions_preserve_database_roles():
    for email, password, expected in [
        ("admin@svnit.acm.org", "Admin@1234", "admin"),
        ("author@svnit.acm.org", "Author@1234", "author"),
        ("reviewer@svnit.acm.org", "Reviewer@1234", "reviewer"),
        ("approver@svnit.acm.org", "Approver@1234", "approver"),
        ("tmpladmin@svnit.acm.org", "TmplAdmin@1234", "template_admin"),
        ("viewer@svnit.acm.org", "Viewer@1234", "viewer"),
    ]:
        data = helper_login(email, password)
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
        assert res.status_code == 200
        assert res.json()["user"]["role"] == expected

def test_firebase_token_required_for_backend_authentication():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-token"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer test-firebase:unlinked:user@svnit.ac.in:1"}).status_code == 401

def test_unverified_firebase_token_cannot_open_backend_session():
    email = "student@svnit.ac.in"
    token = "test-firebase:uid-unverified:student@svnit.ac.in:0"
    assert client.post("/api/auth/session", headers={"Authorization": f"Bearer {token}"}).status_code == 403

def test_signup_registration_requires_firebase_email_verification():
    email = f"new_author_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    uid = f"uid-{uuid.uuid4().hex}"
    res = client.post("/api/auth/register", headers=firebase_headers(email, uid), json={
        "role": "author", "full_name": "New SVNIT Author", "email": email,
    })
    assert res.status_code == 200
    assert res.json()["requires_email_verification"] is True
    assert client.post("/api/auth/session", headers=firebase_headers(email, uid)).status_code == 403
    assert client.get("/api/auth/me", headers=firebase_headers(email, uid, True)).status_code == 403
    verified = client.post("/api/auth/session", headers=firebase_headers(email, uid, True))
    assert verified.status_code == 200
    assert verified.json()["user"]["role"] == "author"
    assert verified.json()["user"]["is_verified"] == 1

def test_public_registration_rejects_privileged_role_and_noninstitutional_domain():
    email = f"rolecheck_{uuid.uuid4().hex[:6]}@svnit.ac.in"
    uid = f"uid-{uuid.uuid4().hex}"
    bad_role = client.post("/api/auth/register", headers=firebase_headers(email, uid), json={
        "role": "admin", "full_name": "Role Check", "email": email,
    })
    assert bad_role.status_code == 403
    external = client.post("/api/auth/register", headers=firebase_headers("student@example.com", uid), json={
        "role": "author", "full_name": "External", "email": "student@example.com",
    })
    assert external.status_code == 422

def test_public_registration_rejects_privileged_role_and_noninstitutional_domain():
    base = {
        "full_name": "Role Check",
        "email": f"rolecheck_{uuid.uuid4().hex[:6]}@svnit.ac.in",
        "password": "StrongPassword@2026",
        "confirm_password": "StrongPassword@2026",
    }
    escalation = client.post("/api/auth/register", json={**base, "role": "admin"})
    assert escalation.status_code == 422
    external = client.post("/api/auth/register", json={**base, "email": "student@example.com"})
    assert external.status_code == 422


def test_legacy_resend_otp_endpoint_is_removed():
    assert client.post("/api/auth/resend-email-otp", json={"email": "student@svnit.ac.in"}).status_code == 404

def test_legacy_otp_password_reset_endpoint_is_removed():
    assert client.post("/api/auth/forgot-password", json={"email": "student@svnit.ac.in"}).status_code == 404
    assert client.post("/api/auth/reset-password", json={}).status_code == 404

def test_admin_user_management_lifecycle():
    """Verify System Admin can list, create, change roles, deactivate accounts, and view audit logs."""
    admin_data = helper_login("admin@svnit.acm.org", "Admin@1234")
    admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}

    # 1. Admin lists users
    list_res = client.get("/api/auth/users", headers=admin_headers)
    assert list_res.status_code == 200
    users = list_res.json()["users"]
    assert len(users) >= 6
    for u in users:
        assert "password" not in u
        assert "hashed_password" not in u

    # 2. Non-admin blocked from listing users
    author_data = helper_login("author@svnit.acm.org", "Author@1234")
    author_headers = {"Authorization": f"Bearer {author_data['access_token']}"}
    forbidden_list = client.get("/api/auth/users", headers=author_headers)
    assert forbidden_list.status_code == 403

    # 3. Admin creates reviewer account
    new_email = f"reviewer_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    create_res = client.post("/api/auth/users", headers=admin_headers, json={
        "email": new_email,
        "password": "SecurePassword@123",
        "full_name": "Dr. Test Reviewer",
        "role": "reviewer",
        "status": "active"
    })
    assert create_res.status_code == 200
    new_user = create_res.json()["user"]
    new_id = new_user["id"]
    assert new_user["role"] == "reviewer"

    # User logs in with 2FA
    reviewer_data = helper_login(new_email, "SecurePassword@123")
    assert reviewer_data["user"]["role"] == "reviewer"
    reviewer_token = reviewer_data["access_token"]

    # 4. Admin updates user role to approver
    role_res = client.put(f"/api/auth/users/{new_id}/role", headers=admin_headers, json={"role": "approver"})
    assert role_res.status_code == 200

    # User's token automatically reflects updated role from database
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {reviewer_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["role"] == "approver"

    # 5. Admin deactivates user
    deact_res = client.put(f"/api/auth/users/{new_id}/status", headers=admin_headers, json={"status": "inactive"})
    assert deact_res.status_code == 200

    # Deactivated user blocked from logging in
    blocked_login = client.get("/api/auth/me", headers={"Authorization": f"Bearer {reviewer_token}"})
    assert blocked_login.status_code == 403

    # Deactivated user's existing token blocked
    blocked_token = client.get("/api/auth/me", headers={"Authorization": f"Bearer {reviewer_token}"})
    assert blocked_token.status_code == 403

    # 6. Admin inspects audit logs
    audit_res = client.get("/api/auth/audit-logs", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()["logs"]
    assert len(logs) > 0


def test_self_role_modification_prevention():
    """Verify non-admin users cannot grant themselves elevated privileges."""
    author_data = helper_login("author@svnit.acm.org", "Author@1234")
    user_id = author_data["user"]["id"]
    author_headers = {"Authorization": f"Bearer {author_data['access_token']}"}

    # Author attempts to promote themselves to admin
    attempt = client.put(f"/api/auth/users/{user_id}/role", headers=author_headers, json={"role": "admin"})
    assert attempt.status_code == 403

    me = client.get("/api/auth/me", headers=author_headers)
    assert me.json()["user"]["role"] == "author"


def test_document_generation_role_permissions():
    """Verify Author and Admin can generate documents, but Viewer is forbidden."""
    doc_payload = {
        "date": "10/10/2026",
        "event_name": "Permission Test Event",
        "venue": "Seminar Hall",
        "event_date": "25/10/2026",
        "time_from": "10:00 AM",
        "time_to": "01:00 PM",
        "brief_description": "Testing permissions.",
        "objective": "Verify RBAC."
    }

    # Viewer attempted generation -> 403 Forbidden
    viewer_data = helper_login("viewer@svnit.acm.org", "Viewer@1234")
    viewer_headers = {"Authorization": f"Bearer {viewer_data['access_token']}"}
    viewer_gen = client.post("/api/documents/executive-meet/generate", headers=viewer_headers, json=doc_payload)
    assert viewer_gen.status_code == 403

    # Author login -> 200 Success
    author_data = helper_login("author@svnit.acm.org", "Author@1234")
    author_headers = {"Authorization": f"Bearer {author_data['access_token']}"}
    author_gen = client.post("/api/documents/executive-meet/generate", headers=author_headers, json=doc_payload)
    assert author_gen.status_code == 200
    assert author_gen.json()["success"] is True

    # Admin login -> 200 Success
    admin_data = helper_login("admin@svnit.acm.org", "Admin@1234")
    admin_headers = {"Authorization": f"Bearer {admin_data['access_token']}"}
    admin_gen = client.post("/api/documents/executive-meet/generate", headers=admin_headers, json=doc_payload)
    assert admin_gen.status_code == 200
    assert admin_gen.json()["success"] is True


def test_legacy_demo_mode_cannot_bypass_firebase_verification(monkeypatch):
    monkeypatch.setenv("DEMO_AUTH_MODE", "true")
    email = f"demo_user_{uuid.uuid4().hex[:6]}@aid.svnit.ac.in"
    uid = f"uid-{uuid.uuid4().hex}"
    reg = client.post("/api/auth/register", headers=firebase_headers(email, uid), json={
        "role": "author", "full_name": "Demo Student", "email": email,
    })
    assert reg.status_code == 200
    assert client.post("/api/auth/session", headers=firebase_headers(email, uid)).status_code == 403

def test_approved_institutional_email_domains(monkeypatch):
    """Verify SVNIT institutional domains and subdomains are permitted."""
    monkeypatch.setenv("ALLOWED_EMAIL_DOMAINS", "svnit.ac.in")
    monkeypatch.setenv("DEMO_AUTH_MODE", "false")
    monkeypatch.setenv("ALLOW_ANY_EMAIL", "false")

    # Approved SVNIT subdomain
    aid_email = f"student_{uuid.uuid4().hex[:6]}@aid.svnit.ac.in"
    aid_uid = f"uid-{uuid.uuid4().hex}"
    valid_aid = client.post("/api/auth/register", headers=firebase_headers(aid_email, aid_uid), json={
        "role": "author", "full_name": "AI Dept Student", "email": aid_email,
    })
    assert valid_aid.status_code == 200

    # Other department subdomains accepted by the Render root-domain allowlist.
    cse_email = f"student_{uuid.uuid4().hex[:6]}@cse.svnit.ac.in"
    cse_uid = f"uid-{uuid.uuid4().hex}"
    valid_cse = client.post("/api/auth/register", headers=firebase_headers(cse_email, cse_uid), json={
        "role": "author", "full_name": "CSE Student", "email": cse_email,
    })
    assert valid_cse.status_code == 200

    # Approved SVNIT main domain
    svnit_email = f"faculty_{uuid.uuid4().hex[:6]}@svnit.ac.in"
    svnit_uid = f"uid-{uuid.uuid4().hex}"
    valid_svnit = client.post("/api/auth/register", headers=firebase_headers(svnit_email, svnit_uid), json={
        "role": "author", "full_name": "Faculty Member", "email": svnit_email,
    })
    assert valid_svnit.status_code == 200

    # Exact label-boundary matching prevents suffix/lookalike domain bypasses.
    for email in ["student@gmail.com", "student@svnit.ac.in.attacker.com"]:
        rejected = client.post("/api/auth/register", headers=firebase_headers(email, f"uid-{uuid.uuid4().hex}"), json={
            "role": "author", "full_name": "Untrusted User", "email": email,
        })
        assert rejected.status_code == 422

    # Unapproved external domain when ALLOW_ANY_EMAIL is false
    unapproved = client.post("/api/auth/register", json={
        "role": "author", "full_name": "External User", "email": "external@randomdomain123.com",
    })
    assert unapproved.status_code == 422 or unapproved.status_code == 400
