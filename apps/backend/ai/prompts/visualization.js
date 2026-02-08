/**
 * Visualization Prompt Logic
 * Determines chart types, axis mappings, and configurations.
 */

export function buildVisualizationPrompt(originalPrompt, data, forceVisualization = false) {
   const columnNames = data && data.length > 0 ? Object.keys(data[0]) : [];
   const sampleRows = data ? data.slice(0, 10) : [];

   const directive = forceVisualization
      ? "\nDETECTION OVERRIDE: The user has explicitly requested a visualization. You MUST return shouldVisualize: true unless technically impossible.\n"
      : "\nSTRICT TEXT MODE: The user has NOT requested a visualization. return shouldVisualize: false UNLESS the USER REQUEST explicitly uses words like 'chart', 'graph', 'plot', 'visualize', or 'trend'. If the request is for a 'summary', 'explanation', or 'analysis', do NOT visualize.\n";

   return `
You are a data visualization expert.
${directive}
Given the user's original request and the query result, determine if and how to visualize the data.

USER REQUEST: "${originalPrompt}"

QUERY RESULT (up to 10 rows):
${JSON.stringify(sampleRows, null, 2)}

COLUMNS: ${columnNames.join(', ')}

RULES:
1. If intent is clearly NOT visual (e.g., "list all...", "find the row..."), return { "shouldVisualize": false }.
2. If headers are generic (e.g. "Field1", "column_0"), scan the QUERY RESULT to find which index contains the user's requested metrics.
3. Choose chart type based on data:
   - "bar": Comparisons, rankings, categorical X.
   - "line": Trends, time-series (X must be a date/time/sequence).
   - "pie": Proportions, distributions (one numeric value, one categorical). Best for < 8 slices.
   - "doughnut": Same as pie.
   - "stat": Single numeric value (KPI/Total).
   - "scatter": Correlation analysis (two numeric columns).

4. DENSITY & AGGREGATION RULE:
   - If raw data has > 50 rows, you MUST aggregate (SUM, AVG, COUNT) by a categorical or date column.
   - If data has > 500 rows after aggregation, it is "High Density".
   - HIGH DENSITY RULE: For time-series, ensure X-axis is bucketed (Hour, Day, Month) to keep points < 100.
   - Avoid line charts with > 500 points as they become unreadable "hairballs".

5. AXIS MAPPING:
   - X-Axis: Choose a categorical or date column.
   - Y-Axis: Choose one or more numeric columns. Use the EXACT column names from the COLUMNS list provided.

OUTPUTSCHEMA (JSON ONLY):
{
  "shouldVisualize": true,
  "type": "bar",
  "title": "Descriptive chart title",
  "xAxis": "column_name",
  "yAxis": ["numeric_column_1", "numeric_column_2"]
}
`.trim();
}
