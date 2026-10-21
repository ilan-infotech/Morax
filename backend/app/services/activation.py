"""Secure, one-time account activation and delivery helpers."""

import hashlib
import logging
import secrets
import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import User, UserActivation


logger = logging.getLogger(__name__)


def activation_url(token: str) -> str:
    base_url = settings.frontend_base_url.rstrip("/")
    return f"{base_url}/activate?{urlencode({'token': token})}"


def issue_activation(db: Session, user: User, created_by_id: str | None) -> tuple[UserActivation, str]:
    """Replace any outstanding activation link and return the raw token once."""
    now = datetime.now(UTC)
    for existing in db.scalars(
        select(UserActivation).where(
            UserActivation.user_id == user.id,
            UserActivation.used_at.is_(None),
        )
    ):
        existing.used_at = now
    token = secrets.token_urlsafe(48)
    activation = UserActivation(
        user_id=user.id,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        expires_at=now + timedelta(minutes=settings.activation_token_minutes),
        created_by_id=created_by_id,
    )
    db.add(activation)
    return activation, token


def set_unusable_password(user: User) -> None:
    """Provision an account without ever generating or retaining a usable password."""
    user.password_hash = hash_password(secrets.token_urlsafe(48))
    user.must_change_password = True


def activate_account(db: Session, token: str, password: str) -> User:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    activation = db.scalar(
        select(UserActivation).where(
            UserActivation.token_hash == token_hash,
            UserActivation.used_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if not activation or activation.expires_at.replace(tzinfo=UTC) <= now:
        raise ValueError("This activation link is invalid, expired, or has already been used")
    user = db.get(User, activation.user_id)
    if not user or not user.active:
        raise ValueError("This account is no longer available")
    user.password_hash = hash_password(password)
    user.must_change_password = False
    activation.used_at = now
    return user


def send_activation_email(user: User, token: str) -> str:
    """Deliver an activation link without exposing the token to callers.

    Local development has no required SMTP dependency; the link is logged for
    the developer. Production callers configure SMTP_* / MAIL_FROM settings.
    """
    link = activation_url(token)
    if not settings.smtp_host:
        logger.warning("MORAX activation link for %s: %s", user.email, link)
        return "development_log"

    message = EmailMessage()
    message["Subject"] = "Activate your MORAX account"
    message["From"] = settings.mail_from
    message["To"] = user.email
    message.set_content(
        "Your MORAX account is ready. Set your password using this one-time "
        f"activation link before it expires:\n\n{link}\n\n"
        "If you did not expect this email, you can safely ignore it."
    )
    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ssl.create_default_context()) as client:
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password or "")
                client.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as client:
                if settings.smtp_use_tls:
                    client.starttls(context=ssl.create_default_context())
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password or "")
                client.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Could not send MORAX activation email to %s", user.email)
        raise RuntimeError("The account was created, but the activation email could not be sent") from exc
    return "smtp"
