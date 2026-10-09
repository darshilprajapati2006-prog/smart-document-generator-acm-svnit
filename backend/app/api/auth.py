"""
Authentication and User Management Routes for SmartDocs SVNIT.
Implements:
1. Public registration with email verification OTP.
2. Two-Factor Authentication (OTP on Login).
3. Forgot Password & Password Reset via OTP.
4. Cryptographic password hashing (PBKDF2-HMAC-SHA256).
5. Secure bootstrap of initial System Admin.
6. Role-Based Access Control and System Admin user management.
7. Security audit logging.
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
    verify_password,
    create_access_token,
    require_authenticated_user,
    require_role,
    get_current_user
)
from app.services.email_service import (
    send_signup_otp_email,
    send_login_otp_email,
    send_password_reset_otp_email
)
from app.services.otp_service import (
    issue_otp_challenge,
    verify_otp_challenge,
    OTPCooldownError,
    OTPExpiredError,
    OTPAttemptsExceededError,
    OTPInvalidError
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
VALID_ROLES = ["viewer", "author", "reviewer", "approver", "template_admin", "admin"]

def mask_email(email: str) -> str:
    """Masks an email for safe display (e.g. j***@svnit.acm.org)."""
    parts = email.split("@")
    if len(parts) != 2:
        return email
    name, domain = parts
    if len(name) <= 2:
        masked_name = name[0] + "***"
    else:
        masked_name = name[0] + "***" + name[-1]
    return f"{masked_name}@{domain}"

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


class VerifyLoginOtpRequest(BaseModel):
    challenge_id: str
    otp: str = Field(min_length=6, max_length=6)


class ResendLoginOtpRequest(BaseModel):
    challenge_id: str


class UserRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, description="Full Name")
    email: str = Field(description="Institutional Email Address")
    password: str = Field(min_length=8, description="Password (min 8 chars)")
    confirm_password: str = Field(min_length=8, description="Confirm Password")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class VerifyEmailOtpRequest(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class ResendEmailOtpRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_PATTERN.match(v.strip()):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v.strip().lower()


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
def register_user(request: UserRegisterRequest, req: Request):
    """
    Public registration endpoint.
    - Public sign-up always assigns the 'author' role by default.
    - Creates user in 'pending_verification' status.
    - Generates and dispatches a time-limited 6-digit email verification OTP.
    - Never returns the OTP in the API response.
    """
    # 1. Validate password match and policy
    if request.password != request.confirm_password:
        raise HTTPException(status_code=400, detail="Password and Confirm Password do not match.")
    validate_password_policy(request.password)

    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        # Check duplicate email
        existing = conn.execute("SELECT id, is_verified, status FROM users WHERE email = ?", (request.email,)).fetchone()
        if existing:
            if existing["is_verified"] == 1:
                raise HTTPException(status_code=400, detail="An account with this institutional email already exists. Please sign in.")
            else:
                # Existing unverified user: update details and re-issue OTP
                user_id = existing["id"]
                conn.execute(
                    """
                    UPDATE users
                    SET full_name = ?, hashed_password = ?, status = 'pending_verification', is_active = 1, is_verified = 0
                    WHERE id = ?
                    """,
                    (request.full_name, hash_password(request.password), user_id)
                )
        else:
            user_id = f"usr-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active, is_verified)
                VALUES (?, ?, ?, ?, 'author', 'pending_verification', 1, 0)
                """,
                (user_id, request.email, hash_password(request.password), request.full_name)
            )

        # 2. Issue OTP challenge
        try:
            raw_otp, challenge_id = issue_otp_challenge(
                conn, email=request.email, purpose="signup_verification", user_id=user_id
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))

        # 3. Dispatch branded verification email
        email_sent = send_signup_otp_email(request.email, request.full_name, raw_otp)
        if not email_sent:
            conn.rollback()
            raise HTTPException(
                status_code=502,
                detail="Unable to send email verification code via email service. Please check RESEND_API_KEY and EMAIL_FROM configuration or try again."
            )

        # 4. Audit Log
        record_audit_log(
            conn,
            action="user_registered",
            actor_email=request.email,
            target_user_id=user_id,
            details={"email": request.email, "role": "author"},
            ip_address=client_ip
        )

    return {
        "success": True,
        "message": f"Verification code sent to {mask_email(request.email)}. Please enter the 6-digit code to activate your account.",
        "email": request.email,
        "cooldown_seconds": 60
    }


