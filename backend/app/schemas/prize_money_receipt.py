from decimal import Decimal
import re

from pydantic import BaseModel, Field, field_validator


class PrizeMoneyReceiptRequest(BaseModel):
    serial_number: str = Field(min_length=1, max_length=60)
    date: str = Field(min_length=1, max_length=40)
    amount_rupees: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    competition_name: str = Field(min_length=1, max_length=240)
    position: str = Field(min_length=1, max_length=120)
    organizing_body: str = Field(min_length=1, max_length=240)
    event_date: str = Field(min_length=1, max_length=40)
    venue: str = Field(min_length=1, max_length=240)
    affiliating_institute: str = Field(min_length=1, max_length=240)
    name_as_per_bank: str = Field(min_length=1, max_length=160)
    bank_name: str = Field(min_length=1, max_length=160)
    branch: str = Field(min_length=1, max_length=160)
    account_number: str = Field(min_length=1, max_length=80)
    ifsc_code: str = Field(min_length=1, max_length=20)
    pan_number: str = Field(min_length=1, max_length=20)
    student_name: str = Field(min_length=1, max_length=160)
    roll_number: str = Field(min_length=1, max_length=60)
    course_semester: str = Field(min_length=1, max_length=120)
    mobile_number: str = Field(min_length=1, max_length=30)
    chairman_name: str = Field(min_length=1, max_length=160)

    @field_validator(
        "serial_number", "date", "competition_name", "position", "organizing_body",
        "event_date", "venue", "affiliating_institute", "name_as_per_bank", "bank_name",
        "branch", "account_number", "ifsc_code", "pan_number", "student_name",
        "roll_number", "course_semester", "mobile_number", "chairman_name",
    )
    @classmethod
    def required_values_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value

    @field_validator("ifsc_code")
    @classmethod
    def normalize_ifsc(cls, value: str) -> str:
        value = value.upper()
        if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", value):
            raise ValueError("Enter a valid 11-character IFSC code.")
        return value

    @field_validator("pan_number")
    @classmethod
    def normalize_pan(cls, value: str) -> str:
        value = value.upper()
        if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", value):
            raise ValueError("Enter a valid PAN number.")
        return value

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        compact = re.sub(r"[\s()-]", "", value)
        if not re.fullmatch(r"(?:\+91)?[6-9]\d{9}", compact):
            raise ValueError("Enter a valid Indian mobile number.")
        return value.strip()
