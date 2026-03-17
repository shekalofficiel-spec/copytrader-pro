"""
MT5 Bridge API — CopyTrader Pro
Endpoints consumed by the CopyTradeBridgeMT5.mq5 Expert Advisor.

POST /api/mt5/event              — Master EA pushes trade open/close events
GET  /api/mt5/orders/{account_id} — Slave EA polls for pending orders
POST /api/mt5/confirm            — Slave EA confirms order execution
GET  /api/mt5/token              — Authenticated user fetches their account token
POST /api/mt5/generate-token     — Authenticated user generates/rotates an account token
"""
import enum
import secrets
import structlog
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import String, Integer, Float, Enum as SAEnum, DateTime, ForeignKey, select, update
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncSession

from database import Base, get_db
from models.account import Account, AccountRole
from core.auth import get_current_user
from models.user import User
from models.trade import Trade, TradeDirection, TradeStatus

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/mt5", tags=["mt5-bridge"])


# ─── SQLAlchemy Model ────────────────────────────────────────────────────────

class PendingOrderStatus(str, enum.Enum):
    pending = "pending"
    sent    = "sent"
    done    = "done"
    failed  = "failed"


class PendingOrder(Base):
    """Queued order waiting to be picked up by a Slave EA."""
    __tablename__ = "pending_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Which slave account should execute this order
    slave_account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=False, index=True
    )

    # The master trade that triggered this order (our internal id as string)
    master_trade_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # Trade details
    symbol:     Mapped[str]   = mapped_column(String(20),  nullable=False)
    direction:  Mapped[str]   = mapped_column(String(10),  nullable=False)  # "BUY" | "SELL"
    lots:       Mapped[float] = mapped_column(Float,       nullable=False)
    open_price: Mapped[float] = mapped_column(Float,       nullable=False, default=0.0)
    sl:         Mapped[float] = mapped_column(Float,       nullable=False, default=0.0)
    tp:         Mapped[float] = mapped_column(Float,       nullable=False, default=0.0)
    magic:      Mapped[int]   = mapped_column(Integer,     nullable=False, default=888888)

    status: Mapped[PendingOrderStatus] = mapped_column(
        SAEnum(PendingOrderStatus), default=PendingOrderStatus.pending, nullable=False, index=True
    )

    # Filled in after slave confirmation
    slave_ticket:   Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message:  Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at:   Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class MT5EventPayload(BaseModel):
    event:       str   = Field(..., pattern="^(open|close)$")
    account_id:  str
    ticket:      int
    symbol:      str
    direction:   str   = Field(..., pattern="^(BUY|SELL)$")
    lots:        float = Field(..., gt=0)
    open_price:  float = Field(default=0.0)
    close_price: Optional[float] = None
    sl:          float = Field(default=0.0)
    tp:          float = Field(default=0.0)
    magic:       int   = Field(default=0)
    profit:      Optional[float] = None


class PendingOrderOut(BaseModel):
    id:           int
    symbol:       str
    direction:    str
    lots:         float
    open_price:   float
    sl:           float
    tp:           float
    magic:        int

    model_config = {"from_attributes": True}


class ConfirmPayload(BaseModel):
    order_id:         int
    slave_account_id: str
    slave_ticket:     Optional[int] = None
    success:          bool
    error:            Optional[str] = None


class GenerateTokenRequest(BaseModel):
    account_id: int


class TokenOut(BaseModel):
    account_id: int
    token:      str


# ─── Auth Helper ─────────────────────────────────────────────────────────────

