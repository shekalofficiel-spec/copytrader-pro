"""
/api/accounts — CRUD for trading accounts (auth-scoped per user).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.account import Account, AccountRole
from models.user import User
from schemas.account import AccountCreate, AccountUpdate, AccountResponse, AccountWithStats
from core.encryption import encrypt_credentials
from core.copy_engine import copy_engine
from core.auth import get_current_user

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


async def _get_user_account(account_id: int, user: User, db: AsyncSession) -> Account:
    result = await db.execute(
        select(Account).where(Account.id == account_id, Account.user_id == user.id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("", response_model=list[AccountWithStats])
async def list_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Account)
        .where(Account.user_id == current_user.id)
        .order_by(Account.created_at.desc())
    )
    accounts = result.scalars().all()

    enriched = []
    for account in accounts:
        data = AccountWithStats.model_validate(account)
        data.is_connected = copy_engine.is_connected(account.id)
        connector = copy_engine.get_connector(account.id)
        if connector:
            try:
                info = await connector.get_account_info()
                data.balance = info.get("balance")
                data.equity = info.get("equity")
                data.margin_level = info.get("margin_level")
                positions = await connector.get_open_positions()
                data.open_trades_count = len(positions)
            except Exception:
                pass
        enriched.append(data)
    return enriched


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Enforce slave limit per subscription tier
    if payload.role == AccountRole.SLAVE:
        result = await db.execute(
            select(Account).where(
                Account.user_id == current_user.id,
                Account.role == AccountRole.SLAVE,
            )
        )
        slave_count = len(result.scalars().all())
        if slave_count >= current_user.max_slaves:
            raise HTTPException(
                status_code=403,
                detail=f"Slave limit reached ({current_user.max_slaves}) for your plan. Upgrade to add more.",
            )

    encrypted = encrypt_credentials(payload.credentials)
    account = Account(
        user_id=current_user.id,
        name=payload.name,
        broker_type=payload.broker_type,
        role=payload.role,
        credentials_encrypted=encrypted,
        lot_ratio=payload.lot_ratio,
        lot_mode=payload.lot_mode,
        fixed_lot_size=payload.fixed_lot_size,
        risk_percent=payload.risk_percent,
        max_drawdown_pct=payload.max_drawdown_pct,
        max_trades=payload.max_trades,
        min_margin_level=payload.min_margin_level,
        max_lot_size=payload.max_lot_size,
        prop_firm_mode=payload.prop_firm_mode,
        no_trade_weekend=payload.no_trade_weekend,
        no_trade_news=payload.no_trade_news,
        allowed_instruments=payload.allowed_instruments,
    )
    db.add(account)
    await db.flush()
    await copy_engine.add_account(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.get("/{account_id}", response_model=AccountWithStats)
async def get_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = await _get_user_account(account_id, current_user, db)
    data = AccountWithStats.model_validate(account)
    data.is_connected = copy_engine.is_connected(account_id)
    connector = copy_engine.get_connector(account_id)
    if connector:
        try:
            info = await connector.get_account_info()
            data.balance = info.get("balance")
            data.equity = info.get("equity")
            data.margin_level = info.get("margin_level")
        except Exception:
            pass
    return data


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = await _get_user_account(account_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = await _get_user_account(account_id, current_user, db)
    await copy_engine.remove_account(account_id)
    await db.delete(account)
    await db.commit()


@router.post("/{account_id}/test-connection")
async def test_connection(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = await _get_user_account(account_id, current_user, db)
    from core.encryption import decrypt_credentials
    from connectors import get_connector
    try:
        creds = decrypt_credentials(account.credentials_encrypted)
        connector = get_connector(account.broker_type, creds, account.id)
        connected = await connector.connect()
        if connected:
            info = await connector.get_account_info()
            await connector.disconnect()
            return {"success": True, "account_info": info}
        return {"success": False, "error": "Connection failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{account_id}/toggle")
async def toggle_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = await _get_user_account(account_id, current_user, db)
    account.is_active = not account.is_active
    await db.commit()

    if account.is_active:
        await copy_engine.add_account(account)
    else:
        await copy_engine.remove_account(account_id)

    return {"account_id": account_id, "is_active": account.is_active}
