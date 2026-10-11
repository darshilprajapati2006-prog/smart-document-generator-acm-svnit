from pydantic import BaseModel, Field
from typing import Optional

class ExecutiveMeetRequest(BaseModel):
    ref_no: str = Field(default="", description="Reference number")
    date: str = Field(description="Document issue date (DD/MM/YYYY or YYYY-MM-DD)")
    submitted_to: str = Field(default="", description="Recipient designation/department")
    subject: str = Field(default="", description="Formal subject line")
    event_name: str = Field(default="", description="Title of the event")
    venue: str = Field(default="", description="Event location")
    event_date: str = Field(description="Date the event will be conducted")
    time_from: str = Field(default="", description="Start time")
    time_to: str = Field(default="", description="End time")
    brief_description: str = Field(
        description="Detailed description of the event purpose and activities"
    )
    objective: str = Field(description="Clear educational or organizational objectives")
    participants: str = Field(default="", description="Expected participant count or description")
    mode: str = Field(default="Offline", description="Mode of conduct (Offline, Online, Hybrid)")
    organizers: str = Field(default="", description="Organizing committee / club name")
    
    # Conditional / Dynamic Section Fields
    online_meeting_platform: Optional[str] = Field(default="", description="Platform for online events (e.g. Google Meet, Zoom)")
    online_meeting_link: Optional[str] = Field(default="", description="Join URL for online sessions")
    has_agenda: Optional[bool] = Field(default=False, description="Toggle to display formal agenda section")
    agenda_items: Optional[str] = Field(default="", description="Agenda points or schedule outline")
    
    # Signatories
    lead_name: str = Field(default="", description="Student Head / Chairperson")
    lead_designation: str = Field(default="", description="Lead designation")
    lead_admission_no: str = Field(default="", description="Student admission number")
    lead_branch: str = Field(default="", description="Department/branch")
    lead_mobile: Optional[str] = Field(default="", description="Contact mobile number")
    
    tech_assist_name: str = Field(default="", description="Technical Assistant")
    tech_assist_designation: str = Field(default="", description="Technical Assistant role")
    tech_assist_branch: str = Field(default="", description="Department")
    tech_assist_mobile: Optional[str] = Field(default="", description="Contact mobile")

    faculty_incharge_name: str = Field(default="", description="Faculty in-charge")
    faculty_incharge_designation: str = Field(default="", description="Role")
    faculty_incharge_branch: str = Field(default="", description="Department")

    faculty_chairman_name: str = Field(default="", description="Faculty Chairman")
    faculty_chairman_designation: str = Field(default="", description="Role")
    faculty_chairman_branch: str = Field(default="", description="Department")
