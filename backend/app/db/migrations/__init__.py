"""Checksum-verified, transactional PostgreSQL schema migrations."""
from __future__ import annotations

import hashlib
from pathlib import Path
import re

from app.db.database import get_db

VERSIONS = Path(__file__).with_name("versions")
APP_TABLES = {
    "users", "user_invitations", "document_artifacts", "batch_artifacts",
    "user_role_requests", "system_bootstrap", "auth_otps", "audit_logs",
    "documents", "document_versions", "approval_logs", "reusable_clauses",
    "template_configs", "analytics_events", "digital_signatures",
    "email_distribution_logs",
}


def _split_sql_statements(sql: str) -> list[str]:
    """Split PostgreSQL SQL at statement terminators, ignoring comments/strings.

    In particular, semicolons in line comments must not terminate a statement:
    doing a plain ``sql.split(';')`` can turn the rest of an explanatory
    comment into invalid SQL.
    """
    statements: list[str] = []
    current: list[str] = []
    i = 0
    state = "normal"
    block_depth = 0
    dollar_tag: str | None = None

    while i < len(sql):
        if state == "normal":
            if sql.startswith("--", i):
                current.append("--")
                state = "line_comment"
                i += 2
                continue
            if sql.startswith("/*", i):
                current.append("/*")
                state = "block_comment"
                block_depth = 1
                i += 2
                continue
            if sql[i] == "'":
                current.append(sql[i]); state = "single_quote"; i += 1; continue
            if sql[i] == '"':
                current.append(sql[i]); state = "double_quote"; i += 1; continue
            if sql[i] == "$":
                match = re.match(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
                if match:
                    dollar_tag = match.group(0)
                    current.append(dollar_tag)
                    state = "dollar_quote"
                    i += len(dollar_tag)
                    continue
            if sql[i] == ";":
                statement = "".join(current).strip()
                if statement:
                    statements.append(statement)
                current = []
                i += 1
                continue
            current.append(sql[i]); i += 1; continue

        if state == "line_comment":
            current.append(sql[i])
            if sql[i] == "\n":
                state = "normal"
            i += 1
            continue
        if state == "block_comment":
            if sql.startswith("/*", i):
                current.append("/*"); block_depth += 1; i += 2; continue
            if sql.startswith("*/", i):
                current.append("*/"); block_depth -= 1; i += 2
                if block_depth == 0:
                    state = "normal"
                continue
            current.append(sql[i]); i += 1; continue
        if state in {"single_quote", "double_quote"}:
            quote = "'" if state == "single_quote" else '"'
            current.append(sql[i])
            if sql[i] == quote:
                if i + 1 < len(sql) and sql[i + 1] == quote:
                    current.append(sql[i + 1]); i += 2; continue
                state = "normal"
            i += 1
            continue
        if state == "dollar_quote":
            if dollar_tag and sql.startswith(dollar_tag, i):
                current.append(dollar_tag)
                i += len(dollar_tag)
                state = "normal"
                dollar_tag = None
                continue
            current.append(sql[i]); i += 1

    trailing = "".join(current).strip()
    if trailing:
        statements.append(trailing)
    return statements


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
            for statement in _split_sql_statements(sql):
                conn.execute(statement)
            conn.execute(
                "INSERT INTO smartdocs_schema_migrations(version, checksum) VALUES (?, ?)",
                (version, checksum),
            )
