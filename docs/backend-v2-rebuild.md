# Backend V2 Rebuild

Pegasus now has a parallel `v2` backend slice for grounded summaries. The goal is to replace the current agent-heavy chat backend with a smaller pipeline that only answers from executed data.

## Principles

- Keep connection adapters and auth middleware where they already work.
- Replace the current chat orchestration path with deterministic stages.
- Allow AI to plan and phrase answers, but never to answer without query results.
- Validate every table and column reference against inspected schema before execution.

## Current V2 Flow

1. `POST /v2/answers/summary`
2. Resolve the authenticated user's connection.
3. Inspect a small schema catalog from live tables and samples.
4. Create a summary plan.
5. Validate the plan against the catalog.
6. Build a read-only SQL query.
7. Execute the query.
8. Synthesize the final answer only from returned rows.

## Why This Is Better

- The route has a single purpose.
- The answer path is inspect -> plan -> execute -> summarize.
- Empty or bad plans fall back to a simple heuristic instead of hallucinated answers.
- The executed query and rows come back in the response for debugging and evaluation.

## Migration Plan

- Port simple summary traffic first.
- Add comparison and time-series plans next.
- Move existing UI summary requests onto `/v2/answers/summary`.
- Shrink the legacy chat route once v2 covers the common prompts.
