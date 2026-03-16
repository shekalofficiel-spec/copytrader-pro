from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from models.user import SubscriptionTier


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    subscription_tier: SubscriptionTier
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SubscriptionInfo(BaseModel):
    tier: SubscriptionTier
    max_slaves: int
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
