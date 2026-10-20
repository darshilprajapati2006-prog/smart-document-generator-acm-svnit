import os
import json
import logging
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an intelligent NLP document information extraction assistant for official university documents (ACM SVNIT Surat).
Your task is to extract information strictly from the user's prompt into a clean JSON object.

RULES:
1. Extract ONLY facts explicitly stated in the text.
2. DO NOT fabricate, guess, or invent any names, dates, amounts, reference numbers, or signatories.
3. If a field is not explicitly mentioned in the user prompt, omit it entirely from the JSON.
4. Normalize dates to DD/MM/YYYY or DD Month YYYY as given in text.
5. Normalize times to HH:MM AM/PM.
6. Support document types: "exec_meet", "bill_certificate", "bill_summary", "prize_money_receipt", and "submitted".
7. For "exec_meet", supported keys are:
   - event_name
   - event_date
   - venue
   - time_from (start time)
   - time_to (end time)
   - participants (expected count)
   - organizers (organizing club/team)
   - mode (Offline, Online, or Hybrid ONLY if explicitly stated)
   - brief_description (summary of session coverage)
   - lead_name (coordinator / student head)
   - objective
8. For "prize_money_receipt", supported keys are: serial_number, date, amount_rupees, competition_name, position, organizing_body, event_date, venue, affiliating_institute, name_as_per_bank, bank_name, branch, account_number, ifsc_code, pan_number, student_name, roll_number, course_semester, mobile_number, chairman_name.
9. For "submitted", supported keys are: ref_no, date, submitted_to, subject, chapter_name, code_no, event_schedule, event_venue, event_title, category, brief_description, objectives, target_audience, expected_participants, judges, financial_items (array of {item, amount}), student_head_name, student_head_roll, student_head_branch, student_head_mobile, student_secretary_name, student_secretary_roll, student_secretary_branch, student_secretary_mobile, faculty_co_chairman_name, faculty_co_chairman_designation, faculty_co_chairman_dept, faculty_co_chairman_mobile, faculty_chairman_name, faculty_chairman_designation, faculty_chairman_dept, faculty_chairman_mobile.
10. For bank, PAN, phone, and signatory details, only return values explicitly provided by the user.
11. Output MUST be valid JSON only, without markdown fences or additional commentary.
"""

def is_llm_configured() -> bool:
    """Returns True if an external LLM API key is present in environment."""
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"))

def extract_with_llm(text: str, document_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Attempts intelligent LLM extraction if an API key is configured.
    Falls back gracefully to None if not configured, timed out, or on network failure.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not (gemini_key or openai_key):
        return None

    # Limit text length to prevent resource exhaustion
    cleaned_text = text.strip()[:4000]
    if not cleaned_text:
        return None

    try:
        if gemini_key:
            return _call_gemini(cleaned_text, gemini_key, document_type)
        elif openai_key:
            return _call_openai(cleaned_text, openai_key, document_type)
    except Exception as e:
        logger.warning(f"LLM extraction fallback encountered an error: {e}")
        return None

    return None

def _call_gemini(text: str, api_key: str, document_type: Optional[str]) -> Optional[Dict[str, Any]]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{SYSTEM_PROMPT}\nTarget document type: {document_type or 'unspecified'}\n\nUser prompt:\n{text}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    with httpx.Client(timeout=10.0) as client:
        res = client.post(url, json=payload)
        if res.status_code == 200:
            data = res.json()
            raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return _sanitize_llm_json(raw_text)
    return None

def _call_openai(text: str, api_key: str, document_type: Optional[str]) -> Optional[Dict[str, Any]]:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Target document type: {document_type or 'unspecified'}\n\nPrompt:\n{text}"}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }

    with httpx.Client(timeout=10.0) as client:
        res = client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            data = res.json()
            raw_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return _sanitize_llm_json(raw_text)
    return None

def _sanitize_llm_json(raw_text: str) -> Optional[Dict[str, Any]]:
    if not raw_text:
        return None
    try:
        # Strip potential markdown code fences
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return None
