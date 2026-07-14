from __future__ import annotations

from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class SocialLoginRequest(BaseModel):
    provider: str = "google"


class DeviceCodeRequest(BaseModel):
    device_code: str | None = None
    user_code: str | None = None
    token: str
    user: dict = {}


class TokenResponse(BaseModel):
    token: str
    user: dict


# ── AI ────────────────────────────────────────────────────────────

class AIMessage(BaseModel):
    role: str  # system, user, assistant
    content: str


class GenerateRequest(BaseModel):
    messages: list[AIMessage]
    model: str = "gemini-3-flash-preview"
    temperature: float = 0.7
    max_tokens: int = 4096
    json: bool = False
    user_id: str | None = None


class GenerateResponse(BaseModel):
    text: str
    usage: dict | None = None


class AIQueryRequest(BaseModel):
    query: str


class AIQueryResponse(BaseModel):
    result: str
    usage: dict | None = None


class AIConfigRequest(BaseModel):
    provider: str = "default"
    model_id: str | None = None


class AIModelInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    context_window: int = 128000
    provider: str = "gemini"
    locked: bool = False


# ── Evidence Ranking ─────────────────────────────────────────────

class SourceRef(BaseModel):
    id: str
    type: str = Field(..., alias="type")
    label: str
    value: str | None = None


class RankRequest(BaseModel):
    question: str
    selected_sources: list[SourceRef]
    reply_to_message_id: str | None = None


class RankResponse(BaseModel):
    selected_source_ids: list[str]
    assumptions: list[str] = []
    confidence: float = 0.0


# ── Synthesis ────────────────────────────────────────────────────

class SynthesisSource(BaseModel):
    id: str
    label: str
    type: str = Field(..., alias="type")
    text: str | None = None
    table_data: str | None = None


class SynthesisRequest(BaseModel):
    prompt: str
    sources: list[SynthesisSource] = []
    schema: dict = {}
    statistics: dict = {}


class SynthesisResponse(BaseModel):
    answer: str
    confidence: float = 0.0
    assumptions: list[str] = []


# ── Insights ─────────────────────────────────────────────────────

class InsightsResponse(BaseModel):
    success: bool
    message: str = ""
    report: str = ""


# ── Billing / Payments ──────────────────────────────────────────

class StripeCheckoutRequest(BaseModel):
    price_id: str
    success_url: str = ""
    cancel_url: str = ""
    user_id: str


class PaymentInfo(BaseModel):
    id: str
    amount: int
    currency: str = "usd"
    description: str = ""
    status: str
    tokens: int = 0
    storage_bytes: int = 0
    created_at: str = ""


class PaymentListResponse(BaseModel):
    success: bool
    payments: list[PaymentInfo] = []


# ── Analytics / Usage ───────────────────────────────────────────

class UsageResponse(BaseModel):
    tokens: int = 0
    limit: int = 0
    tier: str = "free"
    purchased_tokens: int = 0
    purchased_storage: int = 0
    storage: int = 0
    storage_limit: int = 0
