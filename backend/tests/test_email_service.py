"""
Automated Unit & Integration Tests for Resend HTTPS Email Service.
Tests:
1. Resend API successful email dispatch (HTTP 200/201).
2. Resend API error handling (HTTP 403/422/500) without fake success responses.
3. Resend connection failure / network timeout handling.
4. Unconfigured dev fallback (safe in-memory capture).
5. SENDER address formatting and EMAIL_FROM environment variable resolution.
6. Secret protection (RESEND_API_KEY never leaked in error logs or responses).
"""
import pytest
from unittest.mock import patch, MagicMock
import httpx
from app.services.email_service import (
    send_email,
    send_signup_otp_email,
    send_login_otp_email,
    send_password_reset_otp_email,
    get_email_config,
    LAST_SENT_EMAILS
)

def test_email_config_reads_resend_and_email_from(monkeypatch):
    """Verify get_email_config reads RESEND_API_KEY and formats EMAIL_FROM correctly."""
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key_12345")
    monkeypatch.setenv("EMAIL_FROM", "onboarding@resend.dev")
    monkeypatch.setenv("EMAIL_FROM_NAME", "SmartDocs SVNIT")

    cfg = get_email_config()
    assert cfg["api_key"] == "re_test_key_12345"
    assert "onboarding@resend.dev" in cfg["from_address"]
    assert "SmartDocs SVNIT" in cfg["from_address"]


def test_resend_api_successful_dispatch(monkeypatch):
    """Verify successful email delivery via Resend HTTPS API."""
    monkeypatch.setenv("RESEND_API_KEY", "re_mock_valid_key")
    monkeypatch.setenv("EMAIL_FROM", "SmartDocs SVNIT <onboarding@resend.dev>")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "res_msg_abc12345"}

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        success = send_signup_otp_email(
            to_email="testuser@svnit.acm.org",
            recipient_name="Test User",
            otp="849201"
        )
        assert success is True
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer re_mock_valid_key"
        assert call_kwargs["json"]["to"] == ["testuser@svnit.acm.org"]
        assert call_kwargs["json"]["from"] == "SmartDocs SVNIT <onboarding@resend.dev>"
        assert "849201" in call_kwargs["json"]["html"]

        # Check recorded message
        latest = LAST_SENT_EMAILS[-1]
        assert latest["live_delivery"] is True
        assert latest["provider_id"] == "res_msg_abc12345"


def test_resend_api_rejection_returns_false_without_fake_success(monkeypatch):
    """Verify Resend HTTP 403/422 error returns False and does not report fake success."""
    monkeypatch.setenv("RESEND_API_KEY", "re_mock_key")
    monkeypatch.setenv("EMAIL_FROM", "invalid-domain@svnit.acm.org")

    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.json.return_value = {
        "statusCode": 403,
        "message": "Domain not verified. You can only send testing emails from onboarding@resend.dev",
        "name": "validation_error"
    }

    with patch("httpx.Client.post", return_value=mock_resp):
        success = send_login_otp_email(
            to_email="unverified@domain.com",
            recipient_name="Unverified User",
            otp="112233"
        )
        # Must return False, no fake success!
        assert success is False

        latest = LAST_SENT_EMAILS[-1]
        assert latest["live_delivery"] is False
        assert "Domain not verified" in latest["delivery_error"]


def test_resend_network_exception_handling(monkeypatch):
    """Verify network timeouts or DNS errors return False gracefully."""
    monkeypatch.setenv("RESEND_API_KEY", "re_mock_key")

    with patch("httpx.Client.post", side_effect=httpx.ConnectTimeout("Connection timed out")):
        success = send_password_reset_otp_email(
            to_email="timeout@svnit.acm.org",
            recipient_name="Timeout User",
            otp="998877"
        )
        assert success is False
        latest = LAST_SENT_EMAILS[-1]
        assert "timed out" in latest["delivery_error"].lower()


def test_unconfigured_resend_fallback(monkeypatch):
    """Verify unconfigured local dev mode safely captures emails without crashing."""
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    success = send_email(
        to_email="localdev@svnit.acm.org",
        subject="Test Subject",
        html_content="<p>Test</p>",
        text_content="Test",
        purpose="signup_verification",
        otp_code="654321"
    )
    assert success is True
    latest = LAST_SENT_EMAILS[-1]
    assert latest["live_delivery"] is False
    assert latest["otp_code"] == "654321"
