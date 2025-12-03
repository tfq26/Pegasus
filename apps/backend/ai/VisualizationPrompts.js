export class VisualizationPrompts {
    static buildVisualizationPrompt(query, results, previousConfig = null) {
        let refinementContext = ''
        if (previousConfig) {
            refinementContext = `
      PREVIOUS CONFIGURATION:
      ${JSON.stringify(previousConfig, null, 2)}
      
      The user wants to REFINE this visualization based on the new query/context.
      Keep the existing data mapping if possible, but apply requested changes (e.g. change type, color, labels).
      `
        }

        return `
      You are a data visualization expert.
      Query: ${query}
      Results (first 50 rows):
      ${JSON.stringify(results.slice(0, 50), null, 2)}
      
      ${refinementContext}

      Recommend a suitable dashboard visualization for these results.
      
      SUPPORTED TYPES:
      - "stat": Single numeric value (KPI).
      - "bar": Categorical comparisons.
      - "line": Trends over time.
      - "area": Volume trends over time (Line chart with fill: true).
      - "scatter": Correlation between two variables (requires {x, y} data format).
      - "pie": Part-to-whole (limit to < 8 slices).
      - "doughnut": Part-to-whole (limit to < 8 slices).
      
      RULES:
      1. If the data is a single number, use "stat".
      2. If the data is a list of text, return null.
      3. For "scatter", ensure data is mapped to [{x: val, y: val}, ...].
      4. For "area", use type "line" and add "fill": true to the dataset config.
      5. The "config" object must match Chart.js structure.
      
      Output JSON Schema:
      {
        "type": "bar" | "line" | "pie" | "doughnut" | "scatter" | "stat",
        "title": "Chart Title",
        "config": {
           "labels": ["col_name"], 
           "datasets": [{ 
              "label": "Series Name", 
              "data": ["col_name"],
              "backgroundColor": "hex_color", // Optional
              "borderColor": "hex_color", // Optional
              "fill": boolean // True for Area charts
           }] 
        }
      }
      
      For "stat" type:
      {
        "type": "stat",
        "title": "Stat Title",
        "config": {
           "value": "col_name", 
           "label": "col_name" 
        }
      }
      
      If no visualization is suitable, return null.
    `
    }
}
