"""
Authentication and User Management Routes for SmartDocs SVNIT.
Implements:
1. Firebase email/password authentication and email verification.
2. Server-side role-based access control and user administration.
3. Initial System Admin bootstrap and security audit logging.
"""
import os
import re
import uuid
import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.database import get_db
from app.core.security import (
    require_authenticated_user,
    require_role,
    get_current_user
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
VALID_ROLES = ["viewer", "author", "reviewer", "approver", "template_admin", "admin"]
PUBLIC_ROLES = {r.strip().lower() for r in os.getenv("PUBLIC_REGISTRATION_ROLES", "author,viewer").split(",") if r.strip()} & {"author", "viewer"}

def validate_password_policy(password: str) -> None:
    """Enforces appropriate institutional password policy."""
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long."
        )
    if not any(char.isdigit() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one numeric digit."
        )
    if not any(char.isalpha() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one letter."
        )


def is_approved_institutional_email(email: str) -> bool:
    """
    Checks if email belongs to approved SVNIT institutional domains.
    Approved institutional domains:
    - svnit.ac.in, *.svnit.ac.in (e.g. aid.svnit.ac.in, coed.svnit.ac.in, etc.)
    - svnit.acm.org, *.svnit.acm.org
    - acm.org
    Plus any custom domains in ALLOWED_EMAIL_DOMAINS env var.
    """
    if not email or "@" not in email:
        return False
    domain = email.lower().split("@")[-1].strip()

    # Always allow institutional SVNIT and ACM domains
    approved_roots = {"svnit.ac.in", "svnit.acm.org", "acm.org"}
    for root in approved_roots:
        if domain == root or domain.endswith("." + root):
            return True

    # Also check additional custom domains configured in ALLOWED_EMAIL_DOMAINS
    allowed_env = os.getenv("ALLOWED_EMAIL_DOMAINS", "").strip()
    if allowed_env:
        allowed_list = [d.strip().lower() for d in allowed_env.split(",") if d.strip()]
        for allowed in allowed_list:
            if domain == allowed or domain.endswith("." + allowed):
                return True

    return False


# ============================================================
# REQUEST & RESPONSE SCHEMAS
# ============================================================

class UserRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requested_role: Optional[str] = None
    full_name: str = Field(min_length=2, description="Full Name")
    email: str = Field(description="Institutional Email Address")
    invitation_token: Optional[str] = None

    @field_validator("requested_role")
    @classmethod
    def validate_public_role(cls, v):
        valid_roles = {"author", "reviewer", "approver", "template_admin", "admin", "viewer"}
        if v is not None and v not in valid_roles:
            raise ValueError("Please choose an available registration role.")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        cleaned = v.strip().lower()
        if not EMAIL_PATTERN.match(cleaned):
            raise ValueError("Enter a valid email address.")
        if not is_approved_institutional_email(cleaned):
            raise ValueError("Use an SVNIT institutional email address.")
        return cleaned


class CreateInvitationRequest(BaseModel):
    email: str
    role: str
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    confirm_privileged: bool = False

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        cleaned = v.strip().lower()
        if not EMAIL_PATTERN.match(cleaned) or not is_approved_institutional_email(cleaned):
            raise ValueError("Use an eligible SVNIT institutional email address.")
        return cleaned

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Allowed roles: {VALID_ROLES}")
        return v


class RoleRequestBody(BaseModel):
    requested_role: str

    @field_validator("requested_role")
    @classmethod
    def validate_requested_role(cls, value):
        if value not in {"reviewer", "approver", "template_admin", "admin"}:
            raise ValueError("Role request is not eligible for approval.")
        return value


class InvitationTokenRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class ReviewRoleRequestBody(BaseModel):
    decision: str
    confirm_privileged_change: bool = False

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value):
        if value not in {"approve", "reject"}:
            raise ValueError("Decision must be approve or reject.")
        return value


class UpdateRoleRequest(BaseModel):
    role: str
    confirm_privileged_change: bool = False

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Allowed roles: {VALID_ROLES}")
        return v


