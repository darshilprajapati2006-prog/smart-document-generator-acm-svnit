import re
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.schemas.executive_meet import ExecutiveMeetRequest
from app.schemas.bill_certificate import BillCertificateRequest
from app.schemas.bill_summary import BillSummaryRequest
from app.services.executive_meet_service import ExecutiveMeetService
from app.services.bill_certificate_service import BillCertificateService
from app.services.bill_summary_service import BillSummaryService
from app.utils.file_manager import file_manager, sanitize_filename

router = APIRouter(prefix="/documents", tags=["documents"])

class NLPExtractRequest(BaseModel):
    text: str

@router.get("/templates")
def list_templates():
    """List supported official templates and their field definitions."""
    return {
        "templates": [
            {
                "id": "exec_meet",
                "title": "Executive Meet",
                "description": "Event proposals and official permission requests.",
                "icon": "📋",
                "category": "Permission Request",
                "reference_document": "EXEC MEET_public.pdf",
            },
            {
                "id": "bill_certificate",
                "title": "Bill Certificate",
                "description": "Expenditure, supplier and payment certification details.",
                "icon": "🧾",
                "category": "Financial Certification",
                "reference_document": "Bill Certificate_public.pdf",
            },
            {
                "id": "bill_summary",
                "title": "Bill Summary",
                "description": "Payment summaries, recipient details and totals.",
                "icon": "💳",
                "category": "Reimbursement & Payment",
                "reference_document": "BIll_summary_public.pdf",
            },
        ]
    }

