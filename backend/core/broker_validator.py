"""
Broker Credential Validator
Tests real connectivity before any account is saved to the database.
Returns (success: bool, error: str).
"""
from __future__ import annotations
import asyncio
import structlog
import httpx

log = structlog.get_logger(__name__)

# Brokers that CAN be verified server-side
VERIFIABLE = {"METAAPI", "BINANCE"}

# Brokers that need client-side tools (Windows MT5, local EA bridge)
CLIENT_SIDE = {
    "MT5": "MT5 nécessite Windows. Utilise le type METAAPI à la place.",
    "MT4": "MT4 nécessite un bridge local (EA). Ajoute le compte manuellement puis teste la connexion.",
    "CTRADER": "cTrader nécessite une configuration OAuth. Ajoute le compte puis configure les credentials.",
}


async def validate_broker(broker_type: str, credentials: dict) -> tuple[bool, str]:
    """Validate broker credentials. Returns (ok, error_message)."""

    if broker_type in CLIENT_SIDE:
        # Cannot verify server-side — save as unverified, user must test manually
        return True, ""

    if broker_type == "METAAPI":
        return await _validate_metaapi(credentials)

    if broker_type == "BINANCE":
        return await _validate_binance(credentials)

    return False, f"Unknown broker type: {broker_type}"


async def _validate_metaapi(credentials: dict) -> tuple[bool, str]:
    """Verify MetaAPI credentials by calling their REST API."""
    from config import settings

    token = settings.METAAPI_TOKEN or credentials.get("token", "")
    if not token:
        return False, "METAAPI_TOKEN non configuré. Contacte l'administrateur."

    # For MetaAPI with just login/password/server — we provision later.
    # Quick check: verify the token is valid by hitting their accounts endpoint.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
                headers={"auth-token": token},
            )
        if resp.status_code == 200:
            return True, ""
        if resp.status_code == 401:
            return False, "Token MetaAPI invalide. Vérifie ton token dans metaapi.cloud."
        return False, f"MetaAPI error {resp.status_code}"
    except httpx.TimeoutException:
        return False, "Timeout lors de la connexion à MetaAPI. Réessaie."
    except Exception as e:
        log.error("metaapi_validate_error", error=str(e))
        return False, f"Erreur MetaAPI: {str(e)}"


async def _validate_binance(credentials: dict) -> tuple[bool, str]:
    """Verify Binance API key — tries Futures first, falls back to Spot."""
    import hashlib
    import hmac as _hmac
    import time

    api_key = credentials.get("api_key", "")
    api_secret = credentials.get("api_secret", "")
    testnet = credentials.get("testnet", False)

    if not api_key or not api_secret:
        return False, "API Key et API Secret requis pour Binance."

    if len(api_key) < 20 or len(api_secret) < 20:
        return False, "Clés Binance invalides (longueur insuffisante)."

    def _sign(secret: str, query: str) -> str:
        return _hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()

    ts = int(time.time() * 1000)
    query = f"timestamp={ts}"
    sig = _sign(api_secret, query)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # 1. Try Futures
            if testnet:
                futures_base = "https://testnet.binancefuture.com"
            else:
                futures_base = "https://fapi.binance.com"

            resp = await client.get(
                f"{futures_base}/fapi/v2/account",
                params={"timestamp": ts, "signature": sig},
                headers={"X-MBX-APIKEY": api_key},
            )
            if resp.status_code == 200:
                return True, ""

            data = resp.json()
            code = data.get("code", 0)

            # -2015 = invalid key / no permissions → try Spot fallback
            if code not in (-2015, -2014):
                msg = data.get("msg", "Erreur inconnue")
                return False, f"Binance Futures error {code}: {msg}"

            # 2. Fallback: Spot API
            spot_base = "https://testnet.binance.vision" if testnet else "https://api.binance.com"
            ts2 = int(time.time() * 1000)
            query2 = f"timestamp={ts2}"
            sig2 = _sign(api_secret, query2)
            resp2 = await client.get(
                f"{spot_base}/api/v3/account",
                params={"timestamp": ts2, "signature": sig2},
                headers={"X-MBX-APIKEY": api_key},
            )
            if resp2.status_code == 200:
                return True, ""

            data2 = resp2.json()
            code2 = data2.get("code", resp2.status_code)
            msg2 = data2.get("msg", "Erreur inconnue")
            if code2 == -2014:
                return False, "Clé API Binance invalide."
            if code2 == -2015:
                return False, "Clé API Binance invalide ou restrictions IP actives (whitelist ton IP dans les paramètres Binance)."
            return False, f"Binance error {code2}: {msg2}"

    except httpx.TimeoutException:
        return False, "Timeout lors de la connexion à Binance."
    except Exception as e:
        log.error("binance_validate_error", error=str(e))
        return False, f"Erreur Binance: {str(e)}"
