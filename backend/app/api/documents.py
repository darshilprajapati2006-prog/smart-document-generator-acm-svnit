import re
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.schemas.executive_meet import ExecutiveMeetRequest
from app.schemas.bill_certificate import BillCertificateRequest
from app.schemas.bill_summary import BillSummaryRequest
from app.schemas.prize_money_receipt import PrizeMoneyReceiptRequest
from app.services.executive_meet_service import ExecutiveMeetService
from app.services.bill_certificate_service import BillCertificateService
from app.services.bill_summary_service import BillSummaryService
from app.services.prize_money_receipt_service import PrizeMoneyReceiptService
from app.utils.file_manager import file_manager, sanitize_filename

from app.core.template_registry import template_registry
from app.services.llm_extractor import is_llm_configured, extract_with_llm

from app.services.document_classifier import DocumentClassifier
from app.services.document_repository import DocumentRepository
from app.services.workflow_service import WorkflowService
from app.services.clause_service import ClauseService
from app.services.template_editor_service import TemplateEditorService
from app.services.batch_service import BatchService
from app.services.google_integration_service import GoogleIntegrationService
from app.services.email_distribution_service import EmailDistributionService
from app.services.signature_service import SignatureService
from app.services.analytics_service import AnalyticsService
from app.core.security import require_authenticated_user, require_role
from app.db.database import get_db

router = APIRouter(prefix="/documents", tags=["documents"])

def _assert_document_access(doc_id: str, user: Dict[str, Any], write: bool = False):
    doc = DocumentRepository.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    role = user.get("role")
    elevated_reader = role in {"admin", "reviewer", "approver", "template_admin"}
    owns = doc.get("user_id") == user.get("sub")
    if not owns and not elevated_reader:
        raise HTTPException(status_code=403, detail="You do not have access to this document.")
    if write and role not in {"author", "admin"}:
        raise HTTPException(status_code=403, detail="Your role cannot modify documents.")
    if write and role != "admin" and not owns:
        raise HTTPException(status_code=403, detail="You can modify only your own documents.")
    return doc

@router.get("/templates")
def list_templates():
    """List supported official templates and their field definitions."""
    return {
        "templates": template_registry.list_all()
    }

