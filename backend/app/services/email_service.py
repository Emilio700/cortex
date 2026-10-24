"""Outbound email (Fase 4.2) - generic SMTP via stdlib smtplib.

No vendor SDK (SES/SendGrid/Postmark) is wired in: plain SMTP works with any
of them (and with Gmail/Mailtrap for local testing) by just changing the
SMTP_* env vars, so G.E.M.S isn't locked into one provider's client library
for something this simple.

If EMAIL_ENABLED is False (the default - see app.core.config), sends are
logged to stdout instead of attempted. This lets Fase 4.2's triggers exist
and be exercised end-to-end in dev/CI without real SMTP credentials, rather
than being skipped/mocked out entirely.
"""
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings


def send_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None,
) -> bool:
    """Send an email, optionally with HTML body and one attachment.

    Returns True if the email was actually sent (or would have been, in the
    disabled/dev case), False if sending was attempted and failed. Raises
    nothing on SMTP failure - a failed email should not 500 the endpoint that
    triggered it; callers surface the boolean to the user instead.
    """
    if not settings.EMAIL_ENABLED:
        print(f"[email disabled] Would send '{subject}' to {to_email}")
        return True

    message = MIMEMultipart("mixed")
    message["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>"
    message["To"] = to_email
    message["Subject"] = subject

    # Body: multipart/alternative (plain + HTML) for better client support
    body_part = MIMEMultipart("alternative")
    body_part.attach(MIMEText(body_text, "plain"))
    if body_html:
        body_part.attach(MIMEText(body_html, "html"))
    message.attach(body_part)

    if attachment_bytes is not None and attachment_filename is not None:
        part = MIMEApplication(attachment_bytes, Name=attachment_filename)
        part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
        message.attach(part)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM_ADDRESS, [to_email], message.as_string())
        return True
    except Exception as e:
        print(f"[email error] Failed to send '{subject}' to {to_email}: {e}")
        return False
