"""
CopyTrader Pro — Core Copy Engine
Polls master accounts, detects trade events, and replicates on all slave accounts.
"""
from __future__ import annotations
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.risk_manager import RiskManager
from connectors import get_connector, TradeEvent, OrderRequest
from connectors.base import BaseBrokerConnector
from core.encryption import decrypt_credentials
from models.account import Account, AccountRole, BrokerType
from models.trade import Trade, TradeDirection, TradeStatus
from models.copy_event import CopyEvent, CopyStatus
from websocket.manager import ws_manager
from schemas.stats import LiveEvent

log = structlog.get_logger(__name__)


class CopyEngine:
    """
    Main copy engine. Manages:
    - Connection pool for all accounts
    - Polling master positions
    - Detecting opens/closes/modifications
    - Executing copies on slaves with risk checks
    - Retry logic and logging
    """

    def __init__(self):
        self.risk_manager = RiskManager()
        self._connectors: dict[int, BaseBrokerConnector] = {}  # account_id -> connector
        self._master_positions: dict[int, dict[str, TradeEvent]] = {}  # account_id -> {trade_id: event}
        self._running = False
        self._accounts: list[Account] = []

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    async def start(self, db: AsyncSession):
        """Load all accounts, initialize connections, start polling loop."""
        self._running = True
        await self._load_and_connect(db)
        asyncio.create_task(self._polling_loop())
        log.info("copy_engine_started")

    async def stop(self):
        """Gracefully stop the engine and disconnect all connectors."""
        self._running = False
        for account_id, connector in self._connectors.items():
            try:
                await connector.disconnect()
            except Exception as e:
                log.error("disconnect_error", account_id=account_id, error=str(e))
        self._connectors.clear()
        log.info("copy_engine_stopped")

    async def _load_and_connect(self, db: AsyncSession):
        """Load active accounts from DB and establish connections."""
        from sqlalchemy import select
        result = await db.execute(select(Account).where(Account.is_active == True))
        # Convert to plain list to avoid lazy-loading issues in background tasks
        self._accounts = list(result.scalars().all())

        for account in self._accounts:
            await self._connect_account(account)

    async def _connect_account(self, account: Account):
        """Connect a single account."""
        try:
            credentials = decrypt_credentials(account.credentials_encrypted)
            connector = get_connector(account.broker_type, credentials, account.id)
            success = await connector.connect()
            if success:
                self._connectors[account.id] = connector
                if account.role == AccountRole.MASTER:
                    self._master_positions[account.id] = {}
                log.info("account_connected", account_id=account.id, name=account.name)
            else:
                log.error("account_connect_failed", account_id=account.id, name=account.name)
        except Exception as e:
            log.error("account_connect_exception", account_id=account.id, error=str(e))

    # ─── Polling Loop ─────────────────────────────────────────────────────────

    async def _polling_loop(self):
        """Poll master positions every COPY_POLL_INTERVAL_MS milliseconds.
        Creates a fresh DB session each cycle to avoid stale session errors."""
        from database import AsyncSessionLocal
        from datetime import timezone as tz
        interval = settings.COPY_POLL_INTERVAL_MS / 1000.0

        while self._running:
            start = time.monotonic()
            try:
                masters = [a for a in self._accounts if a.role == AccountRole.MASTER and a.is_active]
                if masters:
                    async with AsyncSessionLocal() as db:
                        for master in masters:
                            if master.id in self._connectors:
                                await self._poll_master(master, db)
                        await db.commit()

                # Friday 21:00 UTC — close positions for "no weekend" accounts
                now = datetime.now(tz.utc)
                if now.weekday() == 4 and now.hour == 21 and now.minute == 0:
                    slaves_no_weekend = [
                        a for a in self._accounts
                        if a.role == AccountRole.SLAVE and a.is_active and a.no_trade_weekend
                    ]
                    for slave in slaves_no_weekend:
                        if slave.id in self._connectors:
                            try:
                                connector = self._connectors[slave.id]
                                await connector.close_all_positions()
                                log.info("weekend_close_triggered", account_id=slave.id)
                                await ws_manager.broadcast(LiveEvent(
                                    event_type="RISK_ALERT",
                                    account_id=slave.id,
                                    account_name=slave.name,
                                    message=f"Friday 21:00 UTC — all positions closed on {slave.name} (prop firm mode)",
                                    timestamp=datetime.now(tz.utc),
                                    severity="warning",
                                ))
                            except Exception as e:
                                log.error("weekend_close_error", account_id=slave.id, error=str(e))
            except Exception as e:
                log.error("polling_loop_error", error=str(e))

            elapsed = time.monotonic() - start
            sleep_time = max(0, interval - elapsed)
            await asyncio.sleep(sleep_time)

    async def _poll_master(self, master: Account, db: AsyncSession):
        """Poll one master account and detect position changes."""
        connector = self._connectors[master.id]
        try:
            current_positions = await connector.get_open_positions()
            current_map = {p.trade_id: p for p in current_positions}
            previous_map = self._master_positions.get(master.id, {})

            # Detect NEW trades
            for trade_id, position in current_map.items():
                if trade_id not in previous_map:
                    log.info("master_trade_opened", master_id=master.id, symbol=position.symbol, lot=position.lot_size)
                    await self._on_trade_opened(master, position, db)

            # Detect CLOSED trades
            for trade_id, position in previous_map.items():
                if trade_id not in current_map:
                    log.info("master_trade_closed", master_id=master.id, symbol=position.symbol)
                    await self._on_trade_closed(master, position, db)

            # Detect MODIFIED trades (SL/TP changes)
            for trade_id, position in current_map.items():
                if trade_id in previous_map:
                    prev = previous_map[trade_id]
                    if position.stop_loss != prev.stop_loss or position.take_profit != prev.take_profit:
                        await self._on_trade_modified(master, position, db)

            self._master_positions[master.id] = current_map

        except Exception as e:
            log.error("poll_master_error", master_id=master.id, error=str(e))

    # ─── Trade Event Handlers ─────────────────────────────────────────────────

    async def _on_trade_opened(self, master: Account, event: TradeEvent, db: AsyncSession):
        """Replicate a new master trade on all active slave accounts."""
        slaves = [a for a in self._accounts if a.role == AccountRole.SLAVE and a.is_active]

        # Log master trade to DB
        master_trade = Trade(
            account_id=master.id,
            broker_ticket=event.trade_id,
            symbol=event.symbol,
            direction=TradeDirection.BUY if event.direction == "BUY" else TradeDirection.SELL,
            lot_size=event.lot_size,
            open_price=event.open_price,
            stop_loss=event.stop_loss,
            take_profit=event.take_profit,
            open_time=event.open_time or datetime.now(timezone.utc),
            status=TradeStatus.OPEN,
        )
        db.add(master_trade)
        await db.flush()

        # Broadcast to WebSocket
        await ws_manager.broadcast(LiveEvent(
            event_type="TRADE_OPENED",
            account_id=master.id,
            account_name=master.name,
            symbol=event.symbol,
            direction=event.direction,
            lot_size=event.lot_size,
            message=f"Master {master.name}: {event.direction} {event.lot_size} {event.symbol} @ {event.open_price}",
            timestamp=datetime.now(timezone.utc),
            severity="info",
        ))

        # Copy to slaves in parallel
        slave_tasks = [
            self._copy_to_slave(master_trade, event, slave, db)
            for slave in slaves
            if slave.id in self._connectors
        ]
        if slave_tasks:
            await asyncio.gather(*slave_tasks, return_exceptions=True)

        await db.commit()

    async def _on_trade_closed(self, master: Account, event: TradeEvent, db: AsyncSession):
        """Close the corresponding positions on all slave accounts."""
        from sqlalchemy import select

        # Find slave trades linked to this master trade
        result = await db.execute(
            select(Trade).where(
                Trade.master_trade_id == event.trade_id,
                Trade.status == TradeStatus.OPEN,
            )
        )
        slave_trades = result.scalars().all()

        close_tasks = []
        for slave_trade in slave_trades:
            if slave_trade.account_id in self._connectors:
                connector = self._connectors[slave_trade.account_id]
                close_tasks.append(
                    self._close_slave_trade(slave_trade, connector, db)
                )

        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)

        await ws_manager.broadcast(LiveEvent(
            event_type="TRADE_CLOSED",
            account_id=master.id,
            account_name=master.name,
            symbol=event.symbol,
            message=f"Master {master.name}: Closed {event.symbol}",
            timestamp=datetime.now(timezone.utc),
            severity="info",
        ))

        await db.commit()

    async def _on_trade_modified(self, master: Account, event: TradeEvent, db: AsyncSession):
        """Propagate SL/TP modifications to slave accounts."""
        from sqlalchemy import select
        result = await db.execute(
            select(Trade).where(
                Trade.master_trade_id == event.trade_id,
                Trade.status == TradeStatus.OPEN,
            )
        )
        slave_trades = result.scalars().all()

        for slave_trade in slave_trades:
            if slave_trade.account_id in self._connectors:
                connector = self._connectors[slave_trade.account_id]
                account = next((a for a in self._accounts if a.id == slave_trade.account_id), None)
                if account:
                    try:
                        await connector.modify_position(
                            slave_trade.broker_ticket,
                            stop_loss=event.stop_loss,
                            take_profit=event.take_profit,
                        )
                        slave_trade.stop_loss = event.stop_loss
                        slave_trade.take_profit = event.take_profit
                    except Exception as e:
                        log.error("modify_slave_error", slave_id=account.id, error=str(e))

        await db.commit()

    # ─── Copy Logic ───────────────────────────────────────────────────────────

    async def _copy_to_slave(
        self,
        master_trade: Trade,
        event: TradeEvent,
        slave: Account,
        db: AsyncSession,
    ):
        """Execute the copy of a single trade on a single slave account with retry."""
        connector = self._connectors[slave.id]

        # Risk checks
        risk_result = await self.risk_manager.check_all(slave, event, connector)
        if not risk_result.allowed:
            copy_event = CopyEvent(
                master_trade_id=str(master_trade.id),
                slave_account_id=slave.id,
                status=CopyStatus.SKIPPED,
                error_message=risk_result.reason,
                symbol=event.symbol,
                direction=event.direction,
                master_lot=event.lot_size,
                slave_lot=0.0,
            )
            db.add(copy_event)
            await ws_manager.broadcast(LiveEvent(
                event_type="COPY_SKIPPED",
                account_id=slave.id,
                account_name=slave.name,
                symbol=event.symbol,
                message=f"Skipped {slave.name}: {risk_result.reason or 'risk check failed'}",
                timestamp=datetime.now(timezone.utc),
                severity="warning",
            ))
            return

        # Calculate lot
        slave_lot = await self.risk_manager.calculate_lot(slave, event.lot_size, connector)
        slave_lot = min(slave_lot, slave.max_lot_size)

        order = OrderRequest(
            symbol=event.symbol,
            direction=event.direction,
            lot_size=slave_lot,
            stop_loss=event.stop_loss,
            take_profit=event.take_profit,
            comment=f"CopyTrader Pro | Master: {master_trade.id}",
        )

        # Execute with retry
        result = await self._execute_with_retry(connector, order)

        if result.success:
            # Save slave trade
            slave_trade = Trade(
                account_id=slave.id,
                master_trade_id=str(master_trade.id),
                broker_ticket=result.trade_id,
                symbol=event.symbol,
                direction=master_trade.direction,
                lot_size=slave_lot,
                open_price=result.open_price or event.open_price,
                stop_loss=event.stop_loss,
                take_profit=event.take_profit,
                open_time=datetime.now(timezone.utc),
                status=TradeStatus.OPEN,
                copy_latency_ms=result.latency_ms,
            )
            db.add(slave_trade)
            await db.flush()

            copy_event = CopyEvent(
                master_trade_id=str(master_trade.id),
                slave_account_id=slave.id,
                slave_trade_id=slave_trade.id,
                status=CopyStatus.SUCCESS,
                latency_ms=result.latency_ms,
                symbol=event.symbol,
                direction=event.direction,
                master_lot=event.lot_size,
                slave_lot=slave_lot,
            )
            db.add(copy_event)

            await ws_manager.broadcast(LiveEvent(
                event_type="COPY_SUCCESS",
                account_id=slave.id,
                account_name=slave.name,
                symbol=event.symbol,
                direction=event.direction,
                lot_size=slave_lot,
                message=f"✅ Copied to {slave.name}: {event.direction} {slave_lot} {event.symbol} ({result.latency_ms}ms)",
                timestamp=datetime.now(timezone.utc),
                severity="success",
            ))

            # Trigger Telegram/email notification (best-effort)
            try:
                from tasks.celery_tasks import send_copy_notification, CELERY_AVAILABLE
                kwargs = dict(slave_name=slave.name, symbol=event.symbol,
                              direction=event.direction, lot=slave_lot,
                              latency_ms=result.latency_ms or 0, status="success")
                if CELERY_AVAILABLE:
                    send_copy_notification.delay(**kwargs)
                else:
                    send_copy_notification(**kwargs)
            except Exception:
                pass

        else:
            copy_event = CopyEvent(
                master_trade_id=str(master_trade.id),
                slave_account_id=slave.id,
                status=CopyStatus.FAILED,
                error_message=result.error,
                symbol=event.symbol,
                direction=event.direction,
                master_lot=event.lot_size,
                slave_lot=slave_lot,
            )
            db.add(copy_event)

            await ws_manager.broadcast(LiveEvent(
                event_type="COPY_FAILED",
                account_id=slave.id,
                account_name=slave.name,
                symbol=event.symbol,
                message=f"❌ Copy failed on {slave.name}: {result.error}",
                timestamp=datetime.now(timezone.utc),
                severity="error",
            ))

    async def _execute_with_retry(self, connector: BaseBrokerConnector, order: OrderRequest):
        """Execute an order with exponential backoff retry."""
        from connectors.base import OrderResult

        last_result = None
        for attempt in range(settings.COPY_RETRY_COUNT):
            start_ms = int(time.monotonic() * 1000)
            try:
                result = await connector.place_order(order)
                result.latency_ms = int(time.monotonic() * 1000) - start_ms
                if result.success:
                    return result
                last_result = result
            except Exception as e:
                last_result = OrderResult(success=False, error=str(e))

            if attempt < settings.COPY_RETRY_COUNT - 1:
                delay = (settings.COPY_RETRY_DELAY_MS / 1000.0) * (2 ** attempt)
                await asyncio.sleep(delay)

        return last_result or OrderResult(success=False, error="Max retries exceeded")

    async def _close_slave_trade(self, trade: Trade, connector: BaseBrokerConnector, db: AsyncSession):
        """Close a single slave trade."""
        try:
            success = await connector.close_position(trade.broker_ticket)
            if success:
                trade.status = TradeStatus.CLOSED
                trade.close_time = datetime.now(timezone.utc)
                # Update P&L from broker
                info = await connector.get_account_info()
        except Exception as e:
            log.error("close_slave_trade_error", trade_id=trade.id, error=str(e))

    # ─── Runtime management ───────────────────────────────────────────────────

    async def add_account(self, account: Account):
        """Hot-add a new account to the running engine."""
        # Detach from session to avoid greenlet issues in background tasks
        from sqlalchemy.orm import make_transient
        try:
            make_transient(account)
        except Exception:
            pass
        self._accounts.append(account)
        await self._connect_account(account)
        if account.role == AccountRole.MASTER:
            self._master_positions[account.id] = {}

    async def remove_account(self, account_id: int):
        """Hot-remove an account."""
        self._accounts = [a for a in self._accounts if a.id != account_id]
        connector = self._connectors.pop(account_id, None)
        if connector:
            await connector.disconnect()
        self._master_positions.pop(account_id, None)

    def get_connector(self, account_id: int) -> Optional[BaseBrokerConnector]:
        return self._connectors.get(account_id)

    def is_connected(self, account_id: int) -> bool:
        c = self._connectors.get(account_id)
        return c.is_connected if c else False


# Singleton instance
copy_engine = CopyEngine()