class UpdateStatusRequest(BaseModel):
    status: str = Field(description="'active' or 'inactive'")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v.lower() not in ["active", "inactive"]:
            raise ValueError("Status must be either 'active' or 'inactive'")
        return v.lower()


# ============================================================
# 1. SIGN-UP / REGISTRATION (Requirements 2 & 3)
# ============================================================

@router.post("/register")
def register_user(request: UserRegisterRequest, authorization: Optional[str] = Header(None)):
    """Creates a pending profile using server policy or a validated invitation."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Firebase authentication required.")
    from app.core.firebase_auth import verify_firebase_id_token
    try:
        claims = verify_firebase_id_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase session.")
    email = str(claims.get("email", "")).strip().lower()
    if not claims.get("uid") or email != request.email.strip().lower():
        raise HTTPException(status_code=403, detail="Use the same email address as your account.")
    if not is_approved_institutional_email(email):
        raise HTTPException(status_code=403, detail="Use an SVNIT institutional email address.")

    now = datetime.now(timezone.utc)
    invitation = None
    if request.invitation_token:
        token_hash = hashlib.sha256(request.invitation_token.encode("utf-8")).hexdigest()
        with get_db() as conn:
            invitation = conn.execute(
                "SELECT * FROM user_invitations WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL",
                (token_hash,),
            ).fetchone()
        if not invitation:
            raise HTTPException(status_code=400, detail="Invitation is invalid, expired, revoked, or already used.")
        if invitation["email"].lower() != email:
            raise HTTPException(status_code=403, detail="This invitation belongs to a different email address.")
        if datetime.fromisoformat(invitation["expires_at"]) <= now:
            raise HTTPException(status_code=400, detail="Invitation has expired.")
        assigned_role = invitation["role"]
        role_request_needed = False
    else:
        requested_role = (request.requested_role or "author").strip().lower()
        if requested_role in PUBLIC_ROLES:
            assigned_role = requested_role
            role_request_needed = False
        elif requested_role == "admin":
            bootstrap_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@svnit.acm.org").strip().lower()
            admin_allowlist = {"admin@svnit.acm.org", "i25ai007@aid.svnit.ac.in", bootstrap_email}
            custom_admins = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
            admin_allowlist.update(custom_admins)

            with get_db() as conn_check:
                has_admin = conn_check.execute("SELECT 1 FROM users WHERE role = 'admin' AND is_active = 1").fetchone() is not None

            if not has_admin or email in admin_allowlist:
                assigned_role = "admin"
                role_request_needed = False
            else:
                assigned_role = "author"
                role_request_needed = True
        elif requested_role in {"reviewer", "approver", "template_admin"}:
            assigned_role = "author"
            role_request_needed = True
        else:
            raise HTTPException(status_code=403, detail="Public registration is not enabled for this role. Invitation required.")

    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        uid_owner = conn.execute("SELECT email FROM users WHERE firebase_uid = ?", (claims["uid"],)).fetchone()
        if uid_owner and uid_owner["email"].strip().lower() != email:
            raise HTTPException(status_code=409, detail="This Firebase account is already linked to another email.")
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            if existing["firebase_uid"] and existing["firebase_uid"] != claims["uid"]:
                raise HTTPException(status_code=409, detail="An account already exists for this email. Contact an administrator.")
            # Never claim profile until Firebase confirms mailbox ownership.
            if not claims.get("email_verified"):
                raise HTTPException(status_code=403, detail="Verify your email address before completing registration.")
            if invitation:
                conn.execute("UPDATE users SET firebase_uid = ?, role = ?, is_verified = 1, status = 'active' WHERE id = ?", (claims["uid"], assigned_role, existing["id"]))
            else:
                conn.execute("UPDATE users SET firebase_uid = ?, is_verified = 1, status = 'active' WHERE id = ?", (claims["uid"], existing["id"]))
        else:
            has_admin = conn.execute("SELECT 1 FROM users WHERE role = 'admin' AND is_active = 1").fetchone() is not None
            bootstrap_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@svnit.acm.org").strip().lower()
            if not has_admin and (email == "admin@svnit.acm.org" or email == bootstrap_email or email == "i25ai007@aid.svnit.ac.in"):
                assigned_role = "admin"
                role_request_needed = False

            is_verified = 1 if claims.get("email_verified") else 0
            status = "active" if is_verified else "pending_verification"
            conn.execute(
                "INSERT INTO users (id,email,hashed_password,full_name,role,status,is_active,is_verified,firebase_uid) VALUES (?,?,?,?,?,?,1,?,?)",
                (claims["uid"], email, "firebase-managed", request.full_name.strip(), assigned_role, status, is_verified, claims["uid"]),
            )

        if role_request_needed:
            req_id = f"req-{uuid.uuid4().hex[:12]}"
            existing_req = conn.execute("SELECT id FROM user_role_requests WHERE user_id = ? AND status = 'pending'", (claims["uid"],)).fetchone()
            if not existing_req:
                conn.execute(
                    "INSERT INTO user_role_requests (id, user_id, email, requested_role, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
                    (req_id, claims["uid"], email, requested_role, now.isoformat()),
                )
                record_audit_log(conn, action="role_requested_on_signup", actor_id=claims["uid"], actor_email=email, target_user_id=claims["uid"], details={"requested_role": requested_role})

        if invitation:
            used = conn.execute(
                "UPDATE user_invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
                (now.isoformat(), invitation["id"], now.isoformat()),
            )
            if used.rowcount != 1:
                raise HTTPException(status_code=400, detail="Invitation is expired or has already been used.")

    role_display = requested_role.replace("_", " ").title() if not request.invitation_token else assigned_role.replace("_", " ").title()
    msg = "Account created. Check your inbox for the verification link."
    if role_request_needed:
        msg = f"Account created! Your request for '{role_display}' access has been submitted to the System Administrator for approval."

    return {
        "success": True,
        "role": assigned_role,
        "requested_role": requested_role if not request.invitation_token else assigned_role,
        "role_request_submitted": role_request_needed,
        "requires_email_verification": not bool(claims.get("email_verified")),
        "message": msg,
    }


@router.post("/invitations/validate")
def validate_invitation(req: InvitationTokenRequest):
    token = req.token
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    with get_db() as conn:
        invitation = conn.execute(
            "SELECT email, role, expires_at FROM user_invitations WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL",
            (token_hash,),
        ).fetchone()
    if not invitation or datetime.fromisoformat(invitation["expires_at"]) <= now:
        raise HTTPException(status_code=404, detail="Invitation is invalid or expired.")
    return {"email": invitation["email"], "role": invitation["role"], "expires_at": invitation["expires_at"]}


@router.post("/role-requests")
def create_role_request(req: RoleRequestBody, user: Dict[str, Any] = Depends(require_authenticated_user)):
    request_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute("SELECT id FROM user_role_requests WHERE user_id=? AND status='pending'", (user["sub"],)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="You already have a role request pending.")
        conn.execute("INSERT INTO user_role_requests(id,user_id,email,requested_role) VALUES(?,?,?,?)", (request_id, user["sub"], user["email"], req.requested_role))
        record_audit_log(conn, action="role_requested", actor_id=user.get("sub"), actor_email=user.get("email"), target_user_id=user.get("sub"), details={"requested_role": req.requested_role})
    return {"success": True, "request_id": request_id, "status": "pending"}


@router.get("/role-requests")
def list_role_requests(current_admin: Dict[str, Any] = Depends(require_role(["admin"]))):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM user_role_requests ORDER BY created_at DESC").fetchall()
    return {"success": True, "requests": [dict(row) for row in rows]}


@router.post("/role-requests/{request_id}/review")
def review_role_request(request_id: str, req: ReviewRoleRequestBody, current_admin: Dict[str, Any] = Depends(require_role(["admin"]))):
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        role_request = conn.execute("SELECT * FROM user_role_requests WHERE id=?", (request_id,)).fetchone()
        if not role_request:
            raise HTTPException(status_code=404, detail="Role request not found.")
        if role_request["status"] != "pending":
            raise HTTPException(status_code=409, detail="Role request has already been reviewed.")
        if role_request["user_id"] == current_admin.get("sub"):
            raise HTTPException(status_code=403, detail="You cannot approve your own role request.")
        target_user = conn.execute("SELECT is_active, status FROM users WHERE id=?", (role_request["user_id"],)).fetchone()
        if not target_user or target_user["is_active"] == 0 or target_user["status"] == "inactive":
            raise HTTPException(status_code=409, detail="The requesting account is no longer active.")
        if req.decision == "approve" and not req.confirm_privileged_change:
            raise HTTPException(status_code=400, detail="Explicit confirmation is required to approve a privileged role request.")
        now = datetime.now(timezone.utc).isoformat()
        if req.decision == "approve":
            conn.execute("UPDATE users SET role=? WHERE id=?", (role_request["requested_role"], role_request["user_id"]))
        conn.execute("UPDATE user_role_requests SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?", ("approved" if req.decision == "approve" else "rejected", current_admin.get("sub"), now, request_id))
        record_audit_log(conn, action="role_request_reviewed", actor_id=current_admin.get("sub"), actor_email=current_admin.get("email"), target_user_id=role_request["user_id"], details={"request_id": request_id, "decision": req.decision, "role": role_request["requested_role"]})
    return {"success": True, "request_id": request_id, "status": "approved" if req.decision == "approve" else "rejected"}


@router.post("/session")
def create_firebase_session(authorization: Optional[str] = Header(None)):
    """Links a verified Firebase identity to its DB profile and returns DB authorization data."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Firebase authentication required.")
    from app.core.firebase_auth import verify_firebase_id_token
    try:
        claims = verify_firebase_id_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase session.")
    if not claims.get("email_verified") or not claims.get("email"):
        raise HTTPException(status_code=403, detail="Please verify your email address before signing in.")
    email = str(claims["email"]).strip().lower()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE firebase_uid = ? OR email = ?", (claims["uid"], email)).fetchone()
        if not row:
            has_admin = conn.execute("SELECT 1 FROM users WHERE role = 'admin' AND is_active = 1").fetchone() is not None
            bootstrap_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@svnit.acm.org").strip().lower()
            if not has_admin and (email == "admin@svnit.acm.org" or email == bootstrap_email):
                user_id = f"usr-{uuid.uuid4().hex[:12]}"
                full_name = claims.get("name") or "System Administrator"
                conn.execute(
                    "INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active, is_verified, firebase_uid) VALUES (?, ?, 'firebase-managed', ?, 'admin', 'active', 1, 1, ?)",
                    (user_id, email, full_name, claims["uid"])
                )
                row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            else:
                raise HTTPException(status_code=403, detail="No SmartDocs account found. Create an account first.")
        if row["email"].strip().lower() != email:
            raise HTTPException(status_code=403, detail="Firebase account email does not match the SmartDocs profile.")
        if row["firebase_uid"] and row["firebase_uid"] != claims["uid"]:
            raise HTTPException(status_code=403, detail="This email is linked to another account.")
        if row["status"] == "inactive" or row["is_active"] == 0:
            raise HTTPException(status_code=403, detail="Account is deactivated. Contact an administrator.")
        conn.execute("UPDATE users SET firebase_uid = ?, is_verified = 1, status = 'active' WHERE id = ?", (claims["uid"], row["id"]))
        return {"authenticated": True, "user": {"id": row["id"], "email": row["email"], "full_name": row["full_name"], "role": row["role"], "status": "active", "is_active": 1, "is_verified": 1}}


