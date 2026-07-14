from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.models import (
    AIConfigRequest,
    AIModelInfo,
    AIQueryRequest,
    AIQueryResponse,
    GenerateRequest,
    GenerateResponse,
)
from app.routes.auth import get_current_user
from app.services.provider import AIProviderClient

router = APIRouter(prefix="/ai", tags=["ai"])
client = AIProviderClient()


@router.get("/config")
async def get_ai_config(user: dict = Depends(get_current_user)):
    # In production, fetch from Vault/Secrets
    return {"provider": "default"}


@router.post("/config")
async def set_ai_config(req: AIConfigRequest, user: dict = Depends(get_current_user)):
    # Check entitlements for custom providers
    if req.provider != "default":
        tier = user.get("subscription_tier", "free")
        if tier not in ("pro_plus", "enterprise", "teams"):
            raise HTTPException(
                status_code=403,
                detail="Custom AI Models available on Teams & Enterprise plans only",
            )
    # Save to Vault in production
    return {"success": True, "message": "AI preference updated"}


@router.get("/models", response_model=dict)
async def list_models(user: dict = Depends(get_current_user)):
    """List available models based on user tier."""
    tier = user.get("subscription_tier", "free")
    models = await client.list_models()

    # Filter by tier
    free_only = {"gemini-2.5-flash", "gemini-2.5-pro"}
    pro_models = {"gemini-3-flash-preview", "gemini-3-pro-preview"}
    byom_prefixes = ("aws:", "azure:", "gcp:")

    has_byom = tier in ("pro_plus", "enterprise", "teams")
    restricted: list[AIModelInfo] = []
    for m in models:
        if tier == "free" and m.id not in free_only:
            continue
        if tier != "free" and m.id in free_only:
            continue
        m.locked = m.id.startswith(byom_prefixes) and not has_byom
        restricted.append(m)

    return {"models": [m.model_dump(by_alias=True) for m in restricted]}


@router.post("/query", response_model=AIQueryResponse)
async def ai_query(req: AIQueryRequest, user: dict = Depends(get_current_user)):
    """Execute a structured AI command."""
    if not req.query:
        raise HTTPException(status_code=400, detail="Query is required")

    result = await client.generate_text(
        prompt=req.query,
        model="gemini-3-flash-preview",
        user_id=user["id"],
    )
    return AIQueryResponse(result=result.text, usage=result.usage)


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, user: dict = Depends(get_current_user)):
    """Generate content from messages."""
    result = await client.generate_content(
        messages=[m.model_dump() for m in req.messages],
        model=req.model,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        json_mode=req.json,
        user_id=req.user_id or user["id"],
    )
    return GenerateResponse(text=result.text, usage=result.usage)


@router.post("/dashboard-query", response_model=AIQueryResponse)
async def dashboard_query(req: AIQueryRequest, user: dict = Depends(get_current_user)):
    """AI query triggered from dashboard chat."""
    result = await client.generate_text(
        prompt=req.query,
        model="gemini-3-flash-preview",
        user_id=user["id"],
    )
    return AIQueryResponse(result=result.text, usage=result.usage)
