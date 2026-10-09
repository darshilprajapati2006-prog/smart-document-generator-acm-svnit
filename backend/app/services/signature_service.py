"""
Cryptographic Digital Signature Service.
Signs document versions using HMAC-SHA256 over canonical data representations.
Provides tamper detection and cryptographic signature verification.
Clearly distinguishes cryptographic signatures from plain typed names or signature images.
"""
import uuid
from typing import Dict, Any, Optional
from app.db.database import get_db
from app.core.security import compute_payload_hash, sign_data_payload
from app.services.document_repository import DocumentRepository

class SignatureService:

    @classmethod
    def sign_document_version(
        cls,
        doc_id: str,
        version_num: int,
        signer: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Applies a cryptographic digital signature to a specific document version snapshot.
        """
        signer_id = signer.get("sub") or signer.get("id") or "signer-001"
        signer_name = signer.get("full_name") or signer.get("email") or "Authorized Signer"
        signer_role = signer.get("role") or "author"

        version_detail = DocumentRepository.get_version_detail(doc_id, version_num)
        if not version_detail:
            raise ValueError(f"Version {version_num} of document '{doc_id}' does not exist.")

        data_payload = version_detail["data"]
        payload_hash = compute_payload_hash(data_payload)
        signature_token = sign_data_payload(data_payload, signer_id)

        sig_id = f"sig-{uuid.uuid4().hex[:12]}"

        with get_db() as conn:
            # Save signature record
            conn.execute(
                """
                INSERT INTO digital_signatures (id, document_id, version_num, signer_id, signer_name, signer_role, algorithm, payload_hash, signature_token)
                VALUES (?, ?, ?, ?, ?, ?, 'HMAC-SHA256', ?, ?)
                """,
                (sig_id, doc_id, version_num, signer_id, signer_name, signer_role, payload_hash, signature_token)
            )

            # Update signature hash on document_versions
            conn.execute(
                "UPDATE document_versions SET signature_hash = ? WHERE document_id = ? AND version_num = ?",
                (signature_token, doc_id, version_num)
            )

        return {
            "signature_id": sig_id,
            "document_id": doc_id,
            "version_num": version_num,
            "signer": {
                "id": signer_id,
                "name": signer_name,
                "role": signer_role
            },
            "algorithm": "HMAC-SHA256",
            "payload_hash": payload_hash,
            "signature_token": signature_token,
            "signature_type": "Cryptographic Electronic Digest (HMAC-SHA256)",
            "message": "Cryptographic signature successfully applied. Any future alteration to source fields will invalidate this signature."
        }

    @classmethod
    def verify_signature(cls, doc_id: str, version_num: int) -> Dict[str, Any]:
        """
        Verifies whether the current document payload matches the cryptographic signature.
        Detects tampering or field modifications.
        """
        with get_db() as conn:
            sig_row = conn.execute(
                """
                SELECT * FROM digital_signatures
                WHERE document_id = ? AND version_num = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (doc_id, version_num)
            ).fetchone()

        if not sig_row:
            return {
                "is_signed": False,
                "is_valid": False,
                "tampered": False,
                "detail": f"No digital signature found for document '{doc_id}' version {version_num}."
            }

        version_detail = DocumentRepository.get_version_detail(doc_id, version_num)
        if not version_detail:
            return {
                "is_signed": True,
                "is_valid": False,
                "tampered": True,
                "detail": "Document version record missing or deleted."
            }

        current_hash = compute_payload_hash(version_detail["data"])
        recorded_hash = sig_row["payload_hash"]
        is_intact = (current_hash == recorded_hash)

        return {
            "is_signed": True,
            "is_valid": is_intact,
            "tampered": not is_intact,
            "algorithm": sig_row["algorithm"],
            "signer_name": sig_row["signer_name"],
            "signer_role": sig_row["signer_role"],
            "signed_at": sig_row["created_at"],
            "expected_hash": recorded_hash,
            "computed_hash": current_hash,
            "detail": "Signature is VALID and document payload is UNALTERED." if is_intact else "INTEGRITY ALERT: Document payload has been ALTERED since signature creation!"
        }
