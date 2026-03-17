import enum
from datetime import datetime
from sqlalchemy import String, Boolean, Float, Integer, Enum, JSON, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class BrokerType(str, enum.Enum):
    MT4 = "MT4"
    MT5 = "MT5"
    METAAPI = "METAAPI"   # MT5/MT4 via MetaApi cloud (works on Mac/Linux)
    CTRADER = "CTRADER"
    BINANCE = "BINANCE"


class AccountRole(str, enum.Enum):
    MASTER = "MASTER"
    SLAVE = "SLAVE"


class LotMode(str, enum.Enum):
    MIRROR = "MIRROR"        # Copie exacte
    RATIO = "RATIO"          # lot_master * ratio
    FIXED = "FIXED"          # lot fixe
    RISK_PERCENT = "RISK_PERCENT"  # % du capital


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    broker_type: Mapped[BrokerType] = mapped_column(Enum(BrokerType), nullable=False)
    role: Mapped[AccountRole] = mapped_column(Enum(AccountRole), nullable=False)

    # Credentials stored encrypted (AES-256)
    credentials_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    # Copy settings
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    lot_ratio: Mapped[float] = mapped_column(Float, default=1.0)
    lot_mode: Mapped[LotMode] = mapped_column(Enum(LotMode), default=LotMode.RATIO)
    fixed_lot_size: Mapped[float] = mapped_column(Float, default=0.01)
    risk_percent: Mapped[float] = mapped_column(Float, default=1.0)  # % for RISK_PERCENT mode

    # Risk limits
    max_drawdown_pct: Mapped[float] = mapped_column(Float, default=5.0)
    max_trades: Mapped[int] = mapped_column(Integer, default=10)
    min_margin_level: Mapped[float] = mapped_column(Float, default=200.0)
    max_lot_size: Mapped[float] = mapped_column(Float, default=10.0)

    # Prop firm mode
    prop_firm_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    prop_firm_rules: Mapped[str] = mapped_column(String(50), nullable=True)  # FTMO, MFF, THE5ERS, E8, CUSTOM
    profit_target_pct: Mapped[float] = mapped_column(Float, nullable=True)   # e.g. 10.0
    daily_drawdown_pct: Mapped[float] = mapped_column(Float, nullable=True)  # e.g. 5.0
    total_drawdown_pct: Mapped[float] = mapped_column(Float, nullable=True)  # e.g. 10.0
    no_trade_weekend: Mapped[bool] = mapped_column(Boolean, default=False)
    no_trade_news: Mapped[bool] = mapped_column(Boolean, default=False)

    # Filtering
    allowed_instruments: Mapped[list] = mapped_column(JSON, default=list)  # [] = all allowed

    # Runtime state (not persisted to DB strictly — but cached here)
    current_drawdown: Mapped[float] = mapped_column(Float, default=0.0)
    is_copy_paused: Mapped[bool] = mapped_column(Boolean, default=False)  # auto-paused by risk

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped["User"] = relationship("User", back_populates="accounts")
