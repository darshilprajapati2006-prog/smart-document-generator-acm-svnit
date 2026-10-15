import os
import re
import time
import uuid
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from fastapi import HTTPException
from app.core.config import settings
from app.utils import supabase_storage

def sanitize_filename(name: str) -> str:
    """Removes unsafe characters for OS filenames."""
    clean = re.sub(r'[^\w\-_.]', '_', name)
    return clean[:100]

class FileManager:
    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or settings.STORAGE_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def validate_storage_configuration(self) -> None:
        supabase_storage.verify_storage_configuration()

    def uses_remote_storage(self) -> bool:
        return supabase_storage.storage_backend() == "supabase"

    def persist_version_assets(self, document_id: str, version_num: int, data: dict,
                               docx_path: Optional[str], pdf_path: Optional[str]):
        """Persist generated outputs and signature bytes privately; return DB references."""
        prepared_data = dict(data)
        if not self.uses_remote_storage():
            return prepared_data, docx_path, pdf_path

        from app.utils.supabase_storage import (
            externalize_signature, parse_storage_reference, storage_reference, upload_file,
        )

        paths = []
        for path_value, extension, mime in (
            (docx_path, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            (pdf_path, "pdf", "application/pdf"),
        ):
            if not path_value:
                paths.append(None)
                continue
            if parse_storage_reference(str(path_value)):
                paths.append(str(path_value))
                continue
            local_path = Path(path_value)
            if not local_path.is_file():
                raise FileNotFoundError(f"Generated {extension.upper()} file is missing before durable upload.")
            filename = sanitize_filename(local_path.name)
            key = f"documents/{document_id}/versions/{version_num}/{filename}"
            upload_file(key, local_path, mime)
            paths.append(storage_reference(key, mime))

        prepared_data["lead_signature_data"] = externalize_signature(
            prepared_data.get("lead_signature_data"), document_id, version_num
        )
        return prepared_data, paths[0], paths[1]

    @staticmethod
    def materialize(stored_path: str) -> tuple[Path, bool]:
        """Return a local path for FileResponse; remote copies are temporary and cleaned after send."""
        if stored_path.startswith("supabase-storage://"):
            payload, _ = supabase_storage.download_bytes(stored_path)
            parsed = supabase_storage.parse_storage_reference(stored_path)
            suffix = Path(parsed[1]).suffix if parsed else ""
            handle = tempfile.NamedTemporaryFile(prefix="smartdocs-download-", suffix=suffix, delete=False)
            try:
                handle.write(payload)
                return Path(handle.name), True
            finally:
                handle.close()
        return Path(stored_path), False

    @staticmethod
    def cleanup_materialized(path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    @staticmethod
    def display_filename(stored_path: str) -> str:
        parsed = supabase_storage.parse_storage_reference(stored_path)
        if parsed:
            return Path(parsed[1]).name
        return Path(stored_path).name

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
