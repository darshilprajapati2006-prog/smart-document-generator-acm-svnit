from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

class BillSummaryRow(BaseModel):
    sr_no: Optional[int] = None
    name: str = Field(description="Name of the winner or reimbursement recipient")
    account_details: Optional[str] = Field(default="", description="Account summary string (e.g., A/C: 12345, IFSC: ABCD0001)")
    to_be_paid_to: Optional[str] = Field(default="", description="Payee recipient name")
    prize_money: float = Field(default=0.0, ge=0, description="Prize money in INR")
    other_amount: float = Field(default=0.0, ge=0, description="Other expenses / reimbursement in INR")
    account_no: Optional[str] = Field(default="", description="Dedicated bank account number for table 2")
    ifsc_code: Optional[str] = Field(default="", description="IFSC code for table 2")

class BillSummaryRequest(BaseModel):
    date: str = Field(description="Document issue date")
    title: str = Field(default="BILL SUMMARY", description="Main heading")
    subtitle: str = Field(
        default="Reimbursement for Cost incurred in SIH Internal Hackathon",
        description="Event context or activity summary"
    )
    rows: List[BillSummaryRow] = Field(min_length=1, description="List of payment rows")
    has_bank_transfer_breakdown: Optional[bool] = Field(default=False, description="Display dedicated bank routing breakdown table")
    expense_categories: Optional[str] = Field(default="", description="Comma-separated expense categories included")
    
    # Signatories
    student_head_name: str = Field(default="Ansh Gupta", description="Student Head")
    student_head_title: str = Field(default="Student Head", description="Title")
    student_head_signature_data: Optional[str] = Field(default=None, max_length=1400000)
    student_head_signature_confirmed: bool = Field(default=False)
    student_secretary_name: str = Field(default="Arshad Khatib", description="Student Secretary")
    student_secretary_title: str = Field(default="Student Secretary", description="Title")
    student_secretary_signature_data: Optional[str] = Field(default=None, max_length=1400000)
    student_secretary_signature_confirmed: bool = Field(default=False)
    faculty_chairman_name: str = Field(default="Dr. Sankita Patel", description="Faculty Chairman")
    faculty_chairman_title: str = Field(default="Faculty Chairman", description="Title")
    club_name: str = Field(default="ACM NIT-Surat", description="Club designation")

    @field_validator("rows")
    @classmethod
    def validate_rows(cls, v):
        if not v:
            raise ValueError("At least one recipient row is required.")
        return v
