# Pegasus Rebuild Architecture

## Services

1. Rust Core (`apps/rust-core`)
   - Public API gateway.
   - Auth, orchestration, source lock handling.
   - Calls Python Intelligence for ranking/enrichment.

2. Python Intelligence (`apps/python-intelligence`)
   - Document/table extraction helpers.
   - Semantic ranking helpers.
   - Projection and scenario helper logic.

## Source Selection Rule (Hard Requirement)

If UI sends structured source objects (`selected_sources`), those are authoritative.

- Do not ask "which source should I use?" when one source is explicitly selected.
- Use that source first.
- If execution fails, return a source-specific failure, not a generic ambiguity prompt.

## Data/Trust Model (Initial)

- `authoritative_facts`: connected tables/databases
- `extracted_facts`: parsed tables from uploaded docs/spreadsheets
- `contextual_guidance`: notes, memos, PDFs without validated tables
- `derived_summary`: generated outputs, never primary evidence

