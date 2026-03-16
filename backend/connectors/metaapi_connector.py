"""
MetaApi Connector — Token central SaaS.
L'admin configure METAAPI_TOKEN une fois, tous les clients entrent
juste login + password + serveur MT5/MT4.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Optional
import structlog

from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult
from config import settings

log = structlog.get_logger(__name__)


class MetaApiConnector(BaseBrokerConnector):
    """
    Credentials attendus (simples, côté utilisateur) :
      - login:    numéro de compte MT5/MT4
      - password: mot de passe MT5/MT4
      - server:   serveur broker (ex: FivePercentOnline-Real)
      - platform: MT5 ou MT4 (défaut: MT5)

    Le token MetaApi vient de settings.METAAPI_TOKEN (config centrale admin).
    Le meta_account_id est auto-créé au premier connect() et sauvegardé.
    """

    def __init__(self, credentials: dict, account_id: int):
        super().__init__(credentials, account_id)
        self.token = settings.METAAPI_TOKEN or credentials.get("token", "")
        # Soit l'ID MetaApi déjà connu, soit on va le créer
        self.meta_account_id = credentials.get("meta_account_id", "")
        # Credentials MT5 bruts
        self.mt_login = str(credentials.get("login", ""))
        self.mt_password = credentials.get("password", "")
        self.mt_server = credentials.get("server", "")
        self.mt_platform = credentials.get("platform", "MT5").upper()
        self._api = None
        self._account = None
        self._connection = None

    async def connect(self) -> bool:
        if not self.token:
            log.error("metaapi_no_token", hint="Set METAAPI_TOKEN in .env")
            return False
        try:
            from metaapi_cloud_sdk import MetaApi
            self._api = MetaApi(self.token)

            # Si on n'a pas encore d'ID MetaApi, on crée le compte
            if not self.meta_account_id:
                if not self.mt_login or not self.mt_password or not self.mt_server:
                    log.error("metaapi_missing_mt_credentials")
                    return False
                meta_acc = await self._provision_account()
                if not meta_acc:
                    return False
                self.meta_account_id = meta_acc
                # Persiste l'ID dans la DB pour ne plus recréer
                await self._save_meta_account_id(meta_acc)

            self._account = await self._api.metatrader_account_api.get_account(self.meta_account_id)

            if self._account.state not in ("DEPLOYED", "DEPLOYING"):
                await self._account.deploy()

            log.info("metaapi_waiting_connection", id=self.meta_account_id)
            await self._account.wait_connected(timeout_in_seconds=120)

            self._connection = self._account.get_rpc_connection()
            await self._connection.connect()
            await self._connection.wait_synchronized(timeout_in_seconds=60)

            self._connected = True
            log.info("metaapi_connected", id=self.meta_account_id, login=self.mt_login)
            return True

        except Exception as e:
            log.error("metaapi_connect_error", error=str(e))
            self._connected = False
            return False

    async def _provision_account(self) -> Optional[str]:
        """Crée le compte MT dans MetaApi et retourne son ID."""
        try:
            platform = "MT5" if self.mt_platform == "MT5" else "MT4"
            account = await self._api.metatrader_account_api.create_account({
                "name": f"CT-{self.mt_login}",
                "type": "cloud",
                "login": self.mt_login,
                "password": self.mt_password,
                "server": self.mt_server,
                "platform": platform,
                "magic": 0,
            })
            log.info("metaapi_account_provisioned", meta_id=account.id, login=self.mt_login)
            return account.id
        except Exception as e:
            log.error("metaapi_provision_error", error=str(e), login=self.mt_login)
            return None

    async def _save_meta_account_id(self, meta_id: str):
        """Sauvegarde le meta_account_id dans les credentials chiffrés en DB."""
        try:
            from database import AsyncSessionLocal
            from models.account import Account
            from core.encryption import decrypt_credentials, encrypt_credentials
            import json
            async with AsyncSessionLocal() as db:
                account = await db.get(Account, self.account_id)
                if account:
                    creds = decrypt_credentials(account.credentials_encrypted)
                    creds["meta_account_id"] = meta_id
                    account.credentials_encrypted = encrypt_credentials(creds)
                    await db.commit()
        except Exception as e:
            log.warning("metaapi_save_id_failed", error=str(e))

    async def disconnect(self):
        try:
            if self._connection:
                await self._connection.close()
            if self._api:
                self._api.close()
        except Exception:
            pass
        self._connected = False

    async def get_open_positions(self) -> list[TradeEvent]:
        if not self._connection:
            return []
        try:
            positions = await self._connection.get_positions()
            result = []
            for pos in positions:
                result.append(TradeEvent(
                    trade_id=str(pos.get("id") or pos.get("positionId", "")),
                    symbol=pos.get("symbol", ""),
                    direction="BUY" if pos.get("type") == "POSITION_TYPE_BUY" else "SELL",
                    lot_size=pos.get("volume", 0.0),
                    open_price=pos.get("openPrice", 0.0),
                    stop_loss=pos.get("stopLoss") or None,
                    take_profit=pos.get("takeProfit") or None,
                    open_time=datetime.fromisoformat(pos["time"].replace("Z", "+00:00"))
                              if pos.get("time") else datetime.now(timezone.utc),
                    profit=pos.get("profit", 0.0),
                    swap=pos.get("swap", 0.0),
                    comment=pos.get("comment", ""),
                ))
            return result
        except Exception as e:
            log.error("metaapi_get_positions_error", error=str(e))
            return []

    async def place_order(self, order: OrderRequest) -> OrderResult:
        if not self._connection:
            return OrderResult(success=False, error="Not connected")
        try:
            import time
            start = int(time.monotonic() * 1000)
            params = {
                "symbol": order.symbol,
                "volume": order.lot_size,
                "comment": order.comment,
            }
            if order.stop_loss:
                params["stopLoss"] = order.stop_loss
            if order.take_profit:
                params["takeProfit"] = order.take_profit

            if order.direction == "BUY":
                result = await self._connection.create_market_buy_order(**params)
            else:
                result = await self._connection.create_market_sell_order(**params)

            latency = int(time.monotonic() * 1000) - start
            if result.get("stringCode") == "TRADE_RETCODE_DONE":
                return OrderResult(
                    success=True,
                    trade_id=str(result.get("positionId", "")),
                    open_price=result.get("openPrice"),
                    latency_ms=latency,
                )
            return OrderResult(
                success=False,
                error=f"{result.get('stringCode')}: {result.get('message', '')}",
            )
        except Exception as e:
            log.error("metaapi_place_order_error", error=str(e))
            return OrderResult(success=False, error=str(e))

    async def close_position(self, trade_id: str) -> bool:
        if not self._connection:
            return False
        try:
            result = await self._connection.close_position(trade_id)
            return result.get("stringCode") == "TRADE_RETCODE_DONE"
        except Exception as e:
            log.error("metaapi_close_error", trade_id=trade_id, error=str(e))
            return False

    async def close_all_positions(self) -> int:
        positions = await self.get_open_positions()
        count = 0
        for pos in positions:
            if await self.close_position(pos.trade_id):
                count += 1
        return count

    async def get_account_info(self) -> dict:
        if not self._connection:
            return {}
        try:
            info = await self._connection.get_account_information()
            balance = info.get("balance", 0)
            equity = info.get("equity", balance)
            margin = info.get("margin", 0)
            margin_level = (equity / margin * 100) if margin > 0 else 9999.0
            return {
                "balance": balance,
                "equity": equity,
                "margin": margin,
                "margin_free": info.get("freeMargin", 0),
                "margin_level": margin_level,
                "profit": info.get("profit", 0),
                "currency": info.get("currency", "USD"),
                "leverage": info.get("leverage", 100),
                "broker": info.get("broker", ""),
                "name": info.get("name", ""),
                "server": info.get("server", ""),
            }
        except Exception as e:
            log.error("metaapi_account_info_error", error=str(e))
            return {}

    async def modify_position(self, trade_id: str, stop_loss=None, take_profit=None) -> bool:
        if not self._connection:
            return False
        try:
            result = await self._connection.modify_position(
                position_id=trade_id, stop_loss=stop_loss, take_profit=take_profit
            )
            return result.get("stringCode") == "TRADE_RETCODE_DONE"
        except Exception as e:
            log.error("metaapi_modify_error", error=str(e))
            return False
