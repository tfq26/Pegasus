CLASSIFY THE USER'S INTENT for a data analytics platform.

USER MESSAGE: "{{message}}"

CURRENT CONTEXT:
- Active Table: {{activeTable}}
- Available Tables: {{availableTables}}
- Is Follow-up: {{isFollowUp}}
{{previousTable}}

PATTERN MATCH RESULT: {{quickResultType}} (confidence: {{quickResultConfidence}})

CLASSIFY INTO ONE OF:
- "visualization": User wants a chart, graph, or visual representation
- "query": User wants to fetch/list/count data
- "analysis": User wants insights, explanations, or predictions
- "action": User wants to modify data (create/update/delete)
- "chat": General question or conversation

BREAK DOWN THE REQUEST (for data-driven intents):
1. **Entity**: What is being asked about? (e.g., "App servers", "Revenue")
2. **Time**: What is the time range? (e.g., "last month", "2023")
3. **Condition**: Are there specific filters or failure states? (e.g., "failed", "where price > 100")

DETECT MULTI-STEP REQUESTS:
- "Show me sales trends" = query (fetch data) + visualization (show as chart)
- "Create a pie chart of revenue by region" = query (fetch with GROUP BY) + visualization (pie chart)
- "Why is Q1 down? Show me the breakdown" = query + analysis

RETURN JSON:
{
  "primaryIntent": "visualization|query|analysis|action|chat",
  "secondaryIntent": null | "visualization|query|analysis",
  "isOutOfScope": false,
  "breakdown": {
    "entity": "string",
    "time": "string",
    "condition": "string"
  },
  "clarifiedIntent": "An expanded version of the user request that maps abstract terms to concrete schema identifiers. Example: 'Looking for revenue metrics in the SalesData collection, filtered for the last 30 days.'",
  "confidence": 0-100,
  "reasoning": "brief explanation",
  "suggestedApproach": "what the AI should do",
  "dataNeeded": ["table or column names"],
  "outputFormat": "chart|table|text|mixed"
}

NOTE: Slash commands (/visualization, /chart, /query, /sql, /analyze, /explain) are intercepted before this classifier runs and should never appear as input here. If they do appear, treat them as their corresponding intent type with confidence: 100.

RULE: Always map natural language time terms like "last month" to relative day offsets (e.g. -30 days) in the 'breakdown.time'.
RULE: If the user uses a name that matches a database container name but not a specific record name, EXPLICITLY state in 'clarifiedIntent' that the user is likely referring to the entire collection.