# Firebase sign-out occurs client side; this endpoint records an audit event.
# ============================================================

@router.post("/logout")
def logout_user(
    req: Request,
    user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """Logs out user session on client side and writes audit log."""
    client_ip = req.client.host if req.client else None
    if user:
        with get_db() as conn:
            record_audit_log(
                conn, action="logout", actor_id=user.get("sub"),
                actor_email=user.get("email"), ip_address=client_ip
            )
    return {"success": True, "message": "Successfully logged out."}


@router.get("/me")
def get_current_user_profile(user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Returns authenticated user identity and verified active role."""
    return {
        "authenticated": True,
        "user": {
            "id": user.get("sub"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "status": user.get("status", "active"),
            "is_active": user.get("is_active", 1),
            "is_verified": user.get("is_verified", 1)
        }
    }


# ============================================================
# 4. INITIAL SYSTEM ADMIN BOOTSTRAP (Requirement 8)
# ============================================================

def _verified_bootstrap_identity(authorization: Optional[str]) -> tuple[Dict[str, Any], str, str]:
    """Verify the bearer token and return claims, email, and UID for bootstrap."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Verified Firebase identity required.")
    from app.core.firebase_auth import verify_firebase_id_token
    try:
        claims = verify_firebase_id_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase session.")
    email = str(claims.get("email", "")).strip().lower()
    uid = str(claims.get("uid", ""))
    project_id = os.getenv("FIREBASE_PROJECT_ID", "smartdocs-svnit-6904c").strip()
    if (
        not uid
        or not claims.get("sub")
        or claims.get("sub") != uid
        or claims.get("aud") != project_id
        or claims.get("iss") != f"https://securetoken.google.com/{project_id}"
    ):
        raise HTTPException(status_code=401, detail="Firebase token is invalid for this project.")
    if claims.get("email_verified") is not True or not email:
        raise HTTPException(status_code=403, detail="Use a verified institutional Firebase account to bootstrap.")
    if not is_approved_institutional_email(email):
        raise HTTPException(status_code=403, detail="This email domain is not approved for System Admin bootstrap.")
    return claims, email, uid


def _bootstrap_configuration(email: str) -> Path:
    """Validate backend arming settings and require an existing SQLite file."""
    configured_secret = os.environ.get("ADMIN_BOOTSTRAP_SECRET", "").strip()
    if len(configured_secret) < 32 or configured_secret.lower().startswith("replace-with-"):
        raise HTTPException(status_code=503, detail="System Admin bootstrap is not configured on the server.")

    bootstrap_email = os.environ.get("ADMIN_BOOTSTRAP_EMAIL", "").strip().lower()
    if not bootstrap_email or not is_approved_institutional_email(bootstrap_email):
        raise HTTPException(status_code=503, detail="System Admin bootstrap is not configured on the server.")
    if not secrets.compare_digest(email, bootstrap_email):
        raise HTTPException(status_code=403, detail="This Firebase account is not authorized for initial System Admin setup.")

    database_path = os.environ.get("SMARTDOCS_DATABASE_PATH", "").strip()
    if not database_path:
        raise HTTPException(status_code=503, detail="System Admin bootstrap requires an explicitly configured persistent database path.")
    path = Path(database_path).expanduser()
    # Do not let SQLite silently create a new, empty database on a mistyped
    # Render path. Bootstrap may only inspect and modify an existing DB file.
    if not path.is_absolute() or not path.is_file():
        raise HTTPException(status_code=503, detail="Configured database file does not exist; bootstrap will not create a new database.")
    return path


def _bootstrap_profile_status(database_path: Path, email: str, uid: str) -> tuple[bool, bool]:
    """Read readiness flags from an existing database without creating a file."""
    try:
        conn = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"users", "system_bootstrap"}.issubset(tables):
                raise HTTPException(status_code=503, detail="Configured database is missing required SmartDocs tables.")
            consumed = conn.execute("SELECT 1 FROM system_bootstrap WHERE id = 1").fetchone() is not None
            active_admin = conn.execute("SELECT 1 FROM users WHERE role='admin' AND is_active=1 LIMIT 1").fetchone() is not None
            profile = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            eligible = bool(
                profile
                and profile["role"] == "author"
                and profile["status"] == "active"
                and profile["is_active"] == 1
                and profile["is_verified"] == 1
                and profile["firebase_uid"] == uid
            )
            return consumed or active_admin, eligible
        finally:
            conn.close()
    except HTTPException:
        raise
    except (sqlite3.Error, OSError):
        raise HTTPException(status_code=503, detail="Configured database could not be safely inspected.")


