export class VisualizationPrompts {
  static buildVisualizationPrompt(query, results, previousConfig = null, suggestedChartType = null) {
    let refinementContext = ''
    if (previousConfig) {
      refinementContext = `
      PREVIOUS CONFIGURATION:
      ${JSON.stringify(previousConfig, null, 2)}
      
      The user wants to REFINE this visualization based on the new query/context.
      Keep the existing data mapping if possible, but apply requested changes (e.g. change type, color, labels).
      `
    }

    let chartTypeHint = ''
    if (suggestedChartType) {
      chartTypeHint = `
      SUGGESTED CHART TYPE: "${suggestedChartType}"
      The AI query generator has suggested this chart type based on the user's intent.
      Use this type unless the data structure is incompatible.
      `
    }

    return `
      You are a data visualization expert. Your job is to recommend a chart configuration.
      
      Query: ${query}
      Results (first 50 rows):
      ${JSON.stringify(results.slice(0, 50), null, 2)}
      
      ${refinementContext}
      ${chartTypeHint}

      ANALYZE THE DATA AND RECOMMEND A VISUALIZATION.
      
      SUPPORTED TYPES:
      - "stat": Single numeric value (KPI).
      - "bar": Categorical comparisons (BEST for grouped data with counts).
      - "line": Trends over time.
      - "pie": Part-to-whole (limit to < 8 slices). PERFECT for GROUP BY count() results.
      - "doughnut": Same as pie but with hole in center.
      
      RULES:
      1. If the data has a category column and a count/number column, use "bar" or "pie".
      2. Data like [{Supplier: "X", count: 5}, ...] is PERFECT for pie/bar charts.
      3. For GROUP BY results, the category column is labels, the count column is data.
      4. If data is a single number, use "stat".
      5. ALWAYS return a valid config if the data has categories + numbers.
      6. Only return null if the data is truly unsuitable (e.g., just a list of text).
      
      OUTPUT FORMAT - Return ONLY valid JSON:
      {
        "type": "pie",
        "title": "Items by Supplier",
        "config": {
           "labels": ["Supplier"],
           "datasets": [{ 
              "label": "Count", 
              "data": ["count"]
           }] 
        }
      }
      
      For "stat" type:
      {
        "type": "stat",
        "title": "Total Count",
        "config": {
           "value": "count", 
           "label": "Items" 
        }
      }
      
      IMPORTANT: The data you received IS suitable for visualization. Return a valid config, not null.
    `
  }
}