@router.post("/verify-email-otp")
def verify_email_otp(request: VerifyEmailOtpRequest, req: Request):
    """
    Verifies the email verification OTP and activates the user account.
    """
    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        try:
            verified_email = verify_otp_challenge(
                conn, email=request.email, purpose="signup_verification", otp=request.otp
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))
        except (OTPExpiredError, OTPAttemptsExceededError, OTPInvalidError) as oe:
            raise HTTPException(status_code=400, detail=str(oe))

        # Activate the user
        user = conn.execute("SELECT id FROM users WHERE email = ?", (verified_email,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User account not found.")

        conn.execute(
            "UPDATE users SET status = 'active', is_active = 1, is_verified = 1 WHERE email = ?",
            (verified_email,)
        )

        record_audit_log(
            conn,
            action="email_verified",
            actor_email=verified_email,
            target_user_id=user["id"],
            details={"email": verified_email},
            ip_address=client_ip
        )

    return {
        "success": True,
        "message": "Email address verified successfully! You may now sign in."
    }


@router.post("/resend-email-otp")
def resend_email_otp(request: ResendEmailOtpRequest):
    """
    Re-issues a sign-up verification OTP subject to a 60-second cooldown.
    """
    with get_db() as conn:
        user = conn.execute("SELECT id, full_name, is_verified FROM users WHERE email = ?", (request.email,)).fetchone()
        if not user:
            # Generic safe response to prevent enumeration
            return {
                "success": True,
                "message": "If an eligible unverified account exists, a new code has been sent.",
                "cooldown_seconds": 60
            }

        if user["is_verified"] == 1:
            return {
                "success": True,
                "message": "This account is already verified. Please sign in.",
                "already_verified": True
            }

        try:
            raw_otp, challenge_id = issue_otp_challenge(
                conn, email=request.email, purpose="signup_verification", user_id=user["id"]
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))

        send_signup_otp_email(request.email, user["full_name"], raw_otp)

    return {
        "success": True,
        "message": f"A new verification code has been dispatched to {mask_email(request.email)}.",
        "cooldown_seconds": 60
    }


# ============================================================
# 2. SIGN-IN & LOGIN OTP 2FA (Requirements 4 & 5)
# ============================================================

@router.post("/login")
def login_user(request: UserLoginRequest, req: Request):
    """
    Step 1 of Authentication:
    - Verifies password against hashed credentials.
    - Checks active and verified status.
    - If valid, generates a single-use login challenge and sends OTP to registered email.
    - Returns challenge_id for the subsequent OTP verification step.
    """
    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE email = ?", (request.email,)).fetchone()
        if not user_row:
            record_audit_log(
                conn, action="login_failed", actor_email=request.email,
                details={"reason": "nonexistent_email"}, ip_address=client_ip
            )
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        # Check account deactivation
        is_active = user_row["is_active"] if "is_active" in user_row.keys() else 1
        status_val = user_row["status"] if "status" in user_row.keys() else "active"
        if is_active == 0 or status_val == "inactive":
            record_audit_log(
                conn, action="login_blocked_inactive", actor_email=request.email,
                target_user_id=user_row["id"], ip_address=client_ip
            )
            raise HTTPException(
                status_code=403,
                detail="Account is deactivated. Please contact the System Administrator."
            )

        # Verify password hash
        if not verify_password(request.password, user_row["hashed_password"]):
            record_audit_log(
                conn, action="login_failed", actor_email=request.email,
                target_user_id=user_row["id"], details={"reason": "bad_password"}, ip_address=client_ip
            )
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        # Check unverified account
        is_verified = user_row["is_verified"] if "is_verified" in user_row.keys() else 1
        if is_verified == 0 or status_val == "pending_verification":
            raise HTTPException(
                status_code=403,
                detail="Your email address has not been verified yet. Please verify your email before signing in."
            )

        # Credentials valid: Generate single-use login OTP challenge
        try:
            raw_otp, challenge_id = issue_otp_challenge(
                conn, email=request.email, purpose="login_2fa", user_id=user_row["id"]
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))

        # Send login OTP email
        email_sent = send_login_otp_email(request.email, user_row["full_name"], raw_otp)
        if not email_sent:
            conn.rollback()
            raise HTTPException(
                status_code=502,
                detail="Unable to send login verification code via email service. Please check RESEND_API_KEY and EMAIL_FROM configuration or try again."
            )

        record_audit_log(
            conn,
            action="login_otp_sent",
            actor_email=request.email,
            target_user_id=user_row["id"],
            details={"challenge_id": challenge_id},
            ip_address=client_ip
        )

    return {
        "success": True,
        "requires_otp": True,
        "challenge_id": challenge_id,
        "email": request.email,
        "masked_email": mask_email(request.email),
        "message": f"A 6-digit login verification code was sent to {mask_email(request.email)}.",
        "cooldown_seconds": 60
    }