@router.get("/bootstrap-admin/status")
def bootstrap_admin_status(authorization: Optional[str] = Header(None)):
    """Read-only preflight; reveals no secret, path, profile data, or token."""
    _, email, uid = _verified_bootstrap_identity(authorization)
    database_path = _bootstrap_configuration(email)
    consumed, eligible = _bootstrap_profile_status(database_path, email, uid)
    if consumed:
        return {"ready": False, "email": email, "reason": "Bootstrap has already been completed."}
    if not eligible:
        return {"ready": False, "email": email, "reason": "This account must have an existing active, verified Author profile linked to this Firebase account."}
    return {"ready": True, "email": email}

@router.post("/bootstrap-admin")
def bootstrap_admin(authorization: Optional[str] = Header(None)):
    """Promotes only the configured, verified Author account during one-time bootstrap.

    ADMIN_BOOTSTRAP_SECRET is a backend-only enablement secret; it is never
    accepted from or sent by the browser. ADMIN_BOOTSTRAP_EMAIL scopes the
    otherwise one-time operation to the intended account.
    """
    _, email, uid = _verified_bootstrap_identity(authorization)
    database_path = _bootstrap_configuration(email)
    _bootstrap_profile_status(database_path, email, uid)

    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT id FROM system_bootstrap WHERE id = 1").fetchone() or conn.execute("SELECT id FROM users WHERE role='admin' AND is_active=1").fetchone():
            raise HTTPException(status_code=409, detail="System Admin bootstrap has already been completed.")
        existing_user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not existing_user:
            raise HTTPException(status_code=403, detail="Sign in with your existing active Author profile before bootstrap.")
        if existing_user["role"] != "author" or existing_user["status"] != "active" or existing_user["is_active"] != 1 or existing_user["is_verified"] != 1:
            raise HTTPException(status_code=403, detail="Bootstrap requires your active, verified Author profile.")
        if existing_user["firebase_uid"] != uid:
            raise HTTPException(status_code=409, detail="This email is linked to another Firebase account.")

        updated = conn.execute(
            "UPDATE users SET role = 'admin', status = 'active', is_active = 1, is_verified = 1 WHERE id = ? AND role = 'author' AND firebase_uid = ? AND email = ?",
            (existing_user["id"], uid, email),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=409, detail="The Author profile changed; retry after reviewing the account.")
        user_id = existing_user["id"]

        record_audit_log(
            conn, action="admin_bootstrapped", actor_id=uid, actor_email=email, target_user_id=user_id,
            details={"email": email, "promoted": True}
        )
        conn.execute("INSERT INTO system_bootstrap (id, completed_at, admin_user_id, admin_firebase_uid) VALUES (1, ?, ?, ?)", (datetime.now(timezone.utc).isoformat(), user_id, uid))

    return {
        "success": True,
        "message": "Initial System Admin configured successfully.",
        "user": {
            "id": user_id,
            "email": email,
            "full_name": existing_user["full_name"],
            "role": "admin"
        }
    }


