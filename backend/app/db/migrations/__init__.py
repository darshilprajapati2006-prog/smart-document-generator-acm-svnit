"""Checksum-verified, transactional PostgreSQL schema migrations."""
from __future__ import annotations

import hashlib
from pathlib import Path

from app.db.database import get_db

VERSIONS = Path(__file__).with_name("versions")
APP_TABLES = {
    "users", "user_invitations", "document_artifacts", "batch_artifacts",
    "user_role_requests", "system_bootstrap", "auth_otps", "audit_logs",
    "documents", "document_versions", "approval_logs", "reusable_clauses",
    "template_configs", "analytics_events", "digital_signatures",
    "email_distribution_logs",
}


def run_migrations() -> None:
    files = sorted(VERSIONS.glob("[0-9]*.sql"))
    with get_db() as conn:
        # Don't silently adopt an existing schema without migration provenance.
        exists = conn.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='smartdocs_schema_migrations'"
        ).fetchone()
        if not exists:
            rows = conn.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
            ).fetchall()
            existing = {row["table_name"] for row in rows} & APP_TABLES
            if existing:
                raise RuntimeError(
                    "SmartDocs tables exist without migration history; refusing automatic schema adoption: "
                    + ", ".join(sorted(existing))
                )
            conn.execute(
                "CREATE TABLE smartdocs_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
        applied_rows = conn.execute("SELECT version, checksum FROM smartdocs_schema_migrations").fetchall()
        applied = {row["version"]: row["checksum"] for row in applied_rows}
        known_files = {path.stem for path in files}
        unknown = set(applied) - known_files
        if unknown:
            raise RuntimeError("Database has migration versions missing from this release: " + ", ".join(sorted(unknown)))
        for path in files:
            version = path.stem
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            if version in applied:
                if applied[version] != checksum:
                    raise RuntimeError(f"Applied migration {version} checksum mismatch; refusing to continue.")
                continue
            # Execute each migration and its bookkeeping insert in the same transaction.
            for statement in (part.strip() for part in sql.split(";")):
                if statement:
                    conn.execute(statement)
            conn.execute(
                "INSERT INTO smartdocs_schema_migrations(version, checksum) VALUES (?, ?)",
                (version, checksum),
            )
