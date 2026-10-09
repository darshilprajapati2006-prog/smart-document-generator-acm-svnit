from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

class BillItem(BaseModel):
    sr_no: Optional[int] = None
    name: str = Field(description="Item or equipment description")
    quantity: int = Field(gt=0, description="Quantity of items, must be greater than 0")
    unit_cost: float = Field(ge=0, description="Unit cost in INR, must be non-negative")
    total_cost: Optional[float] = Field(default=None, description="Calculated total cost")

class BillCertificateRequest(BaseModel):
    chapter_name: str = Field(default="ACM", description="Chapter or Club Name")
    code_no: str = Field(default="6/52", description="Head of account code")
    approval_note_no: str = Field(default="ACM/2026-27/SIH/001", description="Approval note reference number")
    date: str = Field(description="Document issue date")
    original_approval_sent_with_bill_no: Optional[str] = Field(default="", description="Bill no. if sent with comparative statement")
    original_bill_date: Optional[str] = Field(default="", description="Date of original bill")
    original_bill_rs: Optional[str] = Field(default="", description="Amount of original bill")
    original_bill_ms: Optional[str] = Field(default="", description="M/s Supplier name on original bill")
    purchase_order_no: str = Field(default="NiL", description="PO number and date or NiL")
    head_of_account: str = Field(default="6/52", description="Head of Account code")
    advance_drawn: str = Field(default="NiL", description="Advance drawn or NiL")
    
    certifier_name: str = Field(default="Dr. Sankita J. Patel", description="Name of the person certifying purchase satisfaction")
    
    items: List[BillItem] = Field(min_length=1, description="List of expenditure items")
    taxes_or_other_charges: float = Field(default=0.0, ge=0, description="Applicable taxes or delivery charges")
    has_taxes: Optional[bool] = Field(default=False, description="Flag indicating explicit tax details")
    tax_details: Optional[str] = Field(default="", description="Detailed tax specification (e.g. CGST 9% + SGST 9%)")
    advance_adjustment_notes: Optional[str] = Field(default="", description="Notes regarding advance adjustment if applicable")
    
    # Supplier Details
    supplier_name: str = Field(description="Name of the vendor/supplier")
    supplier_gst: Optional[str] = Field(default="", description="GST registration number")
    any_other_taxes: Optional[str] = Field(default="-", description="Other tax breakdown if applicable")
    invoice_no_and_date: str = Field(default="", description="Invoice number and date")
    
    # Payment Details
    party_name: Optional[str] = Field(default="", description="Beneficiary / Party name")
    account_number: Optional[str] = Field(default="", description="Bank account number")
    account_holder_name: Optional[str] = Field(default="", description="Name of account holder")
    bank_name: Optional[str] = Field(default="", description="Bank name")
    branch_name: Optional[str] = Field(default="", description="Branch name")
    ifsc_code: Optional[str] = Field(default="", description="IFSC code")
    
    # Page 2: Stock Entry & Administrative
    lab_office: str = Field(default="Student Council", description="Laboratory / Office name")
    register_type: str = Field(default="Recurring Register", description="Register category: Recurring, Consumable, or Misc")
    serial_number: Optional[str] = Field(default="", description="Register serial number")
    page_number: Optional[str] = Field(default="", description="Register page number")
    stock_date: Optional[str] = Field(default="", description="Stock entry date")
    clerk_name: Optional[str] = Field(default="", description="Name of recording clerk/staff")
    
    indenter_name: str = Field(default="Dr. Sankita J. Patel", description="Name of faculty indenter")
    indenter_designation: str = Field(default="Assistant Professor", description="Indenter designation")
    indenter_department: str = Field(default="CSE", description="Indenter department")
    recommended_amount: Optional[float] = Field(default=None, description="Recommended amount (defaults to total)")

    @field_validator("items")
    @classmethod
    def validate_items(cls, v):
        if not v:
            raise ValueError("At least one bill item is required.")
        return v
