from __future__ import annotations

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import close_pool
from app.routes import ai, auth, billing, data, insights, rank, synthesize, ws

# ── FastAPI app ───────────────────────────────────────────────────

app = FastAPI(
    title="Pegasus API",
    description="Pegasus AI, Auth, Billing & Real-time Service",
    version="0.1.0",
    docs_url="/docs",
)

# ── CORS ──────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cookie", "X-Requested-With", "Accept", "Origin", "x-user-id"],
    expose_headers=["Content-Type", "Authorization", "Set-Cookie"],
    max_age=86400,
)

# ── Socket.IO ─────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@sio.event
async def connect(sid, environ, auth_token=None):
    """Authenticate socket connections."""
    from jose import JWTError, jwt

    token = auth_token or environ.get("HTTP_AUTHORIZATION", "")
    if token.startswith("Bearer "):
        token = token[7:]

    if not token:
        raise ConnectionRefusedError("Authentication required")

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        await sio.save_session(sid, {
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
            "firstName": payload.get("firstName", ""),
            "lastName": payload.get("lastName", ""),
        })
    except JWTError:
        raise ConnectionRefusedError("Invalid token")


@sio.event
async def join_dashboard(sid, dashboard_id):
    room = f"dashboard:{dashboard_id.split(':')[-1]}"
    sio.enter_room(sid, room)
    session = await sio.get_session(sid)
    await sio.emit("user_joined", {"user": session, "socketId": sid}, room=room)

    # Send current users
    sockets = sio.rooms(room) if hasattr(sio, 'rooms') else []
    await sio.emit("current_users", [{"user": session, "socketId": sid}], to=sid)


@sio.event
async def leave_dashboard(sid, dashboard_id):
    room = f"dashboard:{dashboard_id.split(':')[-1]}"
    sio.leave_room(sid, room)
    await sio.emit("user_left", {"socketId": sid}, room=room)


@sio.event
async def chat_message(sid, data):
    room = f"dashboard:{data['dashboardId'].split(':')[-1]}"
    session = await sio.get_session(sid)
    message = {
        "id": __import__("uuid").uuid4().hex,
        "user": session,
        "content": data["content"],
        "mentions": data.get("mentions", []),
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }
    await sio.emit("new_message", message, room=room)


@sio.event
async def disconnect(sid):
    pass


# ── Mount routers ─────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(ai.router)
app.include_router(rank.router)
app.include_router(synthesize.router)
app.include_router(insights.router)
app.include_router(ws.router)
app.include_router(data.router)


# ── Health check ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True, "service": "pegasus-api"}


# ── Lifecycle ─────────────────────────────────────────────────────

@app.on_event("shutdown")
async def shutdown():
    await close_pool()


# ── Entry point ────────────────────────────────────────────────────

def run():
    import uvicorn

    uvicorn.run(
        "app.main:socket_app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    run()
