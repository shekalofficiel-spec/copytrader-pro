import enum
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Enum, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class SubscriptionTier(str, enum.Enum):
    FREE = "FREE"          # 1 master, 1 slave
    STARTER = "STARTER"    # 1 master, 5 slaves
    PRO = "PRO"            # unlimited


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=True)
    google_id: Mapped[str] = mapped_column(String(100), nullable=True, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        Enum(SubscriptionTier), default=SubscriptionTier.FREE
    )
    stripe_customer_id: Mapped[str] = mapped_column(String(100), nullable=True)
    stripe_subscription_id: Mapped[str] = mapped_column(String(100), nullable=True)
    subscription_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    accounts: Mapped[list] = relationship("Account", back_populates="owner", lazy="select")

    @property
    def max_slaves(self) -> int:
        return {
            SubscriptionTier.FREE: 1,
            SubscriptionTier.STARTER: 5,
            SubscriptionTier.PRO: 999,
        }.get(self.subscription_tier, 1)
