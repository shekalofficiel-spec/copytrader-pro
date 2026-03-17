"""
MetaTrader 5 Connector
Requires Windows + MetaTrader5 package installed.
Wraps the synchronous MT5 API in asyncio threads.
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional
import structlog

from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult

log = structlog.get_logger(__name__)

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False
    log.warning("MetaTrader5 package not available — MT5 connector in mock mode")


class MT5Connector(BaseBrokerConnector):
    """
    MetaTrader 5 connector using the official Python library.
    All blocking MT5 calls run in a thread executor to avoid blocking asyncio.
    """

    def __init__(self, credentials: dict, account_id: int):
        super().__init__(credentials, account_id)
        self.login = credentials.get("login")
        self.password = credentials.get("password")
        self.server = credentials.get("server")
        self._loop = None

    async def _run_sync(self, func, *args, **kwargs):
        """Run a synchronous MT5 call in a thread pool."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: func(*args, **kwargs))

    async def connect(self) -> bool:
        if not MT5_AVAILABLE:
            log.warning("MT5 not available, running in simulation mode")
            self._connected = True
            return True

        def _init():
            if not mt5.initialize():
                return False
            authorized = mt5.login(
                login=self.login,
                password=self.password,
                server=self.server,
            )
            return authorized

        try:
            result = await self._run_sync(_init)
            self._connected = result
            if result:
                log.info("mt5_connected", login=self.login, server=self.server)
            else:
                error = mt5.last_error() if MT5_AVAILABLE else ("0", "Not available")
                log.error("mt5_connect_failed", error=error)
            return result
        except Exception as e:
            log.error("mt5_connect_exception", error=str(e))
            self._connected = False
            return False

    async def disconnect(self):
        if MT5_AVAILABLE:
            await self._run_sync(mt5.shutdown)
        self._connected = False

    async def get_open_positions(self) -> list[TradeEvent]:
        if not MT5_AVAILABLE:
            return []

        def _get():
            positions = mt5.positions_get()
            if positions is None:
                return []
            result = []
            for pos in positions:
                result.append(TradeEvent(
                    trade_id=str(pos.ticket),
                    symbol=pos.symbol,
                    direction="BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                    lot_size=pos.volume,
                    open_price=pos.price_open,
                    stop_loss=pos.sl if pos.sl > 0 else None,
                    take_profit=pos.tp if pos.tp > 0 else None,
                    open_time=datetime.fromtimestamp(pos.time),
                    profit=pos.profit,
                    swap=pos.swap,
                    comment=pos.comment,
                ))
            return result

        try:
            return await self._run_sync(_get)
        except Exception as e:
            log.error("mt5_get_positions_error", error=str(e))
            return []

    async def place_order(self, order: OrderRequest) -> OrderResult:
        if not MT5_AVAILABLE:
            return OrderResult(success=True, trade_id="SIM_001", open_price=1.0)

        def _place():
            symbol_info = mt5.symbol_info(order.symbol)
            if symbol_info is None:
                return OrderResult(success=False, error=f"Symbol {order.symbol} not found")

            if not symbol_info.visible:
                mt5.symbol_select(order.symbol, True)

            price_tick = mt5.symbol_info_tick(order.symbol)
            if order.direction == "BUY":
                price = price_tick.ask
                order_type = mt5.ORDER_TYPE_BUY
            else:
                price = price_tick.bid
                order_type = mt5.ORDER_TYPE_SELL

            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": order.symbol,
                "volume": order.lot_size,
                "type": order_type,
                "price": price,
                "sl": order.stop_loss or 0.0,
                "tp": order.take_profit or 0.0,
                "deviation": 20,
                "magic": order.magic,
                "comment": order.comment,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }

            result = mt5.order_send(request)
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                return OrderResult(
                    success=True,
                    trade_id=str(result.order),
                    open_price=result.price,
                )
            return OrderResult(
                success=False,
                error=f"MT5 error {result.retcode}: {result.comment}",
            )

        try:
            return await self._run_sync(_place)
        except Exception as e:
            return OrderResult(success=False, error=str(e))

    async def close_position(self, trade_id: str) -> bool:
        if not MT5_AVAILABLE:
            return True

        def _close():
            ticket = int(trade_id)
            position = mt5.positions_get(ticket=ticket)
            if not position:
                return False

            pos = position[0]
            direction = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
            tick = mt5.symbol_info_tick(pos.symbol)
            price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask

            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": pos.symbol,
                "volume": pos.volume,
                "type": direction,
                "position": ticket,
                "price": price,
                "deviation": 20,
                "magic": 777777,
                "comment": "CopyTrader Close",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            result = mt5.order_send(request)
            return result.retcode == mt5.TRADE_RETCODE_DONE

        try:
            return await self._run_sync(_close)
        except Exception as e:
            log.error("mt5_close_error", trade_id=trade_id, error=str(e))
            return False

    async def close_all_positions(self) -> int:
        positions = await self.get_open_positions()
        count = 0
        for pos in positions:
            if await self.close_position(pos.trade_id):
                count += 1
        return count

    async def get_account_info(self) -> dict:
        if not MT5_AVAILABLE:
            return {"balance": None, "equity": None, "margin": 0.0, "margin_level": 0.0}

        def _info():
            info = mt5.account_info()
            if info is None:
                return {}
            return {
                "balance": info.balance,
                "equity": info.equity,
                "margin": info.margin,
                "margin_free": info.margin_free,
                "margin_level": info.margin_level,
                "profit": info.profit,
                "currency": info.currency,
                "leverage": info.leverage,
            }

        try:
            return await self._run_sync(_info)
        except Exception as e:
            log.error("mt5_account_info_error", error=str(e))
            return {}

    async def modify_position(
        self,
        trade_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        if not MT5_AVAILABLE:
            return True

        def _modify():
            ticket = int(trade_id)
            pos = mt5.positions_get(ticket=ticket)
            if not pos:
                return False
            p = pos[0]
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "symbol": p.symbol,
                "position": ticket,
                "sl": stop_loss or p.sl,
                "tp": take_profit or p.tp,
            }
            result = mt5.order_send(request)
            return result.retcode == mt5.TRADE_RETCODE_DONE

        try:
            return await self._run_sync(_modify)
        except Exception as e:
            log.error("mt5_modify_error", trade_id=trade_id, error=str(e))
            return False
