import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.state_store import state_store

logger = logging.getLogger("railpulse.ws")

router = APIRouter(tags=["WebSocket Stream"])


class WebSocketManager:
    """
    Non-blocking fan-out WebSocket manager.
    Enforces a strict 1.0-second send timeout per client to prevent slow clients
    from stalling the real-time broadcast loop.
    """

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Active: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self.active_connections)

        if not clients:
            return

        async def _safe_send(ws: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=1.0)
                return None
            except (WebSocketDisconnect, RuntimeError, TimeoutError, OSError) as exc:
                logger.warning(f"Disconnecting unresponsive or closed client: {exc}")
                return ws

        # Broadcast concurrently across all active clients
        tasks = [_safe_send(ws) for ws in clients]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Cleanup failed or timed out clients
        for res in results:
            if isinstance(res, WebSocket):
                await self.disconnect(res)


ws_manager = WebSocketManager()


@router.websocket("/corridor")
async def websocket_corridor_endpoint(websocket: WebSocket) -> None:
    """
    Sub-second live streaming channel for frontend radar, active train telemetry,
    and freight block occupancy vectors.
    """
    await ws_manager.connect(websocket)

    # Immediately emit current corridor snapshot on handshake
    try:
        snapshot = await state_store.get_snapshot()
        await websocket.send_json(snapshot)
    except (WebSocketDisconnect, RuntimeError, OSError):
        await ws_manager.disconnect(websocket)
        return

    # Keep connection open and await heartbeats/messages
    try:
        while True:
            # Await client ping/messages (clients can send {"ping": 1})
            data = await websocket.receive_text()
            if "ping" in data.lower():
                await websocket.send_text("pong")
    except (WebSocketDisconnect, RuntimeError, OSError):
        await ws_manager.disconnect(websocket)
