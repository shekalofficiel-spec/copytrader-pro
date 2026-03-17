from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from models.account import BrokerType, AccountRole, LotMode


class CredentialsMT5(BaseModel):
    login: int
    password: str
    server: str


class CredentialsMT4(BaseModel):
    host: str = "127.0.0.1"
    port: int = 5555


class CredentialsCTrader(BaseModel):
    client_id: str
    client_secret: str
    access_token: str
    refresh_token: str
    account_id: int
    is_live: bool = True


class CredentialsBinance(BaseModel):
    api_key: str
    api_secret: str
    testnet: bool = False
    futures: bool = True


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    broker_type: BrokerType
    role: AccountRole
    credentials: dict  # Raw credentials — will be encrypted before storage
    lot_ratio: float = Field(1.0, ge=0.01, le=100.0)
    lot_mode: LotMode = LotMode.RATIO
    fixed_lot_size: float = Field(0.01, ge=0.01)
    risk_percent: float = Field(1.0, ge=0.1, le=100.0)
    max_drawdown_pct: float = Field(5.0, ge=0.1, le=100.0)
    max_trades: int = Field(10, ge=1, le=500)
    min_margin_level: float = Field(200.0, ge=0.0)
    max_lot_size: float = Field(10.0, ge=0.01)
    prop_firm_mode: bool = False
    prop_firm_rules: Optional[str] = None
    profit_target_pct: Optional[float] = None
    daily_drawdown_pct: Optional[float] = None
    total_drawdown_pct: Optional[float] = None
    no_trade_weekend: bool = False
    no_trade_news: bool = False
    allowed_instruments: list[str] = Field(default_factory=list)


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    lot_ratio: Optional[float] = Field(None, ge=0.01, le=100.0)
    lot_mode: Optional[LotMode] = None
    fixed_lot_size: Optional[float] = None
    risk_percent: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    max_trades: Optional[int] = None
    min_margin_level: Optional[float] = None
    max_lot_size: Optional[float] = None
    prop_firm_mode: Optional[bool] = None
    prop_firm_rules: Optional[str] = None
    profit_target_pct: Optional[float] = None
    daily_drawdown_pct: Optional[float] = None
    total_drawdown_pct: Optional[float] = None
    no_trade_weekend: Optional[bool] = None
    no_trade_news: Optional[bool] = None
    allowed_instruments: Optional[list[str]] = None
    is_active: Optional[bool] = None


class AccountResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    broker_type: BrokerType
    role: AccountRole
    is_active: bool
    lot_ratio: float
    lot_mode: LotMode
    fixed_lot_size: float
    risk_percent: float
    max_drawdown_pct: float
    max_trades: int
    min_margin_level: float
    max_lot_size: float
    prop_firm_mode: bool
    prop_firm_rules: Optional[str] = None
    profit_target_pct: Optional[float] = None
    daily_drawdown_pct: Optional[float] = None
    total_drawdown_pct: Optional[float] = None
    no_trade_weekend: bool
    no_trade_news: bool
    allowed_instruments: list[str]
    current_drawdown: float
    is_copy_paused: bool
    created_at: datetime
    updated_at: datetime


class AccountWithStats(AccountResponse):
    # Runtime stats injected from connectors
    balance: Optional[float] = None
    equity: Optional[float] = None
    margin_level: Optional[float] = None
    open_trades_count: int = 0
    is_connected: bool = False
    total_profit: float = 0.0
