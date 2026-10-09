"""
Authentication and User Management Routes.
Implements registration, login with token generation, role verification,
and current user profile resolution for RBAC.
"""
import uuid
import re
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from app.db.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    require_authenticated_user,
    require_role
)

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class UserRegisterRequest(BaseModel):
    email: str = Field(description="User email address")
    password: str = Field(min_length=6, description="User password")
    full_name: str = Field(min_length=2, description="Full name")
    role: str = Field(default="author", description="Role: viewer, author, reviewer, approver, template_admin, admin")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()

class UserLoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()

@router.post("/register")
def register_user(request: UserRegisterRequest):
    valid_roles = ["viewer", "author", "reviewer", "approver", "template_admin", "admin"]
    if request.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role '{request.role}'. Allowed roles: {valid_roles}")

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (request.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"User with email '{request.email}' already exists.")

        user_id = f"usr-{uuid.uuid4().hex[:12]}"
        hashed_pwd = hash_password(request.password)
        conn.execute(
            """
            INSERT INTO users (id, email, hashed_password, full_name, role)
            VALUES (?, ?, ?, ?, ?)
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
        "access_token": token,
        "token_type": "Bearer"
    }

@router.post("/login")
def login_user(request: UserLoginRequest):
    with get_db() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE email = ?", (request.email,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

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
                "role": user_row["role"]
            },
            "access_token": token,
            "token_type": "Bearer"
        }

@router.get("/me")
def get_current_user_profile(user: Dict[str, Any] = Depends(require_authenticated_user)):
    return {
        "authenticated": True,
        "user": {
            "id": user.get("sub"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role")
        }
    }
