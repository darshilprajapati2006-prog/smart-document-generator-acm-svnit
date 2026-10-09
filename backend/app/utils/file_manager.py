import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple
from fastapi import HTTPException
from app.core.config import settings

def sanitize_filename(name: str) -> str:
    """Removes unsafe characters for OS filenames."""
    clean = re.sub(r'[^\w\-_.]', '_', name)
    return clean[:100]

class FileManager:
    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or settings.STORAGE_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def create_session(self) -> Tuple[str, Path]:
        """Creates a unique directory for a generated document package."""
        doc_id = str(uuid.uuid4())
        session_dir = self.base_dir / doc_id
        session_dir.mkdir(parents=True, exist_ok=True)
        return doc_id, session_dir

    def get_file(self, doc_id: str, file_format: str) -> Tuple[Path, str]:
        """
        Safely retrieves the requested file path and filename.
        Rejects directory traversal and invalid IDs.
        """
        if not re.match(r"^[0-9a-fA-F-]{36}$", doc_id):
            raise HTTPException(status_code=400, detail="Invalid document ID format.")

        session_dir = self.base_dir / doc_id
        if not session_dir.exists() or not session_dir.is_dir():
            raise HTTPException(status_code=404, detail="Document not found or expired.")

        fmt = file_format.lower().strip()
        if fmt not in ["docx", "pdf"]:
            raise HTTPException(status_code=400, detail="Unsupported file format requested.")

        files = list(session_dir.glob(f"*.{fmt}"))
        if not files:
            raise HTTPException(status_code=404, detail=f"No {fmt.upper()} document found.")

        target_file = files[0]
        # Security check: ensure path stays inside session_dir
        if not str(target_file.resolve()).startswith(str(session_dir.resolve())):
            raise HTTPException(status_code=403, detail="Access denied.")

        return target_file, target_file.name

    def cleanup_old_files(self, max_age_seconds: int = 86400):
        """Clean up generated files older than 24 hours."""
        now = time.time()
        for item in self.base_dir.iterdir():
            if item.is_dir():
                try:
                    if now - item.stat().st_mtime > max_age_seconds:
                        for sub in item.iterdir():
                            sub.unlink()
                        item.rmdir()
                except Exception:
                    pass

file_manager = FileManager()
