[Expert Strategy - Temporal Comparison]: 
If identifying trends or comparisons:
1. Identify ALL date ranges in the request (two-period or three-period).
2. Fetch data for ALL periods — do not skip a period because it seems implied.
3. Analyze the DELTA between consecutive periods (percentage change, absolute change).
4. For three-period comparisons (e.g., this month / last month / same month last year):
   - Fetch all three ranges in a single query using UNION or separate subqueries
   - Calculate: period-over-period delta AND year-over-year delta separately
   - Present both deltas clearly labeled
5. DO NOT claim data is missing if tool calls can resolve the ranges.
6. Always label each period explicitly in the response (e.g., "March 2026", not "current").
