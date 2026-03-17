from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models.journal import TradeJournal
from models.trade import Trade, TradeStatus
from api.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/api/journal", tags=["journal"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class JournalEntryCreate(BaseModel):
    trade_id: Optional[int] = None
    symbol: str
    direction: str
    open_time: Optional[datetime] = None
    close_time: Optional[datetime] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    lot_size: Optional[float] = None
    profit: float = 0.0
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    r_multiple: Optional[float] = None
    setup_type: Optional[str] = None
    entry_reason: Optional[str] = None
    exit_reason: Optional[str] = None
    notes: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    emotion: Optional[str] = None
    rating: Optional[int] = None
    tags: Optional[List[str]] = None


class JournalEntryUpdate(BaseModel):
    setup_type: Optional[str] = None
    entry_reason: Optional[str] = None
    exit_reason: Optional[str] = None
    notes: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    emotion: Optional[str] = None
    rating: Optional[int] = None
    tags: Optional[List[str]] = None
    r_multiple: Optional[float] = None


class JournalEntryOut(BaseModel):
    id: int
    trade_id: Optional[int]
    symbol: str
    direction: str
    open_time: Optional[datetime]
    close_time: Optional[datetime]
    open_price: Optional[float]
    close_price: Optional[float]
    lot_size: Optional[float]
    profit: float
    stop_loss: Optional[float]
    take_profit: Optional[float]
    r_multiple: Optional[float]
    setup_type: Optional[str]
    entry_reason: Optional[str]
    exit_reason: Optional[str]
    notes: Optional[str]
    mistakes: Optional[str]
    lessons: Optional[str]
    emotion: Optional[str]
    rating: Optional[int]
    tags: Optional[List[str]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────────────────────────────

def calc_stats(entries: list[TradeJournal]) -> dict:
    closed = [e for e in entries if e.close_time is not None]
    if not closed:
        return {
            "total_trades": 0, "win_rate": 0, "total_pnl": 0,
            "profit_factor": 0, "avg_win": 0, "avg_loss": 0,
            "avg_r": 0, "expectancy": 0, "best_trade": 0, "worst_trade": 0,
            "avg_hold_hours": 0, "streak_current": 0, "streak_best": 0,
        }

    wins = [e for e in closed if e.profit > 0]
    losses = [e for e in closed if e.profit <= 0]
    total_pnl = sum(e.profit for e in closed)
    gross_profit = sum(e.profit for e in wins) if wins else 0
    gross_loss = abs(sum(e.profit for e in losses)) if losses else 0
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 0
    avg_win = round(gross_profit / len(wins), 2) if wins else 0
    avg_loss = round(-gross_loss / len(losses), 2) if losses else 0
    r_multiples = [e.r_multiple for e in closed if e.r_multiple is not None]
    avg_r = round(sum(r_multiples) / len(r_multiples), 2) if r_multiples else 0
    expectancy = round((len(wins) / len(closed)) * avg_win + (len(losses) / len(closed)) * avg_loss, 2) if closed else 0

    # Hold time
    hold_hours = []
    for e in closed:
        if e.open_time and e.close_time:
            hold_hours.append((e.close_time - e.open_time).total_seconds() / 3600)
    avg_hold = round(sum(hold_hours) / len(hold_hours), 1) if hold_hours else 0

    # Win/loss streak
    sorted_trades = sorted(closed, key=lambda x: x.close_time or datetime.min)
    current_streak = 0
    best_streak = 0
    streak_type = None
    for t in sorted_trades:
        t_type = "win" if t.profit > 0 else "loss"
        if t_type == streak_type:
            current_streak += 1
        else:
            streak_type = t_type
            current_streak = 1
        best_streak = max(best_streak, current_streak)

    return {
        "total_trades": len(closed),
        "win_rate": round(len(wins) / len(closed) * 100, 1) if closed else 0,
        "total_pnl": round(total_pnl, 2),
        "profit_factor": profit_factor,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "avg_r": avg_r,
        "expectancy": expectancy,
        "best_trade": round(max((e.profit for e in closed), default=0), 2),
        "worst_trade": round(min((e.profit for e in closed), default=0), 2),
        "avg_hold_hours": avg_hold,
        "streak_current": current_streak,
        "streak_best": best_streak,
    }


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/entries", response_model=List[JournalEntryOut])
async def list_entries(
    limit: int = 100,
    offset: int = 0,
    symbol: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(TradeJournal).where(TradeJournal.user_id == current_user.id)
    if symbol:
        q = q.where(TradeJournal.symbol == symbol.upper())
    q = q.order_by(TradeJournal.open_time.desc().nullslast()).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/stats")
async def get_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = select(TradeJournal).where(
        and_(TradeJournal.user_id == current_user.id, TradeJournal.created_at >= since)
    )
    result = await db.execute(q)
    entries = result.scalars().all()
    return calc_stats(entries)


@router.get("/calendar")
async def get_calendar(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns daily P&L for the calendar heatmap."""
    from calendar import monthrange
    _, days_in_month = monthrange(year, month)
    start = datetime(year, month, 1)
    end = datetime(year, month, days_in_month, 23, 59, 59)

    q = select(TradeJournal).where(
        and_(
            TradeJournal.user_id == current_user.id,
            TradeJournal.close_time >= start,
            TradeJournal.close_time <= end,
        )
    )
    result = await db.execute(q)
    entries = result.scalars().all()

    daily: dict[int, dict] = {}
    for e in entries:
        if e.close_time:
            day = e.close_time.day
            if day not in daily:
                daily[day] = {"pnl": 0, "trades": 0, "wins": 0}
            daily[day]["pnl"] += e.profit
            daily[day]["trades"] += 1
            if e.profit > 0:
                daily[day]["wins"] += 1

    return [
        {"day": d, "pnl": round(v["pnl"], 2), "trades": v["trades"], "wins": v["wins"]}
        for d, v in sorted(daily.items())
    ]


@router.post("/entries", response_model=JournalEntryOut)
async def create_entry(
    body: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = TradeJournal(user_id=current_user.id, **body.model_dump())
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@router.patch("/entries/{entry_id}", response_model=JournalEntryOut)
async def update_entry(
    entry_id: int,
    body: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TradeJournal).where(
            TradeJournal.id == entry_id,
            TradeJournal.user_id == current_user.id
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, val)
    entry.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TradeJournal).where(
            TradeJournal.id == entry_id,
            TradeJournal.user_id == current_user.id
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    return {"ok": True}


@router.post("/sync-trades")
async def sync_from_trades(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import closed trades from the trades table into the journal (skip already imported)."""
    from models.account import Account

    # Get user's account IDs
    acc_result = await db.execute(
        select(Account.id).where(Account.user_id == current_user.id)
    )
    account_ids = [r[0] for r in acc_result.all()]
    if not account_ids:
        return {"imported": 0}

    # Get closed trades
    trades_result = await db.execute(
        select(Trade).where(
            and_(
                Trade.account_id.in_(account_ids),
                Trade.status == TradeStatus.CLOSED,
            )
        )
    )
    trades = trades_result.scalars().all()

    # Get already-imported trade IDs
    existing_result = await db.execute(
        select(TradeJournal.trade_id).where(
            and_(TradeJournal.user_id == current_user.id, TradeJournal.trade_id.isnot(None))
        )
    )
    existing_ids = {r[0] for r in existing_result.all()}

    imported = 0
    for t in trades:
        if t.id in existing_ids:
            continue
        entry = TradeJournal(
            user_id=current_user.id,
            trade_id=t.id,
            symbol=t.symbol,
            direction=t.direction.value if hasattr(t.direction, 'value') else t.direction,
            open_time=t.open_time,
            close_time=t.close_time,
            open_price=t.open_price,
            close_price=t.close_price,
            lot_size=t.lot_size,
            profit=t.profit,
            stop_loss=t.stop_loss,
            take_profit=t.take_profit,
        )
        db.add(entry)
        imported += 1

    if imported > 0:
        await db.flush()

    return {"imported": imported}
