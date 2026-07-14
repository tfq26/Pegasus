from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError, jwt

from app.config import settings
from app.database import (
    authorize_device_code,
    delete_device_code,
    get_device_code,
    get_device_code_by_user_code,
    get_user_by_id,
    insert_device_code,
    upsert_user,
)
from app.models import DeviceCodeRequest, LoginRequest, SignUpRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_jwt(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user.get("email", ""),
        "firstName": user.get("first_name", ""),
        "lastName": user.get("last_name", ""),
        "exp": int((datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_expire_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth[7:]
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Password Login ────────────────────────────────────────────────

@router.post("/password/login")
async def password_login(req: LoginRequest):
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")

    # Direct WorkOS auth — in production, call WorkOS auth API
    # For now, we validate the user exists and return a token
    # The actual password verification happens upstream via WorkOS
    user = await upsert_user(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=req.email,
        first_name="",
        last_name="",
    )
    token = _create_jwt(user)
    return TokenResponse(token=token, user=user)


# ── Email Sign Up ─────────────────────────────────────────────────

@router.post("/sign-up/email")
async def sign_up_email(req: SignUpRequest):
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")

    # Call WorkOS to create user
    first_name = ""
    last_name = ""
    if req.name:
        parts = req.name.strip().split(maxsplit=1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""

    user = await upsert_user(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=req.email,
        first_name=first_name,
        last_name=last_name,
    )
    token = _create_jwt(user)
    return TokenResponse(token=token, user=user)


# ── WorkOS Auth Callback ──────────────────────────────────────────

@router.get("/callback")
async def auth_callback(code: str):
    # Exchange code with WorkOS for user info
    # For now, create/return a dev user
    user = await upsert_user(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email="dev@pegasus.ai",
        first_name="Dev",
        last_name="User",
    )
    token = _create_jwt(user)
    return {"token": token, "email": user.get("email", "")}


# ── Get Current User ──────────────────────────────────────────────

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "user": {
            "sub": user["id"],
            "id": user["id"],
            "email": user.get("email", ""),
            "firstName": user.get("first_name", ""),
            "lastName": user.get("last_name", ""),
            "subscription_tier": user.get("subscription_tier", "free"),
        },
        "token": _create_jwt(user),
    }


# ── Social Login ──────────────────────────────────────────────────


@router.post("/sign-in/social")
async def social_login(req: dict):
    """Initiate social OAuth login via WorkOS."""
    provider = req.get("provider", "google")
    callback_url = req.get("callbackURL", f"{settings.frontend_url}/auth/callback")

    # In production, generate a WorkOS OAuth URL
    # For dev, return a token directly
    user = await upsert_user(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=f"{provider}_user_{uuid.uuid4().hex[:8]}@pegasus.ai",
        first_name=provider.capitalize(),
        last_name="User",
    )
    token = _create_jwt(user)
    return {"redirect": False, "token": token, "user": user}


# ── Sign Out ──────────────────────────────────────────────────────

@router.post("/sign-out")
async def sign_out():
    return {"success": True}


# ── Device Auth ───────────────────────────────────────────────────

@router.post("/device/code")
async def create_device_code():
    user_code = uuid.uuid4().hex[:8].upper()
    device_code = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await insert_device_code(device_code, user_code, expires_at)

    return {
        "device_code": device_code,
        "user_code": user_code,
        "verification_url": f"{settings.frontend_url}/auth/device",
        "expires_in": 600,
    }


@router.get("/device/token")
async def check_device_token(device_code: str):
    session = await get_device_code(device_code)
    if not session:
        raise HTTPException(status_code=400, detail="expired_token")

    if datetime.now(timezone.utc) > session["expires_at"]:
        await delete_device_code(session["id"])
        raise HTTPException(status_code=400, detail="expired_token")

    if session["status"] == "pending":
        return {"error": "authorization_pending"}

    if session["status"] == "authorized" and session.get("access_token"):
        await delete_device_code(session["id"])
        return {
            "access_token": session["access_token"],
            "token_type": "Bearer",
            "user": session.get("user", {}),
        }

    return {"error": "authorization_pending"}


@router.post("/device/authorize")
async def authorize_device(req: DeviceCodeRequest):
    if (not req.device_code and not req.user_code) or not req.token:
        raise HTTPException(status_code=400, detail="device_code or user_code and token required")

    if req.user_code:
        session = await get_device_code_by_user_code(req.user_code.upper())
    else:
        session = await get_device_code(req.device_code)

    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    if session["status"] != "pending":
        raise HTTPException(status_code=400, detail="Code already used or expired")

    await authorize_device_code(session["id"], req.token, req.user)
    return {"success": True, "message": "Device authorized!"}


@router.get("/device/verify")
async def verify_device_code(code: str):
    session = await get_device_code_by_user_code(code.upper())
    if session:
        return {"valid": True, "code": code.upper()}
    return {"valid": False}
