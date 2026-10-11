"""Role-gated document workflow with ordered review, approval, and audit history."""
import uuid
from typing import Dict, Any, List, Optional

from app.db.database import get_db


class WorkflowConflictError(ValueError):
    """Requested workflow command does not match the document's current state."""


class WorkflowService:
    # Commands are distinct from persisted document statuses. Intermediate
    # approvals update workflow_stage while retaining the existing status schema.
    ACTIONS = {
        ("author", "draft", "ready_for_review"): ("reviewer", "ready_for_review"),
        ("author", "changes_requested", "ready_for_review"): ("reviewer", "ready_for_review"),
        ("reviewer", "ready_for_review", "in_review"): ("reviewer", "in_review"),
        ("reviewer", "in_review", "review_approved"): ("approver", "in_review"),
        ("reviewer", "ready_for_review", "changes_requested"): ("author", "changes_requested"),
        ("reviewer", "in_review", "changes_requested"): ("author", "changes_requested"),
        ("approver", "in_review", "approver_approved"): ("template_admin", "in_review"),
        ("approver", "in_review", "changes_requested"): ("author", "changes_requested"),
        ("approver", "in_review", "rejected"): ("completed", "rejected"),
        ("template_admin", "in_review", "template_approved"): ("admin", "in_review"),
        ("template_admin", "in_review", "changes_requested"): ("author", "changes_requested"),
        ("admin", "in_review", "approved"): ("completed", "approved"),
    }

    @classmethod
    def transition(
        cls,
        doc_id: str,
        target_status: str,
        actor: Dict[str, Any],
        comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        actor_id = actor.get("sub") or actor.get("id") or "anonymous"
        actor_name = actor.get("full_name") or actor.get("email") or "Unknown"
        actor_role = actor.get("role") or "viewer"

        with get_db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if not doc_row:
                raise ValueError(f"Document '{doc_id}' does not exist.")

            current_status = doc_row["status"]
            current_stage = doc_row["workflow_stage"]
            action = cls.ACTIONS.get((current_stage, current_status, target_status))
            if not action:
                raise WorkflowConflictError(
                    f"Action '{target_status}' is not valid while this document is "
                    f"'{current_status}' at the '{current_stage}' stage."
                )
            if target_status in {"changes_requested", "rejected"} and not (comment or "").strip():
                raise ValueError("A comment is required when requesting changes or rejecting a document.")
            if actor_role != current_stage:
                raise PermissionError(f"Only the {current_stage.replace('_', ' ').title()} role can act at this stage.")
            if current_stage != "author" and actor_id == doc_row["user_id"]:
                raise PermissionError("A document author cannot approve their own document workflow stage.")

            next_stage, next_status = action
            conn.execute(
                "UPDATE documents SET status=?, workflow_stage=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (next_status, next_stage, doc_id),
            )
            conn.execute(
                """INSERT INTO approval_logs
                   (id, document_id, version_num, actor_id, actor_name, actor_role,
                    action, from_status, to_status, from_stage, to_stage, comment)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"appr-{uuid.uuid4().hex[:12]}", doc_id, doc_row["current_version"],
                    actor_id, actor_name, actor_role, target_status,
                    current_status, next_status, current_stage, next_stage, comment or "",
                ),
            )

        return {
            "success": True,
            "document_id": doc_id,
            "version_num": doc_row["current_version"],
            "from_status": current_status,
            "to_status": next_status,
            "from_stage": current_stage,
            "to_stage": next_stage,
            "action": target_status,
            "actor": {"id": actor_id, "name": actor_name, "role": actor_role},
            "comment": comment,
        }

    @staticmethod
    def get_history(doc_id: str) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                """SELECT id, version_num, actor_id, actor_name, actor_role, action,
                          from_status, to_status, from_stage, to_stage, comment, created_at
                   FROM approval_logs WHERE document_id=? ORDER BY created_at ASC""",
                (doc_id,),
            ).fetchall()
            return [dict(row) for row in rows]
