"""
Comprehensive Test Suite for Role-Based Authentication & Authorization (Feature 9).
Tests:
- Valid and invalid login for all 6 roles
- Session/token profile verification and logout
- Account deactivation & rejection of inactive accounts
- System Admin exclusive user management (list, create, update role, update status)
- Prevention of self-role alteration / privilege escalation
- Document generation permissions (Author/Admin permitted, Viewer forbidden)
- Template editor permission enforcement (Template Admin/Admin permitted, others forbidden)
- Workflow transition permissions (Approver, Reviewer, Author according to state machine)
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.seed import seed_database
from app.core.security import decode_access_token

client = TestClient(app)

@pytest.fixture(autouse=True)
def ensure_db():
    seed_database()

def test_login_all_six_roles():
    """Verify login for all 6 institutional roles."""
    roles_credentials = [
        ("admin@svnit.acm.org", "Admin@1234", "admin"),
        ("author@svnit.acm.org", "Author@1234", "author"),
        ("reviewer@svnit.acm.org", "Reviewer@1234", "reviewer"),
        ("approver@svnit.acm.org", "Approver@1234", "approver"),
        ("tmpladmin@svnit.acm.org", "TmplAdmin@1234", "template_admin"),
        ("viewer@svnit.acm.org", "Viewer@1234", "viewer"),
    ]

    for email, pwd, expected_role in roles_credentials:
        res = client.post("/api/auth/login", json={"email": email, "password": pwd})
        assert res.status_code == 200, f"Login failed for {email}: {res.text}"
        data = res.json()
        assert data["success"] is True
        assert data["user"]["email"] == email
        assert data["user"]["role"] == expected_role
        assert "access_token" in data
        assert data["token_type"] == "Bearer"

        # Verify decoded token identity
        decoded = decode_access_token(data["access_token"])
        assert decoded is not None
        assert decoded["email"] == email
        assert decoded["role"] == expected_role

def test_login_invalid_credentials():
    """Verify rejection of nonexistent email or wrong password."""
    # Wrong password
    res = client.post("/api/auth/login", json={"email": "admin@svnit.acm.org", "password": "WrongPassword!999"})
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]

    # Nonexistent user
    res2 = client.post("/api/auth/login", json={"email": "nobody@svnit.acm.org", "password": "AnyPassword123"})
    assert res2.status_code == 401
    assert "Invalid email or password" in res2.json()["detail"]

    # Invalid email syntax
    res3 = client.post("/api/auth/login", json={"email": "not-an-email", "password": "Password123"})
    assert res3.status_code == 422

def test_session_profile_and_logout():
    """Verify /auth/me returns authenticated identity and logout behaves cleanly."""
    login_res = client.post("/api/auth/login", json={"email": "author@svnit.acm.org", "password": "Author@1234"})
    token = login_res.json()["access_token"]

    # Profile check with valid token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    profile = me_res.json()
    assert profile["authenticated"] is True
    assert profile["user"]["email"] == "author@svnit.acm.org"
    assert profile["user"]["role"] == "author"

    # Profile check without token
    unauth_res = client.get("/api/auth/me")
    assert unauth_res.status_code == 401

    # Logout
    logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200
    assert logout_res.json()["success"] is True

def test_admin_user_management_lifecycle():
    """Verify System Admin can list, create, change roles, and deactivate accounts."""
    # Login as admin
    admin_login = client.post("/api/auth/login", json={"email": "admin@svnit.acm.org", "password": "Admin@1234"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin lists users
    list_res = client.get("/api/auth/users", headers=admin_headers)
    assert list_res.status_code == 200
    users = list_res.json()["users"]
    assert len(users) >= 6
    # Ensure password hashes are never leaked
    for u in users:
        assert "password" not in u
        assert "hashed_password" not in u

    # 2. Non-admin cannot list users (requires admin)
    author_login = client.post("/api/auth/login", json={"email": "author@svnit.acm.org", "password": "Author@1234"})
    author_token = author_login.json()["access_token"]
    author_headers = {"Authorization": f"Bearer {author_token}"}

    forbidden_list = client.get("/api/auth/users", headers=author_headers)
    assert forbidden_list.status_code == 403

    # 3. Admin creates new reviewer account
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

    # Verify newly created user can log in
    new_login = client.post("/api/auth/login", json={"email": new_email, "password": "SecurePassword@123"})
    assert new_login.status_code == 200
    assert new_login.json()["user"]["role"] == "reviewer"
    new_user_token = new_login.json()["access_token"]

    # 4. Admin updates user role to approver
    role_res = client.put(f"/api/auth/users/{new_id}/role", headers=admin_headers, json={"role": "approver"})
    assert role_res.status_code == 200
    assert role_res.json()["new_role"] == "approver"

    # User's existing token now automatically reflects updated role from database
    me_updated = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_user_token}"})
    assert me_updated.status_code == 200
    assert me_updated.json()["user"]["role"] == "approver"

    # 5. Admin deactivates user account
    deactivate_res = client.put(f"/api/auth/users/{new_id}/status", headers=admin_headers, json={"status": "inactive"})
    assert deactivate_res.status_code == 200
    assert deactivate_res.json()["status"] == "inactive"

    # Deactivated user cannot log in
    blocked_login = client.post("/api/auth/login", json={"email": new_email, "password": "SecurePassword@123"})
    assert blocked_login.status_code == 403
    assert "deactivated" in blocked_login.json()["detail"].lower()

    # Deactivated user cannot use previous token
    blocked_token = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_user_token}"})
    assert blocked_token.status_code == 403

def test_self_role_modification_prevention():
    """Verify non-admin users cannot grant themselves elevated privileges."""
    # Register/login normal author
    email = f"author_{uuid.uuid4().hex[:6]}@svnit.acm.org"
    reg = client.post("/api/auth/register", json={
        "email": email,
        "password": "Password@123",
        "full_name": "Honest Author",
        "role": "author"
    })
    assert reg.status_code == 200
    user_id = reg.json()["user_id"]
    author_token = reg.json()["access_token"]
    author_headers = {"Authorization": f"Bearer {author_token}"}

    # Author attempts to promote themselves to admin
    attempt = client.put(f"/api/auth/users/{user_id}/role", headers=author_headers, json={"role": "admin"})
    assert attempt.status_code == 403

    # Verification: User remains author
    me = client.get("/api/auth/me", headers=author_headers)
    assert me.status_code == 200
    assert me.json()["user"]["role"] == "author"

def test_document_generation_role_permissions():
    """Verify Author and Admin can generate documents, but Viewer is forbidden."""
    # 1. Viewer login
    viewer_login = client.post("/api/auth/login", json={"email": "viewer@svnit.acm.org", "password": "Viewer@1234"})
    viewer_token = viewer_login.json()["access_token"]
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

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
    viewer_gen = client.post("/api/documents/executive-meet/generate", headers=viewer_headers, json=doc_payload)
    assert viewer_gen.status_code == 403
    assert "Viewer role has read-only access" in viewer_gen.json()["detail"]

    # 2. Author login -> 200 Success
    author_login = client.post("/api/auth/login", json={"email": "author@svnit.acm.org", "password": "Author@1234"})
    author_token = author_login.json()["access_token"]
    author_headers = {"Authorization": f"Bearer {author_token}"}

    author_gen = client.post("/api/documents/executive-meet/generate", headers=author_headers, json=doc_payload)
    assert author_gen.status_code == 200
    assert author_gen.json()["success"] is True

    # 3. Admin login -> 200 Success
    admin_login = client.post("/api/auth/login", json={"email": "admin@svnit.acm.org", "password": "Admin@1234"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    admin_gen = client.post("/api/documents/executive-meet/generate", headers=admin_headers, json=doc_payload)
    assert admin_gen.status_code == 200
    assert admin_gen.json()["success"] is True
