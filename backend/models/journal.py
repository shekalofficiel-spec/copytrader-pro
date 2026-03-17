from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class TradeJournal(Base):
    __tablename__ = "trade_journals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # Linked to an existing trade (optional — can be manual entry)
    trade_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True, index=True)

    # Trade info (for manual entries or cache)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # BUY / SELL
    open_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    close_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    open_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    close_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lot_size: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    profit: Mapped[float] = mapped_column(Float, default=0.0)
    stop_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    take_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # R multiple = profit / risk (in $)
    r_multiple: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Journal fields
    setup_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # e.g. "Breakout", "Trend Follow"
    entry_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exit_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mistakes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lessons: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)       # "confident", "fearful", "greedy", "neutral"
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)           # 1–5 stars
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list) # ["scalp", "news", "london"]

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
