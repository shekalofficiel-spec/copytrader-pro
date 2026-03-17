"""
CopyTrader Pro — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from config import settings
from database import init_db, AsyncSessionLocal
from api import accounts_router, trades_router, dashboard_router, settings_router
from api.auth import router as auth_router
from api.billing import router as billing_router
from api.demo import router as demo_router
from api.mt5_bridge import router as mt5_bridge_router
from api.journal import router as journal_router
from core.copy_engine import copy_engine
from websocket.manager import ws_manager

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    log.info("copytrader_starting", env=settings.APP_ENV)

    # Initialize database tables
    await init_db()

    # Start copy engine with a fresh DB session
    async with AsyncSessionLocal() as db:
        await copy_engine.start(db)

    log.info("copytrader_ready")
    yield

    # Shutdown
    await copy_engine.stop()
    log.info("copytrader_stopped")


app = FastAPI(
    title="CopyTrader Pro API",
    description="Professional Copy Trading System — MT4/MT5/cTrader/Binance",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Routes ───────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(demo_router)
app.include_router(accounts_router)
app.include_router(trades_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(mt5_bridge_router)
app.include_router(journal_router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "ws_connections": ws_manager.connection_count,
    }
