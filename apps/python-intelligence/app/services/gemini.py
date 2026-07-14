from __future__ import annotations

from app.config import settings


class GeminiService:
    """Gemini API client for text generation."""

    def __init__(self):
        self.api_key = settings.gemini_api_key

    async def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 2048) -> str | None:
        """Generate text via Gemini API using httpx."""
        if not self.api_key:
            return None

        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            print(f"[Gemini] API error: {e}")
            return None

    async def generate_structured(self, prompt: str, response_model, temperature: float = 0.2) -> dict | None:
        """Generate structured JSON output via Gemini."""
        json_prompt = f"{prompt}\n\nRespond with ONLY valid JSON matching this schema."
        result = await self.generate(json_prompt, temperature=temperature, max_tokens=4096)
        if not result:
            return None
        import json
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return None

    async def embed(self, text: str | list[str]) -> list[float] | list[list[float]] | None:
        """Generate embeddings via Gemini."""
        if not self.api_key:
            return None

        import httpx

        is_batch = isinstance(text, list)
        inputs = text if is_batch else [text]

        url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key={self.api_key}"
        payload = {
            "requests": [
                {"model": "models/text-embedding-004", "content": {"parts": [{"text": t}]}}
                for t in inputs
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                embeddings = [e["values"] for e in data.get("embeddings", [])]
                return embeddings if is_batch else embeddings[0]
        except Exception as e:
            print(f"[Gemini] Embedding error: {e}")
            return None
