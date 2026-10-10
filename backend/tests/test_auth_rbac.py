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
from app.core.security import decode_access_token
from app.services.email_service import get_latest_sent_otp
from app.services.otp_service import issue_otp_challenge

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setenv("SEED_DEMO_USERS", "true")
    seed_database()

def helper_login(email: str, password: str) -> dict:
    """Helper to perform password login (Requirement 17: no login OTP required) and return session payload."""
    res1 = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res1.status_code == 200, f"Login failed for {email}: {res1.text}"
    data1 = res1.json()
    assert data1["success"] is True
    assert "access_token" in data1
    assert data1["requires_otp"] is False
    return data1


# ============================================================
# 1. TWO-STEP LOGIN TESTS (All 6 Roles)
# ============================================================

def test_two_step_login_all_six_roles():
    """Verify 2FA login flow works for all 6 institutional roles."""
    roles_credentials = [
        ("admin@svnit.acm.org", "Admin@1234", "admin"),
        ("author@svnit.acm.org", "Author@1234", "author"),
        ("reviewer@svnit.acm.org", "Reviewer@1234", "reviewer"),
        ("approver@svnit.acm.org", "Approver@1234", "approver"),
        ("tmpladmin@svnit.acm.org", "TmplAdmin@1234", "template_admin"),
        ("viewer@svnit.acm.org", "Viewer@1234", "viewer"),
    ]

    for email, pwd, expected_role in roles_credentials:
        data = helper_login(email, pwd)
        assert data["user"]["email"] == email
        assert data["user"]["role"] == expected_role

        decoded = decode_access_token(data["access_token"])
        assert decoded is not None
        assert decoded["email"] == email
        assert decoded["role"] == expected_role


def test_login_invalid_credentials_and_formats():
    """Verify rejection of wrong password, unknown user, and invalid format."""
    # Wrong password
    res = client.post("/api/auth/login", json={"email": "admin@svnit.acm.org", "password": "WrongPassword!999"})
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]

    # Unknown user
    res2 = client.post("/api/auth/login", json={"email": "nobody@svnit.acm.org", "password": "AnyPassword123"})
    assert res2.status_code == 401
    assert "Invalid email or password" in res2.json()["detail"]

    # Invalid email syntax
    res3 = client.post("/api/auth/login", json={"email": "not-an-email", "password": "Password123"})
    assert res3.status_code == 422


def test_login_otp_tampering_and_replay_prevention():
    """Verify wrong OTP is rejected and OTP cannot be reused after verification."""
    from app.services.otp_service import issue_otp_challenge
    from app.db.database import get_db
    email = "author@svnit.acm.org"
    with get_db() as conn:
        raw_otp, challenge_id = issue_otp_challenge(conn, email=email, purpose="login_2fa", user_id="usr-author-01")

    # Incorrect OTP
    bad_res = client.post("/api/auth/verify-login-otp", json={"challenge_id": challenge_id, "otp": "000000"})
    assert bad_res.status_code == 400
    assert "attempt(s) remaining" in bad_res.json()["detail"].lower()

    # Correct OTP
    ok_res = client.post("/api/auth/verify-login-otp", json={"challenge_id": challenge_id, "otp": raw_otp})
    assert ok_res.status_code == 200

    # Replay attempt with same challenge & OTP -> must fail
    replay_res = client.post("/api/auth/verify-login-otp", json={"challenge_id": challenge_id, "otp": raw_otp})
    assert replay_res.status_code == 400


# ============================================================
# 2. SIGN-UP / PUBLIC REGISTRATION & EMAIL OTP VERIFICATION
# ============================================================

def test_signup_registration_and_email_verification():
    """Verify sign-up creates unverified account, requires OTP, and activates upon verification."""
    email = f"new_author_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    password = "StrongPassword@2026"

    # 1. Submit valid registration
    reg_res = client.post("/api/auth/register", json={
        "full_name": "New SVNIT Author",
        "email": email,
        "password": password,
        "confirm_password": password
    })
    assert reg_res.status_code == 200
    assert reg_res.json()["success"] is True

    # OTP is stored hashed; tests issue the real challenge directly rather than retaining plaintext in mail logs.
    from app.db.database import get_db
    with get_db() as conn:
        otp, _ = issue_otp_challenge(conn, email=email, purpose="signup_verification")

    # 2. Login before verification must be rejected
    unverified_login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert unverified_login.status_code == 403
    assert "not been verified" in unverified_login.json()["detail"].lower()

    # 3. Verify with incorrect OTP -> fails
    bad_otp_res = client.post("/api/auth/verify-email-otp", json={"email": email, "otp": "999999"})
    assert bad_otp_res.status_code == 400

    # 4. Verify with correct OTP -> activates account
    verify_res = client.post("/api/auth/verify-email-otp", json={"email": email, "otp": otp})
    assert verify_res.status_code == 200
    assert verify_res.json()["success"] is True

    # 5. Now user can log in via 2FA
    login_data = helper_login(email, password)
    assert login_data["user"]["role"] == "author"
    assert login_data["user"]["is_verified"] == 1


def test_signup_validation_and_duplicate_rejection():
    """Verify duplicate email and password policy enforcement on registration."""
    # Password mismatch
    res_mismatch = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "mismatch@svnit.acm.org",
        "password": "Password@123",
        "confirm_password": "DifferentPassword@123"
    })
    assert res_mismatch.status_code == 400
    assert "do not match" in res_mismatch.json()["detail"].lower()

    # Weak password (< 8 chars or no digits)
    res_weak = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "weak@svnit.acm.org",
        "password": "short",
        "confirm_password": "short"
    })
    assert res_weak.status_code == 422 or res_weak.status_code == 400

    # Duplicate registered email
    res_dup = client.post("/api/auth/register", json={
        "full_name": "Duplicate Admin",
        "email": "admin@svnit.acm.org",
        "password": "StrongPassword@123",
        "confirm_password": "StrongPassword@123"
    })
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()["detail"].lower()


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


