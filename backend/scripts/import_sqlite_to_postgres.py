"""Safely import a verified SQLite backup into an empty migrated PostgreSQL database.

Dry-run is the default. Applying requires an explicit production-backup acknowledgement.
The source is opened read-only and is never modified or deleted.
"""
from __future__ import annotations

import argparse
import hashlib
import sqlite3
import sys
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from app.db.database import get_db
from app.db.migrations import APP_TABLES, VERSIONS, run_migrations

# Parent tables precede children where foreign keys exist.
TABLE_ORDER = [
    "users", "user_invitations", "user_role_requests", "system_bootstrap", "auth_otps",
    "audit_logs", "documents", "document_artifacts", "batch_artifacts", "document_versions",
    "approval_logs", "reusable_clauses", "template_configs", "analytics_events",
    "digital_signatures", "email_distribution_logs",
]


def table_columns(source, table: str) -> list[str]:
    return [row["name"] for row in source.execute(f'PRAGMA table_info("{table}")').fetchall()]


def primary_key_columns(source, table: str) -> list[str]:
    info = source.execute(f'PRAGMA table_info("{table}")').fetchall()
    return [row["name"] for row in sorted((row for row in info if row["pk"]), key=lambda row: row["pk"])]


def row_digest(rows, columns: list[str]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        values = []
        for column in columns:
            value = row[column]
            if isinstance(value, (datetime, date)):
                value = value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
            elif isinstance(value, Decimal):
                value = str(value)
            elif isinstance(value, bytes):
                value = {"bytes_hex": value.hex()}
            values.append(value)
        digest.update(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def run(source_path: Path, apply: bool) -> None:
    if not source_path.is_file():
        raise RuntimeError("Source backup file does not exist; no import was attempted.")
    hasher = hashlib.sha256()
    with source_path.open("rb") as backup_file:
        for chunk in iter(lambda: backup_file.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    source = sqlite3.connect(f"{source_path.resolve().as_uri()}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    try:
        check = source.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {check}")
        source_tables = {r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = APP_TABLES - source_tables
        if missing:
            raise RuntimeError("Source is missing expected application tables: " + ", ".join(sorted(missing)))
        counts = {table: source.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in TABLE_ORDER}
        print(f"Source SHA-256: {digest}")
        print("SQLite integrity_check: ok")
        print("Source row counts:")
        for table in TABLE_ORDER:
            print(f"  {table}: {counts[table]}")
        if not apply:
            print("Dry run only. No PostgreSQL rows were changed.")
            return
        # Only an explicit verified-backup apply initializes the target schema,
        # so the production service need not be switched to an empty database.
        run_migrations()
        with get_db() as target:
            versions = {row["version"] for row in target.execute("SELECT version FROM smartdocs_schema_migrations").fetchall()}
            expected_versions = {path.stem for path in VERSIONS.glob("[0-9]*.sql")}
            if not expected_versions.issubset(versions):
                raise RuntimeError("PostgreSQL schema migrations are incomplete; refusing import.")
            target_columns = {}
            for table in TABLE_ORDER:
                rows = target.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position",
                    (table,),
                ).fetchall()
                target_columns[table] = [r["column_name"] for r in rows]
                if not target_columns[table] or set(target_columns[table]) != set(table_columns(source, table)):
                    raise RuntimeError(f"Column mismatch in {table}; resolve schema compatibility before import.")
                existing = target.execute(f'SELECT COUNT(*) AS n FROM "{table}"').fetchone()["n"]
                if existing:
                    raise RuntimeError(f"Destination table {table} is not empty; refusing to overwrite or merge.")
            # The surrounding get_db transaction is all-or-nothing.
            for table in TABLE_ORDER:
                cols = target_columns[table]
                quoted_cols = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join("?" for _ in cols)
                for row in source.execute(f'SELECT {quoted_cols} FROM "{table}"'):
                    target.execute(
                        f'INSERT INTO "{table}" ({quoted_cols}) VALUES ({placeholders})',
                        tuple(row[col] for col in cols),
                    )
                imported = target.execute(f'SELECT COUNT(*) AS n FROM "{table}"').fetchone()["n"]
                if imported != counts[table]:
                    raise RuntimeError(f"Post-import count mismatch in {table}: {imported} != {counts[table]}")
                key = primary_key_columns(source, table)
                if not key:
                    raise RuntimeError(f"Table {table} has no declared primary key; refusing unverifiable import.")
                order_by = ", ".join(f'"{column}"' for column in key)
                source_rows = source.execute(f'SELECT {quoted_cols} FROM "{table}" ORDER BY {order_by}')
                target_rows = target.execute(f'SELECT {quoted_cols} FROM "{table}" ORDER BY {order_by}')
                if row_digest(source_rows, cols) != row_digest(target_rows, cols):
                    raise RuntimeError(f"Post-import row-content checksum mismatch in {table}.")
        print("Import committed; all per-table row counts and row-content checksums matched.")
    finally:
        source.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-backup", required=True, type=Path, help="Verified SQLite backup file (read-only).")
    parser.add_argument("--apply", action="store_true", help="Apply import; default is dry-run.")
    parser.add_argument(
        "--i-confirm-this-is-a-verified-production-backup", action="store_true",
        help="Required with --apply to guard against importing an unverified/local SQLite file.",
    )
    args = parser.parse_args()
    if args.apply and not args.i_confirm_this_is_a_verified_production_backup:
        parser.error("--apply requires --i-confirm-this-is-a-verified-production-backup")
    try:
        run(args.source_backup, args.apply)
    except Exception as exc:
        print(f"Import stopped safely: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
