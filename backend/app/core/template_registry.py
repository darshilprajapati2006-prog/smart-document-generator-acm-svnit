from typing import Dict, Any, List, Optional, Type
from pydantic import BaseModel

from app.schemas.executive_meet import ExecutiveMeetRequest
from app.schemas.bill_certificate import BillCertificateRequest
from app.schemas.bill_summary import BillSummaryRequest
from app.services.executive_meet_service import ExecutiveMeetService
from app.services.bill_certificate_service import BillCertificateService
from app.services.bill_summary_service import BillSummaryService

class TemplateDefinition:
    def __init__(
        self,
        id: str,
        title: str,
        description: str,
        icon: str,
        category: str,
        reference_document: str,
        schema_class: Type[BaseModel],
        service_class: Any,
        required_fields: List[str],
        optional_fields: List[str],
        field_labels: Dict[str, str],
        aliases: Optional[Dict[str, str]] = None,
    ):
        self.id = id
        self.title = title
        self.description = description
        self.icon = icon
        self.category = category
        self.reference_document = reference_document
        self.schema_class = schema_class
        self.service_class = service_class
        self.required_fields = required_fields
        self.optional_fields = optional_fields
        self.field_labels = field_labels
        self.aliases = aliases or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "icon": self.icon,
            "category": self.category,
            "reference_document": self.reference_document,
            "required_fields": self.required_fields,
            "optional_fields": self.optional_fields,
            "field_labels": self.field_labels,
        }

    def get_missing_required_fields(self, data: Dict[str, Any]) -> List[str]:
        """Returns list of missing mandatory field labels based on provided data."""
        missing = []
        for field in self.required_fields:
            val = data.get(field)
            # Check aliases if direct key missing
            if (val is None or str(val).strip() == ""):
                for alias_key, target in self.aliases.items():
                    if target == field and data.get(alias_key):
                        val = data.get(alias_key)
                        break
            if val is None or str(val).strip() == "":
                label = self.field_labels.get(field, field)
                missing.append(label)
        return missing


class TemplateRegistry:
    def __init__(self):
        self._templates: Dict[str, TemplateDefinition] = {}
        self._init_default_templates()

    def _init_default_templates(self):
        # 1. Executive Meet
        self.register(TemplateDefinition(
            id="exec_meet",
            title="Executive Meet",
            description="Event proposals and official permission requests.",
            icon="📋",
            category="Permission Request",
            reference_document="EXEC MEET_public.pdf",
            schema_class=ExecutiveMeetRequest,
            service_class=ExecutiveMeetService,
            required_fields=[
                "event_name",
                "event_date",
                "venue",
                "time_from",
                "time_to",
                "brief_description",
            ],
            optional_fields=[
                "ref_no",
                "date",
                "submitted_to",
                "subject",
                "objective",
                "participants",
                "mode",
                "organizers",
                "lead_name",
                "lead_designation",
                "lead_admission_no",
                "lead_branch",
                "lead_mobile",
                "tech_assist_name",
                "tech_assist_designation",
                "tech_assist_branch",
                "faculty_incharge_name",
                "faculty_incharge_designation",
                "faculty_chairman_name",
                "faculty_chairman_designation",
            ],
            field_labels={
                "event_name": "Event Name",
                "event_date": "Event Date",
                "venue": "Venue",
                "time_from": "Start Time",
                "time_to": "End Time",
                "brief_description": "Brief Description",
                "objective": "Objective",
                "participants": "Expected Participants",
                "organizers": "Organizing Club",
                "mode": "Mode of Conduct",
                "lead_name": "Student Chairperson / Coordinator",
                "ref_no": "Reference Number",
                "date": "Document Date",
                "submitted_to": "Submitted To",
                "subject": "Subject Line",
            },
            aliases={
                "start_time": "time_from",
                "end_time": "time_to",
                "expected_participants": "participants",
                "organizing_club": "organizers",
                "coordinator": "lead_name",
                "mode_of_conduct": "mode",
            }
        ))

        # 2. Bill Certificate
        self.register(TemplateDefinition(
            id="bill_certificate",
            title="Bill Certificate",
            description="Expenditure, supplier and payment certification details.",
            icon="🧾",
            category="Financial Certification",
            reference_document="Bill Certificate_public.pdf",
            schema_class=BillCertificateRequest,
            service_class=BillCertificateService,
            required_fields=[
                "supplier_name",
                "date",
                "items",
            ],
            optional_fields=[
                "chapter_name",
                "code_no",
                "approval_note_no",
                "taxes_or_other_charges",
                "invoice_no_and_date",
                "party_name",
                "account_number",
                "bank_name",
                "ifsc_code",
                "certifier_name",
                "certifier_title",
            ],
            field_labels={
                "supplier_name": "Supplier Name",
                "date": "Document Date",
                "items": "Purchased Items",
                "chapter_name": "Chapter Name",
                "code_no": "Budget Code Number",
                "approval_note_no": "Approval Note No.",
                "taxes_or_other_charges": "Taxes / Extra Charges",
                "invoice_no_and_date": "Invoice Details",
                "party_name": "Beneficiary Party Name",
                "account_number": "Bank Account Number",
                "bank_name": "Bank Name",
                "ifsc_code": "IFSC Code",
            },
            aliases={
                "vendor_name": "supplier_name",
                "vendor": "supplier_name",
            }
        ))

        # 3. Bill Summary
        self.register(TemplateDefinition(
            id="bill_summary",
            title="Bill Summary",
            description="Payment summaries, recipient details and totals.",
            icon="💳",
            category="Reimbursement & Payment",
            reference_document="BIll_summary_public.pdf",
            schema_class=BillSummaryRequest,
            service_class=BillSummaryService,
            required_fields=[
                "date",
                "title",
                "rows",
            ],
            optional_fields=[
                "subtitle",
                "student_head_name",
                "student_head_title",
                "student_secretary_name",
                "student_secretary_title",
                "faculty_chairman_name",
                "faculty_chairman_title",
                "club_name",
            ],
            field_labels={
                "date": "Document Date",
                "title": "Document Title",
                "subtitle": "Activity Subtitle",
                "rows": "Recipient Payment Rows",
                "student_head_name": "Student Head Name",
                "student_secretary_name": "Student Secretary Name",
                "faculty_chairman_name": "Faculty Chairman Name",
                "club_name": "Club Name",
            },
            aliases={
                "recipients": "rows",
            }
        ))

    def register(self, template_def: TemplateDefinition):
        self._templates[template_def.id] = template_def

    def get(self, template_id: str) -> Optional[TemplateDefinition]:
        return self._templates.get(template_id)

    def list_all(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self._templates.values()]

    def validate_template_exists(self, template_id: str) -> bool:
        return template_id in self._templates

template_registry = TemplateRegistry()
