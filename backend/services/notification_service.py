"""
Notification Service — Telegram Bot + Email (SMTP async).
All methods are async and non-blocking.
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional
import structlog
from jinja2 import Environment, BaseLoader

from config import settings

log = structlog.get_logger(__name__)

# ─── Jinja2 Email Templates ───────────────────────────────────────────────────

DAILY_REPORT_HTML = """
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 20px; }
  .card { background: #1a1a2e; border: 1px solid #c9a96e; border-radius: 8px; padding: 20px; margin: 10px 0; }
  .gold { color: #c9a96e; }
  .green { color: #00d084; }
  .red { color: #ff4d6d; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px; border-bottom: 1px solid #333; text-align: left; }
</style>
</head>
<body>
  <h1 class="gold">CopyTrader Pro — Daily Report</h1>
  <p>{{ date }}</p>
  <div class="card">
    <h2>Performance Summary</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total P&L</td><td class="{{ 'green' if total_pnl >= 0 else 'red' }}">${{ "%.2f"|format(total_pnl) }}</td></tr>
      <tr><td>Win Rate</td><td>{{ "%.1f"|format(win_rate) }}%</td></tr>
      <tr><td>Trades Today</td><td>{{ trades_today }}</td></tr>
      <tr><td>Copies Executed</td><td>{{ copies_today }}</td></tr>
      <tr><td>Copy Success Rate</td><td>{{ "%.1f"|format(copy_success_rate) }}%</td></tr>
    </table>
  </div>
  {% if top_trades %}
  <div class="card">
    <h2>Top Trades</h2>
    <table>
      <tr><th>Symbol</th><th>Direction</th><th>Profit</th></tr>
      {% for trade in top_trades %}
      <tr>
        <td>{{ trade.symbol }}</td>
        <td>{{ trade.direction }}</td>
        <td class="{{ 'green' if trade.profit >= 0 else 'red' }}">${{ "%.2f"|format(trade.profit) }}</td>
      </tr>
      {% endfor %}
    </table>
  </div>
  {% endif %}
  <p style="color: #666; font-size: 12px;">CopyTrader Pro © 2024</p>
</body>
</html>
"""

jinja_env = Environment(loader=BaseLoader())


class NotificationService:
    def __init__(self):
        self._telegram_bot = None
        self._telegram_enabled = bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)
        self._email_enabled = bool(settings.SMTP_USER and settings.SMTP_PASSWORD)

    # ─── Telegram ─────────────────────────────────────────────────────────────

    async def _get_telegram_bot(self):
        if self._telegram_bot is None and self._telegram_enabled:
            try:
                from telegram import Bot
                self._telegram_bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
            except ImportError:
                log.warning("python-telegram-bot not installed")
                self._telegram_enabled = False
        return self._telegram_bot

    async def send_telegram(self, message: str, parse_mode: str = "Markdown"):
        if not self._telegram_enabled:
            log.debug("telegram_skipped", message=message[:50])
            return
        try:
            bot = await self._get_telegram_bot()
            if bot:
                await bot.send_message(
                    chat_id=settings.TELEGRAM_CHAT_ID,
                    text=message,
                    parse_mode=parse_mode,
                )
        except Exception as e:
            log.error("telegram_send_error", error=str(e))

    async def notify_trade_copied(
        self,
        slave_name: str,
        symbol: str,
        direction: str,
        lot: float,
        latency_ms: Optional[int] = None,
    ):
        latency_str = f" _(latency: {latency_ms}ms)_" if latency_ms else ""
        msg = (
            f"✅ *Trade Copied*\n"
            f"Account: `{slave_name}`\n"
            f"Symbol: `{symbol}` {direction}\n"
            f"Lot: `{lot}`{latency_str}"
        )
        await self.send_telegram(msg)

    async def notify_copy_failed(self, slave_name: str, symbol: str, error: str):
        msg = (
            f"❌ *Copy Failed*\n"
            f"Account: `{slave_name}`\n"
            f"Symbol: `{symbol}`\n"
            f"Error: `{error[:200]}`"
        )
        await self.send_telegram(msg)

    async def notify_drawdown_alert(self, account_name: str, drawdown: float, limit: float):
        msg = (
            f"⚠️ *Drawdown Alert*\n"
            f"Account: `{account_name}`\n"
            f"Current: `{drawdown:.2f}%`\n"
            f"Limit: `{limit:.2f}%`\n"
            f"_Copy trading paused for this account._"
        )
        await self.send_telegram(msg)

    async def notify_kill_switch(self, results: dict):
        closed_count = sum(
            v.get("closed", 0) for v in results.values() if v.get("status") == "success"
        )
        msg = (
            f"🛑 *KILL SWITCH ACTIVATED*\n"
            f"Closed positions on {len(results)} accounts.\n"
            f"Total closed: `{closed_count}`\n"
            f"Time: `{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC`"
        )
        await self.send_telegram(msg)

    async def notify_disconnection(self, account_name: str, broker: str):
        msg = (
            f"🔴 *Account Disconnected*\n"
            f"Account: `{account_name}`\n"
            f"Broker: `{broker}`\n"
            f"_Reconnection in progress..._"
        )
        await self.send_telegram(msg)

    async def test_telegram(self) -> bool:
        try:
            await self.send_telegram("🟢 *CopyTrader Pro* — Telegram notifications are working!")
            return True
        except Exception as e:
            log.error("telegram_test_error", error=str(e))
            return False

    # ─── Email ────────────────────────────────────────────────────────────────

    async def send_email(self, to: str, subject: str, html_body: str):
        if not self._email_enabled:
            log.debug("email_skipped", to=to, subject=subject)
            return
        try:
            import aiosmtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart("alternative")
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to
            msg["Subject"] = subject
            msg.attach(MIMEText(html_body, "html"))

            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
            )
            log.info("email_sent", to=to, subject=subject)
        except Exception as e:
            log.error("email_send_error", to=to, error=str(e))

    async def send_daily_report(self, to: str, stats: dict):
        template = jinja_env.from_string(DAILY_REPORT_HTML)
        html = template.render(
            date=datetime.utcnow().strftime("%Y-%m-%d"),
            **stats,
        )
        await self.send_email(
            to=to,
            subject=f"CopyTrader Pro — Daily Report {datetime.utcnow().strftime('%Y-%m-%d')}",
            html_body=html,
        )


# Singleton
notification_service = NotificationService()
