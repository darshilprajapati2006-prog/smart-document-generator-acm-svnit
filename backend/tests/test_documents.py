import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.services.executive_meet_service import ExecutiveMeetService
from app.services.bill_certificate_service import BillCertificateService
from app.services.bill_summary_service import BillSummaryService
from app.schemas.executive_meet import ExecutiveMeetRequest
from app.schemas.bill_certificate import BillCertificateRequest, BillItem
from app.schemas.bill_summary import BillSummaryRequest, BillSummaryRow

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "Smart Document Generator API" in data["message"]

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_list_templates():
    response = client.get("/api/documents/templates")
    assert response.status_code == 200
    data = response.json()
    assert "templates" in data
    ids = [t["id"] for t in data["templates"]]
    assert "exec_meet" in ids
    assert "bill_certificate" in ids
    assert "bill_summary" in ids

def test_executive_meet_generation(tmp_path):
    payload = {
        "ref_no": "ACM/26-27/ROOM/009",
        "date": "09/10/2026",
        "submitted_to": "HoD(CSE Dept.)",
        "subject": "Requesting Permission to Conduct ACM Executives Meet in Seminar Hall 402, CSE Department.",
        "event_name": "ACM Executives Meet",
        "venue": "Seminar Hall 402, CSE Department",
        "event_date": "15/10/2026",
        "time_from": "06:00 PM",
        "time_to": "07:30 PM",
        "brief_description": "ACM NIT Surat is organizing an Executive Meet to discuss the chapter vision and activities.",
        "objective": "To provide guidance to the ACM executive team on organizing events.",
        "participants": "150+",
        "mode": "Offline",
        "organizers": "ACM Core 2026-27"
    }
    response = client.post("/api/documents/executive-meet/generate", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert "document_id" in res_data
    assert "files" in res_data
    assert "docx" in res_data["files"]
    assert "pdf" in res_data["files"]

    doc_id = res_data["document_id"]
    # Download DOCX
    dl_docx = client.get(f"/api/documents/download/{doc_id}/docx")
    assert dl_docx.status_code == 200
    assert dl_docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert len(dl_docx.content) > 1000

    # Download PDF
    dl_pdf = client.get(f"/api/documents/download/{doc_id}/pdf")
    assert dl_pdf.status_code == 200
    assert dl_pdf.headers["content-type"] == "application/pdf"
    assert len(dl_pdf.content) > 1000

def test_executive_meet_validation():
    # Missing required fields like date, event_date, brief_description
    response = client.post("/api/documents/executive-meet/generate", json={})
    assert response.status_code == 422

def test_bill_certificate_calculation_and_generation():
    payload = {
        "chapter_name": "ACM",
        "code_no": "6/52",
        "approval_note_no": "ACM/2026-27/SIH/001",
        "date": "08/09/2026",
        "supplier_name": "Stationery & Tech Supplies Ltd.",
        "items": [
            {"name": "Item Alpha", "quantity": 2, "unit_cost": 250.0},
            {"name": "Item Beta", "quantity": 5, "unit_cost": 100.0}
        ],
        "taxes_or_other_charges": 50.0,
        "invoice_no_and_date": "INV-1029 dtd 08/09/2026"
    }
    # Expected subtotal: 2*250 + 5*100 = 500 + 500 = 1000.0
    # Expected grand total: 1000.0 + 50.0 = 1050.0
    response = client.post("/api/documents/bill-certificate/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    summary = data["calculation_summary"]
    assert summary["subtotal"] == 1000.0
    assert summary["taxes"] == 50.0
    assert summary["grand_total"] == 1050.0

    doc_id = data["document_id"]
    dl_docx = client.get(f"/api/documents/download/{doc_id}/docx")
    assert dl_docx.status_code == 200
    dl_pdf = client.get(f"/api/documents/download/{doc_id}/pdf")
    assert dl_pdf.status_code == 200

def test_bill_certificate_invalid_items():
    # Invalid quantity <= 0
    payload = {
        "chapter_name": "ACM",
        "date": "08/09/2026",
        "supplier_name": "Test Vendor",
        "items": [
            {"name": "Bad Item", "quantity": 0, "unit_cost": 100.0}
        ]
    }
    response = client.post("/api/documents/bill-certificate/generate", json=payload)
    assert response.status_code == 422

def test_bill_summary_multiple_recipients():
    payload = {
        "date": "09/10/2026",
        "title": "BILL SUMMARY",
        "subtitle": "SIH Internal Hackathon Prize Distributions",
        "rows": [
            {
                "name": "Team Codex",
                "account_details": "A/C: 1122334455, IFSC: SBIN0001234",
                "to_be_paid_to": "Ansh Gupta",
                "prize_money": 5000.0,
                "other_amount": 250.0,
                "account_no": "1122334455",
                "ifsc_code": "SBIN0001234"
            },
            {
                "name": "Team Algo",
                "account_details": "A/C: 9988776655, IFSC: HDFC0005678",
                "to_be_paid_to": "Arshad Khatib",
                "prize_money": 3000.0,
                "other_amount": 0.0,
                "account_no": "9988776655",
                "ifsc_code": "HDFC0005678"
            }
        ]
    }
    response = client.post("/api/documents/bill-summary/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    summary = data["calculation_summary"]
    # 5000 + 3000 = 8000 prize money
    # 250 + 0 = 250 other
    # Grand total = 8250.0
    assert summary["total_prize_money"] == 8000.0
    assert summary["total_other"] == 250.0
    assert summary["grand_total"] == 8250.0

    doc_id = data["document_id"]
    dl_docx = client.get(f"/api/documents/download/{doc_id}/docx")
    assert dl_docx.status_code == 200
    dl_pdf = client.get(f"/api/documents/download/{doc_id}/pdf")
    assert dl_pdf.status_code == 200

def test_invalid_download_id_and_format():
    response = client.get("/api/documents/download/non-existent-uuid/docx")
    assert response.status_code in [400, 404]

    response = client.get("/api/documents/download/12345678-1234-1234-1234-123456789abc/exe")
    assert response.status_code in [400, 404]

def test_nlp_extract_endpoint():
    text = "Conduct an ACM technical workshop on 15 November at Seminar Hall for 120 students."
    response = client.post("/api/documents/nlp/extract", json={"text": text})
    assert response.status_code == 200
    data = response.json()
    assert data["recommended_type"] == "exec_meet"
    assert "event_name" in data["extracted_fields"]
    assert "participants" in data["extracted_fields"]

def test_long_text_and_multipage():
    # Long text in executive meet to verify page safety
    long_desc = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 30
    long_obj = "Comprehensive practical hands-on workshop objective. " * 20
    payload = {
        "ref_no": "ACM/26-27/ROOM/099",
        "date": "09/10/2026",
        "submitted_to": "HoD(CSE Dept.)",
        "subject": "Requesting Permission for Extended Hackathon in Lab 402.",
        "event_name": "ACM Extended Hackathon 2026",
        "venue": "Seminar Hall 402 & CSE Lab 1",
        "event_date": "20/10/2026",
        "time_from": "09:00 AM",
        "time_to": "09:00 PM",
        "brief_description": long_desc,
        "objective": long_obj,
        "participants": "250+",
        "mode": "Hybrid",
        "organizers": "ACM SVNIT Chapter"
    }
    response = client.post("/api/documents/executive-meet/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Verify download of both
    doc_id = data["document_id"]
    r_docx = client.get(f"/api/documents/download/{doc_id}/docx")
    r_pdf = client.get(f"/api/documents/download/{doc_id}/pdf")
    assert r_docx.status_code == 200
    assert r_pdf.status_code == 200

def test_decimal_financial_accuracy():
    # Verify decimal prices and rounding: 3 * 33.33 = 99.99, tax = 18.01 -> 118.00
    payload = {
        "chapter_name": "ACM",
        "code_no": "6/52",
        "approval_note_no": "ACM/2026-27/NOTE/005",
        "date": "09/10/2026",
        "supplier_name": "Precision Tech Components",
        "items": [
            {"name": "Electronic Sensors", "quantity": 3, "unit_cost": 33.33}
        ],
        "taxes_or_other_charges": 18.01
    }
    response = client.post("/api/documents/bill-certificate/generate", json=payload)
    assert response.status_code == 200
    summary = response.json()["calculation_summary"]
    assert summary["subtotal"] == 99.99
    assert summary["taxes"] == 18.01
    assert summary["grand_total"] == 118.00

