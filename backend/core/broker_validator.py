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
    """Verify Binance API key by calling account endpoint."""
    import hashlib
    import hmac
    import time

    api_key = credentials.get("api_key", "")
    api_secret = credentials.get("api_secret", "")
    testnet = credentials.get("testnet", False)

    if not api_key or not api_secret:
        return False, "API Key et API Secret requis pour Binance."

    if len(api_key) < 20 or len(api_secret) < 20:
        return False, "Clés Binance invalides (longueur insuffisante)."

    base = "https://testnet.binancefuture.com" if testnet else "https://fapi.binance.com"
    ts = int(time.time() * 1000)
    query = f"timestamp={ts}"
    sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base}/fapi/v2/account",
                params={"timestamp": ts, "signature": sig},
                headers={"X-MBX-APIKEY": api_key},
            )
        if resp.status_code == 200:
            return True, ""
        data = resp.json()
        code = data.get("code", resp.status_code)
        msg = data.get("msg", "Erreur inconnue")
        if code == -2014:
            return False, "Clé API Binance invalide."
        if code == -2015:
            return False, "Clé API Binance invalide ou sans permission Futures."
        return False, f"Binance error {code}: {msg}"
    except httpx.TimeoutException:
        return False, "Timeout lors de la connexion à Binance."
    except Exception as e:
        log.error("binance_validate_error", error=str(e))
        return False, f"Erreur Binance: {str(e)}"
