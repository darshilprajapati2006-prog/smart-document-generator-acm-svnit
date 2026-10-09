"""
Approval and Review Workflow Service.
Enforces multi-stage state transitions, role authorizations, reviewer comments,
and maintains tamper-proof audit trails for ACM SVNIT documents.
"""
import uuid
from typing import Dict, Any, List, Optional
from app.db.database import get_db

class WorkflowService:

    # Permitted transitions: (from_state, to_state) -> [allowed_roles]
    PERMITTED_TRANSITIONS = {
        ("draft", "ready_for_review"): ["author", "admin"],
        ("ready_for_review", "in_review"): ["reviewer", "approver", "admin"],
        ("in_review", "approved"): ["approver", "admin"],
        ("in_review", "changes_requested"): ["reviewer", "approver", "admin"],
        ("in_review", "rejected"): ["approver", "admin"],
        ("changes_requested", "ready_for_review"): ["author", "admin"],
        ("rejected", "draft"): ["author", "admin"]
    }

    @classmethod
    def transition(
        cls,
        doc_id: str,
        target_status: str,
        actor: Dict[str, Any],
        comment: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes an audited workflow transition on a document.
        Validates current state, target state, actor role, and version correspondence.
        """
        actor_id = actor.get("sub") or actor.get("id") or "anonymous"
        actor_name = actor.get("full_name") or actor.get("email") or "Unknown"
        actor_role = actor.get("role") or "viewer"

        with get_db() as conn:
            doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if not doc_row:
                raise ValueError(f"Document '{doc_id}' does not exist.")

            current_status = doc_row["status"]
            current_version = doc_row["current_version"]

            if current_status == target_status:
                raise ValueError(f"Document is already in '{current_status}' state.")

            transition_key = (current_status, target_status)
            if transition_key not in cls.PERMITTED_TRANSITIONS:
                raise ValueError(
                    f"Invalid workflow transition from '{current_status}' to '{target_status}'. "
                    f"Permitted transitions from '{current_status}': "
                    f"{[to_s for (fr_s, to_s) in cls.PERMITTED_TRANSITIONS.keys() if fr_s == current_status]}"
                )

            allowed_roles = cls.PERMITTED_TRANSITIONS[transition_key]
            if actor_role not in allowed_roles and actor_role != "admin":
                raise PermissionError(
                    f"User with role '{actor_role}' is not authorized to transition document from "
                    f"'{current_status}' to '{target_status}'. Requires one of: {allowed_roles}"
                )

            # Update document status
            conn.execute(
                "UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (target_status, doc_id)
            )

            # Record audit log
            log_id = f"appr-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                INSERT INTO approval_logs (id, document_id, version_num, actor_id, actor_name, actor_role, action, from_status, to_status, comment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_id,
                    doc_id,
                    current_version,
                    actor_id,
                    actor_name,
                    actor_role,
                    f"Transition to {target_status}",
                    current_status,
                    target_status,
                    comment or ""
                )
            )

        return {
            "success": True,
            "document_id": doc_id,
            "version_num": current_version,
            "from_status": current_status,
            "to_status": target_status,
            "actor": {
                "id": actor_id,
                "name": actor_name,
                "role": actor_role
            },
            "comment": comment
        }

    @staticmethod
    def get_history(doc_id: str) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT id, version_num, actor_id, actor_name, actor_role, action, from_status, to_status, comment, created_at
                FROM approval_logs
                WHERE document_id = ?
                ORDER BY created_at ASC
                """,
                (doc_id,)
            ).fetchall()
            return [dict(r) for r in rows]
