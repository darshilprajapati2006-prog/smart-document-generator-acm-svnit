"""
Security, Cryptography, and Authentication utilities.
Implements PBKDF2-HMAC-SHA256 for secure password hashing and token generation.
"""
import hashlib
import hmac
import secrets
import json
import base64
import os
import time
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY")
ALGORITHM = "PBKDF2-HMAC-SHA256"
SALT_BYTES = 16
HASH_ITERATIONS = 100_000
TOKEN_EXPIRY_SECONDS = 86400 * 7 # 7 days


def _secret_key_bytes() -> bytes:
    if not SECRET_KEY or len(SECRET_KEY) < 32:
        raise RuntimeError("Configure JWT_SECRET_KEY or SECRET_KEY with at least 32 characters.")
    return SECRET_KEY.encode("utf-8")

security_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hashes a password with a random salt using PBKDF2-HMAC-SHA256."""
    salt = secrets.token_bytes(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        HASH_ITERATIONS
    )
    return f"{salt.hex()}:{derived.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored salt:hash string."""
    try:
        salt_hex, hash_hex = hashed_password.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            HASH_ITERATIONS
        )
        return hmac.compare_digest(derived, expected_hash)
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str, full_name: str) -> str:
    """Creates a signed tamper-proof token containing user identity and role."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "full_name": full_name,
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS,
        "iat": int(time.time()),
        "nonce": secrets.token_hex(8)
    }
    payload_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode('utf-8').rstrip('=')
    
    signature = hmac.new(
        _secret_key_bytes(),
        payload_b64.encode('utf-8'),
        hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')
    
    return f"{payload_b64}.{sig_b64}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and cryptographically verifies token signature and expiration."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig_b64 = parts
        
        # Verify HMAC signature
        expected_sig = hmac.new(
            _secret_key_bytes(),
            payload_b64.encode('utf-8'),
            hashlib.sha256
        ).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode('utf-8').rstrip('=')
        
        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            return None
            
        # Add padding back if necessary
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(padded.encode('utf-8')).decode('utf-8')
        payload = json.loads(payload_json)
        
        if payload.get("exp", 0) < time.time():
            return None
            
        return payload
    except Exception:
        return None

def compute_payload_hash(data: Dict[str, Any]) -> str:
    """Computes deterministic SHA-256 hash of structured JSON payload for tampering detection."""
    canonical_json = json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(canonical_json).hexdigest()

def sign_data_payload(data: Dict[str, Any], signer_id: str) -> str:
    """Signs canonical document payload using HMAC-SHA256 with signer salt."""
    p_hash = compute_payload_hash(data)
    to_sign = f"{signer_id}:{p_hash}".encode('utf-8')
    return hmac.new(_secret_key_bytes(), to_sign, hashlib.sha256).hexdigest()

def is_allowlisted_admin(email: Optional[str]) -> bool:
    """Only the configured one-time bootstrap identity can hold System Admin access."""
    if not email:
        return False
    email_clean = email.strip().lower()
    bootstrap_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "").strip().lower()
    return bool(bootstrap_email) and email_clean == bootstrap_email

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Optional[Dict[str, Any]]:
    """Validates a Firebase ID token and loads the matching active, verified DB user."""
    if not credentials:
        return None
    token = credentials.credentials
    try:
        from app.core.firebase_auth import verify_firebase_id_token
        user = verify_firebase_id_token(token)
    except Exception:
        return None
    if not user.get("email_verified"):
        return None
    try:
        from app.db.database import get_db
        with get_db() as conn:
            user_row = conn.execute(
                "SELECT id, email, full_name, role, status, is_active, is_verified FROM users WHERE firebase_uid = ? OR (id = ? AND email = ?)",
                (user.get("uid"), user.get("uid"), user.get("email"))
            ).fetchone()
            if not user_row or user_row["is_active"] == 0 or user_row["status"] == "inactive":
                return None
            if user_row["email"].strip().lower() != str(user.get("email", "")).strip().lower():
                return None
            if user_row["is_verified"] == 0 or user_row["status"] == "pending_verification":
                return None
            
            if is_allowlisted_admin(user.get("email")):
                user["role"] = "admin"
                user["status"] = "active"
                user["is_active"] = 1
                user["is_verified"] = 1
                try:
                    conn.execute("UPDATE users SET role = 'admin', status = 'active', is_active = 1, is_verified = 1 WHERE id = ?", (user_row["id"],))
                except Exception:
                    pass
            else:
                user["role"] = "viewer" if user_row["role"] == "admin" else user_row["role"]
                user["status"] = user_row["status"]
                user["is_active"] = user_row["is_active"]
                user["is_verified"] = user_row["is_verified"] if "is_verified" in user_row.keys() else 1

            user["full_name"] = user_row["full_name"]
    except Exception:
        pass
    return user

def require_authenticated_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Dict[str, Any]:
    """Verifies Firebase signature/issuer and enforces DB-backed role/status."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication credentials required.")
    from app.core.firebase_auth import verify_firebase_id_token
    try:
        user = verify_firebase_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    if not user.get("email_verified") or not user.get("email"):
        raise HTTPException(status_code=403, detail="Please verify your email address before signing in.")
    
    from app.db.database import get_db
    with get_db() as conn:
        user_row = conn.execute(
            "SELECT id, email, full_name, role, status, is_active, is_verified FROM users WHERE firebase_uid = ? OR (id = ? AND email = ?)",
            (user.get("uid"), user.get("uid"), user.get("email"))
        ).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="User account no longer exists.")
        if user_row["email"].strip().lower() != str(user.get("email", "")).strip().lower():
            raise HTTPException(status_code=403, detail="Firebase account email does not match the SmartDocs profile.")
        if user_row["is_active"] == 0 or user_row["status"] == "inactive":
            raise HTTPException(
                status_code=403,
                detail="Account is deactivated. Please contact the System Administrator."
            )
        if user_row["is_verified"] == 0 or user_row["status"] == "pending_verification":
            raise HTTPException(status_code=403, detail="Please verify your email address before signing in.")

        if is_allowlisted_admin(user.get("email")):
            if user_row["role"] != "admin" or user_row["status"] != "active":
                conn.execute("UPDATE users SET role = 'admin', status = 'active', is_active = 1, is_verified = 1 WHERE id = ?", (user_row["id"],))
            user_role = "admin"
        else:
            user_role = "viewer" if user_row["role"] == "admin" else user_row["role"]

        # Keep authenticated context strictly synchronized with active database record
        user["sub"] = user_row["id"]
        user["role"] = user_role
        user["full_name"] = user_row["full_name"]
        user["status"] = user_row["status"]
        user["is_active"] = user_row["is_active"]
        user["is_verified"] = user_row["is_verified"] if "is_verified" in user_row.keys() else 1
        
    return user

def require_role(allowed_roles: list[str]):
    """Role-based authorization dependency factory."""
    def role_checker(user: Dict[str, Any] = Depends(require_authenticated_user)) -> Dict[str, Any]:
        user_role = user.get("role")
        if user_role not in allowed_roles and user_role != "admin":
            raise HTTPException(
                status_code=403,
                detail=f"Action forbidden for role '{user_role}'. Required one of: {allowed_roles}"
            )
        return user
    return role_checker
