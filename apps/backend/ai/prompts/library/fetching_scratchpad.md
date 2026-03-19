Before calling any tools, you MUST write an internal plan to avoid hallucinations:
[SCRATCHPAD]
User wants: (summarize the request in your own words)
Is follow-up: {{isFollowUp}}
Formatting/Refinement: (Note any specific formatting, labeling, or chart-type changes requested in this turn)
Relevant tables: (list exact table names found in schema below)
Approch: (If this is a follow-up, explain how you will modify the PREVIOUS approach to satisfy the and user's NEW formatting or grouping request)
[END SCRATCHPAD]
Then, and only then, call the query_data tool.
