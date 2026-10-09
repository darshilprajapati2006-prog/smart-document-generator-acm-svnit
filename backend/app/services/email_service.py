"""
Configurable Transactional & SMTP Email Service for SmartDocs SVNIT.
Handles delivery of verification OTPs for sign-up, two-factor login, and password resets.
Adheres to strict security standards:
- Configuration via environment variables.
- Resilient error handling without crashing application state.
- In-memory inspection interface for test runner verification.
- Zero credential leakage to frontend or logs.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Test & Debug in-memory message log (stores delivery records for test assertions)
LAST_SENT_EMAILS: List[Dict[str, Any]] = []

def get_email_config() -> Dict[str, Any]:
    """Reads SMTP configuration from server-side environment variables."""
    return {
        "host": os.getenv("SMTP_HOST", "").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME", "").strip(),
        "password": os.getenv("SMTP_PASSWORD", "").strip(),
        "from_email": os.getenv("SMTP_FROM_EMAIL", "noreply@svnit.acm.org").strip(),
        "from_name": os.getenv("SMTP_FROM_NAME", "SmartDocs SVNIT · ACM Chapter").strip(),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() in ["1", "true", "yes"],
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() in ["1", "true", "yes"],
    }

def format_otp_html(
    title: str,
    subtitle: str,
    recipient_name: str,
    otp: str,
    purpose_desc: str,
    expires_minutes: int = 10
) -> str:
    """Generates an HTML email with SmartDocs SVNIT branding."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }}
    .container {{
      max-width: 560px;
      margin: 30px auto;
      background: #1e293b;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }}
    .header {{
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      padding: 28px 24px;
      text-align: center;
      color: #ffffff;
    }}
    .header h1 {{
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.02em;
    }}
    .header p {{
      margin: 6px 0 0 0;
      font-size: 13px;
      opacity: 0.9;
    }}
    .content {{
      padding: 32px 28px;
    }}
    .greeting {{
      font-size: 16px;
      color: #f1f5f9;
      margin-bottom: 14px;
    }}
    .desc {{
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 24px;
    }}
    .otp-box {{
      background: rgba(15, 23, 42, 0.85);
      border: 2px dashed #0284c7;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }}
    .otp-code {{
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #38bdf8;
      font-family: 'Courier New', Courier, monospace;
    }}
    .expiry {{
      margin-top: 8px;
      font-size: 12px;
      color: #cbd5e1;
    }}
    .warning {{
      background: rgba(239, 68, 68, 0.1);
      border-left: 4px solid #ef4444;
      padding: 12px 14px;
      border-radius: 6px;
      font-size: 13px;
      color: #fca5a5;
      margin-top: 24px;
      line-height: 1.5;
    }}
    .footer {{
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SmartDocs SVNIT</h1>
      <p>ACM Student Chapter · Sardar Vallabhbhai National Institute of Technology</p>
    </div>
    <div class="content">
      <div class="greeting">Hello, <strong>{recipient_name}</strong></div>
      <div class="desc">{purpose_desc}</div>
      <div class="otp-box">
        <div class="otp-code">{otp}</div>
        <div class="expiry">⏱️ Valid for {expires_minutes} minutes</div>
      </div>
      <div class="warning">
        <strong>Security Notice:</strong> Never share this verification code with anyone. ACM SVNIT administrators will never ask for your code.
      </div>
    </div>
    <div class="footer">
      This is an automated institutional message from SmartDocs ACM SVNIT Surat.<br>
      If you did not initiate this request, you can safely ignore this email.
    </div>
  </div>
</body>
</html>"""

def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    purpose: str = "general",
    otp_code: Optional[str] = None
) -> bool:
    """
    Sends an email using the configured SMTP server.
    If no SMTP host is configured, safely records in memory for local dev/testing.
    Returns True if sent or queued safely in dev mode; False on transmission failure.
    """
    cfg = get_email_config()
    record = {
        "to_email": to_email,
        "subject": subject,
        "purpose": purpose,
        "otp_code": otp_code,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "live_delivery": False
    }

    # If SMTP is configured, attempt real delivery
    if cfg["host"]:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
            msg["To"] = to_email

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            msg.attach(part1)
            msg.attach(part2)

            if cfg["use_ssl"]:
                server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10.0)
            else:
                server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=10.0)
                if cfg["use_tls"]:
                    server.starttls()

            if cfg["username"] and cfg["password"]:
                server.login(cfg["username"], cfg["password"])

            server.sendmail(cfg["from_email"], [to_email], msg.as_string())
            server.quit()
            record["live_delivery"] = True
            LAST_SENT_EMAILS.append(record)
            logger.info("Successfully dispatched live email to %s for %s", to_email, purpose)
            return True
        except Exception as exc:
            logger.error("Failed to transmit email via SMTP (%s): %s", cfg["host"], str(exc))
            record["delivery_error"] = str(exc)
            LAST_SENT_EMAILS.append(record)
            # In production when SMTP is explicitly configured, failure to send returns False
            return False
    else:
        # Development / test mode: safe simulated delivery
        logger.info("[DEV EMAIL] SMTP_HOST not set. Captured message for %s (Purpose: %s)", to_email, purpose)
        record["live_delivery"] = False
        LAST_SENT_EMAILS.append(record)
        return True

def send_signup_otp_email(
    to_email: str,
    recipient_name: str,
    otp: str,
    expires_minutes: int = 10
) -> bool:
    """Dispatches sign-up email verification OTP."""
    subject = "[SmartDocs SVNIT] Verify Your Institutional Email Address"
    desc = "Thank you for registering on SmartDocs SVNIT. Please use the verification code below to activate your account:"
    text = f"Hello {recipient_name},\n\nYour SmartDocs SVNIT sign-up verification code is: {otp}\nValid for {expires_minutes} minutes.\nNever share this code with anyone.\n\nACM SVNIT Surat"
    html = format_otp_html(subject, "Institutional Email Verification", recipient_name, otp, desc, expires_minutes)
    return send_email(to_email, subject, html, text, purpose="signup_verification", otp_code=otp)

def send_login_otp_email(
    to_email: str,
    recipient_name: str,
    otp: str,
    expires_minutes: int = 10
) -> bool:
    """Dispatches two-factor login verification OTP."""
    subject = "[SmartDocs SVNIT] Your One-Time Login Verification Code"
    desc = "A sign-in request was made for your SmartDocs SVNIT account. Enter this one-time code to complete sign-in:"
    text = f"Hello {recipient_name},\n\nYour SmartDocs SVNIT one-time login code is: {otp}\nValid for {expires_minutes} minutes.\nNever share this code with anyone.\n\nACM SVNIT Surat"
    html = format_otp_html(subject, "Two-Factor Login Verification", recipient_name, otp, desc, expires_minutes)
    return send_email(to_email, subject, html, text, purpose="login_2fa", otp_code=otp)

def send_password_reset_otp_email(
    to_email: str,
    recipient_name: str,
    otp: str,
    expires_minutes: int = 10
) -> bool:
    """Dispatches password recovery verification OTP."""
    subject = "[SmartDocs SVNIT] Password Reset Verification Code"
    desc = "We received a request to reset your password for SmartDocs SVNIT. Use the code below to complete password reset:"
    text = f"Hello {recipient_name},\n\nYour SmartDocs SVNIT password reset code is: {otp}\nValid for {expires_minutes} minutes.\nNever share this code with anyone.\n\nACM SVNIT Surat"
    html = format_otp_html(subject, "Password Reset Request", recipient_name, otp, desc, expires_minutes)
    return send_email(to_email, subject, html, text, purpose="password_reset", otp_code=otp)

def get_latest_sent_otp(email: str, purpose: str) -> Optional[str]:
    """Helper for automated tests to retrieve the latest OTP sent to an email."""
    for record in reversed(LAST_SENT_EMAILS):
        if record["to_email"].lower() == email.lower() and record["purpose"] == purpose:
            return record.get("otp_code")
    return None
