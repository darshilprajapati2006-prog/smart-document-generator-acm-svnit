#!/usr/bin/env python3
"""
Bootstrap Initial System Admin CLI Script for SmartDocs SVNIT.
Usage:
    python scripts/bootstrap_admin.py --email admin@svnit.acm.org --password MySecretPassword123 --name "System Administrator"

Or via environment variables:
    export BOOTSTRAP_ADMIN_EMAIL=admin@svnit.acm.org
    export BOOTSTRAP_ADMIN_PASSWORD=MySecretPassword123
    python scripts/bootstrap_admin.py
"""
import sys
import os
import argparse
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import get_db, init_db
from app.core.security import hash_password
from app.services.audit_service import record_audit_log

def bootstrap(email: str, password: str, full_name: str, force: bool = False):
    init_db()
    with get_db() as conn:
        admin_row = conn.execute("SELECT id, email FROM users WHERE role = 'admin' AND is_active = 1").fetchone()
        if admin_row and not force:
            print(f"[!] Active System Admin already exists ({admin_row['email']}). Use --force to reset.")
            return

        hashed_pwd = hash_password(password)
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET hashed_password = ?, full_name = ?, role = 'admin', status = 'active', is_active = 1, is_verified = 1
                WHERE email = ?
                """,
                (hashed_pwd, full_name, email)
            )
            user_id = existing["id"]
            print(f"[✓] Existing user '{email}' successfully promoted to System Admin.")
        else:
            user_id = f"usr-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active, is_verified)
                VALUES (?, ?, ?, ?, 'admin', 'active', 1, 1)
                """,
                (user_id, email, hashed_pwd, full_name)
            )
            print(f"[✓] Initial System Admin created successfully: {email} (ID: {user_id})")

        record_audit_log(
            conn,
            action="admin_bootstrapped_cli",
            actor_email=email,
            target_user_id=user_id,
            details={"email": email, "force": force}
        )

def main():
    parser = argparse.ArgumentParser(description="Bootstrap initial System Admin for ACM SVNIT Document Generator")
    parser.add_argument("--email", default=os.getenv("BOOTSTRAP_ADMIN_EMAIL"), help="Admin email address")
    parser.add_argument("--password", default=os.getenv("BOOTSTRAP_ADMIN_PASSWORD"), help="Admin password (min 8 characters)")
    parser.add_argument("--name", default=os.getenv("BOOTSTRAP_ADMIN_NAME", "System Administrator"), help="Admin full name")
    parser.add_argument("--force", action="store_true", help="Force reset/override admin credentials")

    args = parser.parse_args()

    email = args.email or "admin@svnit.acm.org"
    password = args.password

    if not password:
        import getpass
        print(f"Bootstrapping System Admin for: {email}")
        password = getpass.getpass("Enter secure password (min 8 chars): ")

    if len(password) < 8:
        print("[!] Error: Password must be at least 8 characters long.")
        sys.exit(1)

    bootstrap(email=email, password=password, full_name=args.name, force=args.force)

if __name__ == "__main__":
    main()
