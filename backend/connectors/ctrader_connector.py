"""
cTrader / FIX API Connector using ctrader-open-api (protobuf).
Supports prop firms using cTrader infrastructure (FTMO cTrader, etc.)
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional
import structlog

from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult

log = structlog.get_logger(__name__)

try:
    from ctrader_open_api import Client, Protobuf, TcpProtocol, EndPoints
    from ctrader_open_api.messages.OpenApiMessages_pb2 import (
        ProtoOAApplicationAuthReq,
        ProtoOAAccountAuthReq,
        ProtoOAReconcileReq,
        ProtoOANewOrderReq,
        ProtoOAClosePositionReq,
        ProtoOAGetAccountListByAccessTokenReq,
        ProtoOAAmendPositionSLTPReq,
    )
    from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoOAOrderType
    from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOATradeSide
    CTRADER_AVAILABLE = True
except ImportError:
    CTRADER_AVAILABLE = False
    log.warning("ctrader-open-api not available — cTrader connector in mock mode")


class CTraderConnector(BaseBrokerConnector):
    """
    cTrader Open API connector.
    Uses OAuth2 access token for authentication.
    """

    def __init__(self, credentials: dict, account_id: int):
        super().__init__(credentials, account_id)
        self.client_id = credentials.get("client_id")
        self.client_secret = credentials.get("client_secret")
        self.access_token = credentials.get("access_token")
        self.refresh_token = credentials.get("refresh_token")
        self.ct_account_id = credentials.get("account_id")
        self.is_live = credentials.get("is_live", True)

        self._client = None
        self._positions: dict[str, TradeEvent] = {}
        self._symbols: dict[int, str] = {}
        self._connected_event = asyncio.Event()

    async def connect(self) -> bool:
        if not CTRADER_AVAILABLE:
            log.warning("cTrader API not available, running mock mode")
            self._connected = True
            return True

        try:
            endpoint = EndPoints.PROTOBUF_LIVE_HOST if self.is_live else EndPoints.PROTOBUF_DEMO_HOST
            self._client = Client(endpoint, EndPoints.PROTOBUF_PORT, TcpProtocol)

            self._client.setConnectedCallback(self._on_connected)
            self._client.setDisconnectedCallback(self._on_disconnected)
            self._client.setMessageReceivedCallback(self._on_message)

            self._client.startService()

            # Wait for auth to complete (timeout 10s)
            await asyncio.wait_for(self._connected_event.wait(), timeout=10.0)
            return self._connected
        except asyncio.TimeoutError:
            log.error("ctrader_connect_timeout")
            return False
        except Exception as e:
            log.error("ctrader_connect_error", error=str(e))
            return False

    def _on_connected(self, client, message):
        """Send app auth request once TCP connection is established."""
        req = ProtoOAApplicationAuthReq()
        req.clientId = self.client_id
        req.clientSecret = self.client_secret
        deferred = client.send(req)
        deferred.addErrback(lambda failure: log.error("ctrader_app_auth_error", error=str(failure)))

    def _on_disconnected(self, client, message):
        self._connected = False
        self._connected_event.clear()
        log.warning("ctrader_disconnected")

    def _on_message(self, client, message):
        from ctrader_open_api.messages.OpenApiMessages_pb2 import (
            ProtoOAApplicationAuthRes,
            ProtoOAAccountAuthRes,
            ProtoOAReconcileRes,
        )
        msg_type = message.payloadType

        if msg_type == ProtoOAApplicationAuthRes().payloadType:
            # Now authenticate the trading account
            auth_req = ProtoOAAccountAuthReq()
            auth_req.ctidTraderAccountId = self.ct_account_id
            auth_req.accessToken = self.access_token
            client.send(auth_req)

        elif msg_type == ProtoOAAccountAuthRes().payloadType:
            self._connected = True
            self._connected_event.set()
            log.info("ctrader_authenticated", account_id=self.ct_account_id)

    async def disconnect(self):
        if self._client:
            self._client.stopService()
        self._connected = False

    async def get_open_positions(self) -> list[TradeEvent]:
        if not CTRADER_AVAILABLE:
            return []
        # Return cached positions (updated via subscription)
        return list(self._positions.values())

    async def place_order(self, order: OrderRequest) -> OrderResult:
        if not CTRADER_AVAILABLE:
            return OrderResult(success=True, trade_id="CT_SIM_001", open_price=1.0)

        try:
            req = ProtoOANewOrderReq()
            req.ctidTraderAccountId = self.ct_account_id
            req.symbolId = await self._get_symbol_id(order.symbol)
            req.orderType = ProtoOAOrderType.MARKET
            req.tradeSide = (
                ProtoOATradeSide.BUY if order.direction == "BUY" else ProtoOATradeSide.SELL
            )
            req.volume = int(order.lot_size * 100)  # cTrader uses units * 100
            if order.stop_loss:
                req.stopLoss = int(order.stop_loss * 100000)
            if order.take_profit:
                req.takeProfit = int(order.take_profit * 100000)
            req.comment = order.comment

            deferred = self._client.send(req)
            # In production: await deferred response properly
            return OrderResult(success=True, trade_id="pending")
        except Exception as e:
            return OrderResult(success=False, error=str(e))

    async def _get_symbol_id(self, symbol: str) -> int:
        # In production: query symbol list and cache
        # Simple mock mapping
        symbol_map = {"EURUSD": 1, "GBPUSD": 2, "USDJPY": 3, "XAUUSD": 41}
        return symbol_map.get(symbol, 1)

    async def close_position(self, trade_id: str) -> bool:
        if not CTRADER_AVAILABLE:
            return True
        try:
            req = ProtoOAClosePositionReq()
            req.ctidTraderAccountId = self.ct_account_id
            req.positionId = int(trade_id)
            req.volume = 0  # 0 = close full position
            self._client.send(req)
            return True
        except Exception as e:
            log.error("ctrader_close_error", trade_id=trade_id, error=str(e))
            return False

    async def close_all_positions(self) -> int:
        positions = await self.get_open_positions()
        count = 0
        for pos in positions:
            if await self.close_position(pos.trade_id):
                count += 1
        return count

    async def get_account_info(self) -> dict:
        # In production: query ProtoOAGetCtidProfileByTokenReq or balance events
        return {
            "balance": 10000.0,
            "equity": 10000.0,
            "margin": 0.0,
            "margin_level": 9999.0,
        }

    async def modify_position(
        self,
        trade_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        if not CTRADER_AVAILABLE:
            return True
        try:
            req = ProtoOAAmendPositionSLTPReq()
            req.ctidTraderAccountId = self.ct_account_id
            req.positionId = int(trade_id)
            if stop_loss:
                req.stopLoss = int(stop_loss * 100000)
            if take_profit:
                req.takeProfit = int(take_profit * 100000)
            self._client.send(req)
            return True
        except Exception as e:
            log.error("ctrader_modify_error", trade_id=trade_id, error=str(e))
            return False
