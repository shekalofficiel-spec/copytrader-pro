"""
Demo seed endpoint — populates the DB with realistic demo data.
POST /api/demo/seed  (authenticated)
"""
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models.user import User
from models.account import Account, BrokerType, AccountRole, LotMode
from models.trade import Trade, TradeDirection, TradeStatus
from models.copy_event import CopyEvent, CopyStatus
from core.auth import get_current_user
from core.encryption import encrypt_credentials

router = APIRouter(prefix="/api/demo", tags=["demo"])

SYMBOLS = ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "BTCUSDT", "ETHUSDT", "NASDAQ", "US30"]
SYMBOL_PIPS = {
    "EURUSD": 0.0001, "GBPUSD": 0.0001, "XAUUSD": 0.1,
    "USDJPY": 0.01, "BTCUSDT": 1.0, "ETHUSDT": 0.1,
    "NASDAQ": 0.5, "US30": 1.0,
}


def _rand_price(symbol: str) -> float:
    bases = {
        "EURUSD": 1.0850, "GBPUSD": 1.2650, "XAUUSD": 2310.0,
        "USDJPY": 151.50, "BTCUSDT": 67000.0, "ETHUSDT": 3200.0,
        "NASDAQ": 18200.0, "US30": 39500.0,
    }
    base = bases.get(symbol, 1.0)
    return round(base * (1 + random.uniform(-0.005, 0.005)), 5)


