import os
import pytest
from app.services import email_service

@pytest.fixture(autouse=True)
def configure_test_email_environment(monkeypatch, request):
    """
    Ensures general integration tests run against simulated in-memory email capture
    so that tests with synthetic emails (e.g. author@svnit.acm.org) don't trigger
    external HTTP calls or fail due to sandbox domain restrictions.
    Specific email unit tests (e.g. test_email_service.py) explicitly set RESEND_API_KEY.
    """
    if "test_email_service" not in getattr(request.module, "__name__", ""):
        monkeypatch.setenv("RESEND_API_KEY", "")
        monkeypatch.setattr(email_service, "send_signup_otp_email", lambda *args, **kwargs: True)
        monkeypatch.setattr(email_service, "send_password_reset_otp_email", lambda *args, **kwargs: True)
        monkeypatch.setattr(email_service, "send_login_otp_email", lambda *args, **kwargs: True)
