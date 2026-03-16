from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.trade import TradeDirection, TradeStatus


class TradeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    account_id: int
    master_trade_id: Optional[str]
    broker_ticket: Optional[str]
    symbol: str
    direction: TradeDirection
    lot_size: float
    open_price: float
    close_price: Optional[float]
    stop_loss: Optional[float]
    take_profit: Optional[float]
    profit: float
    swap: float
    commission: float
    status: TradeStatus
    open_time: datetime
    close_time: Optional[datetime]
    copy_latency_ms: Optional[int]
    created_at: datetime


class TradeFilter(BaseModel):
    account_id: Optional[int] = None
    symbol: Optional[str] = None
    status: Optional[TradeStatus] = None
    direction: Optional[TradeDirection] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    page: int = 1
    page_size: int = 50
