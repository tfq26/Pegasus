# Table Cleaner Architecture

Pegasus now includes a generic table cleaning layer that sits between parsing and storage.

## Goal

Normalize messy uploaded data into analysis-ready tables before the AI ever sees it.

## Current Pipeline

1. Parse upload into rows.
2. Run `TableCleanerService`.
3. Pick the highest-confidence cleaning strategy.
4. Produce cleaned tables plus cleaning metadata.
5. Import cleaned tables into DuckDB with inferred types.

## Current Strategies

- `structured_report`
  Best for report-like sheets with section rows, subtotal rows, repeated headers, and sparse context rows.

- `flat_table`
  Best for already-tabular uploads with only light cleanup needed.

## What The Cleaner Produces

- cleaned rows
- selected strategy
- candidate strategy scores
- warnings
- row/column stats
- contextual columns when structure is implied by sparse rows

## Why This Helps AI

- fewer subtotal and note rows leaking into analysis
- fewer duplicate-header mistakes
- better grouping context from messy reports
- cleaner typed tables for query generation

## Next Extensions

- pivot/crosstab normalization
- multi-table sheet splitting
- document-style appendix/footer stripping
- semantic labeling of generic context columns
