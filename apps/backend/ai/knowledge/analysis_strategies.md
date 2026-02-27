# Analysis & Tool Usage Strategies

This document provides strategic guidelines for the Pegasus AI on how to handle complex data analysis requests, multi-step reasoning, and tool selection.

## 1. Temporal Comparisons (Last Week vs. Previous Week)
When a user asks for a comparison between two time periods (e.g., "how is it doing compared to last week"), the agent MUST NOT simply report the current status or claim lack of data.

**STRATEGY:**
1.  **Identify both periods**: Determine the date ranges for the primary period (e.g., last 7 days) and the comparison period (e.g., the 7 days preceding that).
2.  **Proactive Multi-Querying**: Call `query_data` (or relevant data tools) TWICE—once for each period.
3.  **Synthesis**: Do not just show the raw data. Analyze the delta (increase/decrease) and server health changes between the two periods.

**Example Query Pattern:**
- Query 1: `SELECT status, count(*) FROM OrionMetrics WHERE timestamp > '2026-02-18' AND timestamp <= '2026-02-25' GROUP BY status`
- Query 2: `SELECT status, count(*) FROM OrionMetrics WHERE timestamp > '2026-02-11' AND timestamp <= '2026-02-18' GROUP BY status`

## 2. Trend Detection & Anomalies
When asked "what happened" or "why is X down", follow the "Deep Dive" pattern.

**STRATEGY:**
1.  **Fetch Summary**: Get the high-level aggregate metrics.
2.  **Filter for Anomalies**: Look for specific dimensions (e.g., a specific `serverId` or `serverType`) that are outliers.
3.  **Correlate**: If `cpu_usage` is high, check `requestsPerSec` or `errorMessage` in the same period.

## 3. Schema Exploration (Semantic Sensing)
If a prompt mentions a concept (e.g., "server costs") that isn't clearly mapped to a column:

**STRATEGY:**
1.  **Semantic Search**: Use `get_table_schema` to explore available columns.
2.  **Look for Proxies**: If "cost" isn't present, look for "energyWatts" or "usage" that might be a proxy for cost analysis.
3.  **Proactive recovery**: If a query fails because of a missing column, immediately call `get_table_schema` to find the correct identifier before answering.

## 4. Multi-Agent Planning
For complex prompts, the "Planner" turn should explicitly list the steps it will take.
- Step 1: Fetch current metrics.
- Step 2: Fetch historical baseline.
- Step 3: Compare and generate insights.
