"""
Document Repository and Version History Management.
Handles persistent document records, version snapshots, and restores via SQLite.
"""
import uuid
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.db.database import get_db
from app.utils.file_manager import file_manager
from app.utils.supabase_storage import hydrate_signature

class DocumentRepository:
    
    @staticmethod
    def create_document(
        user_id: str,
        document_type: str,
        title: str,
        data: Dict[str, Any],
        docx_path: Optional[str] = None,
        pdf_path: Optional[str] = None,
        change_summary: str = "Initial document generation"
    ) -> Dict[str, Any]:
        """Creates a new document record and saves version 1."""
        doc_id = f"doc-{uuid.uuid4().hex[:12]}"
        version_id = f"ver-{uuid.uuid4().hex[:12]}"
        stored_data, stored_docx_path, stored_pdf_path = file_manager.persist_version_assets(
            doc_id, 1, data, docx_path, pdf_path
        )
        
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO documents (id, user_id, document_type, title, status, current_version)
                VALUES (?, ?, ?, ?, 'draft', 1)
                """,
                (doc_id, user_id, document_type, title)
            )
            
            conn.execute(
                """
                INSERT INTO document_versions (id, document_id, version_num, data_json, docx_path, pdf_path, change_summary, actor_id)
                VALUES (?, ?, 1, ?, ?, ?, ?, ?)
                """,
                (version_id, doc_id, json.dumps(stored_data), stored_docx_path, stored_pdf_path, change_summary, user_id)
            )
            
        return DocumentRepository.get_document(doc_id)

    @staticmethod
    def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if not row:
                return None
            doc = dict(row)
            # Fetch latest version data
            v_row = conn.execute(
                "SELECT * FROM document_versions WHERE document_id = ? AND version_num = ?",
                (doc_id, doc["current_version"])
            ).fetchone()
            if v_row:
                doc["latest_version"] = {
                    "version_num": v_row["version_num"],
                    "data": hydrate_signature(json.loads(v_row["data_json"])),
                    "docx_path": v_row["docx_path"],
                    "pdf_path": v_row["pdf_path"],
                    "change_summary": v_row["change_summary"],
                    "signature_hash": v_row["signature_hash"],
                    "created_at": v_row["created_at"]
                }
            return doc

    @staticmethod
    def list_documents(user_id: Optional[str] = None, role: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists documents. Admins, reviewers, and approvers can view all; authors/viewers view their own."""
        with get_db() as conn:
            if role in ["admin", "reviewer", "approver", "template_admin"]:
                rows = conn.execute("SELECT * FROM documents ORDER BY updated_at DESC").fetchall()
            elif user_id:
                rows = conn.execute("SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM documents ORDER BY updated_at DESC").fetchall()
            return [dict(r) for r in rows]

    @staticmethod
    def update_document_version(
        doc_id: str,
        user_id: str,
        new_data: Dict[str, Any],
        docx_path: Optional[str] = None,
        pdf_path: Optional[str] = None,
        change_summary: str = "Source information updated",
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """Creates an incremented version (version_num + 1) preserving previous versions."""
        with get_db() as conn:
            doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if not doc_row:
                raise ValueError(f"Document '{doc_id}' not found.")
            
            new_version_num = doc_row["current_version"] + 1
            version_id = f"ver-{uuid.uuid4().hex[:12]}"
            stored_data, stored_docx_path, stored_pdf_path = file_manager.persist_version_assets(
                doc_id, new_version_num, new_data, docx_path, pdf_path
            )
            
            # Any new source version invalidates in-flight approvals and returns
            # the document to its Author for a fresh review cycle.
            new_status = "draft" if doc_row["status"] == "draft" else "changes_requested"
            
            updated_title = title or doc_row["title"]

            conn.execute(
                """
                UPDATE documents
                SET current_version = ?, status = ?, workflow_stage = 'author', title = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (new_version_num, new_status, updated_title, doc_id)
            )

            conn.execute(
                """
                INSERT INTO document_versions (id, document_id, version_num, data_json, docx_path, pdf_path, change_summary, actor_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (version_id, doc_id, new_version_num, json.dumps(stored_data), stored_docx_path, stored_pdf_path, change_summary, user_id)
            )

        return DocumentRepository.get_document(doc_id)

    @staticmethod
    def list_versions(doc_id: str) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT version_num, docx_path, pdf_path, change_summary, actor_id, signature_hash, created_at
                FROM document_versions
                WHERE document_id = ?
                ORDER BY version_num DESC
                """,
                (doc_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    @staticmethod
    def get_version_detail(doc_id: str, version_num: int) -> Optional[Dict[str, Any]]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM document_versions WHERE document_id = ? AND version_num = ?",
                (doc_id, version_num)
            ).fetchone()
            if not row:
                return None
            res = dict(row)
            res["data"] = hydrate_signature(json.loads(res["data_json"]))
            res["data_json"] = json.dumps(res["data"])
            return res

    @staticmethod
    def restore_version(doc_id: str, version_num: int, user_id: str) -> Dict[str, Any]:
        """Restores a previous version by creating a NEW incremented version, preserving history."""
        target_v = DocumentRepository.get_version_detail(doc_id, version_num)
        if not target_v:
            raise ValueError(f"Version {version_num} of document '{doc_id}' not found.")
        
        return DocumentRepository.update_document_version(
            doc_id=doc_id,
            user_id=user_id,
            new_data=target_v["data"],
            docx_path=target_v["docx_path"],
            pdf_path=target_v["pdf_path"],
            change_summary=f"Restored from version {version_num}"
        )
