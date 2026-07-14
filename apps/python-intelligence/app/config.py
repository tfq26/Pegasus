from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    port: int = 8090
    debug: bool = False

    # Database (Neon/Postgres)
    database_url: str = "postgresql+asyncpg://localhost:5432/pegasus"

    # JWT
    jwt_secret: str = "fallback_secret_do_not_use_in_production"
    jwt_expire_seconds: int = 604800  # 7 days

    # Frontend
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8090"

    # AI Providers
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Stripe
    stripe_secret_key: str = "sk_test_placeholder"
    stripe_webhook_secret: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    developer_email: str = "developer@example.com"

    # WorkOS (auth provider)
    workos_client_id: str = ""
    workos_api_key: str = ""

    # Vault / Secrets
    vault_addr: str = ""
    vault_token: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