@router.post("/executive-meet/generate")
def generate_executive_meet(data: ExecutiveMeetRequest):
    """Generates DOCX and PDF for Executive Meet permission request."""
    try:
        doc_id, session_dir = file_manager.create_session()
        
        safe_date = sanitize_filename(data.event_date.replace("/", "-"))
        docx_filename = f"Executive_Meet_{safe_date}.docx"
        pdf_filename = f"Executive_Meet_{safe_date}.pdf"
        
        docx_path = session_dir / docx_filename
        pdf_path = session_dir / pdf_filename
        
        ExecutiveMeetService.generate_docx(data, docx_path)
        ExecutiveMeetService.generate_pdf(data, pdf_path)
        
        return {
            "success": True,
            "document_id": doc_id,
            "document_type": "exec_meet",
            "title": data.event_name,
            "files": {
                "docx": {
                    "filename": docx_filename,
                    "download_url": f"/api/documents/download/{doc_id}/docx"
                },
                "pdf": {
                    "filename": pdf_filename,
                    "download_url": f"/api/documents/download/{doc_id}/pdf"
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/bill-certificate/generate")
def generate_bill_certificate(data: BillCertificateRequest):
    """Generates DOCX and PDF for Bill Certificate (Recurring Expenditure)."""
    try:
        doc_id, session_dir = file_manager.create_session()
        
        calc_items, subtotal, taxes, grand_total = BillCertificateService.calculate_totals(data)
        
        safe_date = sanitize_filename(data.date.replace("/", "-"))
        docx_filename = f"Bill_Certificate_{safe_date}.docx"
        pdf_filename = f"Bill_Certificate_{safe_date}.pdf"
        
        docx_path = session_dir / docx_filename
        pdf_path = session_dir / pdf_filename
        
        BillCertificateService.generate_docx(data, docx_path)
        BillCertificateService.generate_pdf(data, pdf_path)
        
        return {
            "success": True,
            "document_id": doc_id,
            "document_type": "bill_certificate",
            "title": f"Bill Certificate - {data.chapter_name}",
            "calculation_summary": {
                "subtotal": subtotal,
                "taxes": taxes,
                "grand_total": grand_total,
                "item_count": len(calc_items)
            },
            "files": {
                "docx": {
                    "filename": docx_filename,
                    "download_url": f"/api/documents/download/{doc_id}/docx"
                },
                "pdf": {
                    "filename": pdf_filename,
                    "download_url": f"/api/documents/download/{doc_id}/pdf"
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/bill-summary/generate")
def generate_bill_summary(data: BillSummaryRequest):
    """Generates DOCX and PDF for Bill Summary."""
    try:
        doc_id, session_dir = file_manager.create_session()
        
        calc_rows, total_prize, total_other, grand_total = BillSummaryService.calculate_totals(data)
        
        safe_date = sanitize_filename(data.date.replace("/", "-"))
        docx_filename = f"Bill_Summary_{safe_date}.docx"
        pdf_filename = f"Bill_Summary_{safe_date}.pdf"
        
        docx_path = session_dir / docx_filename
        pdf_path = session_dir / pdf_filename
        
        BillSummaryService.generate_docx(data, docx_path)
        BillSummaryService.generate_pdf(data, pdf_path)
        
        return {
            "success": True,
            "document_id": doc_id,
            "document_type": "bill_summary",
            "title": data.title,
            "calculation_summary": {
                "total_prize_money": total_prize,
                "total_other": total_other,
                "grand_total": grand_total,
                "recipient_count": len(calc_rows)
            },
            "files": {
                "docx": {
                    "filename": docx_filename,
                    "download_url": f"/api/documents/download/{doc_id}/docx"
                },
                "pdf": {
                    "filename": pdf_filename,
                    "download_url": f"/api/documents/download/{doc_id}/pdf"
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.get("/download/{doc_id}/{file_format}")
def download_document(doc_id: str, file_format: str):
    """Safely serves generated DOCX and PDF files with content-disposition."""
    target_path, filename = file_manager.get_file(doc_id, file_format)
    
    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf"
    }
    media_type = media_types.get(file_format.lower(), "application/octet-stream")
    
    return FileResponse(
        path=str(target_path),
        filename=filename,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/nlp/extract")
def extract_fields_from_nlp(request: NLPExtractRequest):
    """
    Deterministic natural-language extraction helper for event details.
    Extracts candidate fields from free text, validates dates and counts,
    and returns fields with confidence indicators for user confirmation.
    """
    text = request.text.strip()
    if not text:
        return {"extracted": {}, "confidence": {}}

    extracted: Dict[str, Any] = {}
    confidence: Dict[str, str] = {}

    # Event Name detection
    event_match = re.search(r"(?:organize|conducting|conduct|host|plan)\s+(?:an?\s+)?([A-Za-z0-9\s\-]+?)(?:\s+(?:on|at|for|in)|$)", text, re.IGNORECASE)
    if event_match:
        extracted["event_name"] = event_match.group(1).strip()
        confidence["event_name"] = "high"

    # Date detection (DD/MM/YYYY, YYYY-MM-DD, or DD Month YYYY)
    date_match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
    if not date_match:
        date_match = re.search(r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?)\b", text, re.IGNORECASE)
    if date_match:
        extracted["event_date"] = date_match.group(1)
        confidence["event_date"] = "high"

    # Venue detection
    venue_match = re.search(r"(?:at|venue|location|in)\s+([A-Za-z0-9\s,]+?(?:Hall|Lab|Department|Campus|SVNIT|Room|Auditorium)[A-Za-z0-9\s]*)", text, re.IGNORECASE)
    if venue_match:
        extracted["venue"] = venue_match.group(1).strip()
        confidence["venue"] = "high"
    elif "SVNIT" in text:
        extracted["venue"] = "SVNIT Surat"
        confidence["venue"] = "medium"

    # Participants detection
    part_match = re.search(r"(?:for|approx(?:imately)?|around|about)?\s*(\d+)\+?\s*(?:students|participants|members|attendees)", text, re.IGNORECASE)
    if part_match:
        extracted["participants"] = f"{part_match.group(1)}+"
        confidence["participants"] = "high"

    # Objective detection
    if len(text.split()) > 6:
        extracted["objective"] = f"To conduct {extracted.get('event_name', 'the event')} successfully for the benefit of participating students and members."
        confidence["objective"] = "medium"

    # Recommended Document Type
    recommended_type = "exec_meet"
    if any(k in text.lower() for k in ["bill", "certificate", "invoice", "recurring", "purchase"]):
        recommended_type = "bill_certificate"
    elif any(k in text.lower() for k in ["reimbursement", "prize", "summary", "hackathon prize", "bank details"]):
        recommended_type = "bill_summary"

    return {
        "text": text,
        "recommended_type": recommended_type,
        "extracted_fields": extracted,
        "confidence": confidence,
        "requires_confirmation": True
    }