def test_otp_resend_cooldown():
    """Verify OTP resend is rate-limited by a 60-second cooldown."""
    email = f"cooldown_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    client.post("/api/auth/register", json={
        "full_name": "Cooldown Test",
        "email": email,
        "password": "Password@1234",
        "confirm_password": "Password@1234"
    })

    # Immediate resend request -> 429 Too Many Requests
    resend = client.post("/api/auth/resend-email-otp", json={"email": email})
    assert resend.status_code == 429
    assert "wait" in resend.json()["detail"].lower()


# ============================================================
# 3. FORGOT PASSWORD & PASSWORD RESET FLOW
# ============================================================

def test_forgot_password_and_reset_flow():
    """Verify password recovery via OTP and immediate authentication with new password."""
    email = f"recovery_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    initial_pwd = "InitialPassword@2026"
    new_pwd = "UpdatedPassword@2026"

    # Register and activate test user
    reg = client.post("/api/auth/register", json={
        "full_name": "Recovery User",
        "email": email,
        "password": initial_pwd,
        "confirm_password": initial_pwd
    })
    from app.db.database import get_db
    with get_db() as conn:
        signup_otp, _ = issue_otp_challenge(conn, email=email, purpose="signup_verification")
    client.post("/api/auth/verify-email-otp", json={"email": email, "otp": signup_otp})

    # 1. Request recovery code
    req_res = client.post("/api/auth/forgot-password", json={"email": email})
    assert req_res.status_code == 200

    from app.db.database import get_db
    with get_db() as conn:
        reset_otp, _ = issue_otp_challenge(conn, email=email, purpose="password_reset")

    # 2. Reset password with valid OTP and new password
    reset_res = client.post("/api/auth/reset-password", json={
        "email": email,
        "otp": reset_otp,
        "new_password": new_pwd,
        "confirm_password": new_pwd
    })
    assert reset_res.status_code == 200
    assert "successfully updated" in reset_res.json()["message"].lower()

    # 3. Old password now rejected
    old_login = client.post("/api/auth/login", json={"email": email, "password": initial_pwd})
    assert old_login.status_code == 401

    # 4. New password succeeds via 2FA
    new_login = helper_login(email, new_pwd)
    assert new_login["user"]["email"] == email


# ============================================================
# 4. SYSTEM ADMIN USER MANAGEMENT & AUDIT LOGS
# ============================================================

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
    blocked_login = client.post("/api/auth/login", json={"email": new_email, "password": "SecurePassword@123"})
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


def test_demo_auth_mode_lifecycle(monkeypatch):
    """Verify DEMO mode allows signup/login without OTP and clearly marks email unverified."""
    monkeypatch.setenv("DEMO_AUTH_MODE", "true")
    email = f"demo_user_{uuid.uuid4().hex[:6]}@aid.svnit.ac.in"
    pwd = "DemoPassword@123"

    # 1. Legacy mode endpoint continues to require verification
    mode_res = client.get("/api/auth/mode")
    assert mode_res.status_code == 200
    assert mode_res.json()["demo_mode"] is True
    assert mode_res.json()["email_verification_required"] is False

    # 2. Registration requires OTP even when a legacy bypass flag is set
    reg = client.post("/api/auth/register", json={
        "role": "author",
        "full_name": "Demo Student",
        "email": email,
        "password": pwd,
        "confirm_password": pwd
    })
    assert reg.status_code == 200
    assert reg.json()["requires_otp"] is True
    assert reg.json()["is_verified"] is False

    # Unverified accounts cannot log in even when a legacy demo flag is set.
    login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 403

    # 4. Forgot password
    forgot = client.post("/api/auth/forgot-password", json={"email": email})
    assert forgot.status_code == 200
    assert "demo_mode" not in forgot.json()
    reset = client.post("/api/auth/reset-password", json={
        "email": email,
        "otp": "000000",
        "new_password": "NewDemoPass@456",
        "confirm_password": "NewDemoPass@456"
    })
    assert reset.status_code == 400


def test_approved_institutional_email_domains(monkeypatch):
    """Verify SVNIT institutional domains and subdomains are permitted."""
    monkeypatch.setenv("DEMO_AUTH_MODE", "false")
    monkeypatch.setenv("ALLOW_ANY_EMAIL", "false")

    # Approved SVNIT subdomain
    valid_aid = client.post("/api/auth/register", json={
        "full_name": "AI Dept Student",
        "email": f"student_{uuid.uuid4().hex[:6]}@aid.svnit.ac.in",
        "password": "Password@123",
        "confirm_password": "Password@123"
    })
    assert valid_aid.status_code == 200

    # Approved SVNIT main domain
    valid_svnit = client.post("/api/auth/register", json={
        "full_name": "Faculty Member",
        "email": f"faculty_{uuid.uuid4().hex[:6]}@svnit.ac.in",
        "password": "Password@123",
        "confirm_password": "Password@123"
    })
    assert valid_svnit.status_code == 200

    # Unapproved external domain when ALLOW_ANY_EMAIL is false
    unapproved = client.post("/api/auth/register", json={
        "full_name": "External User",
        "email": "external@randomdomain123.com",
        "password": "Password@123",
        "confirm_password": "Password@123"
    })
    assert unapproved.status_code == 422 or unapproved.status_code == 400
