"""SQLite connection management. Persistence depends on the configured filesystem volume."""
import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DEFAULT_DB_PATH = DB_DIR / "smart_doc_generator.db"

def get_db_path() -> Path:
    configured_path = os.getenv("SMARTDOCS_DATABASE_PATH", "").strip()
    db_path = Path(configured_path).expanduser() if configured_path else DEFAULT_DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path

@contextmanager
def get_db():
    conn = sqlite3.connect(str(get_db_path()), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Initializes tables and seed data if not present."""
    with get_db() as conn:
        # 1. Users table for RBAC
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('viewer', 'author', 'reviewer', 'approver', 'template_admin', 'admin')),
            status TEXT NOT NULL DEFAULT 'active',
            is_active INTEGER NOT NULL DEFAULT 1,
            is_verified INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        try:
            conn.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN firebase_uid TEXT")
        except Exception:
            pass
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL")

        # Administrator-created invitations are single-use, time-limited, and only store token hashes.
        conn.execute("""
        CREATE TABLE IF NOT EXISTS user_invitations (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('author', 'viewer', 'reviewer', 'approver', 'template_admin', 'admin')),
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            revoked_at TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email)")
        conn.execute("CREATE TABLE IF NOT EXISTS document_artifacts (artifact_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS batch_artifacts (batch_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS user_role_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            requested_role TEXT NOT NULL CHECK(requested_role IN ('reviewer', 'approver', 'template_admin', 'admin')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            reviewed_by TEXT,
            reviewed_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_role_request_pending ON user_role_requests(user_id) WHERE status='pending'")
        # Durable singleton guard survives admin deletion and prevents repeat bootstrap.
        conn.execute("""
        CREATE TABLE IF NOT EXISTS system_bootstrap (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            completed_at TEXT NOT NULL,
            admin_user_id TEXT NOT NULL,
            admin_firebase_uid TEXT NOT NULL
        )
        """)

        # 1b. Cryptographic OTP Verification Challenges
        conn.execute("""
        CREATE TABLE IF NOT EXISTS auth_otps (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            user_id TEXT,
            purpose TEXT NOT NULL CHECK(purpose IN ('signup_verification', 'login_2fa', 'password_reset')),
            otp_hash TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            expires_at TIMESTAMP NOT NULL,
            resend_available_at TIMESTAMP NOT NULL,
            is_used INTEGER NOT NULL DEFAULT 0,
            challenge_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON auth_otps(email, purpose, is_used);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_otps_challenge_id ON auth_otps(challenge_id);")

        # 1c. Security Audit Logs
        conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            actor_id TEXT,
            actor_email TEXT,
            target_user_id TEXT,
            action TEXT NOT NULL,
            details_json TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);")

        # 2. Documents table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            user_id TEXT DEFAULT 'guest-user',
            document_type TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'ready_for_review', 'in_review', 'approved', 'changes_requested', 'rejected')),
            current_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 3. Document Versions table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS document_versions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version_num INTEGER NOT NULL,
            data_json TEXT NOT NULL,
            docx_path TEXT,
            pdf_path TEXT,
            change_summary TEXT,
            actor_id TEXT DEFAULT 'guest-user',
            signature_hash TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            UNIQUE(document_id, version_num)
        );
        """)

        # 4. Approval Logs table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS approval_logs (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version_num INTEGER NOT NULL,
            actor_id TEXT NOT NULL,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            action TEXT NOT NULL,
            from_status TEXT NOT NULL,
            to_status TEXT NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        """)

        # 5. Reusable Clauses table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS reusable_clauses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            applicable_types TEXT NOT NULL, -- comma separated e.g. exec_meet,bill_certificate
            content TEXT NOT NULL,
            variables_json TEXT DEFAULT '[]',
            approval_status TEXT DEFAULT 'sample_draft',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        try:
            conn.execute("ALTER TABLE reusable_clauses ADD COLUMN approval_status TEXT DEFAULT 'sample_draft'")
        except Exception:
            pass

        # 6. Template Configurations table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS template_configs (
            id TEXT PRIMARY KEY,
            template_id TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            section_ordering_json TEXT NOT NULL,
            labels_json TEXT NOT NULL,
            branding_json TEXT NOT NULL,
            optional_sections_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 7. Analytics Events table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS analytics_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            document_type TEXT,
            duration_ms REAL,
            status TEXT NOT NULL,
            actor_role TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 8. Digital Signatures table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS digital_signatures (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version_num INTEGER NOT NULL,
            signer_id TEXT NOT NULL,
            signer_name TEXT NOT NULL,
            signer_role TEXT NOT NULL,
            algorithm TEXT NOT NULL DEFAULT 'HMAC-SHA256',
            payload_hash TEXT NOT NULL,
            signature_token TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        """)

        # 9. Email Distribution Logs
        conn.execute("""
        CREATE TABLE IF NOT EXISTS email_distribution_logs (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version_num INTEGER NOT NULL,
            sender_id TEXT NOT NULL,
            recipients_json TEXT NOT NULL,
            subject TEXT NOT NULL,
            status TEXT NOT NULL,
            provider_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        """)