@router.get("/templates/{template_id}")
def get_template_details(template_id: str):
    """Retrieve full schema, labels, and required fields for a template."""
    tmpl = template_registry.get(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found.")
    return tmpl.to_dict()

@router.post("/executive-meet/generate")
def generate_executive_meet(data: ExecutiveMeetRequest, current_user: Dict[str, Any] = Depends(require_role(["author"]))):
    """Generates DOCX and PDF for Executive Meet permission request and persists version record."""
    t0 = time.time()
    user_id = current_user.get("sub")
    user_role = current_user.get("role")
    try:
        doc_id, session_dir = file_manager.create_session()
        
        safe_date = sanitize_filename(data.event_date.replace("/", "-"))
        docx_filename = f"Executive_Meet_{safe_date}.docx"
        pdf_filename = f"Executive_Meet_{safe_date}.pdf"
        
        docx_path = session_dir / docx_filename
        pdf_path = session_dir / pdf_filename
        
        ExecutiveMeetService.generate_docx(data, docx_path)
        ExecutiveMeetService.generate_pdf(data, pdf_path)

        duration_ms = round((time.time() - t0) * 1000, 2)
        
        # Persist document record and initial version
        doc_record = DocumentRepository.create_document(
            user_id=user_id,
            document_type="exec_meet",
            title=data.event_name,
            data=data.model_dump(),
            docx_path=str(docx_path),
            pdf_path=str(pdf_path),
            change_summary="Initial generation"
        )
        with get_db() as conn:
            conn.execute("INSERT INTO document_artifacts(artifact_id,document_id,user_id) VALUES(?,?,?)", (doc_id, doc_record["id"], user_id))
        
        AnalyticsService.record_event(
            event_type="document_generated",
            document_type="exec_meet",
            duration_ms=duration_ms,
            status="success",
            actor_role=user_role
        )
        
        return {
            "success": True,
            "document_id": doc_id,
            "repository_id": doc_record.get("id"),
            "document_type": "exec_meet",
            "title": data.event_name,
            "status": doc_record.get("status", "draft"),
            "current_version": doc_record.get("current_version", 1),
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
        duration_ms = round((time.time() - t0) * 1000, 2)
        AnalyticsService.record_event(
            event_type="document_generation_failed",
            document_type="exec_meet",
            duration_ms=duration_ms,
            status="failed",
            actor_role=user_role
        )
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/bill-certificate/generate")
def generate_bill_certificate(data: BillCertificateRequest, current_user: Dict[str, Any] = Depends(require_role(["author"]))):
    """Generates DOCX and PDF for Bill Certificate (Recurring Expenditure) and persists version record."""
    t0 = time.time()
    user_id = current_user.get("sub")
    user_role = current_user.get("role")
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
        
        duration_ms = round((time.time() - t0) * 1000, 2)

        doc_record = DocumentRepository.create_document(
            user_id=user_id,
            document_type="bill_certificate",
            title=f"Bill Certificate - {data.chapter_name}",
            data=data.model_dump(),
            docx_path=str(docx_path),
            pdf_path=str(pdf_path),
            change_summary="Initial generation"
        )
        with get_db() as conn:
            conn.execute("INSERT INTO document_artifacts(artifact_id,document_id,user_id) VALUES(?,?,?)", (doc_id, doc_record["id"], user_id))
        
        AnalyticsService.record_event(
            event_type="document_generated",
            document_type="bill_certificate",
            duration_ms=duration_ms,
            status="success",
            actor_role=user_role
        )

        return {
            "success": True,
            "document_id": doc_id,
            "repository_id": doc_record.get("id"),
            "document_type": "bill_certificate",
            "title": f"Bill Certificate - {data.chapter_name}",
            "status": doc_record.get("status", "draft"),
            "current_version": doc_record.get("current_version", 1),
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
        duration_ms = round((time.time() - t0) * 1000, 2)
        AnalyticsService.record_event(
            event_type="document_generation_failed",
            document_type="bill_certificate",
            duration_ms=duration_ms,
            status="failed",
            actor_role=user_role
        )
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/bill-summary/generate")
def generate_bill_summary(data: BillSummaryRequest, current_user: Dict[str, Any] = Depends(require_role(["author"]))):
    """Generates DOCX and PDF for Bill Summary and persists version record."""
    t0 = time.time()
    user_id = current_user.get("sub")
    user_role = current_user.get("role")
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
        
        duration_ms = round((time.time() - t0) * 1000, 2)

        doc_record = DocumentRepository.create_document(
            user_id=user_id,
            document_type="bill_summary",
            title=data.title,
            data=data.model_dump(),
            docx_path=str(docx_path),
            pdf_path=str(pdf_path),
            change_summary="Initial generation"
        )
        with get_db() as conn:
            conn.execute("INSERT INTO document_artifacts(artifact_id,document_id,user_id) VALUES(?,?,?)", (doc_id, doc_record["id"], user_id))
        
        AnalyticsService.record_event(
            event_type="document_generated",
            document_type="bill_summary",
            duration_ms=duration_ms,
            status="success",
            actor_role=user_role
        )

        return {
            "success": True,
            "document_id": doc_id,
            "repository_id": doc_record.get("id"),
            "document_type": "bill_summary",
            "title": data.title,
            "status": doc_record.get("status", "draft"),
            "current_version": doc_record.get("current_version", 1),
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
        duration_ms = round((time.time() - t0) * 1000, 2)
        AnalyticsService.record_event(
            event_type="document_generation_failed",
            document_type="bill_summary",
            duration_ms=duration_ms,
            status="failed",
            actor_role=user_role
        )
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/prize-money-receipt/generate")
def generate_prize_money_receipt(data: PrizeMoneyReceiptRequest, current_user: Dict[str, Any] = Depends(require_role(["author"]))):
    """Generates and stores the official-format ACM SVNIT prize money receipt."""
    t0 = time.time()
    user_id = current_user.get("sub")
    user_role = current_user.get("role")
    try:
        doc_id, session_dir = file_manager.create_session()
        safe_date = sanitize_filename(data.date.replace("/", "-"))
        docx_filename = f"Prize_Money_Receipt_{safe_date}.docx"
        pdf_filename = f"Prize_Money_Receipt_{safe_date}.pdf"
        docx_path = session_dir / docx_filename
        pdf_path = session_dir / pdf_filename
        PrizeMoneyReceiptService.generate_docx(data, docx_path)
        PrizeMoneyReceiptService.generate_pdf(data, pdf_path)
        duration_ms = round((time.time() - t0) * 1000, 2)

        doc_record = DocumentRepository.create_document(
            user_id=user_id,
            document_type="prize_money_receipt",
            title=f"Prize Money Receipt - {data.competition_name}",
            data=data.model_dump(mode="json"),
            docx_path=str(docx_path),
            pdf_path=str(pdf_path),
            change_summary="Initial generation",
        )
        with get_db() as conn:
            conn.execute("INSERT INTO document_artifacts(artifact_id,document_id,user_id) VALUES(?,?,?)", (doc_id, doc_record["id"], user_id))
        AnalyticsService.record_event(
            event_type="document_generated", document_type="prize_money_receipt",
            duration_ms=duration_ms, status="success", actor_role=user_role,
        )
        return {
            "success": True,
            "document_id": doc_id,
            "repository_id": doc_record.get("id"),
            "document_type": "prize_money_receipt",
            "title": f"Prize Money Receipt - {data.competition_name}",
            "status": doc_record.get("status", "draft"),
            "current_version": doc_record.get("current_version", 1),
            "files": {
                "docx": {"filename": docx_filename, "download_url": f"/api/documents/download/{doc_id}/docx"},
                "pdf": {"filename": pdf_filename, "download_url": f"/api/documents/download/{doc_id}/pdf"},
            },
        }
    except Exception:
        duration_ms = round((time.time() - t0) * 1000, 2)
        AnalyticsService.record_event(
            event_type="document_generation_failed", document_type="prize_money_receipt",
            duration_ms=duration_ms, status="failed", actor_role=user_role,
        )
        # Avoid including receipt/account data in server response errors.
        raise HTTPException(status_code=500, detail="Prize Money Receipt generation failed.")

@router.get("/download/{doc_id}/{file_format}")
def download_document(doc_id: str, file_format: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Safely serves generated DOCX and PDF files with content-disposition."""
    with get_db() as conn:
        artifact = conn.execute("SELECT user_id,document_id FROM document_artifacts WHERE artifact_id=?", (doc_id,)).fetchone()
    if not artifact:
        raise HTTPException(status_code=404, detail="Document not found.")
    document = _assert_document_access(artifact["document_id"], current_user)
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

class NLPExtractRequest(BaseModel):
    text: str
    document_type: Optional[str] = None

def parse_date(text: str) -> Optional[str]:
    # Check numeric patterns: DD/MM/YYYY or DD-MM-YYYY
    m = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
    if m:
        return m.group(1).replace("-", "/")

    months = {
        "jan": "January", "january": "January", "feb": "February", "february": "February",
        "mar": "March", "march": "March", "apr": "April", "april": "April",
        "may": "May", "jun": "June", "june": "June", "jul": "July", "july": "July",
        "aug": "August", "august": "August", "sep": "September", "september": "September",
        "oct": "October", "october": "October", "nov": "November", "november": "November",
        "dec": "December", "december": "December"
    }

    # Format: 28 October 2026 or 28th October 2026
    m2 = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?\b", text, re.IGNORECASE)
    if m2:
        day = m2.group(1).lstrip("0")
        mon_str = m2.group(2).lower()
        year = m2.group(3) or "2026"
        if mon_str in months:
            return f"{day} {months[mon_str]} {year}"

    # Format: October 28, 2026
    m3 = re.search(r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b", text, re.IGNORECASE)
    if m3:
        mon_str = m3.group(1).lower()
        day = m3.group(2).lstrip("0")
        year = m3.group(3)
        if mon_str in months:
            return f"{day} {months[mon_str]} {year}"

    return None

def parse_times(text: str):
    m = re.search(r"(?:from\s+)?(\d{1,2}(?::\d{2})?\s*[AaPp][Mm])\s+(?:to|-|until|and)\s+(\d{1,2}(?::\d{2})?\s*[AaPp][Mm])", text)
    if not m:
        m = re.search(r"between\s+(\d{1,2}(?::\d{2})?\s*[AaPp][Mm])\s+and\s+(\d{1,2}(?::\d{2})?\s*[AaPp][Mm])", text, re.IGNORECASE)
    if m:
        def fmt(t):
            t = t.strip()
            ampm = "AM" if "a" in t.lower() else "PM"
            num_part = re.sub(r"[^0-9:]", "", t)
            if ":" in num_part:
                h, mins = num_part.split(":", 1)
            else:
                h, mins = num_part, "00"
            h_val = int(h) if h.isdigit() else 0
            return f"{h_val}:{mins.zfill(2)} {ampm}"
        return fmt(m.group(1)), fmt(m.group(2))
    return None, None

def clean_title(title: str) -> str:
    minor_words = {"and", "or", "the", "a", "an", "of", "for", "in", "on", "at", "to", "by"}
    words = title.split()
    cleaned = []
    for i, w in enumerate(words):
        if w.isupper():
            cleaned.append(w)
        elif i > 0 and w.lower() in minor_words:
            cleaned.append(w.lower())
        else:
            cleaned.append(w.capitalize())
    return " ".join(cleaned)

def extract_event_name(text: str) -> Optional[str]:
    # 1. Quoted title check
    m_quoted = re.search(r"(?:titled|entitled|named|called)\s+['\"“]([^'\"”]+)['\"”]", text, re.IGNORECASE)
    if not m_quoted:
        m_quoted = re.search(r"title(?:\s+is)?\s*[:\-]?\s*['\"“]([^'\"”]+)['\"”]", text, re.IGNORECASE)
    if not m_quoted:
        m_quoted = re.search(r"['\"“]([^'\"”]+)['\"”]\s+(?:workshop|event|conference|seminar|meet|session)", text, re.IGNORECASE)
    if m_quoted:
        return m_quoted.group(1).strip()

    # 2. Explicit unquoted title following 'titled / named / entitled'
    m_named = re.search(r"(?:is\s+)?(?:titled|entitled|named|called)\s+([A-Z][A-Za-z0-9\s\-]+?)(?:\s+(?:and\s+will|will|on|at|scheduled|for)|\.|$|\n)", text)
    if m_named:
        name = m_named.group(1).strip()
        if len(name) > 3:
            return clean_title(name)

    # 3. Action phrasing: "organize / conducting / conduct / host / plan an? <name>"
    ev_m = re.search(r"(?:organize|organizing|conducting|conduct|host|hosting|plan|planning)\s+(?:an?\s+)?([A-Za-z0-9\s\-]+?)(?:\.|\s+(?:on|at|for|from|in|with|by)|$)", text, re.IGNORECASE)
    if ev_m:
        name = ev_m.group(1).strip()
        name_clean = clean_title(name)
        if name_clean:
            return name_clean

    return None

def extract_venue(text: str) -> Optional[str]:
    vm = re.search(
        r"\b(?:at|in|venue(?:\s+is)?\s*[:\-]?)\s+(?:the\s+)?([A-Za-z0-9\s,/\-]+?(?:Hall(?:\s+\d+)?|Lab(?:\s+\d+)?|Department|Campus|SVNIT(?:\s+Surat)?|Room(?:\s+\d+)?|Auditorium|Center|Centre)[A-Za-z0-9\s,/\-]*)",
        text,
        re.IGNORECASE
    )
    if vm:
        v = vm.group(1).strip()
        v = re.sub(r"^(?:the|The)\s+", "", v)
        v_clean = re.split(r"\s+(?:for|on|from|with|dated)\s+", v, flags=re.IGNORECASE)[0]
        v_clean = v_clean.strip(" .,\n\r\t")
        if v_clean:
            return v_clean
    return None

def extract_participants(text: str) -> Optional[str]:
    # Pattern A: Number after keyword (e.g. "expected number of participants is 100", "participants: 100")
    m_after = re.search(
        r"(?:expected\s+(?:number\s+of\s+)?(?:participants|attendees|students|members)|participants(?:\s+count)?|attendance)\s*(?:is|are|of|to\s+be|:)?\s*(?:around|approx(?:imately)?|about)?\s*(\d+)\+?",
        text,
        re.IGNORECASE
    )
    if m_after:
        return m_after.group(1)

    # Pattern B: Number before keyword (e.g. "for 120 students", "approx 100 participants")
    m_before = re.search(
        r"(?:for|approx(?:imately)?|around|about)?\s*(\d+)\+?\s*(?:students|participants|members|attendees|delegates)",
        text,
        re.IGNORECASE
    )
    if m_before:
        return m_before.group(1)

    return None

def extract_organizers(text: str) -> Optional[str]:
    m = re.search(
        r"(?:organized|conducted|hosted)\s+by\s+(?:the\s+)?([A-Za-z0-9\s\-,&]+?)(?:\.|\n|(?:\s+and\s+(?:will|is))|(?:\s+(?:for|on|at|with)\s+)|$)",
        text,
        re.IGNORECASE
    )
    if not m:
        m = re.search(
            r"organizing\s+(?:club|chapter|team|committee|body)(?:\s+is)?\s*[:\-]?\s*([A-Za-z0-9\s\-,&]+?)(?:\.|\n|$)",
            text,
            re.IGNORECASE
        )
    if m:
        org = m.group(1).strip()
        org_clean = org.strip(" .,\n\r\t")
        if org_clean and not any(coord_word in org_clean.lower() for coord_word in ["coordinated by"]):
            return org_clean
    return None

def extract_coordinator(text: str) -> Optional[str]:
    m = re.search(
        r"(?:coordinated\s+by|coordinator(?:\s+is)?\s*[:\-]?\s*|student\s+lead(?:\s+is)?\s*[:\-]?\s*|led\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
        text
    )
    if m:
        return m.group(1).strip()
    return None

def extract_brief_description(text: str) -> Optional[str]:
    # 1. Look for explicit session/workshop coverage sentence
    m_cover = re.search(
        r"(?:The\s+(?:session|workshop|event|meet)\s+will\s+cover|The\s+(?:session|workshop|event|meet)\s+covers|will\s+cover|covering)\s+([^.?!]+[.?!]?)",
        text,
        re.IGNORECASE
    )
    if m_cover:
        content = m_cover.group(1).strip()
        clean_content = content.rstrip(" .")
        return f"A workshop covering {clean_content}."

    # 2. Explicit description prefix
    m_desc = re.search(
        r"(?:brief\s+description|description|about\s+the\s+event)[:\-]?\s*([^.\n]+(?:\.[^.\n]+)?)",
        text,
        re.IGNORECASE
    )
    if m_desc:
        return m_desc.group(1).strip()

    # 3. Purpose sentence e.g. "ACM NIT Surat is organizing an Executive Meet to discuss ..."
    m_purpose = re.search(
        r"([A-Za-z0-9\s\-]+?\s+is\s+organizing\s+[A-Za-z0-9\s\-]+?\s+to\s+[^.?!]+[.?!])",
        text,
        re.IGNORECASE
    )
    if m_purpose:
        return m_purpose.group(1).strip()

    return None

@router.post("/nlp/extract")
def extract_fields_from_nlp(request: NLPExtractRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """
    Deterministic natural-language extraction helper.
    Extracts only fields explicitly mentioned or unambiguously inferable from the prompt.
    Does NOT fabricate missing administrative, banking, or signatory details.
    """
    text = request.text.strip()
    if not text:
        rec_type = request.document_type or "exec_meet"
        tmpl = template_registry.get(rec_type)
        missing_all = tmpl.get_missing_required_fields({}) if tmpl else []
        return {
            "text": "",
            "recommended_type": rec_type,
            "extracted_fields": {},
            "missing_required_fields": missing_all,
            "items": [],
            "recipients": [],
            "confidence": {},
            "requires_confirmation": True,
            "llm_fallback_available": is_llm_configured(),
            "extractor_used": "none"
        }

    extracted: Dict[str, Any] = {}
    confidence: Dict[str, str] = {}
    items: list = []
    recipients: list = []
    calc_summary: Dict[str, Any] = {}

    lower_text = text.lower()

    # Determine recommended document type
    if request.document_type in ["exec_meet", "bill_certificate", "bill_summary"]:
        recommended_type = request.document_type
    elif any(k in lower_text for k in ["bill certificate", "purchas", "notebooks", "stationery", "pen sets", "unit price", "supplier is"]):
        recommended_type = "bill_certificate"
    elif any(k in lower_text for k in ["reimbursement", "students:", "for travel", "for printing", "prize distribution", "bill summary"]):
        recommended_type = "bill_summary"
    else:
        recommended_type = "exec_meet"

    # --- 1. EXECUTIVE MEET EXTRACTION ---
    if recommended_type == "exec_meet":
        ev_name = extract_event_name(text)
        if ev_name:
            extracted["event_name"] = ev_name
            confidence["event_name"] = "high"

        ev_date = parse_date(text)
        if ev_date:
            extracted["event_date"] = ev_date
            confidence["event_date"] = "high"

        t1, t2 = parse_times(text)
        if t1 and t2:
            extracted["time_from"] = t1
            extracted["time_to"] = t2
            extracted["start_time"] = t1
            extracted["end_time"] = t2
            confidence["time_from"] = "high"
            confidence["time_to"] = "high"

        venue = extract_venue(text)
        if venue:
            extracted["venue"] = venue
            confidence["venue"] = "high"

        participants = extract_participants(text)
        if participants:
            extracted["participants"] = participants
            extracted["expected_participants"] = participants
            confidence["participants"] = "high"

        organizers = extract_organizers(text)
        if organizers:
            extracted["organizers"] = organizers
            extracted["organizing_club"] = organizers
            confidence["organizers"] = "high"

        coordinator = extract_coordinator(text)
        if coordinator:
            extracted["lead_name"] = coordinator
            extracted["coordinator"] = coordinator
            confidence["lead_name"] = "high"

        brief_desc = extract_brief_description(text)
        if brief_desc:
            extracted["brief_description"] = brief_desc
            confidence["brief_description"] = "high"

        # Mode of conduct (ONLY when explicitly stated)
        if "online" in lower_text:
            extracted["mode"] = "Online"
            extracted["mode_of_conduct"] = "Online"
            confidence["mode"] = "high"
        elif "hybrid" in lower_text:
            extracted["mode"] = "Hybrid"
            extracted["mode_of_conduct"] = "Hybrid"
            confidence["mode"] = "high"
        elif "offline" in lower_text:
            extracted["mode"] = "Offline"
            extracted["mode_of_conduct"] = "Offline"
            confidence["mode"] = "high"

    # --- 2. BILL CERTIFICATE EXTRACTION ---
    elif recommended_type == "bill_certificate":
        item_pattern = re.compile(r"(\d+)\s+([A-Za-z\s\-]+?)\s+(?:at|@)\s+(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:each|per\s+[A-Za-z]+)?", re.IGNORECASE)
        for m in item_pattern.finditer(text):
            qty = int(m.group(1))
            name = m.group(2).strip()
            name_clean = " ".join([w.capitalize() for w in name.split()])
            unit_cost = float(m.group(3))
            tot = round(qty * unit_cost, 2)
            items.append({
                "name": name_clean,
                "quantity": qty,
                "unit_cost": unit_cost,
                "total_cost": tot
            })

        sup_m = re.search(r"(?:from|supplier(?:\s+is)?)\s+([A-Za-z0-9\s&]+?(?:Stationery|Prints|Services|Enterprises|Supplies|Stores|Store|Vendor|Supplier|Ltd|Pvt\s+Ltd|Traders|Solutions|[A-Z][a-z]+))(?:\.|$|,|and)", text, re.IGNORECASE)
        if sup_m:
            supplier = sup_m.group(1).strip()
            extracted["supplier_name"] = supplier
            confidence["supplier_name"] = "high"

        d = parse_date(text)
        if d:
            extracted["date"] = d

        # Activity or title context if mentioned
        act_m = re.search(r"for\s+(?:an?\s+)?([A-Za-z0-9\s\-]+?(?:event|hackathon|workshop|meet|activity))", text, re.IGNORECASE)
        if act_m:
            extracted["title"] = f"Bill Certificate - {act_m.group(1).strip()}"

        if items:
            subtotal = round(sum(i["total_cost"] for i in items), 2)
            calc_summary = {
                "subtotal": subtotal,
                "taxes": 0.0,
                "grand_total": subtotal,
                "item_count": len(items)
            }

    # --- 3. BILL SUMMARY EXTRACTION ---
    elif recommended_type == "bill_summary":
        search_part = text.split(":")[-1] if ":" in text else text
        pattern = re.compile(r"(?:and\s+)?([A-Z][a-z]+)\s+(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:for\s+([A-Za-z\s]+?))?(?:,\s*|\s+and\s+|$|\.)", re.IGNORECASE)
        for m in pattern.finditer(search_part):
            name = m.group(1).strip()
            amt = float(m.group(2))
            purpose = m.group(3).strip() if m.group(3) else ""
            if name.lower() not in ["students", "three", "two", "four", "rs", "inr"]:
                recipients.append({
                    "name": name,
                    "prize_money": amt,
                    "other_amount": 0.0,
                    "account_details": f"Reimbursement for {purpose}" if purpose else "",
                    "to_be_paid_to": name,
                    "account_no": "",
                    "ifsc_code": ""
                })

        d = parse_date(text)
        if d:
            extracted["date"] = d

        act_m = re.search(r"(?:reimbursement summary for|summary for)\s+([A-Za-z0-9\s\-]+?)(?::|\.|$)", text, re.IGNORECASE)
        if act_m:
            extracted["subtitle"] = f"Reimbursement for {act_m.group(1).strip()}"

        if recipients:
            total_amt = round(sum(r["prize_money"] for r in recipients), 2)
            calc_summary = {
                "grand_total": total_amt,
                "recipient_count": len(recipients)
            }

    tmpl = template_registry.get(recommended_type)
    missing_fields = tmpl.get_missing_required_fields(extracted) if tmpl else []

    extractor_used = "deterministic"
    # Optional LLM fallback when deterministic extraction yielded minimal data
    if is_llm_configured() and len(extracted) < 2:
        try:
            llm_result = extract_with_llm(text, recommended_type)
            if llm_result and isinstance(llm_result, dict):
                for k, v in llm_result.items():
                    if k not in extracted and v is not None and str(v).strip():
                        extracted[k] = v
                        confidence[k] = "medium"
                extractor_used = "llm_fallback"
                if tmpl:
                    missing_fields = tmpl.get_missing_required_fields(extracted)
        except Exception:
            pass

    return {
        "text": text,
        "recommended_type": recommended_type,
        "extracted_fields": extracted,
        "missing_required_fields": missing_fields,
        "items": items,
        "recipients": recipients,
        "calculation_summary": calc_summary,
        "confidence": confidence,
        "requires_confirmation": True,
        "llm_fallback_available": is_llm_configured(),
        "extractor_used": extractor_used
    }

# ============================================================
# FEATURE 1: AUTOMATIC DOCUMENT-TYPE DETECTION ROUTE
# ============================================================

class ClassifyRequest(BaseModel):
    prompt: str
    explicitly_selected: Optional[str] = None

@router.post("/classify")
def classify_prompt(req: ClassifyRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """
    Feature 1: Automatic Document-Type Detection.
    Classifies prompt to recommend optimal document type with confidence scoring and ambiguity detection.
    """
    result = DocumentClassifier.classify(req.prompt, req.explicitly_selected)
    return result

# ============================================================
# FEATURE 3: BATCH DOCUMENT GENERATION ROUTES
# ============================================================

class BatchJobPayload(BaseModel):
    job_id: Optional[str] = None
    document_type: str
    payload: Dict[str, Any]

class BatchGenerateRequest(BaseModel):
    jobs: List[BatchJobPayload]

@router.post("/batch/generate")
def batch_generate(req: BatchGenerateRequest, current_user: Dict[str, Any] = Depends(require_role(["author"]))):
    """
    Feature 3: Batch Document Generation.
    Executes multiple document jobs in isolation with per-job status and zip bundle creation.
    """
    user_id = current_user.get("sub")
    raw_jobs = [{"job_id": j.job_id, "document_type": j.document_type, "payload": j.payload} for j in req.jobs]
    res = BatchService.process_batch(raw_jobs, user_id=user_id)
    if res.get("zip_download_url"):
        with get_db() as conn:
            conn.execute("INSERT INTO batch_artifacts(batch_id,user_id) VALUES(?,?)", (res["batch_id"], user_id))
    AnalyticsService.record_event("batch_generated", None, None, "success", current_user.get("role"))
    return res

@router.get("/batch/{batch_id}/zip")
def download_batch_zip(batch_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Serves the generated batch ZIP archive."""
    try:
        with get_db() as conn:
            ownership = conn.execute("SELECT user_id FROM batch_artifacts WHERE batch_id=?", (batch_id,)).fetchone()
        if not ownership:
            raise HTTPException(status_code=404, detail="Batch archive not found.")
        if ownership["user_id"] != current_user.get("sub") and current_user.get("role") not in {"admin", "reviewer", "approver"}:
            raise HTTPException(status_code=403, detail="You do not have access to this batch archive.")
        zip_p = BatchService.get_batch_zip(batch_id)
        return FileResponse(
            path=str(zip_p),
            filename=zip_p.name,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_p.name}"'}
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Batch archive '{batch_id}' not found.")

# ============================================================
# FEATURE 4: DOCUMENT VERSION HISTORY ROUTES
# ============================================================

@router.get("/history/list")
def list_documents_history(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 4: Lists all saved documents with current versions."""
    user_id = current_user.get("sub")
    role = current_user.get("role")
    docs = DocumentRepository.list_documents(user_id=user_id, role=role)
    return {"documents": docs}

@router.get("/{doc_id}/versions")
def get_document_versions(doc_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 4: Lists all versions of a document."""
    doc = _assert_document_access(doc_id, current_user)
    versions = DocumentRepository.list_versions(doc_id)
    return {"document_id": doc_id, "versions": versions}

@router.get("/{doc_id}/versions/{version_num}")
def get_document_version_detail(doc_id: str, version_num: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    _assert_document_access(doc_id, current_user)
    """Feature 4: Retrieves source data and artifact details for a specific version."""
    v = DocumentRepository.get_version_detail(doc_id, version_num)
    if not v:
        raise HTTPException(status_code=404, detail=f"Version {version_num} for document '{doc_id}' not found.")
    return v

@router.get("/{doc_id}/download/pdf")
def download_approved_document_pdf(doc_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Downloads the current approved version's stored PDF after document access checks."""
    doc = _assert_document_access(doc_id, current_user)
    if doc.get("status") != "approved":
        raise HTTPException(status_code=409, detail="PDF download is available after the current document version is approved.")

    version = doc.get("latest_version") or {}
    stored_pdf_path = version.get("pdf_path")
    if not stored_pdf_path:
        raise HTTPException(status_code=404, detail="The approved document PDF is unavailable. Generate a new version to create its PDF.")

    pdf_path = Path(stored_pdf_path).resolve()
    storage_root = file_manager.base_dir.resolve()
    if not pdf_path.is_relative_to(storage_root) or not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="The approved document PDF is unavailable. Generate a new version to create its PDF.")
    try:
        with pdf_path.open("rb") as pdf_file:
            if pdf_file.read(5) != b"%PDF-":
                raise HTTPException(status_code=404, detail="The stored PDF is invalid or unavailable. Generate a new version to create its PDF.")
    except OSError:
        raise HTTPException(status_code=404, detail="The approved document PDF is unavailable. Generate a new version to create its PDF.")

    return FileResponse(
        path=str(pdf_path),
        filename=pdf_path.name,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pdf_path.name}"'},
    )

@router.post("/{doc_id}/versions/{version_num}/restore")
def restore_document_version(doc_id: str, version_num: int, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 4: Restores a previous version as a new version, preserving history."""
    _assert_document_access(doc_id, current_user, write=True)
    user_id = current_user.get("sub")
    try:
        updated = DocumentRepository.restore_version(doc_id, version_num, user_id=user_id)
        return {
            "success": True,
            "message": f"Successfully restored version {version_num} as new version {updated['current_version']}.",
            "document": updated
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ============================================================
# FEATURE 5: APPROVAL / REVIEW WORKFLOW ROUTES
# ============================================================

class WorkflowTransitionRequest(BaseModel):
    target_status: str
    comment: Optional[str] = None

@router.post("/{doc_id}/workflow/transition")
def transition_workflow_status(
    doc_id: str,
    req: WorkflowTransitionRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    Feature 5: Approval / Review Workflow.
    Executes role-authorized state transition with audit log.
    """
    _assert_document_access(doc_id, current_user)
    try:
        res = WorkflowService.transition(
            doc_id=doc_id,
            target_status=req.target_status,
            actor=current_user,
            comment=req.comment
        )
        AnalyticsService.record_event("workflow_transition", None, None, "success", current_user.get("role"))
        return res
    except (ValueError, PermissionError) as e:
        status_code = 403 if isinstance(e, PermissionError) else 400
        raise HTTPException(status_code=status_code, detail=str(e))

@router.get("/{doc_id}/workflow/history")
def get_workflow_audit_history(doc_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 5: Retrieves audit history of all approval actions and comments."""
    _assert_document_access(doc_id, current_user)
    history = WorkflowService.get_history(doc_id)
    return {"document_id": doc_id, "history": history}

# ============================================================
# FEATURE 6: REUSABLE CLAUSES AND DOCUMENT SECTIONS ROUTES
# ============================================================

class ClauseCreateRequest(BaseModel):
    name: str
    category: str
    applicable_types: str
    content: str
    variables: Optional[List[str]] = None
    approval_status: Optional[str] = "sample_draft"

class ClauseUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    applicable_types: Optional[str] = None
    content: Optional[str] = None
    variables: Optional[List[str]] = None
    approval_status: Optional[str] = None
    active: Optional[bool] = None

class ClauseInterpolateRequest(BaseModel):
    clause_id: Optional[str] = None
    content: Optional[str] = None
    context: Dict[str, Any]

@router.get("/clauses")
@router.get("/clauses/list")
def list_reusable_clauses(document_type: Optional[str] = None):
    """Feature 6: Lists pre-approved reusable clauses."""
    return {"clauses": ClauseService.list_clauses(document_type=document_type)}

@router.post("/clauses/create")
def create_reusable_clause(
    req: ClauseCreateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["template_admin", "admin"]))
):
    """Feature 6: Creates a new reusable clause (Requires Template Admin or Admin)."""
    created = ClauseService.create_clause(
        name=req.name,
        category=req.category,
        applicable_types=req.applicable_types,
        content=req.content,
        variables=req.variables,
        approval_status=req.approval_status
    )
    return created

@router.put("/clauses/{clause_id}")
def update_reusable_clause(
    clause_id: str,
    req: ClauseUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["template_admin", "admin"]))
):
    """Feature 6: Updates an existing clause."""
    updated = ClauseService.update_clause(
        clause_id=clause_id,
        name=req.name,
        category=req.category,
        applicable_types=req.applicable_types,
        content=req.content,
        variables=req.variables,
        approval_status=req.approval_status,
        active=req.active
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Clause '{clause_id}' not found.")
    return updated

@router.post("/clauses/interpolate")
def interpolate_clause_variables(req: ClauseInterpolateRequest, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 6: Safely substitutes variables into a clause without code execution."""
    content = req.content
    if not content and req.clause_id:
        c = ClauseService.get_clause(req.clause_id)
        if not c:
            raise HTTPException(status_code=404, detail=f"Clause '{req.clause_id}' not found.")
        content = c["content"]
    
    if not content:
        raise HTTPException(status_code=400, detail="Clause content or clause_id must be provided.")

    return ClauseService.interpolate(content, req.context)

# ============================================================
# FEATURE 7: UPDATE EXISTING DOCUMENTS WHEN SOURCE INFO CHANGES
# ============================================================

class UpdateDocumentSourceRequest(BaseModel):
    data: Dict[str, Any]
    change_summary: Optional[str] = "Source information revised"

@router.put("/{doc_id}")
def update_document_source(
    doc_id: str,
    req: UpdateDocumentSourceRequest,
    current_user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """
    Feature 7: Update Existing Documents When Source Information Changes.
    Validates updated source data, regenerates DOCX/PDF, recalculates totals,
    increments version, and sets status to draft/review if previously approved.
    """
    user_id = current_user.get("sub")
    _assert_document_access(doc_id, current_user, write=True)
    doc = DocumentRepository.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")

    doc_type = doc["document_type"]
    new_data = req.data

    try:
        # Create session files for new version
        new_doc_id, session_dir = file_manager.create_session()
        title = doc["title"]
        
        if doc_type == "exec_meet":
            validated = ExecutiveMeetRequest(**new_data)
            title = validated.event_name
            safe_d = sanitize_filename(validated.event_date.replace("/", "-"))
            docx_p = session_dir / f"Executive_Meet_{safe_d}.docx"
            pdf_p = session_dir / f"Executive_Meet_{safe_d}.pdf"
            ExecutiveMeetService.generate_docx(validated, docx_p)
            ExecutiveMeetService.generate_pdf(validated, pdf_p)
            final_data = validated.model_dump()
        elif doc_type == "bill_certificate":
            validated = BillCertificateRequest(**new_data)
            safe_d = sanitize_filename(validated.date.replace("/", "-"))
            docx_p = session_dir / f"Bill_Certificate_{safe_d}.docx"
            pdf_p = session_dir / f"Bill_Certificate_{safe_d}.pdf"
            BillCertificateService.generate_docx(validated, docx_p)
            BillCertificateService.generate_pdf(validated, pdf_p)
            final_data = validated.model_dump()
        elif doc_type == "bill_summary":
            validated = BillSummaryRequest(**new_data)
            title = validated.title
            safe_d = sanitize_filename(validated.date.replace("/", "-"))
            docx_p = session_dir / f"Bill_Summary_{safe_d}.docx"
            pdf_p = session_dir / f"Bill_Summary_{safe_d}.pdf"
            BillSummaryService.generate_docx(validated, docx_p)
            BillSummaryService.generate_pdf(validated, pdf_p)
            final_data = validated.model_dump()
        elif doc_type == "prize_money_receipt":
            validated = PrizeMoneyReceiptRequest(**new_data)
            title = f"Prize Money Receipt - {validated.competition_name}"
            safe_d = sanitize_filename(validated.date.replace("/", "-"))
            docx_p = session_dir / f"Prize_Money_Receipt_{safe_d}.docx"
            pdf_p = session_dir / f"Prize_Money_Receipt_{safe_d}.pdf"
            PrizeMoneyReceiptService.generate_docx(validated, docx_p)
            PrizeMoneyReceiptService.generate_pdf(validated, pdf_p)
            final_data = validated.model_dump(mode="json")
        else:
            raise ValueError(f"Unknown document type: '{doc_type}'")

        updated_doc = DocumentRepository.update_document_version(
            doc_id=doc_id,
            user_id=user_id,
            new_data=final_data,
            docx_path=str(docx_p),
            pdf_path=str(pdf_p),
            change_summary=req.change_summary or "Source data updated",
            title=title
        )

        return {
            "success": True,
            "document": updated_doc,
            "message": f"Document updated to version {updated_doc['current_version']}."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Update failed: {str(e)}")

# ============================================================
# FEATURE 8: TEMPLATE PREVIEW / EDITOR ROUTES
# ============================================================

class TemplateConfigUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    section_ordering: Optional[List[str]] = None
    labels: Optional[Dict[str, str]] = None
    branding: Optional[Dict[str, Any]] = None
    optional_sections: Optional[List[str]] = None

@router.get("/templates-config/list")
def list_template_configs():
    """Feature 8: Lists template configurations."""
    return {"configs": TemplateEditorService.list_template_configs()}

@router.get("/templates-config/{template_id}/preview")
def preview_template_configuration(template_id: str):
    """Feature 8: Returns sample data preview with active configuration."""
    try:
        return TemplateEditorService.get_preview(template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/templates-config/{template_id}")
def update_template_configuration(
    template_id: str,
    req: TemplateConfigUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["template_admin", "admin"]))
):
    """Feature 8: Updates template settings (Requires Template Admin or Admin)."""
    updated = TemplateEditorService.update_template_config(
        template_id=template_id,
        display_name=req.display_name,
        section_ordering=req.section_ordering,
        labels=req.labels,
        branding=req.branding,
        optional_sections=req.optional_sections
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Template configuration '{template_id}' not found.")
    return updated

# ============================================================
# FEATURES 10 & 11: GOOGLE DRIVE, SHEETS & EMAIL INTEGRATION
# ============================================================

@router.get("/integrations/status")
def get_integrations_status(current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Features 10 & 11: Reports live status of Google and Email integrations."""
    return {
        "google": GoogleIntegrationService.get_status(),
        "email": {
            "configured": EmailDistributionService.is_configured(),
            "status": "ready" if EmailDistributionService.is_configured() else "unconfigured",
            "message": "SMTP credentials active." if EmailDistributionService.is_configured() else "SMTP not configured. Dispatches will be simulated locally."
        }
    }

class ExportDriveRequest(BaseModel):
    file_format: Optional[str] = "pdf"

@router.post("/{doc_id}/export/google-drive")
def export_document_to_google_drive(doc_id: str, req: ExportDriveRequest, current_user: Dict[str, Any] = Depends(require_role(["author", "reviewer", "approver"]))):
    """Feature 10: Exports document to Google Drive."""
    _assert_document_access(doc_id, current_user)
    try:
        return GoogleIntegrationService.export_to_drive(doc_id, file_format=req.file_format or "pdf")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{doc_id}/export/google-sheets")
def export_document_to_google_sheets(doc_id: str, current_user: Dict[str, Any] = Depends(require_role(["author", "reviewer", "approver"]))):
    """Feature 10: Appends document record to Google Sheets."""
    _assert_document_access(doc_id, current_user)
    try:
        return GoogleIntegrationService.export_to_sheets(doc_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

class DistributeEmailRequest(BaseModel):
    recipients: List[str]
    subject: str
    message: str
    file_format: Optional[str] = "pdf"

@router.post("/{doc_id}/distribute/email")
def distribute_document_email(
    doc_id: str,
    req: DistributeEmailRequest,
    current_user: Dict[str, Any] = Depends(require_role(["author", "reviewer", "approver"]))
):
    """Feature 11: Distributes document via email with validation and audit logging."""
    _assert_document_access(doc_id, current_user)
    sender = current_user
    try:
        return EmailDistributionService.send_document(
            doc_id=doc_id,
            recipients=req.recipients,
            subject=req.subject,
            message=req.message,
            sender=sender,
            file_format=req.file_format or "pdf"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============================================================
# FEATURE 12: DIGITAL SIGNATURES ROUTES
# ============================================================

@router.post("/{doc_id}/signatures/sign")
def sign_document_version(
    doc_id: str,
    version_num: Optional[int] = None,
    current_user: Dict[str, Any] = Depends(require_role(["approver"]))
):
    """Feature 12: Cryptographically signs document version using HMAC-SHA256."""
    doc = _assert_document_access(doc_id, current_user)
    target_v = version_num or doc["current_version"]
    try:
        return SignatureService.sign_document_version(doc_id, target_v, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{doc_id}/signatures/verify")
def verify_document_signature(doc_id: str, version_num: Optional[int] = None, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Feature 12: Verifies cryptographic signature and detects payload tampering."""
    doc = _assert_document_access(doc_id, current_user)
    target_v = version_num or doc["current_version"]
    return SignatureService.verify_signature(doc_id, target_v)

# ============================================================
# FEATURE 13: USAGE ANALYTICS ROUTES
# ============================================================

@router.get("/analytics/dashboard")
def get_analytics_dashboard(
    document_type: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_role(["admin", "template_admin"]))
):
    """Feature 13: Usage Analytics Dashboard."""
    return AnalyticsService.get_dashboard_metrics(document_type=document_type)

# Detail route placed at end to prevent collision with literal subpaths
@router.get("/{doc_id}")
def get_document_details(doc_id: str, current_user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Retrieves document record and latest version details."""
    doc = _assert_document_access(doc_id, current_user)
    return doc
