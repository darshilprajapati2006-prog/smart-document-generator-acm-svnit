import base64
import httpx
import pytest

from app.utils import supabase_storage as storage


def configure_storage(monkeypatch, key="sb_secret_test-key"):
    monkeypatch.setenv("SMARTDOCS_STORAGE_BACKEND", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", key)
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "smartdocs-private")


def test_new_secret_key_is_only_sent_as_apikey():
    headers = storage._auth_headers("sb_secret_example")
    assert headers == {"apikey": "sb_secret_example"}


def test_legacy_service_role_is_sent_as_apikey_and_bearer():
    headers = storage._auth_headers("legacy-service-role-jwt")
    assert headers["apikey"] == "legacy-service-role-jwt"
    assert headers["Authorization"] == "Bearer legacy-service-role-jwt"


def test_storage_reference_round_trips_escaped_names(monkeypatch):
    configure_storage(monkeypatch)
    reference = storage.storage_reference("documents/doc-1/a file.png", "image/png")
    assert storage.parse_storage_reference(reference) == (
        "smartdocs-private", "documents/doc-1/a file.png", "image/png"
    )


def test_storage_config_rejects_non_origin_project_url_without_echoing_value(monkeypatch):
    configure_storage(monkeypatch)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co/storage/v1")
    with pytest.raises(RuntimeError, match="project origin") as error:
        storage.verify_storage_configuration()
    assert "example.supabase.co" not in str(error.value)


def test_upload_uses_private_storage_endpoint_and_upsert(monkeypatch):
    configure_storage(monkeypatch)
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"Key": "private-object"})

    monkeypatch.setattr(storage, "_client", lambda: httpx.Client(transport=httpx.MockTransport(handler), headers=storage._auth_headers("sb_secret_test-key")))
    storage.upload_bytes("documents/doc-1/version-1/sig.png", b"png", "image/png")
    request = requests[0]
    assert request.method == "POST"
    assert request.url.path.endswith("/storage/v1/object/smartdocs-private/documents/doc-1/version-1/sig.png")
    assert request.headers["apikey"] == "sb_secret_test-key"
    assert "authorization" not in request.headers
    assert request.headers["x-upsert"] == "true"
    assert request.content == b"png"


def test_signature_externalize_and_hydrate_keeps_existing_data_contract(monkeypatch):
    configure_storage(monkeypatch)
    original = "data:image/png;base64," + base64.b64encode(b"normalized-png-bytes").decode("ascii")
    uploads = []
    monkeypatch.setattr(storage, "upload_bytes", lambda key, payload, mime: uploads.append((key, payload, mime)))
    ref = storage.externalize_signature(original, "doc-1", 2)
    assert ref.startswith("supabase-storage://smartdocs-private/documents/doc-1/versions/2/lead-signature.png")
    assert uploads == [("documents/doc-1/versions/2/lead-signature.png", b"normalized-png-bytes", "image/png")]
    monkeypatch.setattr(storage, "download_bytes", lambda value: (b"normalized-png-bytes", "image/png"))
    hydrated = storage.hydrate_signature({"lead_signature_data": ref, "title": "same"})
    assert hydrated["lead_signature_data"] == original
    assert hydrated["title"] == "same"


def test_file_manager_persists_version_assets_and_materializes_private_download(monkeypatch, tmp_path):
    from app.utils.file_manager import FileManager

    configure_storage(monkeypatch)
    manager = FileManager(base_dir=tmp_path / "storage")
    docx = tmp_path / "generated.docx"
    pdf = tmp_path / "generated.pdf"
    docx.write_bytes(b"PK generated docx")
    pdf.write_bytes(b"%PDF-generated pdf")
    uploaded = []

    def capture_upload(key, path, content_type):
        uploaded.append((key, path.read_bytes(), content_type))

    monkeypatch.setattr(storage, "upload_file", capture_upload)
    data, stored_docx, stored_pdf = manager.persist_version_assets(
        "document-1", 2, {"title": "persisted"}, str(docx), str(pdf)
    )
    assert data["title"] == "persisted"
    assert stored_docx.startswith("supabase-storage://smartdocs-private/documents/document-1/versions/2/")
    assert stored_pdf.startswith("supabase-storage://smartdocs-private/documents/document-1/versions/2/")
    assert [item[1] for item in uploaded] == [b"PK generated docx", b"%PDF-generated pdf"]

    monkeypatch.setattr(storage, "download_bytes", lambda _reference: (b"%PDF-durable", "application/pdf"))
    materialized, temporary = manager.materialize(stored_pdf)
    try:
        assert temporary is True
        assert materialized.read_bytes() == b"%PDF-durable"
    finally:
        manager.cleanup_materialized(materialized)
    assert not materialized.exists()


