"""
Audit Logging Service for Security Events.
Records security-critical actions (registration, verification, login, role changes, password resets) in SQLite.
"""
import uuid
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import sqlite3

logger = logging.getLogger(__name__)

def record_audit_log(
    conn: sqlite3.Connection,
    action: str,
    actor_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    target_user_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> str:
    """Inserts a structured audit log entry into the SQLite audit_logs table."""
    log_id = f"aud-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    details_str = json.dumps(details or {})

    try:
        conn.execute(
            """
            INSERT INTO audit_logs (id, actor_id, actor_email, target_user_id, action, details_json, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (log_id, actor_id, actor_email, target_user_id, action, details_str, ip_address, now)
        )
        logger.info("[AUDIT] Action='%s' Actor='%s' Target='%s'", action, actor_email or actor_id or "system", target_user_id or "none")
    except Exception as exc:
        logger.warning("[AUDIT_ERROR] Failed to record audit log: %s", str(exc))

    return log_id
