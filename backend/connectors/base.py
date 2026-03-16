"""
Abstract base class for all broker connectors.
Every connector must implement these methods.
"""
from __future__ import annotations
import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class TradeEvent:
    """Represents a trade position on the master account."""
    trade_id: str           # Broker's unique trade ID
    symbol: str
    direction: str          # BUY or SELL
    lot_size: float
    open_price: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    open_time: Optional[datetime] = None
    profit: float = 0.0
    swap: float = 0.0
    comment: str = ""


@dataclass
class OrderRequest:
    """Represents an order to be placed on a slave account."""
    symbol: str
    direction: str          # BUY or SELL
    lot_size: float
    order_type: str = "MARKET"
    price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    comment: str = "CopyTrader Pro"
    magic: int = 777777


@dataclass
class OrderResult:
    """Result of an order placement."""
    success: bool
    trade_id: Optional[str] = None
    error: Optional[str] = None
    open_price: Optional[float] = None
    latency_ms: Optional[int] = None


class BaseBrokerConnector(abc.ABC):
    """
    Abstract base for all broker connectors.
    All methods are async.
    """

    def __init__(self, credentials: dict, account_id: int):
        self.credentials = credentials
        self.account_id = account_id
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @abc.abstractmethod
    async def connect(self) -> bool:
        """Establish connection to broker. Returns True on success."""

    @abc.abstractmethod
    async def disconnect(self):
        """Clean up connection."""

    @abc.abstractmethod
    async def get_open_positions(self) -> list[TradeEvent]:
        """Return all currently open positions."""

    @abc.abstractmethod
    async def place_order(self, order: OrderRequest) -> OrderResult:
        """Place a new market/limit order."""

    @abc.abstractmethod
    async def close_position(self, trade_id: str) -> bool:
        """Close a specific position by broker trade ID."""

    @abc.abstractmethod
    async def close_all_positions(self) -> int:
        """Close all open positions. Returns count of closed trades."""

    @abc.abstractmethod
    async def get_account_info(self) -> dict:
        """Return account info: balance, equity, margin, margin_level."""

    @abc.abstractmethod
    async def modify_position(
        self,
        trade_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        """Modify SL/TP of an existing position."""
