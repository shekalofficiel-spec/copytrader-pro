"""
Celery tasks for async operations: notifications, daily reports.
Falls back gracefully if Redis/Celery is not available.
"""
import asyncio
import logging

log = logging.getLogger(__name__)

# Try to init Celery — if Redis is not available, tasks become no-ops
try:
    from celery import Celery
    from config import settings

    celery_app = Celery(
        "copytrader",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        broker_connection_retry_on_startup=False,
    )
    CELERY_AVAILABLE = True
except Exception:
    celery_app = None
    CELERY_AVAILABLE = False


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _task(func):
    """Decorator: register as Celery task if available, else make callable directly."""
    if CELERY_AVAILABLE and celery_app:
        return celery_app.task(name=f"tasks.celery_tasks.{func.__name__}", max_retries=3)(func)
    # Fallback: call synchronously (no queue)
    return func


@_task
def send_copy_notification(slave_name: str, symbol: str, direction: str,
                           lot: float, latency_ms: int, status: str):
    try:
        from services.notification_service import notification_service
        if status == "success":
            _run_async(notification_service.notify_trade_copied(
                slave_name=slave_name, symbol=symbol,
                direction=direction, lot=lot, latency_ms=latency_ms,
            ))
        else:
            _run_async(notification_service.notify_copy_failed(
                slave_name=slave_name, symbol=symbol, error="Copy failed after retries",
            ))
    except Exception as e:
        log.warning(f"Notification skipped: {e}")


@_task
def send_drawdown_alert(account_name: str, drawdown: float, limit: float):
    try:
        from services.notification_service import notification_service
        _run_async(notification_service.notify_drawdown_alert(account_name, drawdown, limit))
    except Exception as e:
        log.warning(f"Drawdown alert skipped: {e}")


@_task
def notify_kill_switch_task(results: dict):
    try:
        from services.notification_service import notification_service
        _run_async(notification_service.notify_kill_switch(results))
    except Exception as e:
        log.warning(f"Kill switch notification skipped: {e}")


@_task
def send_daily_report_task():
    try:
        from services.notification_service import notification_service
        from config import settings
        stats = {
            "total_pnl": 0.0, "win_rate": 0.0, "trades_today": 0,
            "copies_today": 0, "copy_success_rate": 0.0, "top_trades": [],
        }
        if settings.SMTP_USER:
            _run_async(notification_service.send_daily_report(to=settings.SMTP_USER, stats=stats))
    except Exception as e:
        log.warning(f"Daily report skipped: {e}")
