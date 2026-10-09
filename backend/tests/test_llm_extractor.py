import os
import json
import pytest
from unittest.mock import patch, MagicMock
from app.services.llm_extractor import (
    is_llm_configured,
    extract_with_llm,
    _sanitize_llm_json,
)

def test_is_llm_configured_without_keys():
    with patch.dict(os.environ, {}, clear=True):
        assert is_llm_configured() is False

def test_is_llm_configured_with_gemini_key():
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key_123"}, clear=True):
        assert is_llm_configured() is True

def test_is_llm_configured_with_openai_key():
    with patch.dict(os.environ, {"OPENAI_API_KEY": "fake_test_key_abc"}, clear=True):
        assert is_llm_configured() is True

def test_extract_with_llm_graceful_when_not_configured():
    with patch.dict(os.environ, {}, clear=True):
        result = extract_with_llm("Organize an AI workshop on 25 October 2026")
        assert result is None

def test_extract_with_llm_mocked_gemini_success():
    mock_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps({
                                "event_name": "AI Workshop",
                                "event_date": "25/10/2026",
                                "venue": "Seminar Hall 402"
                            })
                        }
                    ]
                }
            }
        ]
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_payload

    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=True):
        with patch("httpx.Client.post", return_value=mock_response):
            res = extract_with_llm("Organize an AI workshop on 25 October 2026 at Seminar Hall 402", "exec_meet")
            assert res is not None
            assert res["event_name"] == "AI Workshop"
            assert res["event_date"] == "25/10/2026"
            assert res["venue"] == "Seminar Hall 402"

def test_extract_with_llm_timeout_handled_gracefully():
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=True):
        with patch("httpx.Client.post", side_effect=Exception("ReadTimeout")):
            res = extract_with_llm("Workshop on Friday", "exec_meet")
            # Must not crash, should return None safely
            assert res is None

def test_sanitize_llm_json_clean_markdown_fence():
    raw_markdown = "```json\n{\"event_name\": \"Cloud Computing Meet\"}\n```"
    parsed = _sanitize_llm_json(raw_markdown)
    assert parsed == {"event_name": "Cloud Computing Meet"}

def test_sanitize_llm_json_malformed():
    raw_malformed = "This is not json {invalid..."
    parsed = _sanitize_llm_json(raw_malformed)
    assert parsed is None
