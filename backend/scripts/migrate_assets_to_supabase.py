"""Backfill existing SmartDocs version assets into the private Supabase bucket.

The default is a report-only scan. --apply is required for object uploads and
updates to document_versions. The source files and current database are never deleted.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

from app.db.database import get_db
from app.utils import supabase_storage
from app.utils.file_manager import file_manager, sanitize_filename


def locate_legacy_file(value: str, roots: list[Path]) -> Path | None:
    original = Path(value)
    candidates = [original]
    for root in roots:
        candidates.append(root / original.name)
        parts = original.parts
        if "generated_docs" in parts:
            candidates.append(root / Path(*parts[parts.index("generated_docs") + 1:]))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def externalize_legacy_signature(data: dict, document_id: str, version_num: int) -> dict:
    value = data.get("lead_signature_data")
    if not isinstance(value, str) or not value.startswith("data:"):
        return data
    try:
        header, encoded = value.split(",", 1)
        content_type = header[5:].split(";", 1)[0].lower()
        if content_type not in {"image/png", "image/jpeg"}:
            raise ValueError("unsupported image content type")
        payload = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise RuntimeError(f"Invalid embedded signature for {document_id} version {version_num}.") from exc
    key = f"documents/{document_id}/versions/{version_num}/lead-signature.{ 'jpg' if content_type == 'image/jpeg' else 'png' }"
    supabase_storage.upload_bytes(key, payload, content_type)
    updated = dict(data)
    updated["lead_signature_data"] = supabase_storage.storage_reference(key, content_type)
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file-root", action="append", type=Path, default=[], help="Read-only copy of a legacy generated_docs tree; repeatable.")
    parser.add_argument("--batch-root", type=Path, help="Read-only copy of legacy generated_docs/batches directory.")
    parser.add_argument("--apply", action="store_true", help="Upload assets and replace version references in PostgreSQL.")
    args = parser.parse_args()
    try:
        if args.apply:
            if os.getenv("SMARTDOCS_DB_BACKEND", "postgres").lower() != "postgres":
                raise RuntimeError("Asset backfill requires SMARTDOCS_DB_BACKEND=postgres.")
            supabase_storage.verify_storage_configuration()

        missing: list[str] = []
        versions_updated = signatures_uploaded = files_uploaded = batches_uploaded = 0
        with get_db() as conn:
            versions = conn.execute(
                "SELECT id,document_id,version_num,data_json,docx_path,pdf_path FROM document_versions ORDER BY document_id,version_num"
            ).fetchall()
            pending = []
            for row in versions:
                data = json.loads(row["data_json"])
                paths = {"docx_path": row["docx_path"], "pdf_path": row["pdf_path"]}
                resolved = {}
                for field, stored in paths.items():
                    if not stored or supabase_storage.parse_storage_reference(str(stored)):
                        resolved[field] = stored
                        continue
                    local_file = locate_legacy_file(str(stored), args.file_root)
                    if not local_file:
                        missing.append(str(stored))
                        resolved[field] = stored
                    else:
                        resolved[field] = local_file
                signature_pending = isinstance(data.get("lead_signature_data"), str) and data["lead_signature_data"].startswith("data:")
                file_pending = any(isinstance(value, Path) for value in resolved.values())
                if signature_pending or file_pending:
                    pending.append((row, data, resolved, signature_pending))
            batch_files = []
            batch_rows = conn.execute("SELECT batch_id FROM batch_artifacts ORDER BY batch_id").fetchall()
            if batch_rows and not args.batch_root:
                missing.append("batch archives exist in PostgreSQL but --batch-root was not supplied")
            elif args.batch_root:
                for row in batch_rows:
                    batch_id = row["batch_id"]
                    candidate = args.batch_root / batch_id / f"Batch_{batch_id}.zip"
                    if candidate.is_file():
                        batch_files.append((batch_id, candidate))
                    else:
                        missing.append(str(candidate))

        print(f"Version rows scanned: {len(versions)}; rows needing backfill: {len(pending)}")
        print(f"Legacy batch archives found: {len(batch_files)}; missing source files: {len(missing)}")
        if missing:
            for path in missing:
                print(f"MISSING: {path}")
            if args.apply:
                raise RuntimeError("Missing legacy files; no database references were changed.")
        if not args.apply:
            print("Report only. No objects or database rows were changed.")
            return 0

        for row, data, resolved, signature_pending in pending:
            updated_data = dict(data)
            updated_paths = {}
            for field, value in resolved.items():
                if isinstance(value, Path):
                    extension = value.suffix.lower()
                    if extension not in {".docx", ".pdf"}:
                        raise RuntimeError(f"Unsupported legacy document extension: {value.name}")
                    mime = "application/pdf" if extension == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    key = f"documents/{row['document_id']}/versions/{row['version_num']}/{sanitize_filename(value.name)}"
                    supabase_storage.upload_file(key, value, mime)
                    updated_paths[field] = supabase_storage.storage_reference(key, mime)
                    files_uploaded += 1
                else:
                    updated_paths[field] = value
            if signature_pending:
                updated_data = externalize_legacy_signature(updated_data, row["document_id"], row["version_num"])
                signatures_uploaded += 1
            with get_db() as conn:
                conn.execute(
                    "UPDATE document_versions SET data_json=?,docx_path=?,pdf_path=? WHERE id=?",
                    (json.dumps(updated_data), updated_paths["docx_path"], updated_paths["pdf_path"], row["id"]),
                )
            versions_updated += 1

        for batch_id, path in batch_files:
            supabase_storage.upload_file(f"batches/{batch_id}/Batch_{batch_id}.zip", path, "application/zip")
            batches_uploaded += 1
        print(f"Backfill complete: {versions_updated} version rows, {files_uploaded} files, {signatures_uploaded} signatures, {batches_uploaded} batch archives uploaded.")
        return 0
    except Exception as exc:
        print(f"Backfill stopped: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
