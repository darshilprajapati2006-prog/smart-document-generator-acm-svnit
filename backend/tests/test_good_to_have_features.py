"""
Comprehensive automated tests for all 14 Good to Have features.
Covers:
1. Automatic Document-Type Detection
2. Conditional / Dynamic Document Sections
3. Batch Document Generation
4. Document Version History
5. Approval / Review Workflow
6. Reusable Clauses and Document Sections
7. Update Existing Documents when source info changes
8. Template Preview / Editor
9. Role-Based Access Control (RBAC)
10. Google Drive & Sheets Integration (mocked & status)
11. Email Distribution (mocked & validation)
12. Digital Signatures & Tamper Detection
13. Usage Analytics Dashboard
14. Multilingual & Unicode text safety
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token

client = TestClient(app, headers={"Authorization": "Bearer test-firebase:usr-author-01:author@svnit.acm.org:1"})

# Helper tokens for testing roles
def get_auth_header(role="author", user_id="usr-author-01", name="Test User"):
    from app.db.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT email,full_name FROM users WHERE id=?", (user_id,)).fetchone()
    email = row["email"] if row else f"{role}@svnit.acm.org"
    token = create_access_token(user_id, email, role, name)
    return {"Authorization": f"Bearer {token}"}

# ============================================================
# FEATURE 1: AUTOMATIC DOCUMENT-TYPE DETECTION
# ============================================================

def test_classifier_event_prompt_recommends_exec_meet():
    prompt = "We are organizing a 2-day Machine Learning and AI workshop in Seminar Hall 402 on 28 October 2026."
    res = client.post("/api/documents/classify", json={"prompt": prompt})
    assert res.status_code == 200
    data = res.json()
    assert data["recommended_type"] == "exec_meet"
    assert data["confidence"] in ["high", "medium"]
    assert not data["is_ambiguous"]

def test_classifier_bill_prompt_recommends_bill_certificate():
    prompt = "Bill certificate for purchase of 25 notebooks and 10 pen sets from ABC Stationery & Prints, invoice no INV-09."
    res = client.post("/api/documents/classify", json={"prompt": prompt})
    assert res.status_code == 200
    data = res.json()
    assert data["recommended_type"] == "bill_certificate"
    assert data["confidence"] in ["high", "medium"]

def test_classifier_reimbursement_prompt_recommends_bill_summary():
    prompt = "Bill summary reimbursement for Hackathon winners: Rahul Rs 1500, Priya Rs 800, Amit Rs 1200."
    res = client.post("/api/documents/classify", json={"prompt": prompt})
    assert res.status_code == 200
    data = res.json()
    assert data["recommended_type"] == "bill_summary"
    assert data["confidence"] in ["high", "medium"]

def test_classifier_ambiguous_prompt_flags_ambiguity():
    prompt = "ACM general notification for members."
    res = client.post("/api/documents/classify", json={"prompt": prompt})
    assert res.status_code == 200
    data = res.json()
    assert data["is_ambiguous"] is True
    assert len(data["missing_information"]) > 0

def test_classifier_explicit_selection_override():
    prompt = "Purchased items from store"
    res = client.post("/api/documents/classify", json={"prompt": prompt, "explicitly_selected": "bill_summary"})
    assert res.status_code == 200
    data = res.json()
    assert "User explicitly selected" in data["explicit_override"]

# ============================================================
# FEATURE 2: CONDITIONAL / DYNAMIC DOCUMENT SECTIONS
# ============================================================

def test_dynamic_sections_exec_meet_online_mode():
    payload = {
        "date": "10/10/2026",
        "event_name": "Virtual Python Sprint",
        "venue": "Google Meet",
        "event_date": "20/10/2026",
        "mode": "Online",
        "online_meeting_platform": "Google Meet",
        "online_meeting_link": "https://meet.google.com/abc-defg-hij",
        "has_agenda": True,
        "agenda_items": "10 AM: Intro; 11 AM: Coding; 2 PM: Wrap-up",
        "brief_description": "Online developer sprint.",
        "objective": "Build open-source tools."
    }
    res = client.post("/api/documents/executive-meet/generate", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True

def test_dynamic_sections_bill_certificate_tax_details():
    payload = {
        "chapter_name": "ACM",
        "code_no": "6/52",
        "date": "10/10/2026",
        "supplier_name": "Global Electronics",
        "items": [{"name": "Arduino Kits", "quantity": 5, "unit_cost": 400.0}],
        "has_taxes": True,
        "tax_details": "18% GST (CGST 9% + SGST 9%)",
        "taxes_or_other_charges": 360.0
    }
    res = client.post("/api/documents/bill-certificate/generate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["calculation_summary"]["grand_total"] == 2360.0

# ============================================================
# FEATURE 3: BATCH DOCUMENT GENERATION
# ============================================================

def test_batch_generate_multiple_jobs_and_zip():
    jobs = [
        {
            "job_id": "job-1",
            "document_type": "exec_meet",
            "payload": {
                "date": "10/10/2026",
                "event_name": "Batch Event 1",
                "venue": "Hall 1",
                "event_date": "12/10/2026",
                "brief_description": "Batch meet 1",
                "objective": "Objective 1"
            }
        },
        {
            "job_id": "job-2",
            "document_type": "bill_certificate",
            "payload": {
                "date": "10/10/2026",
                "supplier_name": "Batch Supplier",
                "items": [{"name": "Pencils", "quantity": 10, "unit_cost": 5.0}]
            }
        }
    ]
    res = client.post("/api/documents/batch/generate", json={"jobs": jobs})
    assert res.status_code == 200
    data = res.json()
    assert data["total_jobs"] == 2
    assert data["successful_count"] == 2
    assert data["failed_count"] == 0
    assert data["zip_download_url"] is not None

    # Test downloading the batch zip
    batch_id = data["batch_id"]
    zip_res = client.get(f"/api/documents/batch/{batch_id}/zip")
    assert zip_res.status_code == 200
    assert zip_res.headers["content-type"] == "application/zip"

def test_batch_generate_partial_failure_isolation():
    jobs = [
        {
            "job_id": "job-valid",
            "document_type": "exec_meet",
            "payload": {
                "date": "10/10/2026",
                "event_name": "Valid Job",
                "venue": "Hall 1",
                "event_date": "12/10/2026",
                "brief_description": "Valid brief",
                "objective": "Valid obj"
            }
        },
        {
            "job_id": "job-invalid",
            "document_type": "exec_meet",
            "payload": {
                # Missing required event_name and event_date
                "date": "10/10/2026"
            }
        }
    ]
    res = client.post("/api/documents/batch/generate", json={"jobs": jobs})
    assert res.status_code == 200
    data = res.json()
    assert data["total_jobs"] == 2
    assert data["successful_count"] == 1
    assert data["failed_count"] == 1
    assert data["jobs"][0]["status"] == "completed"
    assert data["jobs"][1]["status"] == "failed"

# ============================================================
# FEATURE 4: DOCUMENT VERSION HISTORY
# ============================================================

def test_version_history_and_restore():
    # 1. Create document
    create_res = client.post("/api/documents/executive-meet/generate", json={
        "date": "10/10/2026",
        "event_name": "Versioned Workshop",
        "venue": "Hall A",
        "event_date": "15/10/2026",
        "brief_description": "Initial version desc",
        "objective": "Version 1 objective"
    })
    assert create_res.status_code == 200
    repo_id = create_res.json()["repository_id"]

    # 2. Check version list
    v_res = client.get(f"/api/documents/{repo_id}/versions")
    assert v_res.status_code == 200
    versions = v_res.json()["versions"]
    assert len(versions) == 1
    assert versions[0]["version_num"] == 1

    # 3. Update document (Feature 7) to create Version 2
    update_res = client.put(f"/api/documents/{repo_id}", json={
        "data": {
            "date": "10/10/2026",
            "event_name": "Versioned Workshop (Updated)",
            "venue": "Seminar Hall 402",
            "event_date": "16/10/2026",
            "brief_description": "Revised description",
            "objective": "Version 2 objective"
        },
        "change_summary": "Venue shifted to Seminar Hall 402"
    })
    assert update_res.status_code == 200
    assert update_res.json()["document"]["current_version"] == 2

    # 4. Restore Version 1
    restore_res = client.post(f"/api/documents/{repo_id}/versions/1/restore")
    assert restore_res.status_code == 200
    assert restore_res.json()["document"]["current_version"] == 3

# ============================================================
# FEATURE 5: APPROVAL / REVIEW WORKFLOW
# ============================================================

def test_approval_workflow_lifecycle_and_permissions():
    # Create doc
    create_res = client.post("/api/documents/executive-meet/generate", json={
        "date": "10/10/2026",
        "event_name": "Approval Flow Test",
        "venue": "Hall B",
        "event_date": "20/10/2026",
        "brief_description": "Desc",
        "objective": "Obj"
    })
    repo_id = create_res.json()["repository_id"]

    author_headers = get_auth_header(role="author", user_id="usr-author-01")
    reviewer_headers = get_auth_header(role="reviewer", user_id="usr-reviewer-01")
    approver_headers = get_auth_header(role="approver", user_id="usr-approver-01")
    viewer_headers = get_auth_header(role="viewer", user_id="usr-viewer-01")

    # Author moves Draft -> Ready for Review
    r1 = client.post(f"/api/documents/{repo_id}/workflow/transition", json={
        "target_status": "ready_for_review",
        "comment": "Submitted for faculty review"
    }, headers=author_headers)
    assert r1.status_code == 200
    assert r1.json()["to_status"] == "ready_for_review"

    # Reviewer moves Ready for Review -> In Review
    r2 = client.post(f"/api/documents/{repo_id}/workflow/transition", json={
        "target_status": "in_review",
        "comment": "Under review by Hall in-charge"
    }, headers=reviewer_headers)
    assert r2.status_code == 200

    # Unauthorized role (viewer) attempting approval is blocked (403)
    r_unauth = client.post(f"/api/documents/{repo_id}/workflow/transition", json={
        "target_status": "approved",
        "comment": "Illegal approval"
    }, headers=viewer_headers)
    assert r_unauth.status_code == 403

    # Approver approves document
    r3 = client.post(f"/api/documents/{repo_id}/workflow/transition", json={
        "target_status": "approved",
        "comment": "Official hall reservation approved"
    }, headers=approver_headers)
    assert r3.status_code == 200
    assert r3.json()["to_status"] == "approved"

    # Check workflow audit history
    hist = client.get(f"/api/documents/{repo_id}/workflow/history")
    assert hist.status_code == 200
    assert len(hist.json()["history"]) >= 3

# ============================================================
# FEATURE 6: REUSABLE CLAUSES AND SECTIONS
# ============================================================

def test_reusable_clauses_listing_and_interpolation():
    # 1. Executive Meet clauses
    res_exec = client.get("/api/documents/clauses/list?document_type=exec_meet")
    assert res_exec.status_code == 200
    clauses_exec = res_exec.json()["clauses"]
    assert len(clauses_exec) >= 4
    for c in clauses_exec:
        assert c["id"].startswith("cl-")
        assert c["name"]
        assert c["content"]
        assert "exec_meet" in c["applicable_types_list"]
        assert c["approval_status"] in ["pre_approved", "sample_draft"]
        assert isinstance(c["variables"], list)

    # 2. Bill Certificate clauses
    res_bill_cert = client.get("/api/documents/clauses?document_type=bill_certificate")
    assert res_bill_cert.status_code == 200
    clauses_bill_cert = res_bill_cert.json()["clauses"]
    assert len(clauses_bill_cert) >= 3
    assert any(c["id"] == "cl-bill-cert-audit" for c in clauses_bill_cert)

    # 3. Bill Summary clauses
    res_bill_sum = client.get("/api/documents/clauses?document_type=bill_summary")
    assert res_bill_sum.status_code == 200
    clauses_bill_sum = res_bill_sum.json()["clauses"]
    assert len(clauses_bill_sum) >= 3
    assert any(c["id"] == "cl-bill-sum-contingency" for c in clauses_bill_sum)

    # 4. Nonexistent document type returns empty list
    res_empty = client.get("/api/documents/clauses?document_type=nonexistent_doc_type")
    assert res_empty.status_code == 200
    assert res_empty.json()["clauses"] == []

    # 5. Safe variable interpolation with missing variables
    raw_text = "The event {{event_name}} will take place at {{venue}} on {{event_date}} coordinated by {{lead_name}}."
    context = {"event_name": "Cloud Day", "venue": "Seminar Hall 402"}
    inter_res = client.post("/api/documents/clauses/interpolate", json={
        "content": raw_text,
        "context": context
    })
    assert inter_res.status_code == 200
    data = inter_res.json()
    assert "Cloud Day" in data["rendered_content"]
    assert "Seminar Hall 402" in data["rendered_content"]
    assert "[Event Date]" in data["rendered_content"]  # missing key rendered safely
    assert "[Lead Name]" in data["rendered_content"]
    assert "event_date" in data["missing_variables"]
    assert "lead_name" in data["missing_variables"]
    assert set(data["used_variables"]) == {"event_name", "venue", "event_date", "lead_name"}

    # 6. Interpolation by clause_id lookup
    inter_by_id = client.post("/api/documents/clauses/interpolate", json={
        "clause_id": "cl-exec-hall-guidelines",
        "context": {"event_date": "15 November 2026"}
    })
    assert inter_by_id.status_code == 200
    assert "15 November 2026" in inter_by_id.json()["rendered_content"]

# ============================================================
# FEATURE 8: TEMPLATE PREVIEW / EDITOR
# ============================================================

def test_template_preview_and_config():
    res = client.get("/api/documents/templates-config/list")
    assert res.status_code == 200
    assert len(res.json()["configs"]) == 3

    prev_res = client.get("/api/documents/templates-config/exec_meet/preview")
    assert prev_res.status_code == 200
    pdata = prev_res.json()
    assert pdata["is_sample_preview"] is True
    assert "sample_data" in pdata
    assert "DO NOT USE AS OFFICIAL DOCUMENT" in pdata["preview_notice"]

# ============================================================
# FEATURE 9: ROLE-BASED ACCESS CONTROL (RBAC)
# ============================================================

def test_rbac_register_login_and_role_protection():
    email = f"testauthor_{uuid.uuid4().hex[:8]}@svnit.acm.org"
    uid = f"uid-{uuid.uuid4().hex}"
    headers = {"Authorization": f"Bearer test-firebase:{uid}:{email}:0"}
    reg = client.post("/api/auth/register", headers=headers, json={
        "requested_role": "author", "full_name": "Test RBAC Author", "email": email,
    })
    assert reg.status_code == 200
    blocked = client.post("/api/auth/session", headers=headers)
    assert blocked.status_code == 403
    verified = client.post("/api/auth/session", headers={"Authorization": f"Bearer test-firebase:{uid}:{email}:1"})
    assert verified.status_code == 200
    assert verified.json()["user"]["role"] == "author"

def test_google_integration_status_and_mock_export():
    # 1. Status check
    st = client.get("/api/documents/integrations/status")
    assert st.status_code == 200
    assert "google" in st.json()

    # 2. Create document for export test
    doc_res = client.post("/api/documents/executive-meet/generate", json={
        "date": "10/10/2026",
        "event_name": "Google Drive Test Doc",
        "venue": "Hall C",
        "event_date": "25/10/2026",
        "brief_description": "Desc",
        "objective": "Obj"
    })
    repo_id = doc_res.json()["repository_id"]

    # 3. Drive export gracefully reports unconfigured when credentials absent
    drv_res = client.post(f"/api/documents/{repo_id}/export/google-drive", json={"file_format": "pdf"})
    assert drv_res.status_code == 200
    assert "status" in drv_res.json()

# ============================================================
# FEATURE 11: EMAIL DISTRIBUTION
# ============================================================

def test_email_distribution_validation_and_dispatch():
    doc_res = client.post("/api/documents/executive-meet/generate", json={
        "date": "10/10/2026",
        "event_name": "Email Dist Test Doc",
        "venue": "Hall D",
        "event_date": "25/10/2026",
        "brief_description": "Desc",
        "objective": "Obj"
    })
    repo_id = doc_res.json()["repository_id"]

    # Invalid recipient rejected
    bad_eml = client.post(f"/api/documents/{repo_id}/distribute/email", json={
        "recipients": ["invalid-email-string"],
        "subject": "Official Document",
        "message": "Please review"
    })
    assert bad_eml.status_code == 400

    # Valid recipients dispatched
    good_eml = client.post(f"/api/documents/{repo_id}/distribute/email", json={
        "recipients": ["faculty@svnit.ac.in", "chairperson@svnit.acm.org"],
        "subject": "Official ACM Executive Meet Permission Document",
        "message": "Attached is the signed document."
    })
    assert good_eml.status_code == 200
    assert good_eml.json()["success"] is True
    assert len(good_eml.json()["recipients"]) == 2

# ============================================================
# FEATURE 12: DIGITAL SIGNATURES & TAMPER DETECTION
# ============================================================

def test_cryptographic_signature_and_tamper_detection():
    doc_res = client.post("/api/documents/executive-meet/generate", json={
        "date": "10/10/2026",
        "event_name": "Signable Event",
        "venue": "Hall E",
        "event_date": "25/10/2026",
        "brief_description": "Tamper test",
        "objective": "Integrity"
    })
    repo_id = doc_res.json()["repository_id"]

    # 1. Sign document with approver role
    approver_headers = get_auth_header(role="approver", user_id="usr-approver-01", name="Dr. Sankita Patel")
    sign_res = client.post(f"/api/documents/{repo_id}/signatures/sign", headers=approver_headers)
    assert sign_res.status_code == 200
    assert sign_res.json()["algorithm"] == "HMAC-SHA256"
    assert sign_res.json()["signature_token"] is not None

    # 2. Verify signature before alteration (Must be valid)
    verify_res1 = client.get(f"/api/documents/{repo_id}/signatures/verify")
    assert verify_res1.status_code == 200
    assert verify_res1.json()["is_valid"] is True
    assert verify_res1.json()["tampered"] is False

    # 3. Simulate unauthorized alteration of source fields in the database
    from app.db.database import get_db
    import json
    with get_db() as conn:
        conn.execute(
            "UPDATE document_versions SET data_json = ? WHERE document_id = ? AND version_num = 1",
            (json.dumps({"event_name": "TAMPERED HACKED EVENT"}), repo_id)
        )

    # 4. Verify signature after alteration (Tampering detected!)
    verify_res2 = client.get(f"/api/documents/{repo_id}/signatures/verify")
    assert verify_res2.status_code == 200
    assert verify_res2.json()["is_valid"] is False
    assert verify_res2.json()["tampered"] is True

# ============================================================
# FEATURE 13: USAGE ANALYTICS DASHBOARD
# ============================================================

def test_analytics_dashboard_metrics():
    res = client.get("/api/documents/analytics/dashboard", headers=get_auth_header("admin", "usr-admin-01"))
    assert res.status_code == 200
    data = res.json()
    assert "total_documents_generated" in data
    assert "documents_by_type" in data
    assert "workflow_status_distribution" in data
    assert data["total_documents_generated"] >= 1

# ============================================================
# FEATURE 14: MULTILINGUAL & UNICODE SAFETY
# ============================================================

def test_multilingual_unicode_document_generation():
    # Gujarati and Hindi text in document fields
    payload = {
        "date": "10/10/2026",
        "event_name": "ટેકનિકલ કાર્યશાળા (Technical Workshop) 2026",
        "venue": "સેમિનાર હોલ 402, SVNIT સુરત",
        "event_date": "28/10/2026",
        "brief_description": "વિદ્યાર્થીઓ માટે આર્ટિફિશિયલ ઇન્ટેલિજન્સ પર કાર્યશાળા.",
        "objective": "નવા વિચારો અને તકનીકી જ્ઞાન આપવું.",
        "organizers": "ACM SVNIT શાખા",
        "lead_name": "દર્શિલ પ્રજાપતિ"
    }
    res = client.post("/api/documents/executive-meet/generate", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True
