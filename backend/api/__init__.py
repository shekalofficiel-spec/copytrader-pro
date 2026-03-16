from api.accounts import router as accounts_router
from api.trades import router as trades_router
from api.dashboard import router as dashboard_router
from api.settings_api import router as settings_router

__all__ = ["accounts_router", "trades_router", "dashboard_router", "settings_router"]
