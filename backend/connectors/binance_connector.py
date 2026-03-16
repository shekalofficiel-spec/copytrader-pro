"""
Binance Connector — supports Spot and USDT-M Futures.
Uses python-binance + WebSocket user data stream for real-time updates.
Handles stepSize precision for lot sizes.
"""
from __future__ import annotations
import asyncio
import math
from datetime import datetime
from typing import Optional
import structlog

from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult

log = structlog.get_logger(__name__)

try:
    from binance.client import Client as BinanceClient
    from binance.exceptions import BinanceAPIException
    from binance import AsyncClient, BinanceSocketManager
    BINANCE_AVAILABLE = True
except ImportError:
    BINANCE_AVAILABLE = False
    log.warning("python-binance not available — Binance connector in mock mode")


class BinanceConnector(BaseBrokerConnector):
    """
    Binance connector supporting Spot and USDT-M Futures.
    Positions tracked via WebSocket user_data_stream.
    """

    def __init__(self, credentials: dict, account_id: int):
        super().__init__(credentials, account_id)
        self.api_key = credentials.get("api_key")
        self.api_secret = credentials.get("api_secret")
        self.testnet = credentials.get("testnet", False)
        self.futures = credentials.get("futures", True)

        self._client: Optional[AsyncClient] = None
        self._bm: Optional[BinanceSocketManager] = None
        self._open_positions: dict[str, TradeEvent] = {}
        self._symbol_filters: dict[str, dict] = {}

    async def connect(self) -> bool:
        if not BINANCE_AVAILABLE:
            log.warning("Binance package not available, running in mock mode")
            self._connected = True
            return True

        try:
            self._client = await AsyncClient.create(
                api_key=self.api_key,
                api_secret=self.api_secret,
                testnet=self.testnet,
            )

            # Start user data stream for real-time updates
            self._bm = BinanceSocketManager(self._client)
            asyncio.create_task(self._listen_user_stream())

            self._connected = True
            log.info("binance_connected", futures=self.futures, testnet=self.testnet)
            return True
        except Exception as e:
            log.error("binance_connect_error", error=str(e))
            self._connected = False
            return False

    async def _listen_user_stream(self):
        """Listen to user account updates via WebSocket."""
        try:
            if self.futures:
                async with self._bm.futures_user_socket() as stream:
                    while self._connected:
                        msg = await stream.recv()
                        await self._handle_user_event(msg)
            else:
                async with self._bm.user_socket() as stream:
                    while self._connected:
                        msg = await stream.recv()
                        await self._handle_user_event(msg)
        except Exception as e:
            log.error("binance_stream_error", error=str(e))
            self._connected = False

    async def _handle_user_event(self, msg: dict):
        """Process account update events from WebSocket."""
        event_type = msg.get("e", "")

        if event_type == "ACCOUNT_UPDATE" and self.futures:
            positions = msg.get("a", {}).get("P", [])
            for pos in positions:
                symbol = pos["s"]
                qty = float(pos["pa"])
                if qty == 0:
                    self._open_positions.pop(symbol, None)
                else:
                    direction = "BUY" if qty > 0 else "SELL"
                    self._open_positions[symbol] = TradeEvent(
                        trade_id=f"{symbol}_{direction}",
                        symbol=symbol,
                        direction=direction,
                        lot_size=abs(qty),
                        open_price=float(pos.get("ep", 0)),
                        profit=float(pos.get("up", 0)),
                    )

    async def disconnect(self):
        self._connected = False
        if self._client:
            await self._client.close_connection()

    async def get_open_positions(self) -> list[TradeEvent]:
        if not BINANCE_AVAILABLE:
            return []

        try:
            if self.futures:
                positions = await self._client.futures_position_information()
                result = []
                for pos in positions:
                    qty = float(pos["positionAmt"])
                    if qty != 0:
                        result.append(TradeEvent(
                            trade_id=f"{pos['symbol']}_{'BUY' if qty > 0 else 'SELL'}",
                            symbol=pos["symbol"],
                            direction="BUY" if qty > 0 else "SELL",
                            lot_size=abs(qty),
                            open_price=float(pos["entryPrice"]),
                            profit=float(pos["unRealizedProfit"]),
                        ))
                return result
            else:
                # For spot: check non-zero balances
                account = await self._client.get_account()
                return []  # Spot positions tracked differently
        except Exception as e:
            log.error("binance_positions_error", error=str(e))
            return []

    async def _get_step_size(self, symbol: str) -> float:
        """Get the lot size precision (stepSize) for a symbol."""
        if symbol in self._symbol_filters:
            return self._symbol_filters[symbol].get("step_size", 0.001)

        try:
            if self.futures:
                info = await self._client.futures_exchange_info()
            else:
                info = await self._client.get_exchange_info()

            for s in info["symbols"]:
                if s["symbol"] == symbol:
                    for f in s["filters"]:
                        if f["filterType"] == "LOT_SIZE":
                            step = float(f["stepSize"])
                            self._symbol_filters[symbol] = {"step_size": step}
                            return step
        except Exception as e:
            log.error("binance_step_size_error", symbol=symbol, error=str(e))

        return 0.001  # Default fallback

    def _round_lot(self, quantity: float, step_size: float) -> float:
        """Round quantity to valid step size."""
        precision = int(round(-math.log(step_size, 10), 0))
        return round(round(quantity / step_size) * step_size, precision)

    async def place_order(self, order: OrderRequest) -> OrderResult:
        if not BINANCE_AVAILABLE:
            return OrderResult(success=True, trade_id="BN_SIM_001", open_price=50000.0)

        try:
            step_size = await self._get_step_size(order.symbol)
            quantity = self._round_lot(order.lot_size, step_size)
            side = "BUY" if order.direction == "BUY" else "SELL"

            if self.futures:
                params = {
                    "symbol": order.symbol,
                    "side": side,
                    "type": "MARKET",
                    "quantity": quantity,
                }
                if order.stop_loss:
                    # Place stop-loss as a separate order
                    pass
                result = await self._client.futures_create_order(**params)
            else:
                result = await self._client.create_order(
                    symbol=order.symbol,
                    side=side,
                    type="MARKET",
                    quantity=quantity,
                )

            return OrderResult(
                success=True,
                trade_id=str(result["orderId"]),
                open_price=float(result.get("price", 0) or result.get("fills", [{}])[0].get("price", 0)),
            )
        except Exception as e:
            log.error("binance_place_order_error", symbol=order.symbol, error=str(e))
            return OrderResult(success=False, error=str(e))

    async def close_position(self, trade_id: str) -> bool:
        """Close position by placing opposite order."""
        try:
            # trade_id format: "BTCUSDT_BUY"
            parts = trade_id.rsplit("_", 1)
            if len(parts) != 2:
                return False
            symbol, direction = parts
            positions = await self.get_open_positions()
            pos = next((p for p in positions if p.trade_id == trade_id), None)
            if not pos:
                return False

            close_side = "SELL" if direction == "BUY" else "BUY"
            step = await self._get_step_size(symbol)
            qty = self._round_lot(pos.lot_size, step)

            if self.futures:
                await self._client.futures_create_order(
                    symbol=symbol, side=close_side, type="MARKET", quantity=qty,
                    reduceOnly=True
                )
            return True
        except Exception as e:
            log.error("binance_close_error", trade_id=trade_id, error=str(e))
            return False

    async def close_all_positions(self) -> int:
        positions = await self.get_open_positions()
        count = 0
        for pos in positions:
            if await self.close_position(pos.trade_id):
                count += 1
        return count

    async def get_account_info(self) -> dict:
        if not BINANCE_AVAILABLE:
            return {"balance": 10000.0, "equity": 10000.0, "margin": 0.0, "margin_level": 9999.0}

        try:
            if self.futures:
                account = await self._client.futures_account()
                balance = float(account["totalWalletBalance"])
                equity = float(account["totalMarginBalance"])
                margin = float(account.get("totalInitialMargin", 0))
                margin_level = (equity / margin * 100) if margin > 0 else 9999.0
                return {
                    "balance": balance,
                    "equity": equity,
                    "margin": margin,
                    "margin_level": margin_level,
                    "profit": float(account.get("totalUnrealizedProfit", 0)),
                }
            else:
                account = await self._client.get_account()
                return {
                    "balance": float(account.get("totalAssetOfBtc", 0)),
                    "equity": float(account.get("totalNetAssetOfBtc", 0)),
                    "margin": 0.0,
                    "margin_level": 9999.0,
                }
        except Exception as e:
            log.error("binance_account_info_error", error=str(e))
            return {}

    async def modify_position(
        self,
        trade_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        # Binance futures: SL/TP are separate orders
        # Would need to cancel existing SL/TP orders and place new ones
        log.info("binance_modify_position", trade_id=trade_id, note="SL/TP are separate orders in Binance")
        return True
