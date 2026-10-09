"""
Database Seeding for ACM SVNIT Smart Document Generator.
Initializes default pre-configured roles, pre-approved clauses, and template metadata.
"""
import uuid
import json
from app.db.database import get_db, init_db
from app.core.security import hash_password

def seed_database():
    init_db()
    with get_db() as conn:
        # 1. Seed demo users for testing each role
        users_to_seed = [
            ("usr-admin-01", "admin@svnit.acm.org", "Admin@1234", "System Administrator", "admin"),
            ("usr-author-01", "author@svnit.acm.org", "Author@1234", "Ansh Gupta (Author)", "author"),
            ("usr-reviewer-01", "reviewer@svnit.acm.org", "Reviewer@1234", "Shri Rakesh Gohil (Reviewer)", "reviewer"),
            ("usr-approver-01", "approver@svnit.acm.org", "Approver@1234", "Dr. Sankita J. Patel (Approver)", "approver"),
            ("usr-tmpladmin-01", "tmpladmin@svnit.acm.org", "TmplAdmin@1234", "Template Admin", "template_admin"),
            ("usr-viewer-01", "viewer@svnit.acm.org", "Viewer@1234", "Guest Viewer", "viewer"),
            ("guest-user", "guest@svnit.acm.org", "Guest@1234", "Guest User", "viewer"),
        ]

        for u_id, email, pwd, name, role in users_to_seed:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO users (id, email, hashed_password, full_name, role, status, is_active) VALUES (?, ?, ?, ?, ?, 'active', 1)",
                    (u_id, email, hash_password(pwd), name, role)
                )
            else:
                conn.execute(
                    "UPDATE users SET status = 'active', is_active = 1 WHERE email = ?",
                    (email,)
                )

        # 2. Seed pre-approved Reusable Clauses
        clauses_to_seed = [
            # Executive Meet Clauses
            (
                "cl-exec-hall-guidelines",
                "SVNIT Seminar Hall Usage & Decorum Rules",
                "Decorum",
                "exec_meet",
                "The organizers undertake to ensure that Seminar Hall property, audiovisual systems, and air conditioning equipment are handled with due care on {{event_date}}. No eatables are permitted inside the hall premises.",
                json.dumps(["event_date"]),
                "pre_approved"
            ),
            (
                "cl-exec-obj-workshop",
                "Technical Workshop Learning Objectives",
                "Objective",
                "exec_meet",
                "To impart practical exposure, industry-aligned technical skills, and collaborative hands-on knowledge to students of SVNIT through structured domain sessions for {{event_name}}.",
                json.dumps(["event_name"]),
                "pre_approved"
            ),
            (
                "cl-exec-venue-permission",
                "Executive Meet Venue Reservation Request",
                "Permission",
                "exec_meet",
                "Permission is kindly requested to reserve {{venue}} for {{event_name}} on {{event_date}} from {{time_from}} to {{time_to}} for approximately {{participants}} attendees, coordinated by {{lead_name}}.",
                json.dumps(["venue", "event_name", "event_date", "time_from", "time_to", "participants", "lead_name"]),
                "sample_draft"
            ),
            (
                "cl-exec-online-platform",
                "Online / Hybrid Session Recording Notice",
                "Virtual Conduct",
                "exec_meet",
                "The virtual session for {{event_name}} will be hosted on {{online_meeting_platform}} (Link: {{online_meeting_link}}). Participants are advised that sessions may be recorded for archival purposes.",
                json.dumps(["event_name", "online_meeting_platform", "online_meeting_link"]),
                "sample_draft"
            ),
            # Bill Certificate Clauses
            (
                "cl-bill-cert-audit",
                "SVNIT Store & Purchase Audit Declaration",
                "Compliance",
                "bill_certificate",
                "Certified that the purchases detailed herein from {{supplier_name}} (Invoice {{invoice_no_and_date}}) were made in the best interest of the Chapter activities, rates are reasonable, and items have been entered into the recurring stock register.",
                json.dumps(["supplier_name", "invoice_no_and_date"]),
                "pre_approved"
            ),
            (
                "cl-bill-cert-tax-exemption",
                "GST Surcharge & Tax Invoice Verification",
                "Taxation",
                "bill_certificate",
                "Certified that statutory GST applied by vendor {{supplier_name}} (GSTIN: {{supplier_gst}}) is consistent with government procurement guidelines for educational chapters.",
                json.dumps(["supplier_name", "supplier_gst"]),
                "pre_approved"
            ),
            (
                "cl-bill-cert-advance-settle",
                "Advance Settlement & Account Adjustment",
                "Accounting",
                "bill_certificate",
                "The expenditure for {{chapter_name}} under Head of Account {{head_of_account}} is certified for direct payment to {{party_name}} against Bank Account {{account_number}} ({{bank_name}}).",
                json.dumps(["chapter_name", "head_of_account", "party_name", "account_number", "bank_name"]),
                "sample_draft"
            ),
            # Bill Summary Clauses
            (
                "cl-bill-sum-contingency",
                "Contingency Reimbursement Verification",
                "Verification",
                "bill_summary",
                "All expenditure vouchers and payment receipts for {{subtitle}} have been verified by the student head and faculty chairman. Amount claimed reflects actual expenses incurred.",
                json.dumps(["subtitle"]),
                "pre_approved"
            ),
            (
                "cl-bill-sum-disbursement",
                "Electronic Bank Transfer Reimbursement Mandate",
                "Disbursement",
                "bill_summary",
                "Reimbursement amounts approved under {{title}} shall be disbursed directly to beneficiary bank accounts under Chapter Code 6/52 with approval of {{faculty_chairman_name}}.",
                json.dumps(["title", "faculty_chairman_name"]),
                "pre_approved"
            ),
            (
                "cl-bill-sum-hackathon-prizes",
                "Competition Prize Distribution Acknowledgement",
                "Prizes",
                "bill_summary",
                "Certified that prizes awarded for {{subtitle}} have been adjudicated according to official evaluation rubrics verified by Student Head {{student_head_name}} and Student Secretary {{student_secretary_name}}.",
                json.dumps(["subtitle", "student_head_name", "student_secretary_name"]),
                "sample_draft"
            )
        ]

        for cid, name, category, app_types, content, vars_json, status in clauses_to_seed:
            conn.execute(
                """
                INSERT INTO reusable_clauses (id, name, category, applicable_types, content, variables_json, approval_status, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    category = excluded.category,
                    applicable_types = excluded.applicable_types,
                    content = excluded.content,
                    variables_json = excluded.variables_json,
                    approval_status = excluded.approval_status,
                    active = 1
                """,
                (cid, name, category, app_types, content, vars_json, status)
            )

        # 3. Seed official template configurations
        templates_to_seed = [
            (
                "tmpl-exec-meet",
                "exec_meet",
                "Executive Meet Request",
                json.dumps(["header", "event_details", "schedule", "conduct_mode", "description", "signatories"]),
                json.dumps({
                    "event_name": "Event Title",
                    "event_date": "Date of Event",
                    "venue": "Hall / Venue",
                    "mode": "Mode of Conduct",
                    "lead_name": "Student Lead / Chairperson"
                }),
                json.dumps({
                    "org_name": "ACM Student Chapter",
                    "institute": "Sardar Vallabhbhai National Institute of Technology, Surat",
                    "department": "Department of Computer Science & Engineering"
                }),
                json.dumps(["online_meeting_details", "agenda_items", "technical_assistance"])
            ),
            (
                "tmpl-bill-cert",
                "bill_certificate",
                "Bill Certificate (Recurring)",
                json.dumps(["header", "approval_reference", "supplier_details", "itemized_table", "banking_details", "stock_register", "signatories"]),
                json.dumps({
                    "chapter_name": "Chapter Name",
                    "supplier_name": "Vendor / Supplier Name",
                    "invoice_no_and_date": "Invoice Details",
                    "account_number": "Bank Account Number"
                }),
                json.dumps({
                    "form_code": "SVNIT Form BC-R",
                    "title": "CERTIFICATE FOR RECURRING EXPENDITURE"
                }),
                json.dumps(["tax_breakdown", "advance_drawn_adjustment"])
            ),
            (
                "tmpl-bill-summary",
                "bill_summary",
                "Bill Summary",
                json.dumps(["header", "title", "reimbursement_table", "grand_totals", "signatories"]),
                json.dumps({
                    "title": "Document Title",
                    "subtitle": "Activity Context",
                    "date": "Submission Date"
                }),
                json.dumps({
                    "sheet_title": "ACM NIT-Surat Bill Summary",
                    "footer": "Confidential - For Official Financial Processing"
                }),
                json.dumps(["variable_expense_breakdown", "prize_vs_operational"])
            )
        ]

        for tid, t_key, dname, ordering, labels, branding, opts in templates_to_seed:
            existing = conn.execute("SELECT id FROM template_configs WHERE template_id = ?", (t_key,)).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO template_configs (id, template_id, display_name, section_ordering_json, labels_json, branding_json, optional_sections_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (tid, t_key, dname, ordering, labels, branding, opts)
                )