async def _get_account_by_token(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> Account:
    """
    Validate the Bearer token sent by the MT5 EA.
    The raw token is stored in Account.credentials_encrypted under the key "mt5_token".
    We do a simple equality check (no JWT — the EA uses this long-lived static token).
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty token")

    # Search all accounts whose credentials_encrypted contains this token.
    # We store the token as a plain JSON string: '{"mt5_token": "<token>"}' or just the token itself.
    result = await db.execute(
        select(Account).where(Account.credentials_encrypted.contains(token))
    )
    account = result.scalar_one_or_none()

    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Double-check that the stored value actually contains our token (substring match is coarse)
    import json as _json
    try:
        creds = _json.loads(account.credentials_encrypted)
        stored_token = creds.get("mt5_token", "")
    except Exception:
        stored_token = account.credentials_encrypted.strip()

    if not secrets.compare_digest(stored_token, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return account


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/event", status_code=status.HTTP_200_OK)
async def receive_event(
    payload: MT5EventPayload,
    account: Account = Depends(_get_account_by_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the MASTER EA every time a trade opens or closes.
    On 'open'  → create a Trade record + fan-out PendingOrders to all slave accounts.
    On 'close' → mark the corresponding Trade as CLOSED.
    """
    log.info("mt5_event_received",
             event=payload.event, account_id=account.id,
             ticket=payload.ticket, symbol=payload.symbol)

    # Verify the account_id in the payload matches the authenticated account
    # (the EA sends its own AccountID string — we store that as part of creds or name)
    if account.role != AccountRole.MASTER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only MASTER accounts can push events",
        )

    broker_ticket_str = str(payload.ticket)

    if payload.event == "open":
        # Idempotency: skip if we already have this ticket
        existing = await db.execute(
            select(Trade).where(
                Trade.account_id == account.id,
                Trade.broker_ticket == broker_ticket_str,
                Trade.status == TradeStatus.OPEN,
            )
        )
        if existing.scalar_one_or_none():
            log.warning("mt5_event_duplicate_open", ticket=payload.ticket)
            return {"status": "duplicate", "message": "Trade already recorded"}

        # Create master trade record
        master_trade = Trade(
            account_id=account.id,
            broker_ticket=broker_ticket_str,
            symbol=payload.symbol,
            direction=TradeDirection(payload.direction),
            lot_size=payload.lots,
            open_price=payload.open_price,
            stop_loss=payload.sl if payload.sl else None,
            take_profit=payload.tp if payload.tp else None,
            open_time=datetime.utcnow(),
            status=TradeStatus.OPEN,
        )
        db.add(master_trade)
        await db.flush()  # get master_trade.id before creating pending orders

        # Find all SLAVE accounts belonging to the same user
        slaves_result = await db.execute(
            select(Account).where(
                Account.user_id == account.user_id,
                Account.role == AccountRole.SLAVE,
                Account.is_active == True,
            )
        )
        slave_accounts = slaves_result.scalars().all()

        pending_orders_created = 0
        for slave in slave_accounts:
            # Apply lot sizing
            slave_lots = _calculate_lots(payload.lots, slave)

            pending = PendingOrder(
                slave_account_id=slave.id,
                master_trade_id=str(master_trade.id),
                symbol=payload.symbol,
                direction=payload.direction,
                lots=slave_lots,
                open_price=payload.open_price,
                sl=payload.sl,
                tp=payload.tp,
                magic=payload.magic if payload.magic else 888888,
                status=PendingOrderStatus.pending,
            )
            db.add(pending)
            pending_orders_created += 1

        await db.commit()
        log.info("mt5_open_processed",
                 master_trade_id=master_trade.id,
                 slaves_queued=pending_orders_created)

        return {
            "status": "ok",
            "master_trade_id": master_trade.id,
            "pending_orders_created": pending_orders_created,
        }

    elif payload.event == "close":
        # Find the open trade by broker ticket
        result = await db.execute(
            select(Trade).where(
                Trade.account_id == account.id,
                Trade.broker_ticket == broker_ticket_str,
                Trade.status == TradeStatus.OPEN,
            )
        )
        trade = result.scalar_one_or_none()

        if trade is None:
            log.warning("mt5_close_not_found", ticket=payload.ticket)
            return {"status": "not_found", "message": "No open trade with this ticket"}

        trade.status      = TradeStatus.CLOSED
        trade.close_price = payload.close_price
        trade.close_time  = datetime.utcnow()
        trade.profit      = payload.profit or 0.0

        await db.commit()
        log.info("mt5_close_processed", trade_id=trade.id, profit=trade.profit)
        return {"status": "ok", "trade_id": trade.id}

    # Should never reach here due to Pydantic validation
    raise HTTPException(status_code=400, detail="Unknown event type")


