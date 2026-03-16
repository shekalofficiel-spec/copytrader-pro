import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Enum, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class CopyStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    RETRYING = "RETRYING"


class CopyEvent(Base):
    __tablename__ = "copy_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    master_trade_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    slave_account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True)
    slave_trade_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True)

    status: Mapped[CopyStatus] = mapped_column(Enum(CopyStatus), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Snapshot of what was copied
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    master_lot: Mapped[float] = mapped_column(Float, nullable=False)
    slave_lot: Mapped[float] = mapped_column(Float, nullable=False)

    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
