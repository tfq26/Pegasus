/**
 * Visualization Prompt Logic
 * Determines chart types, axis mappings, and configurations.
 * Enhanced with data profile awareness for smarter chart decisions.
 */

export function buildVisualizationPrompt(originalPrompt, data, forceVisualization = false, dataProfile = null) {
   const columnNames = data && data.length > 0 ? Object.keys(data[0]) : [];
   const sampleRows = data ? data.slice(0, 10) : [];
   const rowCount = data?.length || 0;

   // Analyze columns for chart suitability
   const columnAnalysis = analyzeColumnsForChart(columnNames, sampleRows, dataProfile);

   const directive = forceVisualization
      ? "\nDETECTION OVERRIDE: The user has explicitly requested a visualization. You MUST return shouldVisualize: true unless technically impossible.\n"
      : "\nSTRICT TEXT MODE: The user has NOT requested a visualization. Return shouldVisualize: false UNLESS the USER REQUEST explicitly uses words like 'chart', 'graph', 'plot', 'visualize', or 'trend'. If the request is for a 'summary', 'explanation', or 'analysis', do NOT visualize.\n";

   // Smart warnings based on data shape
   const warnings = [];
   if (rowCount < 3) warnings.push("⚠️ Very few data points - consider stat/KPI card instead of chart");
   if (rowCount > 500) warnings.push("⚠️ High density - MUST aggregate before charting");
   if (columnAnalysis.highCardinalityColumns.length > 0) {
      warnings.push(`⚠️ High cardinality columns (${columnAnalysis.highCardinalityColumns.join(', ')}) - NOT suitable for X-axis categories`);
   }
   if (!columnAnalysis.hasNumericColumn) {
      warnings.push("⚠️ No numeric columns detected - limited chart options");
   }
   if (!columnAnalysis.hasCategoryColumn && !columnAnalysis.hasTimeColumn) {
      warnings.push("⚠️ No category or time column detected for X-axis");
   }

   return `
You are a data visualization expert.
${directive}
Given the user's original request and the query result, determine if and how to visualize the data.

USER REQUEST: "${originalPrompt}"
TOTAL ROWS: ${rowCount}

COLUMN ANALYSIS:
${columnAnalysis.summary}

${warnings.length > 0 ? `DATA WARNINGS:\n${warnings.join('\n')}\n` : ''}

QUERY RESULT SAMPLE (${Math.min(rowCount, 10)} of ${rowCount} rows):
${JSON.stringify(sampleRows, null, 2)}

CHART TYPE DECISION MATRIX:
| Condition | Recommended Chart |
|-----------|-------------------|
| Single value/total | stat (KPI card) |
| Time series + numeric | line |
| Category (≤15 values) + numeric | bar |
| Proportions (≤8 categories) | pie/doughnut |
| 2 numeric columns | scatter |
| Many categories (>15) | bar with scroll or table |
| >100 data points | aggregate first |

SMART RECOMMENDATIONS:
- Best X-axis candidates: ${columnAnalysis.xAxisCandidates.join(', ') || 'None detected'}
- Best Y-axis candidates: ${columnAnalysis.yAxisCandidates.join(', ') || 'None detected'}
- Suggested chart type: ${columnAnalysis.suggestedChart}

RULES:
1. If intent is clearly NOT visual (e.g., "list all...", "find the row..."), return { "shouldVisualize": false }.
2. NEVER use high-cardinality columns (>50 unique values) for X-axis categories.
3. For pie/doughnut: LIMIT to 8 slices maximum. If more categories, use bar chart instead.
4. For line charts: X-axis MUST be time/date or sequence. Data MUST be sorted.
5. Always use EXACT column names from the data.
6. FORMATTING: The UI automatically handles smart date (e.g. 2026-01-12 -> 1/12/26) and numeric formatting. If the user asks for "cleaner" or "better" labels, proced with the chart and mention the UI formatting in your reason.
7. REFINEMENT: If the user requests a change to an existing chart, you MUST fulfill it by updating the 'type', 'xAxis', or 'yAxis'. DO NOT simply repeat the old config if a change was requested.

OUTPUTSCHEMA (JSON ONLY):
{
  "shouldVisualize": true,
  "type": "bar|line|pie|doughnut|stat|scatter",
  "title": "Descriptive chart title",
  "xAxis": "column_name",
  "yAxis": ["numeric_column_1", "numeric_column_2"],
  "reasoning": "Why this chart type was chosen"
}
`.trim();
}

/**
 * Analyze columns for chart suitability
 */
function analyzeColumnsForChart(columnNames, sampleRows, dataProfile) {
   const analysis = {
      xAxisCandidates: [],
      yAxisCandidates: [],
      highCardinalityColumns: [],
      hasNumericColumn: false,
      hasCategoryColumn: false,
      hasTimeColumn: false,
      suggestedChart: 'bar',
      summary: ''
   };

   if (!columnNames || columnNames.length === 0) {
      analysis.summary = 'No columns available';
      return analysis;
   }

   const summaryLines = [];

   for (const col of columnNames) {
      // Skip internal columns
      if (col === '__id' || col === '_rowid_') continue;

      const profile = dataProfile?.[col] || {};
      const sampleValues = sampleRows.map(r => r[col]).filter(v => v != null);
      const uniqueValues = [...new Set(sampleValues)];
      const isNumeric = sampleValues.length > 0 && sampleValues.every(v => typeof v === 'number' || !isNaN(Number(v)));
      const isTime = /date|time|timestamp|year|month|day|quarter|created|updated/i.test(col);

      let role = 'unknown';
      let cardinality = profile.cardinality || uniqueValues.length;

      if (profile.isLikelyId || cardinality > 50) {
         analysis.highCardinalityColumns.push(col);
         role = 'id/high-cardinality';
      } else if (isTime) {
         analysis.xAxisCandidates.push(col);
         analysis.hasTimeColumn = true;
         role = 'time (X-axis)';
      } else if (isNumeric) {
         analysis.yAxisCandidates.push(col);
         analysis.hasNumericColumn = true;
         role = 'numeric (Y-axis)';
      } else if (cardinality <= 15) {
         analysis.xAxisCandidates.push(col);
         analysis.hasCategoryColumn = true;
         role = `category (${cardinality} values)`;
      }

      summaryLines.push(`- ${col}: ${role}${uniqueValues.length <= 5 ? ` [${uniqueValues.slice(0, 3).join(', ')}${uniqueValues.length > 3 ? '...' : ''}]` : ''}`);
   }

   // Determine suggested chart type
   const rowCount = sampleRows.length;
   if (rowCount === 1 && analysis.yAxisCandidates.length > 0) {
      analysis.suggestedChart = 'stat';
   } else if (analysis.hasTimeColumn && analysis.hasNumericColumn) {
      analysis.suggestedChart = 'line';
   } else if (analysis.hasCategoryColumn && analysis.hasNumericColumn) {
      const catCol = analysis.xAxisCandidates[0];
      const catCardinality = dataProfile?.[catCol]?.cardinality || 10;
      analysis.suggestedChart = catCardinality <= 8 ? 'pie' : 'bar';
   } else if (analysis.yAxisCandidates.length >= 2) {
      analysis.suggestedChart = 'scatter';
   }

   analysis.summary = summaryLines.join('\n');
   return analysis;
}
