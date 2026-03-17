from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

# SQLite doesn't support pool_size / max_overflow
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    **({} if _is_sqlite else {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
    })
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    # Import all models so SQLAlchemy registers them before create_all
    import models.user      # noqa: F401
    import models.account   # noqa: F401
    import models.trade     # noqa: F401
    import models.journal   # noqa: F401
    import models.session   # noqa: F401
    import api.mt5_bridge   # noqa: F401  — registers PendingOrder table
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns if they don't exist (safe migrations)
        if not _is_sqlite:
            migrations = [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100) UNIQUE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)",
                "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE",
                "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS prop_firm_rules VARCHAR(50)",
                "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS profit_target_pct FLOAT",
                "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS daily_drawdown_pct FLOAT",
                "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS total_drawdown_pct FLOAT",
                "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes JSON",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP",
            ]
            for sql in migrations:
                try:
                    await conn.execute(__import__('sqlalchemy').text(sql))
                except Exception:
                    pass
