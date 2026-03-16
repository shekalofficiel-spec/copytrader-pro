"""
Risk Manager — validates each copy action before execution.
All methods return (allowed: bool, reason: str).
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import TYPE_CHECKING
import structlog

from models.account import Account

if TYPE_CHECKING:
    from connectors.base import BaseBrokerConnector, TradeEvent

log = structlog.get_logger(__name__)


class RiskCheckResult:
    def __init__(self, allowed: bool, reason: str = ""):
        self.allowed = allowed
        self.reason = reason

    def __bool__(self):
        return self.allowed

    def __repr__(self):
        return f"RiskCheckResult(allowed={self.allowed}, reason={self.reason!r})"


class RiskManager:
    """
    Validates whether a copy trade should be executed on a given slave account.
    All checks are non-blocking and fast.
    """

    async def check_all(
        self,
        account: Account,
        trade_event: "TradeEvent",
        connector: "BaseBrokerConnector",
    ) -> RiskCheckResult:
        """Run all risk checks sequentially. Returns first failure."""

        checks = [
            self._check_active(account),
            self._check_instrument(account, trade_event.symbol),
            await self._check_max_trades(account, connector),
            await self._check_margin_level(account, connector),
            await self._check_drawdown(account, connector),
            self._check_max_lot(account, trade_event.lot_size),
            self._check_weekend(account),
        ]

        for result in checks:
            if not result:
                log.warning(
                    "risk_check_failed",
                    account_id=account.id,
                    reason=result.reason,
                    symbol=trade_event.symbol,
                )
                return result

        return RiskCheckResult(True)

    # ─── Individual checks ────────────────────────────────────────────────────

    def _check_active(self, account: Account) -> RiskCheckResult:
        if not account.is_active:
            return RiskCheckResult(False, "Account is disabled")
        if account.is_copy_paused:
            return RiskCheckResult(False, "Copy paused (drawdown limit reached)")
        return RiskCheckResult(True)

    def _check_instrument(self, account: Account, symbol: str) -> RiskCheckResult:
        allowed = account.allowed_instruments
        if not allowed:  # Empty list = all instruments allowed
            return RiskCheckResult(True)
        if symbol in allowed:
            return RiskCheckResult(True)
        return RiskCheckResult(False, f"Symbol {symbol} not in allowed list: {allowed}")

    async def _check_max_trades(
        self, account: Account, connector: "BaseBrokerConnector"
    ) -> RiskCheckResult:
        try:
            positions = await connector.get_open_positions()
            count = len(positions)
            if count >= account.max_trades:
                return RiskCheckResult(
                    False, f"Max trades reached: {count}/{account.max_trades}"
                )
        except Exception as e:
            log.error("risk_check_trades_error", error=str(e))
            # Fail safe: allow if we can't check
        return RiskCheckResult(True)

    async def _check_margin_level(
        self, account: Account, connector: "BaseBrokerConnector"
    ) -> RiskCheckResult:
        if account.min_margin_level <= 0:
            return RiskCheckResult(True)
        try:
            info = await connector.get_account_info()
            margin_level = info.get("margin_level", 9999)
            if margin_level < account.min_margin_level:
                return RiskCheckResult(
                    False,
                    f"Margin level too low: {margin_level:.1f}% < {account.min_margin_level:.1f}%",
                )
        except Exception as e:
            log.error("risk_check_margin_error", error=str(e))
        return RiskCheckResult(True)

    async def _check_drawdown(
        self, account: Account, connector: "BaseBrokerConnector"
    ) -> RiskCheckResult:
        try:
            info = await connector.get_account_info()
            balance = info.get("balance", 0)
            equity = info.get("equity", balance)
            if balance > 0:
                drawdown_pct = ((balance - equity) / balance) * 100
                account.current_drawdown = drawdown_pct
                if drawdown_pct >= account.max_drawdown_pct:
                    account.is_copy_paused = True
                    return RiskCheckResult(
                        False,
                        f"Daily drawdown exceeded: {drawdown_pct:.2f}% >= {account.max_drawdown_pct:.2f}%",
                    )
        except Exception as e:
            log.error("risk_check_drawdown_error", error=str(e))
        return RiskCheckResult(True)

    def _check_max_lot(self, account: Account, lot: float) -> RiskCheckResult:
        if lot > account.max_lot_size:
            return RiskCheckResult(
                False, f"Lot {lot} exceeds max allowed {account.max_lot_size}"
            )
        return RiskCheckResult(True)

    def _check_weekend(self, account: Account) -> RiskCheckResult:
        if not account.no_trade_weekend:
            return RiskCheckResult(True)
        now = datetime.now(timezone.utc)
        # 0=Monday, 5=Saturday, 6=Sunday
        if now.weekday() in (5, 6):
            return RiskCheckResult(False, "Weekend trading disabled (prop firm mode)")
        return RiskCheckResult(True)

    # ─── Lot Calculator ───────────────────────────────────────────────────────

    async def calculate_lot(
        self,
        account: Account,
        master_lot: float,
        connector: "BaseBrokerConnector",
    ) -> float:
        from models.account import LotMode

        mode = account.lot_mode

        if mode == LotMode.MIRROR:
            return master_lot

        elif mode == LotMode.RATIO:
            return round(master_lot * account.lot_ratio, 2)

        elif mode == LotMode.FIXED:
            return account.fixed_lot_size

        elif mode == LotMode.RISK_PERCENT:
            try:
                info = await connector.get_account_info()
                balance = info.get("balance", 10000)
                # Simple approximation: 1 lot = $10 per pip, 1 pip = 0.0001
                # Adjust based on symbol later; using 1% of balance / 100 as approximation
                risk_amount = balance * (account.risk_percent / 100)
                lot = round(risk_amount / 1000, 2)
                return max(0.01, min(lot, account.max_lot_size))
            except Exception:
                return account.fixed_lot_size

        return master_lot

    # ─── Kill Switch ──────────────────────────────────────────────────────────

    async def kill_switch(
        self, accounts: list[tuple[Account, "BaseBrokerConnector"]]
    ) -> dict:
        """Close ALL positions on ALL slave accounts in parallel."""
        results = {}

        async def close_account(account: Account, connector: "BaseBrokerConnector"):
            try:
                closed = await connector.close_all_positions()
                results[account.id] = {"status": "success", "closed": closed}
                log.warning("kill_switch_executed", account_id=account.id, closed=closed)
            except Exception as e:
                results[account.id] = {"status": "error", "error": str(e)}
                log.error("kill_switch_failed", account_id=account.id, error=str(e))

        await asyncio.gather(
            *[close_account(acc, conn) for acc, conn in accounts],
            return_exceptions=True,
        )
        return results
