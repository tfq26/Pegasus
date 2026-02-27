/**
 * SpreadsheetToolService - Defines tools for AI-powered spreadsheet operations
 * These tools can be called by the AI to perform various spreadsheet actions
 */
export class SpreadsheetToolService {
    constructor() {
        this.tools = new Map();
        this.initializeTools();
    }

    initializeTools() {
        // ============================================
        // SEARCH TOOLS
        // ============================================
        this.registerTool({
            name: "search_web",
            description: "Search the internet for real-time information, news, current events, competitors, or general knowledge NOT found in the database. Use this for questions about market trends, fashion brands, industry leaders, global rankings, or any 'outside' information that complements local data.",
            category: "general",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query. MANDATORY: Include the industry domain found in the local data (e.g. 'fashion', 'retail', 'automotive') to ensure relevant results. (Example: 'top fashion brands in Southeast Asia 2024')" }
                },
                required: ["query"]
            },
            handler: async ({ query }) => {
                const { SearchService } = await import('./SearchService.js');
                const results = await SearchService.search(query);
                return {
                    type: "search_results",
                    query,
                    results,
                    note: `Found ${results.length} results from the web.`
                };
            }
        });

        // ============================================
        // DATABASE TOOLS (Query Mode)
        // ============================================

        this.registerTool({
            name: "execute_query",
            description: "Execute a SQL query against the database and return the results",
            category: "database",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to execute"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                if (!context?.adapter) {
                    throw new Error("No database adapter available in context");
                }

                console.log(`[SpreadsheetToolService] Executing query tool: ${query}`);
                const result = await context.adapter.query(query);

                return {
                    type: "query_result",
                    rows: Array.isArray(result) ? result : [result],
                    count: Array.isArray(result) ? result.length : 1
                };
            }
        });

        this.registerTool({
            name: "get_sample_data",
            description: "Retrieve a few sample rows (default 3) from a table. Use this to identify column meanings when headers are generic (Field1, Field2), and to confirm data types before joining.",
            category: "database",
            parameters: {
                type: "object",
                properties: {
                    tableName: { type: "string", description: "Name of the table to sample" },
                    limit: { type: "number", description: "Number of rows to sample (default 3, max 10)" }
                },
                required: ["tableName"]
            },
            handler: async ({ tableName, limit = 10 }, context) => {
                if (!context?.adapter) {
                    throw new Error("No database adapter available in context");
                }
                const safeLimit = Math.min(limit, 20);
                console.log(`[SpreadsheetToolService] Sampling ${safeLimit} rows from ${tableName}`);

                // Get the real table name from mappings if available
                const realName = context.schema?.mappings?.tables?.[tableName] || tableName;

                // Handle different dialects for quoting
                const quote = (name) => {
                    const d = context.dialect?.toLowerCase() || '';
                    if (d.includes('postgres') || d.includes('duckdb')) return `"${name}"`;
                    if (d.includes('mysql')) return `\`${name}\``;
                    return `"${name}"`; // default
                };

                const result = await context.adapter.query(`SELECT * FROM ${quote(realName)} LIMIT ${safeLimit}`);
                return {
                    type: "sample_data_result",
                    tableName,
                    rows: Array.isArray(result) ? result : [result],
                    note: `Sampled ${safeLimit} rows for analysis.`
                };
            }
        });

        this.registerTool({
            name: "get_table_schema",
            description: "Fetch the detailed schema (columns and types) for a specific table when needed for JOINs or context",
            category: "database",
            parameters: {
                type: "object",
                properties: {
                    tableName: {
                        type: "string",
                        description: "Name of the table to fetch schema for"
                    }
                },
                required: ["tableName"]
            },
            handler: async ({ tableName }, context) => {
                let columns = context?.schema?.detailedSchema?.[tableName];
                let ddl = null;

                // Lazy fetch if not in initial context
                if (context?.adapter) {
                    if (!columns) {
                        console.log(`[SpreadsheetToolService] Lazy fetching schema for ${tableName}`);
                        if (typeof context.adapter.getOneTableSchema === 'function') {
                            columns = await context.adapter.getOneTableSchema(tableName);
                        }
                    }

                    // Try to fetch DDL/View definition for better context (critical for DuckDB/Parquet)
                    try {
                        // Creating a generic way to get DDL if supported
                        if (typeof context.adapter.query === 'function') {
                            // DuckDB specific check
                            const ddlResult = await context.adapter.query(`SELECT sql FROM sqlite_master WHERE name = '${tableName}' UNION ALL SELECT sql FROM duckdb_tables WHERE table_name = '${tableName}' LIMIT 1`).catch(() => null);
                            if (ddlResult && ddlResult.length > 0) {
                                ddl = ddlResult[0].sql;
                            }
                        }
                    } catch (e) { console.warn('Failed to fetch DDL', e); }
                }

                return {
                    type: "schema_result",
                    tableName,
                    columns: columns || [],
                    ddl: ddl,
                    note: "Table structure fetched successfully"
                };
            }
        });

        this.registerTool({
            name: "record_data_insight",
            description: "Persist an observation or fact about a data source (table) to AI memory. Use this when you discover important mappings, data patterns, or anomalies that will help future queries.",
            category: "system",
            parameters: {
                type: "object",
                properties: {
                    tableName: { type: "string", description: "Name of the table this insight relates to" },
                    insight: { type: "string", description: "The fact or observation to record (concise)" },
                    category: { type: "string", enum: ["mapping", "data_quality", "anomaly", "logic"], description: "Category of the insight" },
                    confidence: { type: "number", description: "Confidence score (0.0 to 1.0)" }
                },
                required: ["tableName", "insight", "category", "confidence"]
            },
            handler: async ({ tableName, insight, category, confidence }, context) => {
                const { db } = await import('../db/index.js');
                const { connections, spaceFiles, dataSources } = await import('../db/schema.js');
                const { eq } = await import('drizzle-orm');
                const { v4: uuidv4 } = await import('uuid');

                const registry = context.schema?.sourceRegistry?.[tableName];
                if (!registry) throw new Error(`Source not found in registry: ${tableName}`);

                const newInsight = {
                    id: uuidv4(),
                    insight,
                    category,
                    confidence,
                    updatedAt: new Date().toISOString()
                };

                // Resolve the correct ID based on registry entry
                let sid = registry.id;
                if (sid === 'primary') sid = context.connectionId;

                let updated = false;

                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                const isUuid = uuidRegex.test(sid);

                try {
                    // Try spaceFiles
                    const file = isUuid ? await db.query.spaceFiles.findFirst({ where: eq(spaceFiles.id, sid) }) : null;
                    if (file) {
                        const insights = Array.isArray(file.aiInsights) ? file.aiInsights : [];
                        insights.push(newInsight);
                        await db.update(spaceFiles).set({ aiInsights: insights }).where(eq(spaceFiles.id, sid));
                        updated = true;
                    }

                    if (!updated) {
                        // Try connections
                        const conn = (isUuid && !sid.startsWith('system:')) ? await db.query.connections.findFirst({ where: eq(connections.id, sid) }) : null;
                        if (conn) {
                            const insights = Array.isArray(conn.aiInsights) ? conn.aiInsights : [];
                            insights.push(newInsight);
                            await db.update(connections).set({ aiInsights: insights }).where(eq(connections.id, sid));
                            updated = true;
                        }
                    }

                    if (!updated) {
                        // Try dataSources
                        const ds = await db.query.dataSources.findFirst({ where: eq(dataSources.id, sid) });
                        if (ds) {
                            const insights = Array.isArray(ds.aiInsights) ? ds.aiInsights : [];
                            insights.push(newInsight);
                            await db.update(dataSources).set({ aiInsights: insights }).where(eq(dataSources.id, sid));
                            updated = true;
                        }
                    }
                } catch (e) {
                    console.error(`[SpreadsheetToolService] record_data_insight failed:`, e);
                }

                return {
                    status: updated ? "success" : "failure",
                    message: updated ? `Recorded insight for ${tableName}` : `Could not find persistent source record for ${tableName} (ID: ${sid})`,
                    insight: newInsight
                };
            }
        });

        // ============================================
        // SPREADSHEET TOOLS (Grid.vue / Editor)
        // ============================================


        // Generic AI processing tool for flexible transformations
        this.registerTool({
            name: "process_with_ai",
            description: "Process or transform spreadsheet data using AI for tasks that don't fit other tools (e.g., 'create random groups', 'shuffle and assign', 'categorize items', 'generate creative output from data'). Use this when the user wants to manipulate, reorganize, or creatively transform the data.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    task: {
                        type: "string",
                        description: "Clear description of what transformation or processing to perform on the data"
                    },
                    outputFormat: {
                        type: "string",
                        enum: ["table", "list", "text", "json"],
                        description: "Desired output format for the result"
                    },
                    options: {
                        type: "object",
                        description: "Optional parameters for the task (e.g., { groupCount: 5 } for creating 5 groups)"
                    }
                },
                required: ["task"]
            },
            handler: async ({ task, outputFormat = "table", options = {} }, context) => {
                const { spreadsheetData } = context;

                // This will be processed by the AI with the full data context
                return {
                    type: "ai_process_request",
                    task,
                    outputFormat,
                    options,
                    data: spreadsheetData.sampleData,
                    headers: spreadsheetData.headers,
                    rowCount: spreadsheetData.rowCount
                };
            }
        });

        // Generate new table tool
        this.registerTool({
            name: "generate_table",
            description: "Create a new table with AI-generated data based on a description. Use this when asked to create, generate, or make a new table, list, or dataset (e.g., 'create a table of 20 students with names and grades', 'generate a product inventory list').",
            category: "data_creation",
            parameters: {
                type: "object",
                properties: {
                    description: {
                        type: "string",
                        description: "Description of the table to create (e.g., 'list of 20 students with names, ages, and grades')"
                    },
                    tableName: {
                        type: "string",
                        description: "Name for the new table"
                    },
                    rowCount: {
                        type: "number",
                        description: "Number of rows to generate (default: 10)"
                    },
                    columns: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional: specific column names to include"
                    },
                    openInNewTab: {
                        type: "boolean",
                        description: "Whether to open the generated table in a new spreadsheet tab"
                    }
                },
                required: ["description", "tableName"]
            },
            handler: async ({ description, tableName, rowCount = 10, columns, openInNewTab = false }, context) => {
                // This will be processed by AI to generate the actual data
                return {
                    type: "generate_table_request",
                    description,
                    tableName,
                    rowCount,
                    columns,
                    openInNewTab
                };
            }
        });

        this.registerTool({
            name: "calculate_column",
            description: "Compute new column values with mathematical reasoning (e.g., 'calculate profit margin as (revenue - cost) / revenue')",
            parameters: {
                type: "object",
                properties: {
                    description: {
                        type: "string",
                        description: "Description of the calculation to perform"
                    },
                    targetColumn: {
                        type: "number",
                        description: "0-based column index where results should go"
                    },
                    columnHeader: {
                        type: "string",
                        description: "Name for the new column"
                    },
                    calculation: {
                        type: "string",
                        description: "The mathematical expression (e.g., 'Price * Quantity')"
                    }
                },
                required: ["description", "calculation"]
            },
            handler: async ({ description, targetColumn, columnHeader, calculation }, context) => {
                return {
                    type: "calculation",
                    targetColumn,
                    columnHeader,
                    calculation,
                    reasoning: description
                };
            }
        });

        this.registerTool({
            name: "apply_conditional_formatting",
            description: "Highlight cells based on a condition (e.g., 'highlight cells > 1000 in red')",
            parameters: {
                type: "object",
                properties: {
                    column: {
                        type: "number",
                        description: "Column index to apply formatting to"
                    },
                    condition: {
                        type: "string",
                        description: "Condition expression (e.g., '> 100', '< 0', '== \"Active\"')"
                    },
                    color: {
                        type: "string",
                        description: "Color to apply (e.g., 'red', '#FF0000')"
                    }
                },
                required: ["column", "condition", "color"]
            },
            handler: async ({ column, condition, color }, context) => {
                return {
                    type: "formatting",
                    column,
                    condition,
                    color
                };
            }
        });

        this.registerTool({
            name: "forecast",
            description: "Predict future values based on historical trends",
            parameters: {
                type: "object",
                properties: {
                    column: {
                        type: "number",
                        description: "Column index containing the data to forecast"
                    },
                    algorithm: {
                        type: "string",
                        enum: ["linear", "sma", "ema"],
                        description: "Forecasting algorithm to use"
                    },
                    periods: {
                        type: "number",
                        description: "Number of future periods to predict"
                    }
                },
                required: ["column", "algorithm", "periods"]
            },
            handler: async ({ column, algorithm, periods }, context) => {
                return {
                    type: "forecast_request",
                    column,
                    algorithm,
                    periods
                };
            }
        });

        this.registerTool({
            name: "clean_data",
            description: "Standardize formats, remove duplicates, or fix inconsistencies",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    operation: {
                        type: "string",
                        enum: ["remove_duplicates", "standardize_dates", "trim_whitespace", "fix_case"],
                        description: "Type of cleaning to perform"
                    },
                    column: {
                        type: "number",
                        description: "Column index to clean (optional for remove_duplicates)"
                    }
                },
                required: ["operation"]
            },
            handler: async ({ operation, column }, context) => {
                return {
                    type: "cleaning_request",
                    operation,
                    column
                };
            }
        });


        this.registerTool({
            name: "sort_data",
            description: "Sort the data by a specific column",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    column: {
                        type: "number",
                        description: "Column index to sort by"
                    },
                    ascending: {
                        type: "boolean",
                        description: "True for ascending, false for descending"
                    }
                },
                required: ["column"]
            },
            handler: async ({ column, ascending = true }, context) => {
                return {
                    type: "sort",
                    column,
                    ascending
                };
            }
        });


        this.registerTool({
            name: "apply_template",
            description: "Transform this table to match a template table's structure",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    templateName: {
                        type: "string",
                        description: "Name of the template table to match"
                    }
                },
                required: ["templateName"]
            },
            handler: async ({ templateName }, context) => {
                return {
                    type: "template_transform",
                    templateName
                };
            }
        });

        this.registerTool({
            name: "query_data",
            description: "Fetch or analyze data from the database using a structured intent. Use this for ANY data retrieval (tables, comparisons, aggregations).",
            category: "data",
            parameters: {
                type: "object",
                properties: {
                    resource: { type: "string", description: "The table name to query (e.g. 'funds', 'users')." },
                    filters: {
                        type: "array",
                        description: "Conditions to filter data (WHERE clause)",
                        items: {
                            type: "object",
                            properties: {
                                field: { type: "string" },
                                op: { type: "string", enum: ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "in"] },
                                value: {
                                    oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { type: "string" } }]
                                }
                            },
                            required: ["field", "op", "value"]
                        }
                    },
                    groupBy: {
                        type: "array",
                        items: { type: "string" },
                        description: "Columns to group by"
                    },
                    aggregations: {
                        type: "array",
                        description: "Calculations (SUM, COUNT, etc)",
                        items: {
                            type: "object",
                            properties: {
                                op: { type: "string", enum: ["sum", "count", "avg", "min", "max"] },
                                field: { type: "string" },
                                alias: { type: "string" }
                            },
                            required: ["op", "field"]
                        }
                    },
                    orderBy: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                field: { type: "string" },
                                direction: { type: "string", enum: ["asc", "desc"] }
                            }
                        }
                    },
                    limit: { type: "number", description: "Max rows to return (default 1000)" }
                },
                required: ["resource"]
            },
            handler: async (intent, context) => {
                const { IntentCompiler } = await import('./IntentCompiler.js');
                const compiler = new IntentCompiler();

                try {
                    // Pass the full context (including schema/mappings) to compile
                    const sqlOrSqls = compiler.compile(intent, context);

                    const executeWithHealing = async (sql, currentIntent) => {
                        try {
                            return await context.adapter.query(sql);
                        } catch (error) {
                            console.warn(`[SpreadsheetToolService] Query failed: ${error.message}. Attempting autonomous healing...`);

                            const { queryHealingService } = await import('./QueryHealingService.js');
                            const healResult = await queryHealingService.healQuery(
                                sql,
                                context.dialect || 'postgres',
                                error.message,
                                {
                                    originalSql: sql,
                                    intent: currentIntent,
                                    schema: context.schema
                                }
                            );

                            if (healResult && healResult.healedSql) {
                                console.log(`[SpreadsheetToolService] Retrying with healed SQL: ${healResult.healedSql}`);
                                return await context.adapter.query(healResult.healedSql);
                            }

                            // If healing fails or confidence is low, rethrow original error
                            throw error;
                        }
                    };

                    if (Array.isArray(sqlOrSqls)) {
                        // Handle Compound Intent (Multiple Queries)
                        const results = await Promise.all(sqlOrSqls.map((sql, i) => executeWithHealing(sql, intent[i])));
                        return {
                            type: "data_response",
                            isCompound: true,
                            results: results.map((data, i) => ({
                                query: sqlOrSqls[i],
                                data: data,
                                intent: intent[i] // Pass back the specific intent part (e.g. for titles)
                            }))
                        };
                    } else {
                        // Handle Single Intent
                        const result = await executeWithHealing(sqlOrSqls, intent);

                        return {
                            type: "data_response",
                            query: sqlOrSqls,
                            data: result
                        };
                    }

                } catch (e) {
                    // Self-Correction for "Candidate bindings" (DuckDB/Postgres column errors)
                    if (e.message && e.message.includes("Candidate bindings")) {
                        const candidatesMatch = e.message.match(/Candidate bindings: (.*)/);
                        if (candidatesMatch) {
                            const candidates = candidatesMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));

                            // Simple heuristic: If user asked for "current_value" and "funds_held" is available, suggest it
                            // Or just return the available columns to the user
                            throw new Error(`Column not found. Available columns in '${intent.resource}': ${candidates.join(', ')}. Please refine your query.`);
                        }
                    }

                    throw new Error(`Intent Compilation or Execution Failed: ${e.message}`);
                }
            }
        });

        // ============================================
        // SQL QUERY TOOLS (Query Tab - Code Editor)
        // ============================================

        this.registerTool({
            name: "format_query",
            description: "Prettify and indent SQL code for better readability",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to format"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                return {
                    type: "formatted_query",
                    query
                };
            }
        });

        this.registerTool({
            name: "explain_query",
            description: "Explain what a SQL query does in plain English",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to explain"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                return {
                    type: "query_explanation",
                    query
                };
            }
        });

        this.registerTool({
            name: "optimize_query",
            description: "Suggest performance improvements for a SQL query",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to optimize"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                return {
                    type: "query_optimization",
                    query
                };
            }
        });

        this.registerTool({
            name: "fix_query_error",
            description: "Diagnose and fix syntax or runtime errors in a SQL query",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query with errors"
                    },
                    error: {
                        type: "string",
                        description: "The error message received"
                    }
                },
                required: ["query", "error"]
            },
            handler: async ({ query, error }, context) => {
                return {
                    type: "query_fix",
                    query,
                    error
                };
            }
        });

        this.registerTool({
            name: "generate_query",
            description: "Create a SQL query from a natural language description",
            parameters: {
                type: "object",
                properties: {
                    description: {
                        type: "string",
                        description: "Natural language description of what the query should do"
                    }
                },
                required: ["description"]
            },
            handler: async ({ description }, context) => {
                return {
                    type: "generated_query",
                    description
                };
            }
        });

        this.registerTool({
            name: "create_index",
            description: "Suggest indexes to improve query performance",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The slow query to analyze"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                return {
                    type: "index_suggestion",
                    query
                };
            }
        });

        this.registerTool({
            name: "generate_test_data",
            description: "Create mock data for testing purposes",
            parameters: {
                type: "object",
                properties: {
                    table: {
                        type: "string",
                        description: "Table name to generate data for"
                    },
                    rows: {
                        type: "number",
                        description: "Number of rows to generate"
                    }
                },
                required: ["table", "rows"]
            },
            handler: async ({ table, rows }, context) => {
                return {
                    type: "test_data",
                    table,
                    rows
                };
            }
        });

        this.registerTool({
            name: "convert_dialect",
            description: "Convert a SQL query between different database dialects (e.g., SQL to Cosmos DB, SQL to Kusto KQL)",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to convert"
                    },
                    targetDialect: {
                        type: "string",
                        description: "Target SQL dialect: 'cosmosdb', 'kusto', 'postgresql', 'mysql', 'sqlite', 'duckdb'"
                    }
                },
                required: ["query", "targetDialect"]
            },
            handler: async ({ query, targetDialect }, context) => {
                try {
                    // Import translation service
                    const { queryTranslationService } = await import('./QueryTranslationService.js');

                    // Perform translation
                    const result = await queryTranslationService.translateQuery(
                        query,
                        targetDialect,
                        context.schema || {}
                    );

                    return {
                        type: "dialect_conversion",
                        success: result.confidence > 0,
                        originalQuery: result.originalQuery,
                        translatedQuery: result.translatedQuery,
                        dialect: result.dialect,
                        confidence: result.confidence,
                        warnings: result.warnings,
                        notes: result.notes,
                        translationTimeMs: result.translationTimeMs,
                        cached: result.cached
                    };
                } catch (error) {
                    console.error('[convert_dialect] Translation error:', error);
                    return {
                        type: "dialect_conversion",
                        success: false,
                        originalQuery: query,
                        translatedQuery: query,
                        dialect: targetDialect,
                        confidence: 0,
                        warnings: [`Translation failed: ${error.message}`],
                        notes: 'Error occurred during translation',
                        error: error.message
                    };
                }
            }
        });

        this.registerTool({
            name: "generate_visualization",
            description: "Generate a chart/visualization. Use this when the user explicitly asks for a visual or when /visualization command is used. You MUST provide the SQL query to fetch the data AND the chart configuration.",
            category: "visualization",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "SQL query to fetch data" },
                    chartType: { type: "string", enum: ["bar", "line", "pie", "stat", "table"] },
                    title: { type: "string" },
                    xAxis: { type: "string" },
                    yAxis: { type: "array", items: { type: "string" } },
                    live: { type: "boolean", description: "Set to true if the user wants real-time/live updates" }
                },
                required: ["query", "chartType", "xAxis", "yAxis"]
            },
            handler: async ({ query, chartType, title, xAxis, yAxis, live }, context) => {
                return {
                    type: "visualization_request",
                    query,
                    config: { type: chartType, title, xAxis, yAxis, live }
                };
            }
        });

        this.registerTool({
            name: "save_as_view",
            description: "Create a database view from the current query",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to save as a view"
                    },
                    viewName: {
                        type: "string",
                        description: "Name for the new view"
                    }
                },
                required: ["query", "viewName"]
            },
            handler: async ({ query, viewName }, context) => {
                return {
                    type: "create_view",
                    query,
                    viewName
                };
            }
        });

        this.registerTool({
            name: "diff_queries",
            description: "Compare two SQL queries and show the differences",
            parameters: {
                type: "object",
                properties: {
                    query1: {
                        type: "string",
                        description: "First query"
                    },
                    query2: {
                        type: "string",
                        description: "Second query"
                    }
                },
                required: ["query1", "query2"]
            },
            handler: async ({ query1, query2 }, context) => {
                return {
                    type: "query_diff",
                    query1,
                    query2
                };
            }
        });

        this.registerTool({
            name: "analyze_query_performance",
            description: "Get execution time, row scans, and performance metrics for a query",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to analyze"
                    }
                },
                required: ["query"]
            },
            handler: async ({ query }, context) => {
                return {
                    type: "performance_analysis",
                    query
                };
            }
        });

        this.registerTool({
            name: "bind_to_live_data",
            description: "Bind a column of identifiers (like stock symbols or crypto IDs) to live data sources. Use this when the user asks for 'live prices', 'current market data', or 'weather updates' for a list of items. For example, 'get live prices for stocks in column A and put them in column B'.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    sourceColumn: {
                        type: "number",
                        description: "0-based index of the column containing the identifiers (e.g., 'AAPL', 'BTC', 'London')"
                    },
                    targetColumn: {
                        type: "number",
                        description: "0-based index of the column where the live values should be displayed"
                    },
                    providerType: {
                        type: "string",
                        enum: ["stock", "crypto", "weather"],
                        description: "The type of live data provider to use"
                    },
                    fieldPath: {
                        type: "string",
                        description: "The specific field to bind to (e.g., 'price' for stocks/crypto, 'temp' or 'humidity' for weather). FIELD NAMES: Stocks/Crypto: 'price', 'change24h'. Weather: 'temp', 'humidity', 'windSpeed', 'description'."
                    }
                },
                required: ["sourceColumn", "targetColumn", "providerType"]
            },
            handler: async (args, context) => {
                return {
                    type: "live_data_binding_request",
                    ...args
                };
            }
        });

        this.registerTool({
            name: "monitor_data_source",
            description: "Start a background monitor on a data source (table/container) to watch for new records. The backend will emit live updates to the dashboard.",
            category: "query",
            parameters: {
                type: "object",
                properties: {
                    connectionId: { type: "string", description: "The ID of the connection" },
                    tableName: { type: "string", description: "The table or container to monitor" },
                    dateColumn: { type: "string", description: "For SQL: The column to check for new records (e.g., 'created_at', 'timestamp'). Optional." }
                },
                required: ["connectionId", "tableName"]
            },
            handler: async (args, context) => {
                const { liveDataService } = await import('./LiveDataService.js');

                // Resolve adapter from context
                let adapter = context.resourceToAdapter?.[args.tableName];
                if (!adapter) {
                    // Try normalized lookup
                    const slug = args.tableName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    adapter = context.resourceToAdapter?.[slug];
                }

                let provider = context.resourceToProvider?.[args.tableName];
                if (!provider) {
                    const slug = args.tableName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    provider = context.resourceToProvider?.[slug];
                }

                if (!adapter) {
                    return {
                        error: `Could not find a valid database connection for table '${args.tableName}'. Ensure it is in the current context.`
                    };
                }

                const monitorId = `monitor:${args.connectionId}:${args.tableName}`;

                try {
                    await liveDataService.startMonitor(adapter, provider, args.tableName, monitorId, {
                        dateColumn: args.dateColumn
                    });

                    return {
                        type: "monitor_started",
                        monitorId,
                        message: `Started monitoring ${args.tableName} for live updates.`,
                        socketRoom: `monitor:${monitorId}`
                    };
                } catch (e) {
                    return { error: `Failed to start monitor: ${e.message}` };
                }
            }
        });

        // ============================================
        // MODIFICATION & FORMATTING TOOLS
        // ============================================

        this.registerTool({
            name: "modify_cells",
            description: "Update values in specific cells. Use this for point-edits or correcting specific data entries.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    changes: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                row: { type: "number", description: "0-based row index" },
                                col: { type: "number", description: "0-based column index" },
                                value: { type: "string", description: "New value for the cell (string or number)" }
                            },
                            required: ["row", "col", "value"]
                        }
                    }
                },
                required: ["changes"]
            },
            handler: async ({ changes }) => {
                return {
                    type: "modification",
                    description: `Updating ${changes.length} cells`,
                    cellChanges: changes
                };
            }
        });

        this.registerTool({
            name: "add_columns",
            description: "Add one or more new columns to the spreadsheet.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    columns: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                header: { type: "string", description: "Header name for the new column" },
                                values: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional initial values for the column rows"
                                }
                            },
                            required: ["header"]
                        }
                    }
                },
                required: ["columns"]
            },
            handler: async ({ columns }) => {
                return {
                    type: "add_column", // Unified type for frontend handling
                    description: `Adding ${columns.length} columns: ${columns.map(c => c.header).join(', ')}`,
                    newColumns: columns
                };
            }
        });

        this.registerTool({
            name: "remove_columns",
            description: "Delete columns from the spreadsheet by their indices.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    columnIndices: {
                        type: "array",
                        items: { type: "number" },
                        description: "0-based indices of columns to remove"
                    }
                },
                required: ["columnIndices"]
            },
            handler: async ({ columnIndices }) => {
                return {
                    type: "delete_column",
                    description: `Deleting columns at indices: ${columnIndices.join(', ')}`,
                    deletedColumns: columnIndices
                };
            }
        });

        this.registerTool({
            name: "format_spreadsheet",
            description: "Apply visual formatting (bold, color, alignment) to a range of cells.",
            category: "spreadsheet",
            mutation: true,
            parameters: {
                type: "object",
                properties: {
                    formats: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                range: { type: "string", description: "A1-style range (e.g., 'A1:C1') or 'all'" },
                                style: {
                                    type: "object",
                                    properties: {
                                        bold: { type: "boolean" },
                                        italic: { type: "boolean" },
                                        color: { type: "string", description: "Text color hex or name" },
                                        backgroundColor: { type: "string", description: "Background color hex or name" },
                                        textAlign: { type: "string", enum: ["left", "center", "right"] }
                                    }
                                }
                            },
                            required: ["range", "style"]
                        }
                    }
                },
                required: ["formats"]
            },
            handler: async ({ formats }) => {
                return {
                    type: "format",
                    description: `Applying formatting to ${formats.length} ranges`,
                    formatting: formats
                };
            }
        });
    }

    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }

    getToolDefinitions() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            category: t.category || 'general'
        }));
    }

    // Get all tools - no restrictions, available everywhere
    getAllTools() {
        return this.getToolDefinitions();
    }

    // Get tools grouped by category for UI organization
    getToolsByCategory() {
        const tools = this.getToolDefinitions();
        const categories = {
            data_analysis: { name: 'Data Analysis', tools: [] },
            data_creation: { name: 'Data Creation', tools: [] },
            data_transformation: { name: 'Data Transformation', tools: [] },
            visualization: { name: 'Visualization', tools: [] },
            query: { name: 'SQL & Query', tools: [] },
            general: { name: 'General', tools: [] }
        };

        for (const tool of tools) {
            const category = tool.category || 'general';
            if (categories[category]) {
                categories[category].tools.push(tool);
            } else {
                categories.general.tools.push(tool);
            }
        }

        return categories;
    }

    // Legacy methods - now return ALL tools for backwards compatibility
    getSpreadsheetTools() {
        // Return ALL tools - no restrictions
        return this.getToolDefinitions();
    }

    getReadOnlyTools() {
        // Return only tools that are NOT marked as mutation: true
        const allTools = this.tools.values();
        const readOnlyTools = [];

        for (const tool of allTools) {
            if (!tool.mutation) {
                readOnlyTools.push({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                    category: tool.category || 'general'
                });
            }
        }
        return readOnlyTools;
    }

    getQueryTools() {
        // Return ALL tools - no restrictions
        return this.getToolDefinitions();
    }


    async callTool(name, args, context) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        console.log(`[SpreadsheetToolService] Calling tool: ${name} with args:`, args);
        return await tool.handler(args, context);
    }
}



export const spreadsheetToolService = new SpreadsheetToolService();
