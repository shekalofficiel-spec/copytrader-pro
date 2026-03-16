"""
MetaTrader 4 Connector via EA TCP Bridge.
MT4 doesn't have a Python API — we use a custom Expert Advisor that exposes
a mini REST server on localhost. The EA file (CopyTradeBridge.mq4) must be
running in the MT4 terminal.
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional
import httpx
import structlog

from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult

log = structlog.get_logger(__name__)


class MT4Connector(BaseBrokerConnector):
    """
    Connects to the MT4 EA bridge running on a local port.
    The bridge exposes a simple HTTP API.
    """

    def __init__(self, credentials: dict, account_id: int):
        super().__init__(credentials, account_id)
        self.host = credentials.get("host", "127.0.0.1")
        self.port = credentials.get("port", 5555)
        self.base_url = f"http://{self.host}:{self.port}"
        self._client: Optional[httpx.AsyncClient] = None

    async def connect(self) -> bool:
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=5.0,
        )
        try:
            resp = await self._client.get("/ping")
            self._connected = resp.status_code == 200
            if self._connected:
                log.info("mt4_bridge_connected", url=self.base_url)
            return self._connected
        except Exception as e:
            log.error("mt4_bridge_connect_failed", url=self.base_url, error=str(e))
            self._connected = False
            return False

    async def disconnect(self):
        if self._client:
            await self._client.aclose()
        self._connected = False

    async def get_open_positions(self) -> list[TradeEvent]:
        try:
            resp = await self._client.get("/positions")
            resp.raise_for_status()
            positions = resp.json()
            return [
                TradeEvent(
                    trade_id=str(p["ticket"]),
                    symbol=p["symbol"],
                    direction="BUY" if p["type"] == 0 else "SELL",
                    lot_size=p["lots"],
                    open_price=p["open_price"],
                    stop_loss=p.get("sl") or None,
                    take_profit=p.get("tp") or None,
                    open_time=datetime.fromtimestamp(p["open_time"]),
                    profit=p.get("profit", 0),
                    swap=p.get("swap", 0),
                    comment=p.get("comment", ""),
                )
                for p in positions
            ]
        except Exception as e:
            log.error("mt4_get_positions_error", error=str(e))
            return []

    async def place_order(self, order: OrderRequest) -> OrderResult:
        try:
            payload = {
                "symbol": order.symbol,
                "type": 0 if order.direction == "BUY" else 1,
                "lots": order.lot_size,
                "sl": order.stop_loss or 0.0,
                "tp": order.take_profit or 0.0,
                "comment": order.comment,
                "magic": order.magic,
            }
            resp = await self._client.post("/order", json=payload)
            resp.raise_for_status()
            data = resp.json()
            if data.get("ticket", -1) > 0:
                return OrderResult(
                    success=True,
                    trade_id=str(data["ticket"]),
                    open_price=data.get("open_price"),
                )
            return OrderResult(success=False, error=data.get("error", "Unknown error"))
        except Exception as e:
            return OrderResult(success=False, error=str(e))

    async def close_position(self, trade_id: str) -> bool:
        try:
            resp = await self._client.post(f"/close/{trade_id}")
            resp.raise_for_status()
            return resp.json().get("success", False)
        except Exception as e:
            log.error("mt4_close_error", trade_id=trade_id, error=str(e))
            return False

    async def close_all_positions(self) -> int:
        try:
            resp = await self._client.post("/close-all")
            resp.raise_for_status()
            return resp.json().get("closed", 0)
        except Exception as e:
            log.error("mt4_close_all_error", error=str(e))
            return 0

    async def get_account_info(self) -> dict:
        try:
            resp = await self._client.get("/account")
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            log.error("mt4_account_info_error", error=str(e))
            return {}

    async def modify_position(
        self,
        trade_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        try:
            payload = {"sl": stop_loss or 0.0, "tp": take_profit or 0.0}
            resp = await self._client.put(f"/modify/{trade_id}", json=payload)
            resp.raise_for_status()
            return resp.json().get("success", False)
        except Exception as e:
            log.error("mt4_modify_error", trade_id=trade_id, error=str(e))
            return False