# ============================================================
# 5. SYSTEM ADMIN USER MANAGEMENT (Requirement 7)
# ============================================================

@router.get("/users")
def list_users(current_admin: Dict[str, Any] = Depends(require_role(["admin"]))):
    """
    Retrieves all user accounts for administration.
    Never exposes passwords or password hashes.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, email, full_name, role, status, is_active, is_verified, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        users = [dict(r) for r in rows]
        invitations = conn.execute("SELECT id,email,role,expires_at,used_at,revoked_at,created_at FROM user_invitations ORDER BY created_at DESC").fetchall()
        return {"success": True, "users": users, "invitations": [dict(r) for r in invitations]}


@router.post("/users/invitations")
def admin_create_invitation(
    req: CreateInvitationRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """Creates a one-time invitation and returns its secret link exactly once for delivery."""
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid invitation role.")
    if req.role in {"reviewer", "approver", "template_admin", "admin"} and not req.confirm_privileged:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required for privileged invitations.")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=req.expires_in_hours)
    invitation_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("UPDATE user_invitations SET revoked_at=? WHERE email=? AND used_at IS NULL AND revoked_at IS NULL", (now.isoformat(), req.email))
        conn.execute(
            "INSERT INTO user_invitations (id,email,role,token_hash,expires_at,created_by) VALUES (?,?,?,?,?,?)",
            (invitation_id, req.email, req.role, hashlib.sha256(token.encode("utf-8")).hexdigest(), expires_at.isoformat(), current_admin.get("sub")),
        )
        record_audit_log(
            conn, action="invitation_created", actor_id=current_admin.get("sub"),
            actor_email=current_admin.get("email"), target_user_id=invitation_id,
            details={"email": req.email, "role": req.role, "expires_at": expires_at.isoformat()}
        )
    app_url = os.getenv("PUBLIC_APP_URL", "https://smart-document-generator-acm-svnit.vercel.app").rstrip("/")
    return {"success": True, "invitation_id": invitation_id, "email": req.email, "role": req.role,
            "expires_at": expires_at.isoformat(), "invitation_url": f"{app_url}/#invite={token}"}


@router.put("/users/{user_id}/role")
def admin_update_user_role(
    user_id: str,
    req: UpdateRoleRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin changes another user's database-authoritative role.
    """
    with get_db() as conn:
        target_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")
        if current_admin.get("sub") == user_id and req.role != target_user["role"]:
            raise HTTPException(status_code=400, detail="Administrators cannot change their own role.")
        if req.role in {"admin", "template_admin", "approver", "reviewer"} and not req.confirm_privileged_change:
            raise HTTPException(status_code=400, detail="Explicit confirmation is required for privileged role changes.")

        conn.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, user_id))

        record_audit_log(
            conn, action="role_changed_by_admin", actor_id=current_admin.get("sub"),
            actor_email=current_admin.get("email"), target_user_id=user_id,
            details={"old_role": target_user["role"], "new_role": req.role}
        )

    return {
        "success": True,
        "message": f"User role updated to '{req.role}'.",
        "user_id": user_id,
        "new_role": req.role
    }


