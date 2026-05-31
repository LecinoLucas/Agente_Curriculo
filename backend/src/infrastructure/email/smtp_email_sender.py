from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from src.core.settings import settings


class EmailDeliveryConfigurationError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


class SMTPEmailSender:
    def __init__(self) -> None:
        self.host = settings.SMTP_HOST.strip()
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME.strip()
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL.strip()
        self.from_name = settings.SMTP_FROM_NAME.strip()
        self.starttls = settings.SMTP_STARTTLS
        self.ssl_enabled = settings.SMTP_SSL
        self.timeout = settings.SMTP_TIMEOUT_SECONDS

    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str | None = None,
    ) -> None:
        self._validate_configuration()
        message = self._build_message(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
        try:
            await asyncio.to_thread(self._send_sync, message)
        except EmailDeliveryConfigurationError:
            raise
        except Exception as exc:
            raise EmailDeliveryError("Email delivery failed") from exc

    def _validate_configuration(self) -> None:
        if not self.host or not self.from_email:
            raise EmailDeliveryConfigurationError("SMTP host and sender are required")

    def _build_message(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str | None,
    ) -> EmailMessage:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = (
            formataddr((self.from_name, self.from_email)) if self.from_name else self.from_email
        )
        message["To"] = to_email
        message.set_content(text_body)
        if html_body:
            message.add_alternative(html_body, subtype="html")
        return message

    def _send_sync(self, message: EmailMessage) -> None:
        context = ssl.create_default_context()
        if self.ssl_enabled:
            with smtplib.SMTP_SSL(
                self.host,
                self.port,
                timeout=self.timeout,
                context=context,
            ) as client:
                self._authenticate(client)
                client.send_message(message)
            return

        with smtplib.SMTP(self.host, self.port, timeout=self.timeout) as client:
            if self.starttls:
                client.starttls(context=context)
            self._authenticate(client)
            client.send_message(message)

    def _authenticate(self, client: smtplib.SMTP) -> None:
        if self.username:
            client.login(self.username, self.password)
