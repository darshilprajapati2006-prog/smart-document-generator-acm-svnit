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
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Request, status
from pydantic import BaseModel, Field, field_validator

from app.db.database import get_db
from app.core.security import (
    hash_password,
    require_authenticated_user,
    require_role,
    get_current_user
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
VALID_ROLES = ["viewer", "author", "reviewer", "approver", "template_admin", "admin"]
PUBLIC_ROLES = {"author"}

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
    Or custom domains in ALLOWED_EMAIL_DOMAINS env var.
    Registration is always restricted to institutional domains.
    """
    allowed_env = os.getenv("ALLOWED_EMAIL_DOMAINS", "").strip()
    if allowed_env:
        allowed_list = [d.strip().lower() for d in allowed_env.split(",") if d.strip()]
        domain = email.lower().split("@")[-1]
        for allowed in allowed_list:
            if domain == allowed or domain.endswith("." + allowed):
                return True
        return False

    domain = email.lower().split("@")[-1]
    if (
        domain == "svnit.ac.in"
        or domain.endswith(".svnit.ac.in")
        or domain == "svnit.acm.org"
        or domain.endswith(".svnit.acm.org")
        or domain == "acm.org"
    ):
        return True

    return False


# ============================================================
# REQUEST & RESPONSE SCHEMAS
# ============================================================

class UserRegisterRequest(BaseModel):
    role: str = "author"
    full_name: str = Field(min_length=2, description="Full Name")
    email: str = Field(description="Institutional Email Address")

    @field_validator("role")
    @classmethod
    def validate_public_role(cls, v):
        if v not in PUBLIC_ROLES:
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


class AdminCreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: str = Field(default="author")
    status: str = Field(default="active")
    is_verified: bool = Field(default=True)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Allowed roles: {VALID_ROLES}")
        return v


class UpdateRoleRequest(BaseModel):
    role: str

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


class BootstrapAdminRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, default="System Administrator")
    secret_key: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


# ============================================================
# 1. SIGN-UP / REGISTRATION (Requirements 2 & 3)
# ============================================================

@router.post("/register")
def register_user(request: UserRegisterRequest, authorization: Optional[str] = Header(None)):
    """Creates a pending Author profile for a Firebase-authenticated signup."""
    if request.role != "author":
        raise HTTPException(status_code=403, detail="Public registration is limited to Author accounts.")
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

    with get_db() as conn:
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            if existing["firebase_uid"] and existing["firebase_uid"] != claims["uid"]:
                raise HTTPException(status_code=409, detail="An account already exists for this email. Contact an administrator.")
            if existing["role"] != "author":
                raise HTTPException(status_code=409, detail="An account already exists for this email. Contact an administrator.")
            # Never claim even an Author profile until Firebase confirms mailbox ownership.
            if not claims.get("email_verified"):
                raise HTTPException(status_code=403, detail="Verify your email address before completing registration.")
            conn.execute("UPDATE users SET firebase_uid = ? WHERE id = ?", (claims["uid"], existing["id"]))
        else:
            conn.execute(
                "INSERT INTO users (id,email,hashed_password,full_name,role,status,is_active,is_verified,firebase_uid) VALUES (?,?,?,?,?,'pending_verification',1,0,?)",
                (claims["uid"], email, "firebase-managed", request.full_name.strip(), "author", claims["uid"]),
            )
    return {"success": True, "requires_email_verification": not bool(claims.get("email_verified")), "message": "Account created. Check your inbox for the verification link."}


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

@router.post("/bootstrap-admin")
def bootstrap_admin(
    req: BootstrapAdminRequest,
    x_bootstrap_secret: Optional[str] = Header(None)
):
    """
    Secure bootstrap mechanism to create or promote the initial System Admin account.
    Allowed only if:
    - No active System Admin account exists in SQLite, OR
    - Valid BOOTSTRAP_SECRET_KEY / ADMIN_BOOTSTRAP_SECRET is provided.
    """
    validate_password_policy(req.password)
    configured_secret = os.environ.get("BOOTSTRAP_SECRET_KEY") or os.environ.get("ADMIN_BOOTSTRAP_SECRET")
    secret_matches = False
    if configured_secret and (req.secret_key == configured_secret or x_bootstrap_secret == configured_secret):
        secret_matches = True

    with get_db() as conn:
        admin_row = conn.execute(
            "SELECT id FROM users WHERE role = 'admin' AND is_active = 1"
        ).fetchone()

        if admin_row and not secret_matches:
            raise HTTPException(
                status_code=403,
                detail="A System Admin is already configured. Use authorized admin session or provide valid bootstrap secret."
            )

        existing_user = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
        hashed_pwd = hash_password(req.password)

        if existing_user:
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', hashed_password = ?, full_name = ?, status = 'active', is_active = 1, is_verified = 1
                WHERE email = ?
                """,
                (hashed_pwd, req.full_name, req.email)
            )
            user_id = existing_user["id"]
        else:
            user_id = f"usr-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active, is_verified)
                VALUES (?, ?, ?, ?, 'admin', 'active', 1, 1)
                """,
                (user_id, req.email, hashed_pwd, req.full_name)
            )

        record_audit_log(
            conn, action="admin_bootstrapped", actor_email=req.email, target_user_id=user_id,
            details={"email": req.email, "promoted": bool(existing_user)}
        )

    return {
        "success": True,
        "message": "Initial System Admin configured successfully.",
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
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
        return {"success": True, "users": users}


@router.post("/users")
def admin_create_user(
    req: AdminCreateUserRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin creates an individual user account with any assigned role.
    Securely hashes password and validates unique email.
    """
    validate_password_policy(req.password)

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"User with email '{req.email}' already exists.")

        user_id = f"usr-{uuid.uuid4().hex[:12]}"
        hashed_pwd = hash_password(req.password)
        is_act = 1 if req.status == "active" else 0
        is_ver = 1 if req.is_verified else 0

        conn.execute(
            """
            INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, req.email, hashed_pwd, req.full_name, req.role, req.status, is_act, is_ver)
        )

        record_audit_log(
            conn, action="user_created_by_admin", actor_id=current_admin.get("sub"),
            actor_email=current_admin.get("email"), target_user_id=user_id,
            details={"email": req.email, "role": req.role, "status": req.status}
        )

    return {
        "success": True,
        "message": f"User '{req.full_name}' created successfully with role '{req.role}'.",
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "role": req.role,
            "status": req.status,
            "is_active": is_act,
            "is_verified": is_ver
        }
    }


@router.put("/users/{user_id}/role")
def admin_update_user_role(
    user_id: str,
    req: UpdateRoleRequest,
    current_admin: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """
    System Admin updates another user's assigned role.
    Prevents self-demotion if caller is the only active admin.
    """
    with get_db() as conn:
        target_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")

        # Guard: If current admin is demoting themselves, ensure another active admin remains
        if current_admin.get("sub") == user_id and req.role != "admin":
            other_admins = conn.execute(
                "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
                (user_id,)
            ).fetchone()
            if other_admins["count"] == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove admin role: System requires at least one active System Admin."
                )

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
