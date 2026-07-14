from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import settings
from app.models import AIModelInfo


@dataclass
class AIResult:
    text: str
    usage: dict | None = None


class AIProviderClient:
    """Unified AI provider client — mirrors the Node AIClient interface.

    Routes model IDs to the correct provider (Gemini, OpenAI, Anthropic, etc.).
    """

    def __init__(self):
        self._providers: dict[str, Any] = {}
        self._init_providers()

    def _init_providers(self):
        if settings.gemini_api_key:
            self._providers["gemini"] = "gemini"
        if settings.openai_api_key:
            self._providers["openai"] = "openai"
        if settings.anthropic_api_key:
            self._providers["anthropic"] = "anthropic"

    def _get_provider_for_model(self, model_id: str) -> str:
        if not model_id:
            return "gemini" if "gemini" in self._providers else next(iter(self._providers), "gemini")

        if model_id.startswith(("gpt", "o1", "o3", "o4")):
            return "openai"
        if model_id.startswith("gemini"):
            return "gemini"
        if model_id.startswith("claude"):
            return "anthropic"
        if model_id.startswith("local:"):
            return "gemini"  # fallback

        return next(iter(self._providers), "gemini")

    async def list_models(self) -> list[AIModelInfo]:
        models: list[AIModelInfo] = []

        if "gemini" in self._providers:
            models.extend([
                AIModelInfo(id="gemini-2.5-flash", name="Gemini 2.5 Flash", provider="gemini", context_window=1_000_000),
                AIModelInfo(id="gemini-2.5-pro", name="Gemini 2.5 Pro", provider="gemini", context_window=1_000_000),
                AIModelInfo(id="gemini-3-flash-preview", name="Gemini 3 Flash Preview", provider="gemini", context_window=1_000_000),
                AIModelInfo(id="gemini-3-pro-preview", name="Gemini 3 Pro Preview", provider="gemini", context_window=1_000_000),
            ])

        if "openai" in self._providers:
            models.extend([
                AIModelInfo(id="gpt-5.1-mini", name="GPT 5.1 Mini", provider="openai", context_window=128_000),
                AIModelInfo(id="o4-mini", name="o4 Mini", provider="openai", context_window=128_000),
                AIModelInfo(id="gpt-5.1", name="GPT 5.1", provider="openai", context_window=128_000),
            ])

        if "anthropic" in self._providers:
            models.extend([
                AIModelInfo(id="claude-3-5-haiku-latest", name="Claude 3.5 Haiku", provider="anthropic", context_window=200_000),
                AIModelInfo(id="claude-3-5-sonnet-latest", name="Claude 3.5 Sonnet", provider="anthropic", context_window=200_000),
            ])

        return models

    async def generate_content(
        self,
        messages: list[dict],
        model: str = "gemini-3-flash-preview",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        json_mode: bool = False,
        user_id: str | None = None,
    ) -> AIResult:
        provider_name = self._get_provider_for_model(model)

        if provider_name == "openai":
            return await self._openai_generate(messages, model, temperature, max_tokens, json_mode)
        elif provider_name == "anthropic":
            return await self._anthropic_generate(messages, model, temperature, max_tokens)
        else:
            return await self._gemini_generate(messages, model, temperature, max_tokens)

    async def generate_text(
        self,
        prompt: str,
        model: str = "gemini-3-flash-preview",
        user_id: str | None = None,
    ) -> AIResult:
        return await self.generate_content(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            user_id=user_id,
        )

    async def _gemini_generate(
        self, messages: list[dict], model: str, temperature: float, max_tokens: int
    ) -> AIResult:
        from app.services.gemini import GeminiService

        gemini = GeminiService()
        # Combine messages into a single prompt
        prompt = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
        text = await gemini.generate(prompt, temperature=temperature, max_tokens=max_tokens)

        return AIResult(
            text=text or "",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        )

    async def _openai_generate(
        self, messages: list[dict], model: str, temperature: float, max_tokens: int, json_mode: bool
    ) -> AIResult:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            resp = await client.chat.completions.create(**kwargs)
            return AIResult(
                text=resp.choices[0].message.content or "",
                usage={
                    "prompt_tokens": resp.usage.prompt_tokens if resp.usage else 0,
                    "completion_tokens": resp.usage.completion_tokens if resp.usage else 0,
                    "total_tokens": resp.usage.total_tokens if resp.usage else 0,
                },
            )
        except Exception as e:
            print(f"[OpenAI] API error: {e}")
            return AIResult(text="", usage=None)

    async def _anthropic_generate(
        self, messages: list[dict], model: str, temperature: float, max_tokens: int
    ) -> AIResult:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        # Separate system message
        system = None
        api_messages = []
        for m in messages:
            if m["role"] == "system":
                system = m["content"]
            else:
                api_messages.append({"role": m["role"], "content": m["content"]})

        try:
            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": api_messages,
                "temperature": temperature,
            }
            if system:
                kwargs["system"] = system

            resp = await client.messages.create(**kwargs)
            return AIResult(
                text=resp.content[0].text if resp.content else "",
                usage={
                    "prompt_tokens": resp.usage.input_tokens if resp.usage else 0,
                    "completion_tokens": resp.usage.output_tokens if resp.usage else 0,
                    "total_tokens": (resp.usage.input_tokens if resp.usage else 0)
                                   + (resp.usage.output_tokens if resp.usage else 0),
                },
            )
        except Exception as e:
            print(f"[Anthropic] API error: {e}")
            return AIResult(text="", usage=None)

    async def recommend_visualization(self, query: str, results: list[dict], previous_config: dict | None = None):
        """Recommend a visualization type based on query and results."""
        prompt = (
            f"Given the query '{query}' and the following data results, "
            f"recommend the best visualization type (bar, line, pie, scatter, table, etc.) "
            f"and configuration. Return JSON with 'type', 'title', 'xAxis', 'yAxis' fields.\n"
            f"Data: {str(results)[:2000]}"
        )
        if previous_config:
            prompt += f"\nPrevious config: {previous_config}"

        result = await self._gemini_generate(
            [{"role": "user", "content": prompt}],
            model="gemini-2.0-flash",
            temperature=0.2,
            max_tokens=1024,
        )

        import json
        try:
            return json.loads(result.text) if result.text else None
        except json.JSONDecodeError:
            return None

    async def generate_title(self, messages: list[dict]) -> str:
        """Generate a title for a chat session."""
        prompt = (
            "Generate a short, concise title (max 6 words) for this conversation:\n"
            + "\n".join(m.get("content", "")[:200] for m in messages[-3:] if m.get("content"))
        )
        result = await self._gemini_generate(
            [{"role": "user", "content": prompt}],
            model="gemini-2.0-flash",
            temperature=0.5,
            max_tokens=50,
        )
        return (result.text or "New Chat").strip().strip('"').strip("'")

    async def generate_embedding(self, text: str | list[str]) -> list[float] | list[list[float]] | None:
        """Generate embeddings, trying Gemini first, falling back to OpenAI."""
        from app.services.gemini import GeminiService

        gemini = GeminiService()
        result = await gemini.embed(text)
        if result is not None:
            return result

        if settings.openai_api_key:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            try:
                resp = await client.embeddings.create(
                    model="text-embedding-3-small",
                    input=text if isinstance(text, list) else [text],
                )
                embeddings = [d.embedding for d in resp.data]
                return embeddings if isinstance(text, list) else embeddings[0]
            except Exception as e:
                print(f"[Provider] Embedding error: {e}")

        return None
