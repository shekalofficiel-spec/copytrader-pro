"""
/api/trades — Trade history, active trades, kill switch.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from datetime import datetime

from database import get_db
from models.trade import Trade, TradeStatus
from models.account import Account, AccountRole
from models.copy_event import CopyEvent
from models.user import User
from schemas.trade import TradeResponse, TradeFilter
from schemas.stats import CopyEventResponse
from core.copy_engine import copy_engine
from core.risk_manager import RiskManager
from core.auth import get_current_user
from websocket.manager import ws_manager
from schemas.stats import LiveEvent

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("", response_model=dict)
async def list_trades(
    account_id: Optional[int] = Query(None),
    symbol: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Scope trades to user's accounts
    user_account_ids_q = select(Account.id).where(Account.user_id == current_user.id)
    user_account_ids = (await db.execute(user_account_ids_q)).scalars().all()
    filters = [Trade.account_id.in_(user_account_ids)]

    if account_id and account_id in user_account_ids:
        filters.append(Trade.account_id == account_id)
    if symbol:
        filters.append(Trade.symbol == symbol.upper())
    if status:
        filters.append(Trade.status == status)
    if date_from:
        filters.append(Trade.open_time >= date_from)
    if date_to:
        filters.append(Trade.open_time <= date_to)

    # Total count
    count_q = select(func.count(Trade.id))
    if filters:
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar_one()

    # Data
    q = select(Trade).order_by(Trade.open_time.desc())
    if filters:
        q = q.where(and_(*filters))
    q = q.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    trades = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "trades": [TradeResponse.model_validate(t) for t in trades],
    }


@router.get("/active", response_model=list[TradeResponse])
async def get_active_trades(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_account_ids = (await db.execute(
        select(Account.id).where(Account.user_id == current_user.id)
    )).scalars().all()
    result = await db.execute(
        select(Trade)
        .where(Trade.status == TradeStatus.OPEN, Trade.account_id.in_(user_account_ids))
        .order_by(Trade.open_time.desc())
    )
    return [TradeResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/close-all")
async def kill_switch(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Emergency kill switch — closes ALL positions on ALL slave accounts of this user."""
    result = await db.execute(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.role == AccountRole.SLAVE,
            Account.is_active == True,
        )
    )
    slaves = result.scalars().all()

    risk_manager = RiskManager()
    pairs = []
    for slave in slaves:
        connector = copy_engine.get_connector(slave.id)
        if connector:
            pairs.append((slave, connector))

    kill_results = await risk_manager.kill_switch(pairs)

    # Broadcast kill switch event
    await ws_manager.broadcast(LiveEvent(
        event_type="KILL_SWITCH",
        message=f"🛑 Kill switch activated — {len(pairs)} accounts affected",
        timestamp=datetime.utcnow(),
        severity="error",
    ))

    # Trigger Telegram notification (best-effort)
    try:
        from tasks.celery_tasks import notify_kill_switch_task, CELERY_AVAILABLE
        if CELERY_AVAILABLE:
            notify_kill_switch_task.delay(kill_results)
        else:
            notify_kill_switch_task(kill_results)
    except Exception:
        pass

    # Mark all open slave trades as cancelled
    open_trades_q = select(Trade).where(
        Trade.status == TradeStatus.OPEN,
        Trade.account_id.in_([s.id for s in slaves]),
    )
    open_trades = (await db.execute(open_trades_q)).scalars().all()
    for trade in open_trades:
        trade.status = TradeStatus.CLOSED
        trade.close_time = datetime.utcnow()

    await db.commit()
    return {"success": True, "accounts_affected": len(pairs), "results": kill_results}


@router.get("/copy-events", response_model=dict)
async def get_copy_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if status:
        filters.append(CopyEvent.status == status)

    count_q = select(func.count(CopyEvent.id))
    if filters:
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar_one()

    q = select(CopyEvent).order_by(CopyEvent.timestamp.desc())
    if filters:
        q = q.where(and_(*filters))
    q = q.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    events = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "events": [CopyEventResponse.model_validate(e) for e in events],
    }