def test_render_refuses_local_storage(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("SMARTDOCS_STORAGE_BACKEND", "local")
    with pytest.raises(RuntimeError, match="disabled on Render"):
        storage.storage_backend()


def test_startup_verification_requires_private_bucket_and_deny_policy(monkeypatch):
    configure_storage(monkeypatch)
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"id": "smartdocs-private", "public": False})

    client_type = httpx.Client
    monkeypatch.setattr(storage.httpx, "Client", lambda **kwargs: client_type(transport=httpx.MockTransport(handler), **kwargs))

    class Result:
        def fetchone(self):
            return {
                "permissive": "RESTRICTIVE",
                "roles": "{anon,authenticated}",
                "cmd": "ALL",
                "qual": "(bucket_id <> 'smartdocs-private'::text)",
                "with_check": "(bucket_id <> 'smartdocs-private'::text)",
                "relrowsecurity": True,
            }

    class Connection:
        def execute(self, *_args, **_kwargs): return Result()

    class Context:
        def __enter__(self): return Connection()
        def __exit__(self, *_args): return False

    from app.db import database
    monkeypatch.setattr(database, "get_db", lambda: Context())
    storage.verify_storage_configuration()
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/storage/v1/bucket/smartdocs-private"
    assert requests[0].headers["apikey"] == "sb_secret_test-key"
    assert "authorization" not in requests[0].headers


@pytest.mark.parametrize(("status", "message"), [
    (401, "rejected the backend API key"),
    (403, "denied bucket verification"),
    (404, "bucket was not found"),
    (503, "HTTP 503"),
])
def test_startup_verification_reports_safe_http_failure_category(monkeypatch, status, message):
    configure_storage(monkeypatch, key="sb_secret_do-not-leak-this-key")
    client_type = httpx.Client
    monkeypatch.setattr(storage.httpx, "Client", lambda **kwargs: client_type(
        transport=httpx.MockTransport(lambda _request: httpx.Response(status, text="sensitive upstream body")),
        **kwargs,
    ))

    with pytest.raises(RuntimeError, match=message) as error:
        storage.verify_storage_configuration()
    assert "do-not-leak-this-key" not in str(error.value)
    assert "sensitive upstream body" not in str(error.value)


def test_startup_verification_reports_network_failure_without_request_details(monkeypatch):
    configure_storage(monkeypatch, key="sb_secret_do-not-leak-this-key")

    def handler(request):
        raise httpx.ConnectError("secret-do-not-echo", request=request)

    client_type = httpx.Client
    monkeypatch.setattr(storage.httpx, "Client", lambda **kwargs: client_type(
        transport=httpx.MockTransport(handler), **kwargs,
    ))
    with pytest.raises(RuntimeError, match=r"could not be reached \(ConnectError\)") as error:
        storage.verify_storage_configuration()
    assert "do-not-leak-this-key" not in str(error.value)
    assert "secret-do-not-echo" not in str(error.value)


def test_startup_verification_reports_invalid_json_safely(monkeypatch):
    configure_storage(monkeypatch, key="sb_secret_do-not-leak-this-key")
    client_type = httpx.Client
    monkeypatch.setattr(storage.httpx, "Client", lambda **kwargs: client_type(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, text="upstream-secret-body")),
        **kwargs,
    ))
    with pytest.raises(RuntimeError, match="invalid response") as error:
        storage.verify_storage_configuration()
    assert "do-not-leak-this-key" not in str(error.value)
    assert "upstream-secret-body" not in str(error.value)


@pytest.mark.parametrize("bucket_info", [
    {"id": "smartdocs-private", "public": True},
    {"id": "unexpected-bucket", "public": False},
])
def test_startup_verification_rejects_public_or_wrong_bucket(monkeypatch, bucket_info):
    configure_storage(monkeypatch)
    client_type = httpx.Client
    monkeypatch.setattr(
        storage.httpx, "Client",
        lambda **kwargs: client_type(
            transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=bucket_info)),
            **kwargs,
        ),
    )
    with pytest.raises(RuntimeError, match="bucket"):
        storage.verify_storage_configuration()


def test_startup_verification_rejects_incorrect_storage_policy(monkeypatch):
    configure_storage(monkeypatch)
    client_type = httpx.Client
    monkeypatch.setattr(storage.httpx, "Client", lambda **kwargs: client_type(
        transport=httpx.MockTransport(lambda _request: httpx.Response(
            200, json={"id": "smartdocs-private", "public": False}
        )),
        **kwargs,
    ))

    class Result:
        def fetchone(self):
            return {
                "permissive": "PERMISSIVE", "roles": "{anon,authenticated}", "cmd": "ALL",
                "qual": "(bucket_id <> 'smartdocs-private'::text)",
                "with_check": "(bucket_id <> 'smartdocs-private'::text)", "relrowsecurity": True,
            }

    class Connection:
        def execute(self, *_args, **_kwargs): return Result()

    class Context:
        def __enter__(self): return Connection()
        def __exit__(self, *_args): return False

    from app.db import database
    monkeypatch.setattr(database, "get_db", lambda: Context())
    with pytest.raises(RuntimeError, match="policy"):
        storage.verify_storage_configuration()


