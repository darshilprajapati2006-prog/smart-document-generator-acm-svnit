from pydantic import BaseModel, Field
from typing import Optional

class ExecutiveMeetRequest(BaseModel):
    ref_no: str = Field(default="ACM/26-27/ROOM/009", description="Reference number")
    date: str = Field(description="Document issue date (DD/MM/YYYY or YYYY-MM-DD)")
    submitted_to: str = Field(default="HoD(CSE Dept.)", description="Recipient designation/department")
    subject: str = Field(
        default="Requesting Permission to Conduct ACM Executives Meet in Seminar Hall 402, CSE Department.",
        description="Formal subject line"
    )
    event_name: str = Field(default="ACM Executives Meet", description="Title of the event")
    venue: str = Field(default="Seminar Hall 402, CSE Department", description="Event location")
    event_date: str = Field(description="Date the event will be conducted")
    time_from: str = Field(default="06:00 PM", description="Start time")
    time_to: str = Field(default="07:30 PM", description="End time")
    brief_description: str = Field(
        description="Detailed description of the event purpose and activities"
    )
    objective: str = Field(
        description="Clear educational or organizational objectives"
    )
    participants: str = Field(default="150+", description="Expected participant count or description")
    mode: str = Field(default="Offline", description="Mode of conduct (Offline, Online, Hybrid)")
    organizers: str = Field(default="ACM Core 2026-27", description="Organizing committee / club name")
    
    # Signatories
    lead_name: str = Field(default="Ansh Gupta", description="Student Head / Chairperson")
    lead_designation: str = Field(default="Chairperson, ACM", description="Lead designation")
    lead_admission_no: str = Field(default="I24AI005", description="Student admission number")
    lead_branch: str = Field(default="Artificial Intelligence", description="Department/branch")
    lead_mobile: Optional[str] = Field(default="", description="Contact mobile number")
    
    tech_assist_name: str = Field(default="Sunny Bodiwala", description="Technical Assistant")
    tech_assist_designation: str = Field(default="Tech Assistant, Seminar Hall", description="Technical Assistant role")
    tech_assist_branch: str = Field(default="Computer Science & Engineering", description="Department")
    tech_assist_mobile: Optional[str] = Field(default="", description="Contact mobile")

    faculty_incharge_name: str = Field(default="Shri. Rakesh P. Gohil", description="Faculty in-charge")
    faculty_incharge_designation: str = Field(default="Faculty in-charge, Seminar Hall", description="Role")
    faculty_incharge_branch: str = Field(default="Computer Science & Engineering", description="Department")

    faculty_chairman_name: str = Field(default="Dr. Sankita J. Patel", description="Faculty Chairman")
    faculty_chairman_designation: str = Field(default="Chairman, ACM", description="Role")
    faculty_chairman_branch: str = Field(default="Computer Science & Engineering", description="Department")
