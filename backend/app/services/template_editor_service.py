"""
Template Preview and Editor Configuration Service.
Provides live template schemas, section ordering, branding configuration,
and sample previews without corrupting production document data.
"""
import json
from typing import Dict, Any, List, Optional
from app.db.database import get_db

class TemplateEditorService:

    SAMPLE_DATA = {
        "exec_meet": {
            "ref_no": "ACM/26-27/SAMPLE/001",
            "date": "15/10/2026",
            "submitted_to": "Head of Department (CSE)",
            "subject": "Request for Hall Permission (Sample Preview)",
            "event_name": "Preview: ACM Hands-on Cloud Workshop",
            "event_date": "20/10/2026",
            "time_from": "02:00 PM",
            "time_to": "05:00 PM",
            "venue": "Seminar Hall 402, SVNIT",
            "participants": "100",
            "mode": "Offline",
            "organizers": "ACM SVNIT Chapter",
            "brief_description": "A comprehensive cloud computing and infrastructure workshop designed for students.",
            "objective": "To introduce industry workflows and containerization.",
            "lead_name": "Student Chairperson",
            "lead_designation": "Chairperson",
            "lead_admission_no": "I24CS001",
            "lead_branch": "Computer Science & Engineering",
            "faculty_chairman_name": "Dr. Faculty Chairman",
            "faculty_chairman_designation": "Chairman, ACM"
        },
        "bill_certificate": {
            "chapter_name": "ACM",
            "code_no": "6/52",
            "approval_note_no": "ACM/26-27/APP/001",
            "date": "15/10/2026",
            "purchase_order_no": "PO/2026/04",
            "head_of_account": "6/52",
            "advance_drawn": "NiL",
            "certifier_name": "Dr. Certifier Name",
            "title": "Preview: Bill Certificate for Event Banners",
            "items": [
                {"name": "Stage Backdrop & Flex Banners", "quantity": 2, "unit_cost": 850.0, "total_cost": 1700.0},
                {"name": "Laminated Participant ID Badges", "quantity": 50, "unit_cost": 15.0, "total_cost": 750.0}
            ],
            "taxes_or_other_charges": 120.0,
            "supplier_name": "Apex Printing Works",
            "supplier_gst": "24ABCDE1234F1Z5",
            "invoice_no_and_date": "INV-789 dated 10/10/2026",
            "party_name": "Apex Printing Works",
            "account_number": "112233445566",
            "bank_name": "State Bank of India",
            "branch_name": "SVNIT Campus",
            "ifsc_code": "SBIN0003320"
        },
        "bill_summary": {
            "date": "15/10/2026",
            "title": "BILL SUMMARY (PREVIEW)",
            "subtitle": "Expenditure incurred during Annual Coding Hackathon",
            "rows": [
                {"name": "Team Alpha", "account_details": "1st Prize Award", "to_be_paid_to": "Team Lead Alpha", "prize_money": 3000.0, "other_amount": 0.0},
                {"name": "Team Beta", "account_details": "2nd Prize Award", "to_be_paid_to": "Team Lead Beta", "prize_money": 2000.0, "other_amount": 0.0},
                {"name": "Logistics Team", "account_details": "Reimbursement for materials", "to_be_paid_to": "Logistics Lead", "prize_money": 0.0, "other_amount": 1450.0}
            ],
            "student_head_name": "Student Head",
            "student_secretary_name": "Student Secretary",
            "faculty_chairman_name": "Faculty Chairman",
            "club_name": "ACM NIT-Surat"
        },
        "prize_money_receipt": {
            "serial_number": "ACM/PR/2026/01",
            "date": "15/10/2026",
            "amount_rupees": 5000.00,
            "competition_name": "Web3 & AI Hackathon 2026",
            "position": "1st Prize Winner",
            "organizing_body": "ACM SVNIT Student Chapter",
            "event_date": "12/10/2026",
            "venue": "Seminar Hall 402, SVNIT",
            "affiliating_institute": "Sardar Vallabhbhai National Institute of Technology, Surat",
            "name_as_per_bank": "Student Winner",
            "bank_name": "State Bank of India",
            "branch": "SVNIT Campus Branch",
            "account_number": "38927491024",
            "ifsc_code": "SBIN0003320",
            "pan_number": "ABCDE1234F",
            "student_name": "Student Winner",
            "roll_number": "U24CS001",
            "course_semester": "B.Tech CSE - 5th Semester",
            "mobile_number": "9876543210",
            "chairman_name": "Dr. Sankita J. Patel"
        }
    }

    DEFAULT_CONFIGS = {
        "exec_meet": {
            "id": "tmpl-exec-meet",
            "template_id": "exec_meet",
            "display_name": "Executive Meet Request",
            "section_ordering": ["header", "event_details", "schedule", "conduct_mode", "description", "signatories"],
            "labels": {
                "event_name": "Event Title",
                "event_date": "Date of Event",
                "venue": "Hall / Venue",
                "mode": "Mode of Conduct",
                "lead_name": "Student Lead / Chairperson"
            },
            "branding": {
                "org_name": "ACM Student Chapter",
                "institute": "Sardar Vallabhbhai National Institute of Technology, Surat",
                "department": "Department of Computer Science & Engineering"
            },
            "optional_sections": ["online_meeting_details", "agenda_items", "technical_assistance"]
        },
        "prize_money_receipt": {
            "id": "tmpl-prize-receipt",
            "template_id": "prize_money_receipt",
            "display_name": "Prize Money Receipt",
            "section_ordering": ["header", "event_info", "payment_acknowledgement", "bank_account_details", "student_details", "signatures"],
            "labels": {
                "serial_number": "Serial Number",
                "competition_name": "Competition / Hackathon Title",
                "position": "Prize Position Awarded",
                "amount_rupees": "Prize Amount (INR)",
                "student_name": "Student Beneficiary Name",
                "roll_number": "Roll / Admission Number",
                "bank_name": "Bank Name",
                "account_number": "Account Number",
                "ifsc_code": "Bank IFSC Code"
            },
            "branding": {
                "org_name": "ACM SVNIT Chapter",
                "institute": "Sardar Vallabhbhai National Institute of Technology, Surat",
                "department": "Department of Computer Science & Engineering",
                "receipt_title": "OFFICIAL PRIZE MONEY RECEIPT"
            },
            "optional_sections": ["pan_verification", "course_semester_verification"]
        },
        "bill_certificate": {
            "id": "tmpl-bill-cert",
            "template_id": "bill_certificate",
            "display_name": "Bill Certificate (Recurring)",
            "section_ordering": ["header", "approval_reference", "supplier_details", "itemized_table", "banking_details", "stock_register", "signatories"],
            "labels": {
                "chapter_name": "Chapter Name",
                "supplier_name": "Vendor / Supplier Name",
                "invoice_no_and_date": "Invoice Details",
                "account_number": "Bank Account Number"
            },
            "branding": {
                "form_code": "SVNIT Form BC-R",
                "title": "CERTIFICATE FOR RECURRING EXPENDITURE",
                "institute": "Sardar Vallabhbhai National Institute of Technology, Surat"
            },
            "optional_sections": ["tax_breakdown", "advance_drawn_adjustment"]
        },
        "bill_summary": {
            "id": "tmpl-bill-summary",
            "template_id": "bill_summary",
            "display_name": "Bill Summary",
            "section_ordering": ["header", "title", "reimbursement_table", "grand_totals", "signatories"],
            "labels": {
                "title": "Document Title",
                "subtitle": "Activity Context",
                "date": "Submission Date"
            },
            "branding": {
                "sheet_title": "ACM NIT-Surat Bill Summary",
                "footer": "Confidential - For Official Financial Processing",
                "institute": "Sardar Vallabhbhai National Institute of Technology, Surat"
            },
            "optional_sections": ["variable_expense_breakdown", "prize_vs_operational"]
        }
    }

    @classmethod
    def get_template_config(cls, template_id: str) -> Optional[Dict[str, Any]]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM template_configs WHERE template_id = ?", (template_id,)).fetchone()
            if row:
                cfg = dict(row)
                cfg["section_ordering"] = json.loads(cfg["section_ordering_json"])
                cfg["labels"] = json.loads(cfg["labels_json"])
                cfg["branding"] = json.loads(cfg["branding_json"])
                cfg["optional_sections"] = json.loads(cfg["optional_sections_json"])
                return cfg

            # Fallback to DEFAULT_CONFIGS and auto-insert into DB
            default = cls.DEFAULT_CONFIGS.get(template_id)
            if default:
                try:
                    conn.execute(
                        """
                        INSERT INTO template_configs (id, template_id, display_name, section_ordering_json, labels_json, branding_json, optional_sections_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (template_id) DO NOTHING
                        """,
                        (
                            default["id"],
                            template_id,
                            default["display_name"],
                            json.dumps(default["section_ordering"]),
                            json.dumps(default["labels"]),
                            json.dumps(default["branding"]),
                            json.dumps(default["optional_sections"]),
                        )
                    )
                except Exception:
                    pass
                return {
                    "id": default["id"],
                    "template_id": template_id,
                    "display_name": default["display_name"],
                    "section_ordering": list(default["section_ordering"]),
                    "labels": dict(default["labels"]),
                    "branding": dict(default["branding"]),
                    "optional_sections": list(default["optional_sections"]),
                }
            return None

    @classmethod
    def list_template_configs(cls) -> List[Dict[str, Any]]:
        # Ensure all default template configs exist
        for tid in cls.DEFAULT_CONFIGS:
            cls.get_template_config(tid)

        with get_db() as conn:
            rows = conn.execute("SELECT * FROM template_configs ORDER BY template_id").fetchall()
            configs = []
            for r in rows:
                cfg = dict(r)
                cfg["section_ordering"] = json.loads(cfg["section_ordering_json"])
                cfg["labels"] = json.loads(cfg["labels_json"])
                cfg["branding"] = json.loads(cfg["branding_json"])
                cfg["optional_sections"] = json.loads(cfg["optional_sections_json"])
                configs.append(cfg)
            return configs

    @staticmethod
    def update_template_config(
        template_id: str,
        display_name: Optional[str] = None,
        section_ordering: Optional[List[str]] = None,
        labels: Optional[Dict[str, str]] = None,
        branding: Optional[Dict[str, Any]] = None,
        optional_sections: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        existing = TemplateEditorService.get_template_config(template_id)
        if not existing:
            return None

        new_name = display_name or existing["display_name"]
        new_ordering = json.dumps(section_ordering) if section_ordering is not None else existing["section_ordering_json"]
        new_labels = json.dumps(labels) if labels is not None else existing["labels_json"]
        new_branding = json.dumps(branding) if branding is not None else existing["branding_json"]
        new_opts = json.dumps(optional_sections) if optional_sections is not None else existing["optional_sections_json"]

        with get_db() as conn:
            conn.execute(
                """
                UPDATE template_configs
                SET display_name = ?, section_ordering_json = ?, labels_json = ?, branding_json = ?, optional_sections_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE template_id = ?
                """,
                (new_name, new_ordering, new_labels, new_branding, new_opts, template_id)
            )
        return TemplateEditorService.get_template_config(template_id)

    @classmethod
    def get_preview(cls, template_id: str) -> Dict[str, Any]:
        """Returns structured preview with sample data and active config."""
        cfg = cls.get_template_config(template_id)
        if not cfg:
            raise ValueError(f"Template '{template_id}' configuration not found.")
        
        sample = cls.SAMPLE_DATA.get(template_id, {})
        return {
            "template_id": template_id,
            "display_name": cfg["display_name"],
            "section_ordering": cfg["section_ordering"],
            "labels": cfg["labels"],
            "branding": cfg["branding"],
            "optional_sections": cfg["optional_sections"],
            "is_sample_preview": True,
            "sample_data": sample,
            "preview_notice": "THIS IS A PREVIEW WITH DEMONSTRATION SAMPLE DATA. DO NOT USE AS OFFICIAL DOCUMENT."
        }
