/**
 * SQL Syntax Dictionary
 * Centralized registry for dialect-specific syntax, aggregation rules, and limitations.
 */

export const DIALECTS = {
    postgres: {
        displayName: 'PostgreSQL',
        instructions: [
            "Use double quotes for mixed-case table/column names: SELECT \"ColumnName\" FROM \"TableName\"",
            "Use standard SQL for filters and joins.",
            "Use ::type for explicit casting if needed."
        ],
        aggregationRules: {
            day: "DATE_TRUNC('day', timestamp)",
            hour: "DATE_TRUNC('hour', timestamp)",
            minute: "DATE_TRUNC('minute', timestamp)"
        },
        examples: [
            "SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) FROM users GROUP BY 1 ORDER BY 1"
        ]
    },
    mysql: {
        displayName: 'MySQL',
        instructions: [
            "Use backticks for escaping identifiers: SELECT `col` FROM `table`"
        ],
        aggregationRules: {
            day: "DATE(timestamp)",
            hour: "DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')",
            minute: "DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:00')"
        }
    },
    sqlite: {
        displayName: 'SQLite',
        instructions: [
            "Case-insensitive LIKE is the default.",
            "Limited date functions; use strftime."
        ],
        aggregationRules: {
            day: "strftime('%Y-%m-%d', timestamp)",
            hour: "strftime('%Y-%m-%d %H:00:00', timestamp)"
        }
    },
    duckdb: {
        displayName: 'DuckDB',
        instructions: [
            "Strongly typed. Use explicit casts if comparing numbers to strings.",
            "EXCELLENT temporal support. Use time_bucket or date_trunc."
        ],
        aggregationRules: {
            day: "date_trunc('day', timestamp)",
            hour: "date_trunc('hour', timestamp)",
            five_min: "time_bucket(interval '5 minutes', timestamp)"
        }
    },
    cosmosdb: {
        displayName: 'Cosmos DB',
        instructions: [
            "ALWAYS alias the root as 'c': SELECT c.col FROM c",
            "No JOIN support across containers.",
            "Use VALUE keyword for single-column results if required by tool choice."
        ],
        aggregationRules: {
            day: "SUBSTRING(c.timestamp, 0, 10)",
            hour: "SUBSTRING(c.timestamp, 0, 13)"
        },
        limitations: [
            "CRITICAL: Cannot use expressions (like SUBSTRING) or aliases in ORDER BY when GROUP BY is present.",
            "RULE: If using GROUP BY on an expression, OMIT the ORDER BY clause entirely. The UI will handle sorting."
        ],
        examples: [
            "SELECT SUBSTRING(c.timestamp, 0, 10) as day, AVG(c.cpuPercent) as avg_cpu FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10)"
        ]
    },
    kusto: {
        displayName: 'Kusto (KQL)',
        instructions: [
            "Pipelined syntax: Table | where ... | project ...",
            "Use 'summarize' for aggregations."
        ],
        aggregationRules: {
            day: "bin(Timestamp, 1d)",
            hour: "bin(Timestamp, 1h)"
        },
        examples: [
            "OrionMetrics | summarize avg(cpuPercent) by bin(timestamp, 1d) | order by timestamp asc"
        ]
    },
    mongodb: {
        displayName: 'MongoDB',
        instructions: [
            "Return MQL (Filter/Sort/Limit) in JSON format as specified in the MongoDB Tool.",
            "Use $match, $group, $sort for complex pipelines."
        ]
    }
};

/**
 * Helper to build dialect-specific prompt instructions from the dictionary.
 */
export function getDialectPrompt(dialectId) {
    const dialect = DIALECTS[dialectId];
    if (!dialect) return "";

    let prompt = `\n${dialect.displayName.toUpperCase()} INSTRUCTIONS:\n`;

    if (dialect.instructions) {
        dialect.instructions.forEach(ins => prompt += `- ${ins}\n`);
    }

    if (dialect.aggregationRules) {
        prompt += `\nAGGREGATION PATTERNS:\n`;
        Object.entries(dialect.aggregationRules).forEach(([key, val]) => {
            prompt += `- ${key}: ${val}\n`;
        });
    }

    if (dialect.limitations) {
        prompt += `\nLIMITATIONS & SAFETY RULES:\n`;
        dialect.limitations.forEach(lim => prompt += `- ${lim}\n`);
    }

    if (dialect.examples) {
        prompt += `\nBEST PRACTICE EXAMPLES:\n`;
        dialect.examples.forEach(ex => prompt += `|_ ${ex}\n`);
    }

    return prompt;
}
