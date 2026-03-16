"""
/api/settings — Global configuration management.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from config import settings
from services.notification_service import notification_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsPayload(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    daily_report_hour: Optional[int] = None
    copy_poll_interval_ms: Optional[int] = None
    copy_retry_count: Optional[int] = None
    copy_retry_delay_ms: Optional[int] = None


@router.get("")
async def get_settings():
    return {
        "telegram_bot_token": "***" if settings.TELEGRAM_BOT_TOKEN else None,
        "telegram_chat_id": settings.TELEGRAM_CHAT_ID,
        "telegram_configured": bool(settings.TELEGRAM_BOT_TOKEN),
        "smtp_host": settings.SMTP_HOST,
        "smtp_port": settings.SMTP_PORT,
        "smtp_user": settings.SMTP_USER,
        "smtp_configured": bool(settings.SMTP_USER),
        "daily_report_hour": settings.DAILY_REPORT_HOUR,
        "copy_poll_interval_ms": settings.COPY_POLL_INTERVAL_MS,
        "copy_retry_count": settings.COPY_RETRY_COUNT,
        "copy_retry_delay_ms": settings.COPY_RETRY_DELAY_MS,
    }


@router.put("")
async def update_settings(payload: SettingsPayload):
    """
    Update runtime settings.
    Note: For production, persist these to DB or .env file.
    """
    updated = {}
    if payload.telegram_bot_token is not None:
        settings.TELEGRAM_BOT_TOKEN = payload.telegram_bot_token
        notification_service._telegram_bot = None  # Reset bot instance
        notification_service._telegram_enabled = bool(payload.telegram_bot_token)
        updated["telegram_bot_token"] = "set"

    if payload.telegram_chat_id is not None:
        settings.TELEGRAM_CHAT_ID = payload.telegram_chat_id
        updated["telegram_chat_id"] = payload.telegram_chat_id

    if payload.smtp_host:
        settings.SMTP_HOST = payload.smtp_host
        updated["smtp_host"] = payload.smtp_host

    if payload.smtp_port:
        settings.SMTP_PORT = payload.smtp_port
        updated["smtp_port"] = payload.smtp_port

    if payload.smtp_user:
        settings.SMTP_USER = payload.smtp_user
        updated["smtp_user"] = payload.smtp_user

    if payload.smtp_password:
        settings.SMTP_PASSWORD = payload.smtp_password
        notification_service._email_enabled = True
        updated["smtp_password"] = "set"

    if payload.daily_report_hour is not None:
        settings.DAILY_REPORT_HOUR = payload.daily_report_hour
        updated["daily_report_hour"] = payload.daily_report_hour

    if payload.copy_poll_interval_ms is not None:
        settings.COPY_POLL_INTERVAL_MS = payload.copy_poll_interval_ms
        updated["copy_poll_interval_ms"] = payload.copy_poll_interval_ms

    return {"updated": updated}


@router.post("/test-telegram")
async def test_telegram():
    success = await notification_service.test_telegram()
    return {"success": success}


@router.post("/test-email")
async def test_email():
    try:
        await notification_service.send_email(
            to=settings.SMTP_USER or "",
            subject="CopyTrader Pro — Test Email",
            html_body="<p>Email notifications are working correctly!</p>",
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
