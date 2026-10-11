"""
Privacy-Preserving Usage Analytics Service.
Tracks high-level operational metrics: generation counts, durations, success/failure rates,
and document-type distributions without recording sensitive personal or financial content.
"""
import uuid
from typing import Dict, Any, List, Optional
from app.db.database import get_db

class AnalyticsService:

    @classmethod
    def record_event(
        cls,
        event_type: str,
        document_type: Optional[str] = None,
        duration_ms: Optional[float] = None,
        status: str = "success",
        actor_role: Optional[str] = "anonymous"
    ):
        """Records an operational event without sensitive payloads."""
        event_id = f"evt-{uuid.uuid4().hex[:12]}"
        try:
            with get_db() as conn:
                conn.execute(
                    """
                    INSERT INTO analytics_events (id, event_type, document_type, duration_ms, status, actor_role)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (event_id, event_type, document_type, duration_ms, status, actor_role)
                )
        except Exception:
            # Analytics recording must never crash primary business workflows
            pass

    @classmethod
    def get_dashboard_metrics(cls, document_type: Optional[str] = None) -> Dict[str, Any]:
        """Calculates aggregated operational statistics."""
        with get_db() as conn:
            # 1. Total events and breakdown
            where_clause = "WHERE 1=1"
            params = []
            if document_type:
                where_clause += " AND document_type = ?"
                params.append(document_type)

            total_gen = conn.execute(
                f"SELECT COUNT(*) as cnt FROM analytics_events {where_clause} AND event_type IN ('document_generated', 'batch_generated')",
                params
            ).fetchone()["cnt"]

            failures = conn.execute(
                f"SELECT COUNT(*) as cnt FROM analytics_events {where_clause} AND status = 'failed'",
                params
            ).fetchone()["cnt"]

            # Average generation duration
            avg_row = conn.execute(
                f"SELECT AVG(duration_ms) as avg_d FROM analytics_events {where_clause} AND duration_ms IS NOT NULL",
                params
            ).fetchone()
            avg_duration = round(avg_row["avg_d"], 1) if avg_row and avg_row["avg_d"] else 0.0

            # Counts by document type
            type_rows = conn.execute(
                "SELECT document_type, COUNT(*) as cnt FROM analytics_events WHERE document_type IS NOT NULL GROUP BY document_type"
            ).fetchall()
            doc_type_counts = {r["document_type"]: r["cnt"] for r in type_rows}

            # Workflow document counts by status
            status_rows = conn.execute(
                "SELECT status, COUNT(*) as cnt FROM documents GROUP BY status"
            ).fetchall()
            status_distribution = {r["status"]: r["cnt"] for r in status_rows}

            # Total registered documents in database
            total_persisted_docs = conn.execute("SELECT COUNT(*) as cnt FROM documents").fetchone()["cnt"]

            return {
                "total_documents_generated": total_gen,
                "total_persisted_documents": total_persisted_docs,
                "total_failures": failures,
                "success_rate_percentage": round(((total_gen - failures) / total_gen * 100) if total_gen > 0 else 100.0, 1),
                "avg_generation_duration_ms": avg_duration,
                "documents_by_type": {
                "exec_meet": doc_type_counts.get("exec_meet", 0),
                "prize_money_receipt": doc_type_counts.get("prize_money_receipt", 0),
                "bill_certificate": doc_type_counts.get("bill_certificate", 0),
                    "bill_summary": doc_type_counts.get("bill_summary", 0)
                },
                "workflow_status_distribution": status_distribution
            }
