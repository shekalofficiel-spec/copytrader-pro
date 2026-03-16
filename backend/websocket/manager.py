"""
WebSocket Manager — broadcasts live events to all connected frontend clients.
"""
from __future__ import annotations
import json
from typing import Set
from fastapi import WebSocket
import structlog
from schemas.stats import LiveEvent

log = structlog.get_logger(__name__)


class WebSocketManager:
    def __init__(self):
        self._connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._connections.add(websocket)
        log.info("ws_client_connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket):
        self._connections.discard(websocket)
        log.info("ws_client_disconnected", total=len(self._connections))

    async def broadcast(self, event: LiveEvent):
        """Send event to all connected clients."""
        if not self._connections:
            return

        payload = event.model_dump(mode="json")
        dead = set()

        for ws in self._connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)

        for ws in dead:
            self._connections.discard(ws)

    async def send_to(self, websocket: WebSocket, data: dict):
        try:
            await websocket.send_json(data)
        except Exception as e:
            log.error("ws_send_error", error=str(e))
            self._connections.discard(websocket)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


ws_manager = WebSocketManager()
