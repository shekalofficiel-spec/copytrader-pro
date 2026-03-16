"""
/api/stats, /api/performance, /ws/live
"""
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
from models.trade import Trade, TradeStatus
from models.account import Account, AccountRole
from models.copy_event import CopyEvent, CopyStatus
from models.user import User
from schemas.stats import StatsResponse, PerformancePoint
from websocket.manager import ws_manager
from core.copy_engine import copy_engine
from core.auth import get_current_user

router = APIRouter(tags=["dashboard"])


@router.get("/api/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Scope to user's accounts
    user_account_ids = (await db.execute(
        select(Account.id).where(Account.user_id == current_user.id)
    )).scalars().all()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Total P&L
    total_pnl_r = await db.execute(
        select(func.sum(Trade.profit)).where(
            Trade.status == TradeStatus.CLOSED,
            Trade.account_id.in_(user_account_ids),
        )
    )
    total_pnl = total_pnl_r.scalar_one() or 0.0

    # Today P&L
    today_pnl_r = await db.execute(
        select(func.sum(Trade.profit)).where(
            Trade.status == TradeStatus.CLOSED,
            Trade.close_time >= today_start,
            Trade.account_id.in_(user_account_ids),
        )
    )
    today_pnl = today_pnl_r.scalar_one() or 0.0

    # Win/loss stats
    total_r = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.status == TradeStatus.CLOSED,
            Trade.account_id.in_(user_account_ids),
        )
    )
    total_trades = total_r.scalar_one() or 0

    win_r = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.status == TradeStatus.CLOSED,
            Trade.profit > 0,
            Trade.account_id.in_(user_account_ids),
        )
    )
    winning = win_r.scalar_one() or 0
    losing = total_trades - winning
    win_rate = (winning / total_trades * 100) if total_trades > 0 else 0.0

    # Trades copied today
    copied_today_r = await db.execute(
        select(func.count(CopyEvent.id)).where(CopyEvent.timestamp >= today_start)
    )
    copies_today = copied_today_r.scalar_one() or 0

    # Accounts (scoped to user)
    accounts_r = await db.execute(
        select(func.count(Account.id)).where(
            Account.is_active == True,
            Account.user_id == current_user.id,
        )
    )
    active_accounts = accounts_r.scalar_one() or 0

    master_r = await db.execute(
        select(func.count(Account.id)).where(
            Account.is_active == True,
            Account.user_id == current_user.id,
            Account.role == AccountRole.MASTER,
        )
    )
    masters = master_r.scalar_one() or 0

    # Copy success rate
    total_copies_r = await db.execute(select(func.count(CopyEvent.id)))
    total_copies = total_copies_r.scalar_one() or 0
    success_copies_r = await db.execute(
        select(func.count(CopyEvent.id)).where(CopyEvent.status == CopyStatus.SUCCESS)
    )
    success_copies = success_copies_r.scalar_one() or 0
    copy_success_rate = (success_copies / total_copies * 100) if total_copies > 0 else 0.0

    # Avg latency
    avg_lat_r = await db.execute(
        select(func.avg(CopyEvent.latency_ms)).where(
            CopyEvent.status == CopyStatus.SUCCESS,
            CopyEvent.latency_ms.isnot(None),
        )
    )
    avg_latency = avg_lat_r.scalar_one() or 0.0

    return StatsResponse(
        total_pnl=round(total_pnl, 2),
        today_pnl=round(today_pnl, 2),
        win_rate=round(win_rate, 1),
        total_trades=total_trades,
        winning_trades=winning,
        losing_trades=losing,
        trades_copied_today=copies_today,
        active_accounts=active_accounts,
        master_accounts=masters,
        slave_accounts=active_accounts - masters,
        copy_success_rate=round(copy_success_rate, 1),
        avg_copy_latency_ms=round(avg_latency, 1),
    )


@router.get("/api/performance", response_model=list[PerformancePoint])
async def get_performance(
    days: int = Query(30, ge=1, le=365),
    account_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_account_ids = (await db.execute(
        select(Account.id).where(Account.user_id == current_user.id)
    )).scalars().all()
    start_date = datetime.utcnow() - timedelta(days=days)
    filters = [
        Trade.status == TradeStatus.CLOSED,
        Trade.close_time >= start_date,
        Trade.account_id.in_(user_account_ids),
    ]
    if account_id and account_id in user_account_ids:
        filters.append(Trade.account_id == account_id)

    result = await db.execute(
        select(Trade).where(and_(*filters)).order_by(Trade.close_time)
    )
    trades = result.scalars().all()

    # Group by day
    daily: dict[str, float] = {}
    for trade in trades:
        day = trade.close_time.strftime("%Y-%m-%d")
        daily[day] = daily.get(day, 0.0) + trade.profit

    # Build response with cumulative P&L
    points = []
    cumulative = 0.0
    for date_str in sorted(daily.keys()):
        pnl = round(daily[date_str], 2)
        cumulative = round(cumulative + pnl, 2)
        trade_count = sum(1 for t in trades if t.close_time.strftime("%Y-%m-%d") == date_str)
        points.append(PerformancePoint(
            date=date_str,
            pnl=pnl,
            cumulative_pnl=cumulative,
            trades=trade_count,
        ))

    return points


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive — receive pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
