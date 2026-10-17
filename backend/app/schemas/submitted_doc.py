from typing import List, Optional
from pydantic import BaseModel, Field


class FinancialItem(BaseModel):
    item: str = Field(default="Banner (8*6)", min_length=1, max_length=200)
    amount: float = Field(default=800.0, ge=0)


class SubmittedDocRequest(BaseModel):
    # Reference Header
    ref_no: str = Field(default="ACM/2026-27/SIH/001", min_length=1, max_length=100)
    date: str = Field(default="08/09/2026", min_length=1, max_length=50)
    submitted_to: str = Field(default="Dean (Students Welfare)", min_length=1, max_length=150)
    
    # Primary Meta Table
    subject: str = Field(
        default="Requesting Permission to Conduct Internal Hackathon of SIH",
        min_length=1, max_length=300
    )
    chapter_name: str = Field(default="ACM", min_length=1, max_length=100)
    code_no: str = Field(default="6/52", min_length=1, max_length=50)
    event_schedule: str = Field(default="September 12th 2026", min_length=1, max_length=100)
    event_venue: str = Field(default="CSE Department", min_length=1, max_length=200)

    # About the Event
    event_title: str = Field(default="Internal Hackathon of SIH", min_length=1, max_length=200)
    category: str = Field(default="Hackathon", min_length=1, max_length=100)
    brief_description: str = Field(
        default="The Internal Hackathon for Smart India Hackathon (SIH) is an institute-level selection round organized to shortlist the best student teams who will represent the college/university at the National Level Smart India Hackathon.",
        min_length=1
    )
    objectives: str = Field(
        default="The SIH Internal Hackathon aims to foster innovation and problem-solving among students by encouraging them to develop practical solutions for real-world challenges. It promotes teamwork, creativity, and technical expertise while selecting the most promising projects to represent the institute at the national Smart India Hackathon stage.",
        min_length=1
    )
    target_audience: str = Field(default="All year Student", min_length=1, max_length=150)
    expected_participants: str = Field(default="1000+", min_length=1, max_length=100)
    judges: str = Field(default="Dr. Alok Kumar", min_length=1, max_length=200)

    # Financial Proposal
    financial_items: List[FinancialItem] = Field(
        default_factory=lambda: [
            FinancialItem(item="Banner (8*6)", amount=800.0),
            FinancialItem(item="Miscellaneous", amount=300.0)
        ]
    )

    # Page 2: Student Signatures
    student_head_name: str = Field(default="Ansh Gupta", min_length=1, max_length=100)
    student_head_roll: str = Field(default="I24AI005", min_length=1, max_length=50)
    student_head_branch: str = Field(default="AI", min_length=1, max_length=50)
    student_head_mobile: str = Field(default="+91 87806 37299", min_length=1, max_length=50)
    student_head_signature_data: Optional[str] = Field(default=None, max_length=1400000)
    student_head_signature_confirmed: bool = Field(default=False)

    student_secretary_name: str = Field(default="Arshad Khatib", min_length=1, max_length=100)
    student_secretary_roll: str = Field(default="U24AI112", min_length=1, max_length=50)
    student_secretary_branch: str = Field(default="AI", min_length=1, max_length=50)
    student_secretary_mobile: str = Field(default="+91 88060 45005", min_length=1, max_length=50)
    student_secretary_signature_data: Optional[str] = Field(default=None, max_length=1400000)
    student_secretary_signature_confirmed: bool = Field(default=False)

    # Faculty Signatures
    faculty_co_chairman_name: str = Field(default="Dr. Balu Parne", min_length=1, max_length=100)
    faculty_co_chairman_designation: str = Field(default="Co-Chairman", min_length=1, max_length=100)
    faculty_co_chairman_dept: str = Field(default="CSE", min_length=1, max_length=100)
    faculty_co_chairman_mobile: str = Field(default="+91 94224 48729", min_length=1, max_length=50)

    faculty_chairman_name: str = Field(default="Dr. Sankita Patel", min_length=1, max_length=100)
    faculty_chairman_designation: str = Field(default="Chairman", min_length=1, max_length=100)
    faculty_chairman_dept: str = Field(default="CSE", min_length=1, max_length=100)
    faculty_chairman_mobile: str = Field(default="+91 98792 20919", min_length=1, max_length=50)

    # Office Use & Dean SW Approvals
    office_sanctioned_amount: Optional[str] = Field(default="", max_length=100)
    office_amount_utilized: Optional[str] = Field(default="", max_length=100)
    office_proposed_amount: Optional[str] = Field(default="", max_length=100)
    office_balance_amount: Optional[str] = Field(default="", max_length=100)
    office_clerk_signature: Optional[str] = Field(default="", max_length=100)

    chairman_fsw: str = Field(default="Dr. Rakesh Maurya", min_length=1, max_length=100)
    associate_dean_sw: str = Field(default="Dr. Manish K Rathod", min_length=1, max_length=100)
    dean_sw: str = Field(default="Dr. Sanjay R. Patel", min_length=1, max_length=100)