@router.post("/seed")
async def seed_demo(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if already seeded
    existing = await db.execute(
        select(func.count(Account.id)).where(Account.user_id == current_user.id)
    )
    if existing.scalar_one() >= 3:
        raise HTTPException(status_code=400, detail="Demo data already seeded")

    # ── Accounts ────────────────────────────────────────────────────────────
    fake_creds = encrypt_credentials({"demo": True, "login": "12345678", "server": "demo"})

    master = Account(
        user_id=current_user.id,
        name="Master MT5 — ICMarkets",
        broker_type=BrokerType.MT5,
        role=AccountRole.MASTER,
        credentials_encrypted=fake_creds,
        is_active=True,
        lot_mode=LotMode.RATIO,
        lot_ratio=1.0,
        max_drawdown_pct=8.0,
        max_trades=20,
    )
    slave1 = Account(
        user_id=current_user.id,
        name="Slave 1 — FTMO MT5",
        broker_type=BrokerType.MT5,
        role=AccountRole.SLAVE,
        credentials_encrypted=fake_creds,
        is_active=True,
        lot_mode=LotMode.RATIO,
        lot_ratio=0.5,
        max_drawdown_pct=5.0,
        prop_firm_mode=True,
        no_trade_weekend=True,
    )
    slave2 = Account(
        user_id=current_user.id,
        name="Slave 2 — Binance Futures",
        broker_type=BrokerType.BINANCE,
        role=AccountRole.SLAVE,
        credentials_encrypted=fake_creds,
        is_active=True,
        lot_mode=LotMode.FIXED,
        fixed_lot_size=0.01,
        max_drawdown_pct=10.0,
    )

    db.add_all([master, slave1, slave2])
    await db.flush()  # get IDs

    # ── Trades — 30 days history ────────────────────────────────────────────
    now = datetime.utcnow()
    all_trades = []
    copy_events = []

    # Realistic P&L curve — slightly positive bias
    pnl_sequence = []
    for _ in range(60):
        # 60% win rate, wins avg +45, losses avg -25
        if random.random() < 0.62:
            pnl_sequence.append(round(random.uniform(20, 120), 2))
        else:
            pnl_sequence.append(round(random.uniform(-60, -10), 2))

    trade_idx = 0
    for day_offset in range(30, 0, -1):
        # 1-3 trades per day
        trades_today = random.randint(1, 3)
        for _ in range(trades_today):
            if trade_idx >= len(pnl_sequence):
                break
            symbol = random.choice(SYMBOLS)
            direction = random.choice([TradeDirection.BUY, TradeDirection.SELL])
            open_price = _rand_price(symbol)
            profit = pnl_sequence[trade_idx]
            pip = SYMBOL_PIPS.get(symbol, 0.0001)
            close_price = round(
                open_price + (profit / 1000) * pip * (1 if direction == TradeDirection.BUY else -1),
                5
            )
            lot = round(random.choice([0.1, 0.2, 0.5, 1.0]), 2)
            open_t = now - timedelta(days=day_offset, hours=random.randint(1, 22))
            close_t = open_t + timedelta(minutes=random.randint(15, 480))

            # Master trade
            master_trade = Trade(
                account_id=master.id,
                symbol=symbol,
                direction=direction,
                lot_size=lot,
                open_price=open_price,
                close_price=close_price,
                profit=profit,
                status=TradeStatus.CLOSED,
                open_time=open_t,
                close_time=close_t,
                broker_ticket=f"TKT{random.randint(100000, 999999)}",
            )
            all_trades.append(master_trade)

            # Slave 1 trade
            slave1_profit = round(profit * 0.5, 2)
            slave1_trade = Trade(
                account_id=slave1.id,
                symbol=symbol,
                direction=direction,
                lot_size=round(lot * 0.5, 2),
                open_price=open_price,
                close_price=close_price,
                profit=slave1_profit,
                status=TradeStatus.CLOSED,
                open_time=open_t + timedelta(milliseconds=random.randint(60, 200)),
                close_time=close_t,
                copy_latency_ms=random.randint(60, 250),
            )
            all_trades.append(slave1_trade)

            # Copy event slave1
            latency = random.randint(60, 250)
            copy_events.append(CopyEvent(
                master_trade_id=f"DEMO-{day_offset}-{trade_idx}",
                slave_account_id=slave1.id,
                status=CopyStatus.SUCCESS if random.random() > 0.05 else CopyStatus.FAILED,
                latency_ms=latency,
                symbol=symbol,
                direction=direction.value,
                master_lot=lot,
                slave_lot=round(lot * 0.5, 2),
                timestamp=open_t + timedelta(milliseconds=latency),
            ))

            # Slave 2 trade (Binance)
            slave2_profit = round(profit * 0.3, 2)
            slave2_trade = Trade(
                account_id=slave2.id,
                symbol=symbol,
                direction=direction,
                lot_size=0.01,
                open_price=open_price,
                close_price=close_price,
                profit=slave2_profit,
                status=TradeStatus.CLOSED,
                open_time=open_t + timedelta(milliseconds=random.randint(80, 300)),
                close_time=close_t,
                copy_latency_ms=random.randint(80, 300),
            )
            all_trades.append(slave2_trade)

            latency2 = random.randint(80, 300)
            copy_events.append(CopyEvent(
                master_trade_id=f"DEMO-{day_offset}-{trade_idx}",
                slave_account_id=slave2.id,
                status=CopyStatus.SUCCESS if random.random() > 0.08 else CopyStatus.FAILED,
                latency_ms=latency2,
                symbol=symbol,
                direction=direction.value,
                master_lot=lot,
                slave_lot=0.01,
                timestamp=open_t + timedelta(milliseconds=latency2),
            ))

            trade_idx += 1

    # Add 3 open trades (active right now)
    for i in range(3):
        symbol = random.choice(["EURUSD", "XAUUSD", "BTCUSDT"])
        direction = random.choice([TradeDirection.BUY, TradeDirection.SELL])
        open_price = _rand_price(symbol)
        open_t = now - timedelta(hours=random.randint(1, 8))
        lot = random.choice([0.1, 0.5, 1.0])

        all_trades.append(Trade(
            account_id=master.id,
            symbol=symbol,
            direction=direction,
            lot_size=lot,
            open_price=open_price,
            profit=round(random.uniform(-50, 80), 2),
            status=TradeStatus.OPEN,
            open_time=open_t,
        ))
        all_trades.append(Trade(
            account_id=slave1.id,
            symbol=symbol,
            direction=direction,
            lot_size=round(lot * 0.5, 2),
            open_price=open_price,
            profit=round(random.uniform(-25, 40), 2),
            status=TradeStatus.OPEN,
            open_time=open_t + timedelta(milliseconds=120),
            copy_latency_ms=120,
        ))

    db.add_all(all_trades)
    db.add_all(copy_events)
    await db.commit()

    total_pnl = sum(t.profit for t in all_trades if t.status == TradeStatus.CLOSED and t.account_id == master.id)

    return {
        "message": "Demo data seeded successfully",
        "accounts": 3,
        "trades": len([t for t in all_trades if t.status == TradeStatus.CLOSED]),
        "active_trades": len([t for t in all_trades if t.status == TradeStatus.OPEN]),
        "copy_events": len(copy_events),
        "total_pnl": round(total_pnl, 2),
    }
