import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, Enum, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class TradeDirection(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class TradeStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    PARTIALLY_CLOSED = "PARTIALLY_CLOSED"
    CANCELLED = "CANCELLED"


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True)

    # Link to master trade (for slave trades)
    master_trade_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    broker_ticket: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # broker's own ID

    # Trade details
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    direction: Mapped[TradeDirection] = mapped_column(Enum(TradeDirection), nullable=False)
    lot_size: Mapped[float] = mapped_column(Float, nullable=False)
    open_price: Mapped[float] = mapped_column(Float, nullable=False)
    close_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    take_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Times
    open_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    close_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # P&L
    profit: Mapped[float] = mapped_column(Float, default=0.0)
    swap: Mapped[float] = mapped_column(Float, default=0.0)
    commission: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[TradeStatus] = mapped_column(Enum(TradeStatus), default=TradeStatus.OPEN)
    copy_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