def test_postgres_migrations_and_relational_round_trip_on_opt_in_database(monkeypatch):
    import os
    import uuid
    import json

    url = os.getenv("SMARTDOCS_TEST_DATABASE_URL", "").strip()
    if not url or os.getenv("SMARTDOCS_RUN_POSTGRES_INTEGRATION") != "I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE":
        pytest.skip("Set a disposable SMARTDOCS_TEST_DATABASE_URL and explicit write acknowledgement to run PostgreSQL integration tests.")
    pytest.importorskip("psycopg")
    from app.db.database import _database_target
    configured_production_url = os.getenv("DATABASE_URL", "").strip()
    if configured_production_url and _database_target(url) == _database_target(configured_production_url):
        pytest.fail("SMARTDOCS_TEST_DATABASE_URL must target a database separate from DATABASE_URL.")
    monkeypatch.setenv("SMARTDOCS_RUN_POSTGRES_INTEGRATION", "I_HAVE_SELECTED_A_DISPOSABLE_TEST_DATABASE")
    monkeypatch.setenv("SMARTDOCS_TEST_DATABASE_URL", url)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("SMARTDOCS_DB_BACKEND", "postgres")

    from app.db.database import get_db
    from app.db.migrations import run_migrations
    from app.core.security import compute_payload_hash, sign_data_payload
    from app.services.audit_service import record_audit_log

    run_migrations()
    run_migrations()  # checksum/idempotency check against an already migrated test DB
    from pathlib import Path
    import hashlib
    migration = Path(__file__).parents[1] / "app" / "db" / "migrations" / "versions" / "0001_initial_schema.sql"
    expected_checksum = hashlib.sha256(migration.read_bytes()).hexdigest()
    with get_db() as conn:
        migration_row = conn.execute(
            "SELECT checksum FROM smartdocs_schema_migrations WHERE version=?",
            (migration.stem,),
        ).fetchone()
        assert migration_row["checksum"] == expected_checksum
    suffix = uuid.uuid4().hex
    user_id, doc_id, version_id = f"pg-test-user-{suffix}", f"pg-test-doc-{suffix}", f"pg-test-ver-{suffix}"
    payload = {"test": True}
    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_hash = compute_payload_hash(payload)
    signature_token = sign_data_payload(payload, user_id)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users(id,email,hashed_password,full_name,role,status,is_active,is_verified,firebase_uid) VALUES(?,?,?,?,?,'active',1,1,?)",
            (user_id, f"{suffix}@pg-test.invalid", "test-only", "PG Integration", "author", f"firebase-{suffix}"),
        )
        conn.execute(
            "INSERT INTO documents(id,user_id,document_type,title,status,workflow_stage,current_version) VALUES(?,?,?,?,?,?,1)",
            (doc_id, user_id, "integration", "Round trip", "draft", "author"),
        )
        conn.execute(
            "INSERT INTO document_versions(id,document_id,version_num,data_json,actor_id) VALUES(?,?,1,?,?)",
            (version_id, doc_id, payload_json, user_id),
        )
        conn.execute(
            "INSERT INTO approval_logs(id,document_id,version_num,actor_id,actor_name,actor_role,action,from_status,to_status,comment) VALUES(?,?,1,?,?,?,?,?,?,?)",
            (f"pg-test-log-{suffix}", doc_id, user_id, "PG Integration", "author", "submitted", "draft", "ready_for_review", "integration"),
        )
        conn.execute(
            "INSERT INTO digital_signatures(id,document_id,version_num,signer_id,signer_name,signer_role,algorithm,payload_hash,signature_token) VALUES(?,?,1,?,?,?,'HMAC-SHA256',?,?)",
            (f"pg-test-signature-{suffix}", doc_id, user_id, "PG Integration", "author", payload_hash, signature_token),
        )
        audit_id = record_audit_log(
            conn, action="postgres_integration_round_trip", actor_id=user_id,
            actor_email=f"{suffix}@pg-test.invalid", target_user_id=doc_id,
            details={"test_id": suffix},
        )
        row = conn.execute(
            "SELECT u.firebase_uid,u.role,d.status,d.workflow_stage,v.data_json,a.comment,s.payload_hash,s.signature_token,al.action,al.target_user_id "
            "FROM users u JOIN documents d ON d.user_id=u.id JOIN document_versions v ON v.document_id=d.id "
            "JOIN approval_logs a ON a.document_id=d.id JOIN digital_signatures s ON s.document_id=d.id "
            "JOIN audit_logs al ON al.actor_id=u.id WHERE u.id=? AND al.id=?",
            (user_id, audit_id),
        ).fetchone()
        assert row == {
            "firebase_uid": f"firebase-{suffix}", "role": "author", "status": "draft",
            "data_json": payload_json, "comment": "integration", "workflow_stage": "author", "payload_hash": payload_hash,
            "signature_token": signature_token, "action": "postgres_integration_round_trip", "target_user_id": doc_id,
        }
        round_tripped_payload = json.loads(row["data_json"])
        assert compute_payload_hash(round_tripped_payload) == row["payload_hash"]
        assert sign_data_payload(round_tripped_payload, user_id) == row["signature_token"]
        conn.rollback()  # rollback only this test's uniquely named rows