@router.post("/verify-login-otp")
def verify_login_otp(request: VerifyLoginOtpRequest, req: Request):
    """
    Step 2 of Authentication:
    - Verifies the OTP submitted with the challenge_id.
    - On success, establishes the authenticated session and returns JWT access token.
    """
    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        try:
            verified_email = verify_otp_challenge(
                conn, email=None, purpose="login_2fa", otp=request.otp, challenge_id=request.challenge_id
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))
        except (OTPExpiredError, OTPAttemptsExceededError, OTPInvalidError) as oe:
            raise HTTPException(status_code=400, detail=str(oe))

        user_row = conn.execute("SELECT * FROM users WHERE email = ?", (verified_email,)).fetchone()
        if not user_row or user_row["is_active"] == 0:
            raise HTTPException(status_code=403, detail="Account is deactivated.")

        token = create_access_token(
            user_row["id"],
            user_row["email"],
            user_row["role"],
            user_row["full_name"]
        )

        record_audit_log(
            conn,
            action="login_success",
            actor_email=verified_email,
            target_user_id=user_row["id"],
            details={"role": user_row["role"]},
            ip_address=client_ip
        )

    return {
        "success": True,
        "user": {
            "id": user_row["id"],
            "email": user_row["email"],
            "full_name": user_row["full_name"],
            "role": user_row["role"],
            "status": user_row["status"],
            "is_active": user_row["is_active"],
            "is_verified": user_row["is_verified"]
        },
        "access_token": token,
        "token_type": "Bearer"
    }


@router.post("/resend-login-otp")
def resend_login_otp(request: ResendLoginOtpRequest):
    """
    Resends login OTP challenge subject to 60-second cooldown.
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT email, user_id FROM auth_otps WHERE challenge_id = ? AND purpose = 'login_2fa' ORDER BY created_at DESC LIMIT 1",
            (request.challenge_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Login challenge expired or not found.")

        user_row = conn.execute("SELECT full_name FROM users WHERE email = ?", (row["email"],)).fetchone()
        name = user_row["full_name"] if user_row else "SVNIT Member"

        try:
            raw_otp, new_challenge_id = issue_otp_challenge(
                conn, email=row["email"], purpose="login_2fa", user_id=row["user_id"]
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))

        send_login_otp_email(row["email"], name, raw_otp)

    return {
        "success": True,
        "message": f"A new login code has been sent to {mask_email(row['email'])}.",
        "challenge_id": new_challenge_id,
        "cooldown_seconds": 60
    }


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
# 3. FORGOT PASSWORD & PASSWORD RESET (Requirement 6)
# ============================================================

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, req: Request):
    """
    Initiates password recovery.
    Dispatches a time-limited OTP to the registered email address.
    Protects against account enumeration through uniform messaging.
    """
    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        user_row = conn.execute("SELECT id, full_name, is_active FROM users WHERE email = ?", (request.email,)).fetchone()
        if user_row and user_row["is_active"] == 1:
            try:
                raw_otp, challenge_id = issue_otp_challenge(
                    conn, email=request.email, purpose="password_reset", user_id=user_row["id"]
                )
                send_password_reset_otp_email(request.email, user_row["full_name"], raw_otp)
                record_audit_log(
                    conn, action="password_reset_requested", actor_email=request.email,
                    target_user_id=user_row["id"], ip_address=client_ip
                )
            except OTPCooldownError as ce:
                raise HTTPException(status_code=429, detail=str(ce))
            except Exception:
                pass  # Avoid revealing delivery errors

    return {
        "success": True,
        "message": f"If an eligible account is registered with {mask_email(request.email)}, a password reset code has been sent.",
        "email": request.email,
        "cooldown_seconds": 60
    }


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, req: Request):
    """
    Verifies the password recovery OTP and resets the user's password.
    """
    if request.new_password != request.confirm_password:
        raise HTTPException(status_code=400, detail="New Password and Confirm Password do not match.")
    validate_password_policy(request.new_password)

    client_ip = req.client.host if req.client else None

    with get_db() as conn:
        try:
            verified_email = verify_otp_challenge(
                conn, email=request.email, purpose="password_reset", otp=request.otp
            )
        except OTPCooldownError as ce:
            raise HTTPException(status_code=429, detail=str(ce))
        except (OTPExpiredError, OTPAttemptsExceededError, OTPInvalidError) as oe:
            raise HTTPException(status_code=400, detail=str(oe))

        user_row = conn.execute("SELECT id FROM users WHERE email = ?", (verified_email,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User account not found.")

        new_hash = hash_password(request.new_password)
        conn.execute("UPDATE users SET hashed_password = ? WHERE id = ?", (new_hash, user_row["id"]))

        record_audit_log(
            conn,
            action="password_reset_completed",
            actor_email=verified_email,
            target_user_id=user_row["id"],
            ip_address=client_ip
        )

    return {
        "success": True,
        "message": "Password has been successfully updated. You may now sign in with your new password."
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
