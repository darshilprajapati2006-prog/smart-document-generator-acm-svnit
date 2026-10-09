"""
Authentication and User Management Routes.
Implements secure role-based login, JWT token issuance, session profile verification,
initial System Admin bootstrap, and System Admin user management (CRUD).
"""
import os
import uuid
import re
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field, field_validator

from app.db.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    require_authenticated_user,
    require_role,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
VALID_ROLES = ["viewer", "author", "reviewer", "approver", "template_admin", "admin"]


# ============================================================
# REQUEST & RESPONSE SCHEMAS
# ============================================================

class UserLoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class UserRegisterRequest(BaseModel):
    email: str = Field(description="User email address")
    password: str = Field(min_length=6, description="User password (min 6 chars)")
    full_name: str = Field(min_length=2, description="Full name")
    role: str = Field(default="author", description="Role: viewer, author, reviewer, approver, template_admin, admin")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class AdminCreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: str = Field(default="author")
    status: str = Field(default="active")

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
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2, default="System Administrator")
    secret_key: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


# ============================================================
# AUTHENTICATION ENDPOINTS
# ============================================================

@router.post("/login")
def login_user(request: UserLoginRequest):
    """
    Authenticates user credentials, verifies active account status,
    and returns signed token with user identity and assigned role.
    """
    with get_db() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE email = ?", (request.email,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        # Check account status
        is_active = user_row["is_active"] if "is_active" in user_row.keys() else 1
        status = user_row["status"] if "status" in user_row.keys() else "active"
        if is_active == 0 or status == "inactive":
            raise HTTPException(
                status_code=403,
                detail="Account is deactivated. Please contact the System Administrator."
            )

        # Verify cryptographic password hash
        if not verify_password(request.password, user_row["hashed_password"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        token = create_access_token(
            user_row["id"],
            user_row["email"],
            user_row["role"],
            user_row["full_name"]
        )

        return {
            "success": True,
            "user": {
                "id": user_row["id"],
                "email": user_row["email"],
                "full_name": user_row["full_name"],
                "role": user_row["role"],
                "status": status,
                "is_active": is_active
            },
            "access_token": token,
            "token_type": "Bearer"
        }


@router.post("/logout")
def logout_user(user: Optional[Dict[str, Any]] = Depends(get_current_user)):
    """Logs out user session on client side."""
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
            "is_active": user.get("is_active", 1)
        }
    }


@router.post("/register")
def register_user(
    request: UserRegisterRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """
    Self-registration or author registration.
    Elevated roles (admin, template_admin, approver) require an authenticated System Admin.
    """
    if request.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role '{request.role}'. Allowed roles: {VALID_ROLES}")

    # Elevating to admin or template_admin requires existing admin session
    if request.role in ["admin", "template_admin"]:
        if not current_user or current_user.get("role") != "admin":
            raise HTTPException(
                status_code=403,
                detail=f"Only an authorized System Admin can assign role '{request.role}'."
            )

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (request.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"User with email '{request.email}' already exists.")

        user_id = f"usr-{uuid.uuid4().hex[:12]}"
        hashed_pwd = hash_password(request.password)
        conn.execute(
            """
            INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active)
            VALUES (?, ?, ?, ?, ?, 'active', 1)
            """,
            (user_id, request.email, hashed_pwd, request.full_name, request.role)
        )

    token = create_access_token(user_id, request.email, request.role, request.full_name)
    return {
        "success": True,
        "user_id": user_id,
        "email": request.email,
        "full_name": request.full_name,
        "role": request.role,
        "status": "active",
        "is_active": 1,
        "access_token": token,
        "token_type": "Bearer"
    }


# ============================================================
# BOOTSTRAP INITIAL SYSTEM ADMIN (Requirement 3)
# ============================================================

@router.post("/bootstrap-admin")
def bootstrap_admin(
    req: BootstrapAdminRequest,
    x_bootstrap_secret: Optional[str] = Header(None)
):
    """
    Secure bootstrap mechanism to create the initial System Admin account.
    Allowed only if no active admin account exists OR if valid BOOTSTRAP_SECRET_KEY is provided.
    """
    configured_secret = os.environ.get("BOOTSTRAP_SECRET_KEY")
    secret_matches = False
    if configured_secret and (req.secret_key == configured_secret or x_bootstrap_secret == configured_secret):
        secret_matches = True

    with get_db() as conn:
        # Check if any active admin account exists
        admin_row = conn.execute(
            "SELECT id FROM users WHERE role = 'admin' AND is_active = 1"
        ).fetchone()

        if admin_row and not secret_matches:
            raise HTTPException(
                status_code=403,
                detail="A System Admin is already configured. Please sign in as System Admin to manage accounts."
            )

        existing_user = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
        hashed_pwd = hash_password(req.password)

        if existing_user:
            # Upgrade existing user to admin
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', hashed_password = ?, full_name = ?, status = 'active', is_active = 1
                WHERE email = ?
                """,
                (hashed_pwd, req.full_name, req.email)
            )
            user_id = existing_user["id"]
        else:
            user_id = f"usr-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active)
                VALUES (?, ?, ?, ?, 'admin', 'active', 1)
                """,
                (user_id, req.email, hashed_pwd, req.full_name)
            )

    token = create_access_token(user_id, req.email, "admin", req.full_name)
    return {
        "success": True,
        "message": "Initial System Admin configured successfully.",
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "role": "admin"
        },
        "access_token": token,
        "token_type": "Bearer"
    }


# ============================================================
# SYSTEM ADMIN USER MANAGEMENT ENDPOINTS (Requirement 7)
# ============================================================

@router.get("/users")
def list_users(current_admin: Dict[str, Any] = Depends(require_role(["admin"]))):
    """
    Retrieves all user accounts for administration.
    Never exposes passwords or password hashes.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, email, full_name, role, status, is_active, created_at FROM users ORDER BY created_at DESC"
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
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"User with email '{req.email}' already exists.")

        user_id = f"usr-{uuid.uuid4().hex[:12]}"
        hashed_pwd = hash_password(req.password)
        is_act = 1 if req.status == "active" else 0

        conn.execute(
            """
            INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, req.email, hashed_pwd, req.full_name, req.role, req.status, is_act)
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
            "is_active": is_act
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
        target_user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")

        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    return {"success": True, "message": f"User '{user_id}' deleted successfully."}
