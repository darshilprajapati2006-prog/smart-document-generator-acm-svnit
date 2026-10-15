"""Read-only database and migration diagnostic. Never applies migrations or reads records."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.db.database import _database_backend, get_db
from app.db.migrations import APP_TABLES, VERSIONS


def inspect_database() -> dict[str, Any]:
    result: dict[str, Any] = {
        "connected": False,
        "backend": None,
        "schema": None,
        "expected_schema": "public",
        "tables_present": [],
        "tables_missing": sorted(APP_TABLES),
        "migration_ledger_present": False,
        "migrations_expected": [],
        "migrations_applied": [],
        "migrations_missing": [],
        "migrations_unknown": [],
        "migration_checksum_mismatches": [],
        "error_type": None,
        "ok": False,
    }
    try:
        backend = _database_backend()
        result["backend"] = backend
        if backend != "postgres":
            result["error_type"] = "PostgreSQLRequired"
            return result

        migration_files = sorted(VERSIONS.glob("[0-9]*.sql"))
        expected = {
            path.stem: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in migration_files
        }
        result["migrations_expected"] = sorted(expected)

        with get_db() as conn:
            schema_row = conn.execute("SELECT current_schema() AS schema").fetchone()
            schema = schema_row["schema"] if schema_row else None
            result["connected"] = True
            result["schema"] = schema

            table_rows = conn.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema=? AND table_type='BASE TABLE'",
                (schema,),
            ).fetchall() if schema else []
            table_names = {row["table_name"] for row in table_rows}
            result["tables_present"] = sorted(table_names & APP_TABLES)
            result["tables_missing"] = sorted(APP_TABLES - table_names)

            if "smartdocs_schema_migrations" in table_names:
                result["migration_ledger_present"] = True
                applied_rows = conn.execute(
                    "SELECT version, checksum FROM smartdocs_schema_migrations"
                ).fetchall()
                applied = {row["version"]: row["checksum"] for row in applied_rows}
                result["migrations_applied"] = sorted(applied)
                result["migrations_missing"] = sorted(set(expected) - set(applied))
                result["migrations_unknown"] = sorted(set(applied) - set(expected))
                result["migration_checksum_mismatches"] = sorted(
                    version for version in set(expected) & set(applied)
                    if expected[version] != applied[version]
                )
            else:
                result["migrations_missing"] = sorted(expected)

        result["ok"] = (
            result["connected"]
            and result["schema"] == result["expected_schema"]
            and result["migration_ledger_present"]
            and not result["tables_missing"]
            and not result["migrations_missing"]
            and not result["migrations_unknown"]
            and not result["migration_checksum_mismatches"]
        )
    except Exception as exc:
        # Exception messages from database drivers can include connection details.
        # Report only the exception class, never a URL, host, user, or driver message.
        result["error_type"] = type(exc).__name__
    return result


def main() -> int:
    result = inspect_database()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
