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

SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY") or "acm-svnit-smart-document-generator-secure-secret-key-2026"
ALGORITHM = "PBKDF2-HMAC-SHA256"
SALT_BYTES = 16
HASH_ITERATIONS = 100_000
TOKEN_EXPIRY_SECONDS = 86400 * 7 # 7 days

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
        SECRET_KEY.encode('utf-8'),
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
            SECRET_KEY.encode('utf-8'),
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
    return hmac.new(SECRET_KEY.encode('utf-8'), to_sign, hashlib.sha256).hexdigest()

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Optional[Dict[str, Any]]:
    """Dependency that extracts user if authenticated and active, or None if anonymous."""
    if not credentials:
        return None
    token = credentials.credentials
    user = decode_access_token(token)
    if not user:
        return None
    try:
        from app.db.database import get_db
        with get_db() as conn:
            user_row = conn.execute(
                "SELECT id, email, full_name, role, status, is_active FROM users WHERE id = ?",
                (user.get("sub"),)
            ).fetchone()
            if not user_row or user_row["is_active"] == 0 or user_row["status"] == "inactive":
                return None
            user["role"] = user_row["role"]
            user["full_name"] = user_row["full_name"]
            user["status"] = user_row["status"]
            user["is_active"] = user_row["is_active"]
    except Exception:
        pass
    return user

def require_authenticated_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Dict[str, Any]:
    """Dependency enforcing authentication, active account status, and role integrity."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication credentials required.")
    user = decode_access_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    
    from app.db.database import get_db
    with get_db() as conn:
        user_row = conn.execute(
            "SELECT id, email, full_name, role, status, is_active FROM users WHERE id = ?",
            (user.get("sub"),)
        ).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="User account no longer exists.")
        if user_row["is_active"] == 0 or user_row["status"] == "inactive":
            raise HTTPException(
                status_code=403,
                detail="Account is deactivated. Please contact the System Administrator."
            )
        # Keep authenticated context strictly synchronized with active database record
        user["role"] = user_row["role"]
        user["full_name"] = user_row["full_name"]
        user["status"] = user_row["status"]
        user["is_active"] = user_row["is_active"]
        
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
