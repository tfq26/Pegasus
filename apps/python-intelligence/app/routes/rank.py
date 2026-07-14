from __future__ import annotations

from fastapi import APIRouter

from app.models import RankRequest, RankResponse

router = APIRouter(tags=["intelligence"])


@router.post("/rank_evidence", response_model=RankResponse)
async def rank_evidence(req: RankRequest):
    """Rank evidence sources by relevance to the question.

    Currently uses a deterministic priority sort (structured sources first).
    Will be replaced with semantic embedding ranking.
    """
    sources = req.selected_sources

    if not sources:
        return RankResponse(
            selected_source_ids=[],
            assumptions=["No selected sources were provided by the caller."],
            confidence=0.0,
        )

    def source_key(s):
        type_priority = 0 if s.type in {"table", "database", "file"} else 1
        return (type_priority, len(s.label))

    ranked = sorted(sources, key=source_key)
    chosen = ranked[0]

    return RankResponse(
        selected_source_ids=[chosen.id],
        assumptions=[
            "Selected source was prioritized from explicit UI source objects.",
            "This is deterministic scaffolding until full semantic ranking is enabled.",
            "Structured envelope metadata is accepted for thread-aware ranking.",
        ],
        confidence=0.92,
    )
