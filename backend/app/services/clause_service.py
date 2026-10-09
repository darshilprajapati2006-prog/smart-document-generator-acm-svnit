"""
Reusable Clauses and Document Sections Service.
Allows maintainers to store approved clauses, filter by document type,
and perform safe variable interpolation without code execution risks.
"""
import re
import uuid
import json
from typing import Dict, Any, List, Optional
from app.db.database import get_db

class ClauseService:

    @staticmethod
    def list_clauses(document_type: Optional[str] = None, active_only: bool = True) -> List[Dict[str, Any]]:
        with get_db() as conn:
            query = "SELECT * FROM reusable_clauses WHERE 1=1"
            params = []
            if active_only:
                query += " AND active = 1"
            
            rows = conn.execute(query + " ORDER BY category, name", params).fetchall()
            clauses = []
            for r in rows:
                c = dict(r)
                c["variables"] = json.loads(c["variables_json"]) if c.get("variables_json") else []
                app_types = [t.strip() for t in c["applicable_types"].split(",") if t.strip()]
                c["applicable_types_list"] = app_types
                if not document_type or document_type in app_types:
                    clauses.append(c)
            return clauses

    @staticmethod
    def get_clause(clause_id: str) -> Optional[Dict[str, Any]]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM reusable_clauses WHERE id = ?", (clause_id,)).fetchone()
            if not row:
                return None
            c = dict(row)
            c["variables"] = json.loads(c["variables_json"]) if c.get("variables_json") else []
            c["applicable_types_list"] = [t.strip() for t in c["applicable_types"].split(",") if t.strip()]
            return c

    @staticmethod
    def create_clause(
        name: str,
        category: str,
        applicable_types: str,
        content: str,
        variables: Optional[List[str]] = None,
        clause_id: Optional[str] = None
    ) -> Dict[str, Any]:
        cid = clause_id or f"cl-{uuid.uuid4().hex[:8]}"
        vars_json = json.dumps(variables or [])
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO reusable_clauses (id, name, category, applicable_types, content, variables_json, active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (cid, name, category, applicable_types, content, vars_json)
            )
        return ClauseService.get_clause(cid)

    @staticmethod
    def update_clause(
        clause_id: str,
        name: Optional[str] = None,
        category: Optional[str] = None,
        applicable_types: Optional[str] = None,
        content: Optional[str] = None,
        variables: Optional[List[str]] = None,
        active: Optional[bool] = None
    ) -> Optional[Dict[str, Any]]:
        existing = ClauseService.get_clause(clause_id)
        if not existing:
            return None
        
        updated_name = name if name is not None else existing["name"]
        updated_cat = category if category is not None else existing["category"]
        updated_types = applicable_types if applicable_types is not None else existing["applicable_types"]
        updated_content = content if content is not None else existing["content"]
        updated_vars = json.dumps(variables) if variables is not None else existing["variables_json"]
        updated_active = (1 if active else 0) if active is not None else existing["active"]

        with get_db() as conn:
            conn.execute(
                """
                UPDATE reusable_clauses
                SET name = ?, category = ?, applicable_types = ?, content = ?, variables_json = ?, active = ?
                WHERE id = ?
                """,
                (updated_name, updated_cat, updated_types, updated_content, updated_vars, updated_active, clause_id)
            )
        return ClauseService.get_clause(clause_id)

    @staticmethod
    def interpolate(content: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Substitutes {{variable}} placeholders with context values.
        Missing variables are highlighted safely without throwing errors.
        """
        pattern = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")
        used_variables = []
        missing_variables = []

        def replacer(match):
            key = match.group(1)
            used_variables.append(key)
            if key in context and context[key] is not None and str(context[key]).strip():
                return str(context[key])
            missing_variables.append(key)
            return f"[{key.replace('_', ' ').title()}]"

        rendered_text = pattern.sub(replacer, content)
        return {
            "rendered_content": rendered_text,
            "used_variables": used_variables,
            "missing_variables": missing_variables
        }
