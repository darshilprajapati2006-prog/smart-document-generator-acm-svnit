"""
Automatic Document-Type Detection Service.
Classifies natural-language prompts to recommend the optimal template among:
- Executive Meet (exec_meet)
- Bill Certificate (bill_certificate)
- Bill Summary (bill_summary)
- Prize Money Receipt (prize_money_receipt)

Provides confidence scores, classification rationale, ambiguity detection,
and respects explicit user overrides.
"""
import re
from typing import Dict, Any, List, Optional

class DocumentClassifier:
    
    PATTERNS = {
        "exec_meet": {
            "strong": [
                r"\b(executive\s+meet|exec\s+meet|permission\s+letter|hall\s+permission|reservation)\b",
                r"\b(organiz(?:e|ing)|conduct(?:ing)?|host(?:ing)?)\s+(?:an?\s+)?(workshop|seminar|meet|session|talk|hackathon|bootcamp|orientation)\b",
                r"\b(seminar\s+hall|department\s+room|audi|auditorium|amphitheatre)\b",
                r"\b(agenda|speakers?|schedule|attendees|participants\s+count)\b"
            ],
            "context": [
                r"\b(event|date|time|venue|mode|offline|online|coordinator|speaker)\b"
            ]
        },
        "bill_certificate": {
            "strong": [
                r"\b(bill\s+certificate|recurring\s+expenditure|form\s+bc-?r|stock\s+register)\b",
                r"\b(supplier|vendor|stationery|printing\s+press|invoice\s+no|gst\s*no|purchase\s+order)\b",
                r"\b(\d+\s+(?:notebooks|pens|banners|badges|certificates|posters)\s+(?:at|@))\b",
                r"\b(unit\s+price|unit\s+cost|per\s+item|subtotal|grand\s+total)\b"
            ],
            "context": [
                r"\b(purchas|procure|bought|cost|item|qty|quantity|bill)\b"
            ]
        },
        "bill_summary": {
            "strong": [
                r"\b(bill\s+summary|reimbursement\s+summary|expense\s+summary|prize\s+distribution)\b",
                r"\b(reimburse|reimbursement|prize\s+distribution|contingency\s+summary)\b",
                r"\b(recipients?|winners?|paid\s+to|account\s+details|ifsc)\b",
                r"\b(multiple\s+students|travel\s+expense|food\s+expense|printing\s+expense)\b"
            ],
            "context": [
                r"\b(summary|cost\s+incurred|total\s+amount|breakdown|participants\s+paid)\b"
            ]
        }
        ,"prize_money_receipt": {
            "strong": [r"\b(prize\s+money\s+receipt|receipt\s+of\s+prize\s+money)\b"],
            "context": [r"\b(position\s+secured|pan\s+card|affiliating\s+institute)\b"],
        }
    }

    @classmethod
    def classify(cls, prompt: str, explicitly_selected: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyzes prompt and returns structured classification result.
        """
        text = (prompt or "").strip()
        if not text:
            return {
                "recommended_type": explicitly_selected or "exec_meet",
                "confidence": "none",
                "confidence_score": 0.0,
                "rationale": "Empty prompt provided; defaulting to current selection.",
                "is_ambiguous": True,
                "candidate_scores": {},
                "missing_information": ["All prompt details are missing."]
            }

        scores = {doc_type: 0 for doc_type in cls.PATTERNS}
        reasons = {doc_type: [] for doc_type in cls.PATTERNS}

        lower = text.lower()

        # Score matching
        for doc_type, patterns in cls.PATTERNS.items():
            for pat in patterns["strong"]:
                matches = re.findall(pat, lower, re.IGNORECASE)
                if matches:
                    scores[doc_type] += 3 * len(matches)
                    reasons[doc_type].append(f"Strong match: '{pat}' ({len(matches)}x)")
            for pat in patterns["context"]:
                matches = re.findall(pat, lower, re.IGNORECASE)
                if matches:
                    scores[doc_type] += 1 * len(matches)
                    reasons[doc_type].append(f"Context match: '{pat}'")

        sorted_candidates = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        detected_type, top_score = sorted_candidates[0]
        second_type, second_score = sorted_candidates[1]

        # Evaluate ambiguity
        is_ambiguous = False
        ambiguity_reason = ""
        
        if top_score == 0:
            is_ambiguous = True
            ambiguity_reason = "Prompt lacks specific keywords for any known document type."
            top_type = explicitly_selected or "exec_meet"
            confidence = "low"
            calibrated_score = 0.2
        elif top_score > 0 and (top_score - second_score) <= 1 and second_score > 0:
            is_ambiguous = True
            ambiguity_reason = f"Prompt shares characteristics between {detected_type} and {second_type}."
            top_type = detected_type
            confidence = "medium"
            calibrated_score = 0.5
        elif top_score >= 6:
            top_type = detected_type
            confidence = "high"
            calibrated_score = min(0.95, 0.6 + (top_score * 0.05))
        else:
            top_type = detected_type
            confidence = "medium"
            calibrated_score = 0.65

        # Rationale string
        matched_reasons = reasons.get(detected_type, [])
        rationale = f"Classified as {top_type} based on: " + (", ".join(matched_reasons[:3]) if matched_reasons else "default fallback")
        if is_ambiguous:
            rationale += f" Note: Ambiguity detected ({ambiguity_reason})."

        # Missing information checks
        missing = []
        if top_type == "exec_meet":
            if not re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:october|november|december|january|february|march|april|may|june|july|august|september)\b", lower):
                missing.append("Event Date")
            if not re.search(r"\b(hall|lab|room|audi|seminar|campus|svnit)\b", lower):
                missing.append("Venue")
        elif top_type == "bill_certificate":
            if not re.search(r"\b(from|supplier|vendor|store|prints)\b", lower):
                missing.append("Supplier Name")
            if not re.search(r"\b\d+\s+[A-Za-z]+\s+(?:at|@)\b", lower):
                missing.append("Itemized quantities and rates")
        elif top_type == "bill_summary":
            if not re.search(r"\b(reimburse|paid|rs\.?|inr|₹|\d{3,})\b", lower):
                missing.append("Recipient payment amounts")
        elif top_type == "prize_money_receipt":
            if not re.search(r"\b\d+(?:\.\d{1,2})?\b", lower):
                missing.append("Prize Amount")
            if not re.search(r"\b(student|winner|recipient)\b", lower):
                missing.append("Student Name")

        # Respect explicit selection
        override_note = ""
        recommended = top_type
        if explicitly_selected:
            recommended = explicitly_selected
            override_note = f"User explicitly selected '{explicitly_selected}'."
            if detected_type != explicitly_selected:
                override_note += f" (Prompt analysis suggested '{detected_type}')"

        return {
            "recommended_type": recommended,
            "confidence": confidence,
            "confidence_score": round(calibrated_score, 2),
            "rationale": rationale,
            "is_ambiguous": is_ambiguous,
            "ambiguity_reason": ambiguity_reason,
            "candidate_scores": scores,
            "missing_information": missing,
            "explicit_override": override_note
        }
