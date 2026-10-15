from pathlib import Path

import pytest

from app.db.database import _PostgresConnection, _database_backend, get_db


def test_qmark_adapter_preserves_question_marks_in_sql_literals_and_comments():
    sql = "SELECT '?' AS marker, id FROM items WHERE a=? -- keep ? here\n AND b=?"
    assert _PostgresConnection._adapt_sql(sql) == "SELECT '?' AS marker, id FROM items WHERE a=%s -- keep ? here\n AND b=%s"


def test_begin_immediate_maps_to_postgres_begin():
    assert _PostgresConnection._adapt_sql("BEGIN IMMEDIATE") == "BEGIN"


def test_missing_database_url_fails_closed_even_if_sqlite_path_exists(monkeypatch, tmp_path):
    path = tmp_path / "must-not-be-created.db"
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "postgres")
    monkeypatch.setenv("SMARTDOCS_DATABASE_PATH", str(path))
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        with get_db():
            pass
    assert not path.exists()


def test_postgres_integration_mode_requires_test_url_and_never_uses_database_url(monkeypatch):
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "postgres")
    monkeypatch.setenv("SMARTDOCS_RUN_POSTGRES_INTEGRATION", "I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE")
    monkeypatch.delenv("SMARTDOCS_TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://prod.invalid/app")
    with pytest.raises(RuntimeError, match="SMARTDOCS_TEST_DATABASE_URL"):
        _database_backend()


def test_postgres_integration_mode_rejects_same_target_as_database_url(monkeypatch):
    target = "postgresql://db.example.invalid:5432/smartdocs"
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "postgres")
    monkeypatch.setenv("SMARTDOCS_RUN_POSTGRES_INTEGRATION", "I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE")
    monkeypatch.setenv("SMARTDOCS_TEST_DATABASE_URL", target)
    monkeypatch.setenv("DATABASE_URL", target)
    with pytest.raises(RuntimeError, match="separate from DATABASE_URL"):
        _database_backend()


@pytest.mark.parametrize("production_env", ["render", "app_env"])
def test_postgres_integration_mode_refuses_to_run_in_production(monkeypatch, production_env):
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "postgres")
    monkeypatch.setenv("SMARTDOCS_RUN_POSTGRES_INTEGRATION", "I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE")
    monkeypatch.setenv("SMARTDOCS_TEST_DATABASE_URL", "postgresql://test.invalid/disposable")
    if production_env == "render":
        monkeypatch.setenv("RENDER", "true")
    else:
        monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="disabled in production"):
        _database_backend()


def test_unknown_database_backend_fails_clearly(monkeypatch):
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "mysql")
    with pytest.raises(RuntimeError, match="SMARTDOCS_DB_BACKEND"):
        _database_backend()


def test_initial_postgres_migration_contains_no_destructive_statements():
    migration = Path(__file__).parents[1] / "app" / "db" / "migrations" / "versions" / "0001_initial_schema.sql"
    sql = migration.read_text(encoding="utf-8").lower()
    assert "create table if not exists" in sql
    assert "drop table" not in sql
    assert "truncate" not in sql
    assert "delete from" not in sql


def test_migration_runner_refuses_untracked_existing_application_tables(monkeypatch):
    from app.db import migrations

    class Result:
        def __init__(self, one=None, many=None):
            self._one, self._many = one, many or []
        def fetchone(self): return self._one
        def fetchall(self): return self._many

    class Connection:
        def __init__(self): self.statements = []
        def execute(self, sql, params=()):
            self.statements.append(sql)
            if "smartdocs_schema_migrations" in sql:
                return Result()
            return Result(many=[{"table_name": "users"}])

    connection = Connection()
    class Context:
        def __enter__(self): return connection
        def __exit__(self, *_): return False

    monkeypatch.setattr(migrations, "get_db", lambda: Context())
    with pytest.raises(RuntimeError, match="without migration history"):
        migrations.run_migrations()
    assert not any("CREATE TABLE IF NOT EXISTS users" in sql for sql in connection.statements)


def test_migration_runner_does_not_execute_prose_after_semicolon_in_sql_comment(monkeypatch, tmp_path):
    from app.db import migrations

    migration_dir = tmp_path / "versions"
    migration_dir.mkdir()
    (migration_dir / "0001_initial_schema.sql").write_text(
        "-- Initial schema. Additive creation only; no data is reset or dropped.\n"
        "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(migrations, "VERSIONS", migration_dir)

    class Result:
        def __init__(self, one=None, many=None):
            self._one, self._many = one, many or []
        def fetchone(self): return self._one
        def fetchall(self): return self._many

    class Connection:
        def __init__(self): self.statements = []
        def execute(self, sql, params=()):
            self.statements.append(sql)
            if "information_schema.tables" in sql and "table_name='smartdocs_schema_migrations'" in sql:
                return Result()
            if "information_schema.tables" in sql:
                return Result(many=[])
            if sql == "SELECT version, checksum FROM smartdocs_schema_migrations":
                return Result(many=[])
            return Result()

    connection = Connection()
    class Context:
        def __enter__(self): return connection
        def __exit__(self, *_): return False

    monkeypatch.setattr(migrations, "get_db", lambda: Context())
    migrations.run_migrations()

    executed_migration_sql = [
        sql for sql in connection.statements if "CREATE TABLE IF NOT EXISTS users" in sql
    ]
    assert len(executed_migration_sql) == 1
    assert "no data is reset or dropped." in executed_migration_sql[0]  # retained only as a SQL comment
    assert not any(sql.strip().lower().startswith("no data is reset or dropped") for sql in connection.statements)
    assert any("INSERT INTO smartdocs_schema_migrations" in sql for sql in connection.statements)


def test_explicit_seed_never_overwrites_existing_user_records():
    from app.db.database import get_db
    from app.db.seed import seed_database

    with get_db() as conn:
        original = conn.execute(
            "SELECT full_name, role, hashed_password FROM users WHERE email=?",
            ("admin@svnit.acm.org",),
        ).fetchone()
        conn.execute(
            "UPDATE users SET full_name=?, role=?, hashed_password=? WHERE email=?",
            ("Retained Account", "author", "preserved-hash", "admin@svnit.acm.org"),
        )
    seed_database()
    with get_db() as conn:
        row = conn.execute(
            "SELECT full_name, role, hashed_password FROM users WHERE email=?",
            ("admin@svnit.acm.org",),
        ).fetchone()
    assert row["full_name"] == "Retained Account"
    assert row["role"] == "author"
    assert row["hashed_password"] == "preserved-hash"
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET full_name=?, role=?, hashed_password=? WHERE email=?",
            (original["full_name"], original["role"], original["hashed_password"], "admin@svnit.acm.org"),
        )
