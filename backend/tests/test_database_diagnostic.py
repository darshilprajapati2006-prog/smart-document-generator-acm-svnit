import hashlib
import json

from scripts import diagnose_database
from app.db.migrations import APP_TABLES, VERSIONS


def test_diagnostic_reports_complete_migration_state_without_record_data(monkeypatch):
    expected = {
        path.stem: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(VERSIONS.glob("[0-9]*.sql"))
    }

    class Result:
        def __init__(self, one=None, many=None):
            self.one = one
            self.many = many or []

        def fetchone(self):
            return self.one

        def fetchall(self):
            return self.many

    class Connection:
        def execute(self, sql, params=()):
            if "current_schema()" in sql:
                return Result(one={"schema": "public"})
            if "information_schema.tables" in sql:
                names = sorted(APP_TABLES | {"smartdocs_schema_migrations"})
                return Result(many=[{"table_name": name} for name in names])
            if "smartdocs_schema_migrations" in sql:
                return Result(many=[{"version": version, "checksum": checksum} for version, checksum in expected.items()])
            raise AssertionError("Unexpected diagnostic query")

    class Context:
        def __enter__(self): return Connection()
        def __exit__(self, *_args): return False

    monkeypatch.setattr(diagnose_database, "_database_backend", lambda: "postgres")
    monkeypatch.setattr(diagnose_database, "get_db", lambda: Context())
    report = diagnose_database.inspect_database()

    assert report["ok"] is True
    assert report["connected"] is True
    assert report["schema"] == "public"
    assert report["tables_missing"] == []
    assert report["migrations_missing"] == []
    assert report["migration_checksum_mismatches"] == []
    assert "records" not in report
    assert "database_url" not in report


def test_diagnostic_redacts_database_exception_message(monkeypatch):
    monkeypatch.setattr(
        diagnose_database, "_database_backend",
        lambda: (_ for _ in ()).throw(RuntimeError("credential-marker must not be returned")),
    )
    report = diagnose_database.inspect_database()

    assert report["ok"] is False
    assert report["connected"] is False
    assert report["error_type"] == "RuntimeError"
    assert "credential-marker" not in json.dumps(report)
