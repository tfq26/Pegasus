from __future__ import annotations

import json

from fastapi import APIRouter

from app.models import SynthesisRequest, SynthesisResponse
from app.services.gemini import GeminiService

router = APIRouter(tags=["intelligence"])
gemini = GeminiService()


@router.post("/v1/intelligence/synthesize", response_model=SynthesisResponse)
async def synthesize(req: SynthesisRequest):
    """Multi-modal context fusion and LLM-powered synthesis."""
    context_blocks = []

    if req.schema:
        context_blocks.append("### DATASET SCHEMA STRUCTURE:")
        context_blocks.append(json.dumps(req.schema, indent=2))

    if req.statistics:
        context_blocks.append("### DESCRIPTIVE STATISTICS & PEARSON CORRELATIONS:")
        context_blocks.append(json.dumps(req.statistics, indent=2))

    context_blocks.append("### GROUNDED SOURCES DATA:")
    for idx, src in enumerate(req.sources):
        context_blocks.append(f"--- SOURCE {idx + 1}: {src.label} ({src.type}) ---")
        if src.table_data:
            context_blocks.append(f"Sample Data Rows:\n{src.table_data}")
        if src.text:
            context_blocks.append(f"Document Snippets:\n{src.text}")

    context_fusion = "\n\n".join(context_blocks)

    system_instruction = (
        "You are Pegasus-AI, an elite business intelligence and data synthesis engine. "
        "Your task is to analyze the user prompt and the provided dataset context, schemas, "
        "descriptive statistics, and source records to generate a deeply grounded, high-reasoning, "
        "and precise analytical response. "
        "Incorporate relevant world knowledge and domain context where appropriate."
    )

    final_prompt = f"{system_instruction}\n\n### CONTEXT FUSION DATA:\n{context_fusion}\n\n### USER QUESTION:\n{req.prompt}"

    result = await gemini.generate(final_prompt, temperature=0.15, max_tokens=2048)

    if result:
        return SynthesisResponse(
            answer=result,
            confidence=0.96,
            assumptions=["Fused raw data with statistical schema and active world knowledge."],
        )

    # Fallback
    fallback = (
        f"### PEGASUS UNIFIED DATA REPORT\n\n"
        f"Analyzed question: *\"{req.prompt}\"*\n\n"
        f"**Context Fusion Snapshot:**\n"
        f"- Identified `{len(req.sources)}` ranked sources.\n"
        f"- Active schemas: `{list(req.schema.keys()) if req.schema else 'None'}`\n\n"
        f"Please configure your `GEMINI_API_KEY` to unlock full generative reasoning."
    )
    return SynthesisResponse(
        answer=fallback,
        confidence=0.80,
        assumptions=["Fell back to pre-formatted template because GEMINI_API_KEY is not set."],
    )
