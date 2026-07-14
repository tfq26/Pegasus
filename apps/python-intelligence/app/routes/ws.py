from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["real-time"])


@router.post("/v1/intelligence/socket-events")
async def socket_events():
    """Placeholder for socket.io event proxying.
    
    The actual socket.io real-time events are handled by the
    Socket.IO ASGI mount in main.py. This endpoint exists
    for REST-based event dispatching (e.g. for push
    notifications from background jobs).
    """
    return {"success": True, "message": "Socket events handled via WebSocket mount"}