@router.get("/orders/{account_id}", response_model=List[PendingOrderOut])
async def get_pending_orders(
    account_id: str = Path(..., description="Slave account ID string"),
    account: Account = Depends(_get_account_by_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the SLAVE EA every 500 ms.
    Returns all 'pending' orders for this slave account and marks them as 'sent'.
    """
    if account.role != AccountRole.SLAVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only SLAVE accounts can poll for orders",
        )

    result = await db.execute(
        select(PendingOrder).where(
            PendingOrder.slave_account_id == account.id,
            PendingOrder.status == PendingOrderStatus.pending,
        ).order_by(PendingOrder.created_at.asc())
    )
    orders = result.scalars().all()

    if not orders:
        return []

    # Mark all as 'sent' atomically
    order_ids = [o.id for o in orders]
    await db.execute(
        update(PendingOrder)
        .where(PendingOrder.id.in_(order_ids))
        .values(status=PendingOrderStatus.sent)
    )
    await db.commit()

    log.info("mt5_orders_dispatched", slave_account_id=account.id, count=len(orders))
    return [PendingOrderOut.model_validate(o) for o in orders]


@router.post("/confirm", status_code=status.HTTP_200_OK)
async def confirm_order(
    payload: ConfirmPayload,
    account: Account = Depends(_get_account_by_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the SLAVE EA after it attempts to execute a pending order.
    Updates PendingOrder status to 'done' or 'failed'.
    """
    result = await db.execute(
        select(PendingOrder).where(PendingOrder.id == payload.order_id)
    )
    order = result.scalar_one_or_none()

    if order is None:
        raise HTTPException(status_code=404, detail="Pending order not found")

    if order.slave_account_id != account.id:
        raise HTTPException(status_code=403, detail="Order does not belong to this account")

    order.status       = PendingOrderStatus.done if payload.success else PendingOrderStatus.failed
    order.slave_ticket = str(payload.slave_ticket) if payload.slave_ticket else None
    order.error_message = payload.error
    order.confirmed_at  = datetime.utcnow()

    await db.commit()

    log.info("mt5_order_confirmed",
             order_id=payload.order_id,
             success=payload.success,
             slave_ticket=payload.slave_ticket)

    return {"status": "ok", "order_id": payload.order_id, "result": order.status}


@router.get("/token", response_model=TokenOut)
async def get_token(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticated endpoint: returns the MT5 Bearer token for the given account.
    Used by the CopyTrader Pro dashboard so traders can configure their EA.
    """
    account = await _fetch_user_account(account_id, current_user, db)

    import json as _json
    try:
        creds = _json.loads(account.credentials_encrypted)
        token = creds.get("mt5_token", "")
    except Exception:
        token = ""

    if not token:
        raise HTTPException(
            status_code=404,
            detail="No token generated yet. Call POST /api/mt5/generate-token first.",
        )

    return TokenOut(account_id=account.id, token=token)


@router.post("/generate-token", response_model=TokenOut)
async def generate_token(
    body: GenerateTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticated endpoint: generates (or rotates) a secure random token for the account.
    The token is stored in credentials_encrypted as JSON: {"mt5_token": "<token>"}.
    Existing credential data is preserved; only the mt5_token key is updated.
    """
    account = await _fetch_user_account(body.account_id, current_user, db)

    import json as _json
    try:
        creds = _json.loads(account.credentials_encrypted)
        if not isinstance(creds, dict):
            creds = {}
    except Exception:
        creds = {}

    new_token = secrets.token_urlsafe(32)
    creds["mt5_token"] = new_token

    account.credentials_encrypted = _json.dumps(creds)
    await db.commit()

    log.info("mt5_token_generated", account_id=account.id, user_id=current_user.id)
    return TokenOut(account_id=account.id, token=new_token)


# ─── Private Helpers ─────────────────────────────────────────────────────────

async def _fetch_user_account(account_id: int, user: User, db: AsyncSession) -> Account:
    """Load an account, verifying it belongs to the requesting user."""
    result = await db.execute(
        select(Account).where(Account.id == account_id, Account.user_id == user.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _calculate_lots(master_lots: float, slave: Account) -> float:
    """Apply the slave's lot-sizing mode to produce the slave trade size."""
    from models.account import LotMode
    mode = slave.lot_mode

    if mode == LotMode.MIRROR:
        return round(master_lots, 2)
    elif mode == LotMode.RATIO:
        return round(master_lots * slave.lot_ratio, 2)
    elif mode == LotMode.FIXED:
        return round(slave.fixed_lot_size, 2)
    else:
        # RISK_PERCENT: use fixed for now (proper implementation needs account balance)
        return round(slave.fixed_lot_size or master_lots, 2)
