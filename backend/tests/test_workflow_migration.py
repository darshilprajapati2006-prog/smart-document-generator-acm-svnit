import sqlite3


def test_workflow_stage_migration_preserves_legacy_documents_and_audit_rows(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy-smartdocs.db"
    monkeypatch.setenv("SMARTDOCS_DATABASE_PATH", str(database_path))
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            document_type TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            current_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO documents (id,user_id,document_type,title,status,current_version)
        VALUES ('legacy-doc','author-1','exec_meet','Existing permission request','in_review',2);
        CREATE TABLE approval_logs (
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO approval_logs
            (id,document_id,version_num,actor_id,actor_name,actor_role,action,from_status,to_status,comment)
        VALUES ('legacy-log','legacy-doc',2,'reviewer-1','Reviewer','reviewer','in_review','ready_for_review','in_review','Legacy review comment');
        """
    )
    connection.commit()
    connection.close()

    from app.db.database import init_db

    init_db()

    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    document = connection.execute("SELECT * FROM documents WHERE id='legacy-doc'").fetchone()
    audit = connection.execute("SELECT * FROM approval_logs WHERE id='legacy-log'").fetchone()
    assert document["title"] == "Existing permission request"
    assert document["current_version"] == 2
    assert document["status"] == "in_review"
    assert document["workflow_stage"] == "reviewer"
    assert audit["comment"] == "Legacy review comment"
    assert audit["actor_role"] == "reviewer"
    assert audit["from_stage"] is None and audit["to_stage"] is None
    connection.close()
