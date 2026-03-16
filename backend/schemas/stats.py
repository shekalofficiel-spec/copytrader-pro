from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.copy_event import CopyStatus


class StatsResponse(BaseModel):
    total_pnl: float
    today_pnl: float
    win_rate: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    trades_copied_today: int
    active_accounts: int
    master_accounts: int
    slave_accounts: int
    copy_success_rate: float
    avg_copy_latency_ms: float


class PerformancePoint(BaseModel):
    date: str
    pnl: float
    cumulative_pnl: float
    trades: int


class CopyEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    master_trade_id: str
    slave_account_id: int
    slave_trade_id: Optional[int]
    status: CopyStatus
    error_message: Optional[str]
    latency_ms: Optional[int]
    retry_count: int
    symbol: str
    direction: str
    master_lot: float
    slave_lot: float
    timestamp: datetime


class LiveEvent(BaseModel):
    event_type: str  # TRADE_OPENED, TRADE_CLOSED, COPY_SUCCESS, COPY_FAILED, RISK_ALERT, KILL_SWITCH
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    symbol: Optional[str] = None
    direction: Optional[str] = None
    lot_size: Optional[float] = None
    profit: Optional[float] = None
    message: str
    timestamp: datetime
    severity: str = "info"  # info, success, warning, error
