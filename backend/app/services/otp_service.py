"""
Cryptographic One-Time Password (OTP) Generation and Verification Service.
Enforces:
- Cryptographically secure random 6-digit tokens.
- Server-side HMAC-SHA256 hashing (never stored in plaintext).
- 10-minute expiration window.
- 60-second resend cooldown per email & purpose.
- Attempt limit (maximum 5 tries before permanent challenge burn).
- Replay and tampering prevention.
"""
import os
import uuid
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional
import sqlite3

OTP_SECRET_KEY = os.getenv("OTP_SECRET_KEY") or os.getenv("JWT_SECRET_KEY") or "acm_svnit_smart_docs_otp_secret_key_2026"
DEFAULT_EXPIRY_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5

class OTPError(Exception):
    """Base class for OTP errors."""
    pass

class OTPCooldownError(OTPError):
    def __init__(self, remaining_seconds: int):
        self.remaining_seconds = remaining_seconds
        super().__init__(f"Please wait {remaining_seconds} seconds before requesting a new verification code.")

class OTPExpiredError(OTPError):
    pass

class OTPAttemptsExceededError(OTPError):
    pass

class OTPInvalidError(OTPError):
    def __init__(self, message: str, remaining_attempts: Optional[int] = None):
        self.remaining_attempts = remaining_attempts
        super().__init__(message)

def generate_random_digits(length: int = 6) -> str:
    """Generates cryptographically secure numeric digits."""
    return "".join(secrets.choice("0123456789") for _ in range(length))

def hash_otp(otp: str, email: str) -> str:
    """Computes HMAC-SHA256 hash using server-side secret and lowercased email salt."""
    key = OTP_SECRET_KEY.encode("utf-8")
    msg = f"{otp.strip()}:{email.strip().lower()}".encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()

def issue_otp_challenge(
    conn: sqlite3.Connection,
    email: str,
    purpose: str,
    user_id: Optional[str] = None,
    expiry_minutes: int = DEFAULT_EXPIRY_MINUTES
) -> Tuple[str, str]:
    """
    Creates an OTP challenge in SQLite.
    Returns (raw_otp, challenge_id).
    Raises OTPCooldownError if called within the cooldown period.
    """
    clean_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    # 1. Check if an active, unused OTP is still within the resend cooldown window
    recent = conn.execute(
        """
        SELECT resend_available_at FROM auth_otps
        WHERE email = ? AND purpose = ? AND is_used = 0
        ORDER BY created_at DESC LIMIT 1
        """,
        (clean_email, purpose)
    ).fetchone()

    if recent and recent["resend_available_at"]:
        try:
            resend_time = datetime.fromisoformat(recent["resend_available_at"])
            if resend_time.tzinfo is None:
                resend_time = resend_time.replace(tzinfo=timezone.utc)
            if now < resend_time:
                wait_sec = int((resend_time - now).total_seconds()) + 1
                raise OTPCooldownError(wait_sec)
        except (ValueError, TypeError):
            pass

    # 2. Invalidate all previous unused OTPs for this email & purpose to prevent replay
    conn.execute(
        """
        UPDATE auth_otps SET is_used = 1
        WHERE email = ? AND purpose = ? AND is_used = 0
        """,
        (clean_email, purpose)
    )

    # 3. Generate secure code, challenge ID, and calculate timestamps
    raw_otp = generate_random_digits(6)
    challenge_id = f"chl-{uuid.uuid4().hex}"
    expires_at = (now + timedelta(minutes=expiry_minutes)).isoformat()
    resend_available_at = (now + timedelta(seconds=RESEND_COOLDOWN_SECONDS)).isoformat()
    otp_hash = hash_otp(raw_otp, clean_email)

    otp_id = f"otp-{uuid.uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO auth_otps (
            id, email, user_id, purpose, otp_hash, attempts, max_attempts,
            expires_at, resend_available_at, is_used, challenge_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?)
        """,
        (
            otp_id, clean_email, user_id, purpose, otp_hash,
            MAX_ATTEMPTS, expires_at, resend_available_at, challenge_id, now.isoformat()
        )
    )

    return raw_otp, challenge_id

def verify_otp_challenge(
    conn: sqlite3.Connection,
    email: Optional[str],
    purpose: str,
    otp: str,
    challenge_id: Optional[str] = None
) -> str:
    """
    Verifies an OTP against SQLite records.
    Returns the verified email address.
    Raises OTPExpiredError, OTPAttemptsExceededError, or OTPInvalidError.
    """
    now = datetime.now(timezone.utc)
    clean_otp = otp.strip()

    # Query challenge by challenge_id OR (email + purpose)
    if challenge_id:
        row = conn.execute(
            """
            SELECT * FROM auth_otps
            WHERE challenge_id = ? AND purpose = ? AND is_used = 0
            ORDER BY created_at DESC LIMIT 1
            """,
            (challenge_id, purpose)
        ).fetchone()
    else:
        if not email:
            raise OTPInvalidError("Email address or challenge identifier is required.")
        row = conn.execute(
            """
            SELECT * FROM auth_otps
            WHERE email = ? AND purpose = ? AND is_used = 0
            ORDER BY created_at DESC LIMIT 1
            """,
            (email.strip().lower(), purpose)
        ).fetchone()

    if not row:
        raise OTPInvalidError("Invalid or expired verification challenge. Please request a new code.")

    resolved_email = row["email"]

    # 1. Check expiration
    try:
        exp_time = datetime.fromisoformat(row["expires_at"])
        if exp_time.tzinfo is None:
            exp_time = exp_time.replace(tzinfo=timezone.utc)
        if now > exp_time:
            conn.execute("UPDATE auth_otps SET is_used = 1 WHERE id = ?", (row["id"],))
            raise OTPExpiredError("Verification code has expired. Please request a new code.")
    except (ValueError, TypeError):
        conn.execute("UPDATE auth_otps SET is_used = 1 WHERE id = ?", (row["id"],))
        raise OTPExpiredError("Verification code has expired.")

    # 2. Check maximum attempts
    attempts = row["attempts"]
    max_att = row["max_attempts"]
    if attempts >= max_att:
        conn.execute("UPDATE auth_otps SET is_used = 1 WHERE id = ?", (row["id"],))
        raise OTPAttemptsExceededError("Maximum verification attempts exceeded. Please request a new code.")

    # 3. Constant-time HMAC comparison
    expected_hash = hash_otp(clean_otp, resolved_email)
    if not hmac.compare_digest(row["otp_hash"], expected_hash):
        new_attempts = attempts + 1
        conn.execute("UPDATE auth_otps SET attempts = ? WHERE id = ?", (new_attempts, row["id"]))
        remaining = max_att - new_attempts
        if remaining <= 0:
            conn.execute("UPDATE auth_otps SET is_used = 1 WHERE id = ?", (row["id"],))
            raise OTPAttemptsExceededError("Maximum verification attempts exceeded. Please request a new code.")
        raise OTPInvalidError(f"Incorrect verification code. {remaining} attempt(s) remaining.", remaining_attempts=remaining)

    # 4. Successful verification -> burn OTP immediately to prevent replay
    conn.execute("UPDATE auth_otps SET is_used = 1 WHERE id = ?", (row["id"],))
    return resolved_email
