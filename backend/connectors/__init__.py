from connectors.base import BaseBrokerConnector, TradeEvent, OrderRequest, OrderResult
from connectors.mt5_connector import MT5Connector
from connectors.mt4_connector import MT4Connector
from connectors.metaapi_connector import MetaApiConnector
from connectors.ctrader_connector import CTraderConnector
from connectors.binance_connector import BinanceConnector
from models.account import BrokerType


def get_connector(broker_type: BrokerType, credentials: dict, account_id: int) -> BaseBrokerConnector:
    """Factory function to instantiate the right connector."""
    mapping = {
        BrokerType.MT5: MT5Connector,
        BrokerType.MT4: MT4Connector,
        BrokerType.METAAPI: MetaApiConnector,
        BrokerType.CTRADER: CTraderConnector,
        BrokerType.BINANCE: BinanceConnector,
    }
    cls = mapping.get(broker_type)
    if not cls:
        raise ValueError(f"Unknown broker type: {broker_type}")
    return cls(credentials, account_id)


__all__ = [
    "BaseBrokerConnector", "TradeEvent", "OrderRequest", "OrderResult",
    "MT5Connector", "MT4Connector", "MetaApiConnector", "CTraderConnector", "BinanceConnector",
    "get_connector",
]
