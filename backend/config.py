from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    APP_NAME: str = "CopyTrader Pro"
    APP_ENV: str = "development"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-please-use-32-chars"
    ENCRYPTION_KEY: str = "change-me-32-chars-encryption-key!!"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://copytrader:secret@postgres:5432/copytrader"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    REDIS_CHANNEL_LIVE: str = "live_events"

    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: str = "copytrader@example.com"
    DAILY_REPORT_HOUR: int = 20  # 8 PM UTC

    # Copy Engine
    COPY_POLL_INTERVAL_MS: int = 100
    COPY_RETRY_COUNT: int = 3
    COPY_RETRY_DELAY_MS: int = 500

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # MetaApi (token central admin — tous les clients passent par ce token)
    METAAPI_TOKEN: Optional[str] = None

    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None

    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_STARTER: Optional[str] = None  # price_xxx for Starter plan
    STRIPE_PRICE_PRO: Optional[str] = None       # price_xxx for Pro plan
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def secret_key(self) -> str:
        return self.SECRET_KEY


settings = Settings()
