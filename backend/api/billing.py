from fastapi import APIRouter, HTTPException, Depends, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from database import get_db
from models.user import User, SubscriptionTier
from schemas.user import SubscriptionInfo
from core.auth import get_current_user
from config import settings
import structlog

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

TIER_PRICES = {
    "starter": settings.STRIPE_PRICE_STARTER,
    "pro": settings.STRIPE_PRICE_PRO,
}

PRICE_TO_TIER = {}
if settings.STRIPE_PRICE_STARTER:
    PRICE_TO_TIER[settings.STRIPE_PRICE_STARTER] = SubscriptionTier.STARTER
if settings.STRIPE_PRICE_PRO:
    PRICE_TO_TIER[settings.STRIPE_PRICE_PRO] = SubscriptionTier.PRO


@router.get("/subscription", response_model=SubscriptionInfo)
async def get_subscription(current_user: User = Depends(get_current_user)):
    return SubscriptionInfo(
        tier=current_user.subscription_tier,
        max_slaves=current_user.max_slaves,
        stripe_customer_id=current_user.stripe_customer_id,
        stripe_subscription_id=current_user.stripe_subscription_id,
        subscription_expires_at=current_user.subscription_expires_at,
    )


@router.post("/checkout/{plan}")
async def create_checkout(
    plan: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY

    price_id = TIER_PRICES.get(plan.lower())
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")

    # Get or create Stripe customer
    if not current_user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=current_user.email,
            name=current_user.full_name,
            metadata={"user_id": str(current_user.id)},
        )
        current_user.stripe_customer_id = customer.id
        await db.commit()

    session = stripe.checkout.Session.create(
        customer=current_user.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.FRONTEND_URL}/billing?success=1",
        cancel_url=f"{settings.FRONTEND_URL}/billing?cancelled=1",
        metadata={"user_id": str(current_user.id)},
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: Optional[str] = Header(None),
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY

    body = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = int(session["metadata"].get("user_id", 0))
        sub_id = session.get("subscription")
        await _upgrade_user(db, user_id, sub_id, session.get("customer"))

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.subscription_tier = SubscriptionTier.FREE
            user.stripe_subscription_id = None
            await db.commit()
            log.info("subscription_cancelled", user_id=user.id)

    return {"received": True}


async def _upgrade_user(db, user_id: int, sub_id: str, customer_id: str):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    sub = stripe.Subscription.retrieve(sub_id)
    price_id = sub["items"]["data"][0]["price"]["id"]
    tier = PRICE_TO_TIER.get(price_id, SubscriptionTier.STARTER)

    user.subscription_tier = tier
    user.stripe_subscription_id = sub_id
    if customer_id:
        user.stripe_customer_id = customer_id
    await db.commit()
    log.info("user_upgraded", user_id=user_id, tier=tier)