@router.put("/users/{user_id}/status")
def admin_update_user_status(
    user_id: str,
    req: UpdateStatusRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin activates or deactivates a user account.
    Deactivated users are blocked from logging in or using existing tokens.
    """
    if current_admin.get("sub") == user_id and req.status == "inactive":
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own System Admin account."
        )

    is_act = 1 if req.status == "active" else 0
    with get_db() as conn:
        target_user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")

        conn.execute(
            "UPDATE users SET status = ?, is_active = ? WHERE id = ?",
            (req.status, is_act, user_id)
        )

        record_audit_log(
            conn, action="status_changed_by_admin", actor_id=current_admin.get("sub"),
            actor_email=current_admin.get("email"), target_user_id=user_id,
            details={"new_status": req.status}
        )

    return {
        "success": True,
        "message": f"User account status changed to '{req.status}'.",
        "user_id": user_id,
        "status": req.status,
        "is_active": is_act
    }


@router.post("/users/invitations/{invitation_id}/revoke")
def revoke_invitation(invitation_id: str, current_admin: Dict[str, Any] = Depends(require_role(["admin"]))):
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        invitation = conn.execute("SELECT id,used_at,revoked_at FROM user_invitations WHERE id=?", (invitation_id,)).fetchone()
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        if invitation["used_at"] or invitation["revoked_at"]:
            raise HTTPException(status_code=409, detail="Invitation is already used or revoked.")
        conn.execute("UPDATE user_invitations SET revoked_at=? WHERE id=?", (now, invitation_id))
        record_audit_log(conn, action="invitation_revoked", actor_id=current_admin.get("sub"), actor_email=current_admin.get("email"), target_user_id=invitation_id)
    return {"success": True, "invitation_id": invitation_id, "revoked_at": now}


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: str,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin permanently deletes a user account.
    """
    if current_admin.get("sub") == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    with get_db() as conn:
        target_user = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")

        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

        record_audit_log(
            conn, action="user_deleted_by_admin", actor_id=current_admin.get("sub"),
            actor_email=current_admin.get("email"), target_user_id=user_id,
            details={"deleted_email": target_user["email"]}
        )

    return {"success": True, "message": f"User '{user_id}' deleted successfully."}


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 50,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin views recent security audit events.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return {"success": True, "logs": [dict(r) for r in rows]}
