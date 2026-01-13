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
                let columns = context?.schemaInfo?.detailedSchema?.[tableName];

                // Lazy fetch if not in initial context
                if (!columns && context?.adapter) {
                    console.log(`[SpreadsheetToolService] Lazy fetching schema for ${tableName}`);
                    if (typeof context.adapter.getOneTableSchema === 'function') {
                        columns = await context.adapter.getOneTableSchema(tableName);
                    }
                }

                return {
                    type: "schema_result",
                    tableName,
                    columns: columns || [],
                    note: "Table structure fetched successfully"
                };
            }
        });

        // ============================================
        // SPREADSHEET TOOLS (Grid.vue / Editor)
        // ============================================

        this.registerTool({
            name: "analyze_data",
            description: "Answer a question about the spreadsheet data by specifying what calculation to perform",
            category: "spreadsheet",
            parameters: {
                type: "object",
                properties: {
                    question: {
                        type: "string",
                        description: "The original question being asked"
                    },
                    operation: {
                        type: "string",
                        enum: ["max", "min", "sum", "average", "count", "find", "filter", "group_by"],
                        description: "The mathematical/analytical operation to perform"
                    },
                    column: {
                        type: "number",
                        description: "The column index to analyze (0-based)"
                    },
                    condition: {
                        type: "object",
                        description: "Optional filter condition",
                        properties: {
                            column: { type: "number" },
                            operator: { type: "string", enum: ["=", ">", "<", ">=", "<=", "!=", "contains"] },
                            value: { type: "string" }
                        }
                    },
                    groupByColumn: {
                        type: "number",
                        description: "Column to group by (for group_by operation)"
                    }
                },
                required: ["question", "operation", "column"]
            },
            handler: async (args, context) => {
                const { question, operation, column, condition, groupByColumn } = args;
                const { spreadsheetData } = context;

                console.log(`[analyze_data] Executing ${operation} on column ${column}`);

                // Execute the calculation on the FULL dataset provided in context
                let result;
                let data = spreadsheetData.sampleData; // This contains the rows sent from frontend

                // Apply filter if condition exists
                if (condition) {
                    data = data.filter(row => {
                        const cellValue = row[condition.column];
                        const compareValue = condition.value;

                        switch (condition.operator) {
                            case "=": return cellValue == compareValue;
                            case ">": return Number(cellValue) > Number(compareValue);
                            case "<": return Number(cellValue) < Number(compareValue);
                            case ">=": return Number(cellValue) >= Number(compareValue);
                            case "<=": return Number(cellValue) <= Number(compareValue);
                            case "!=": return cellValue != compareValue;
                            case "contains": return String(cellValue).includes(compareValue);
                            default: return true;
                        }
                    });
                }

                // Perform the operation
                switch (operation) {
                    case "max": {
                        let maxValue = -Infinity;
                        let maxRow = null;
                        data.forEach(row => {
                            const val = Number(String(row[column]).replace(/[^0-9.-]+/g, ""));
                            if (!isNaN(val) && val > maxValue) {
                                maxValue = val;
                                maxRow = row;
                            }
                        });
                        result = { value: maxValue, row: maxRow, operation: "maximum" };
                        break;
                    }
                    case "min": {
                        let minValue = Infinity;
                        let minRow = null;
                        data.forEach(row => {
                            const val = Number(String(row[column]).replace(/[^0-9.-]+/g, ""));
                            if (!isNaN(val) && val < minValue) {
                                minValue = val;
                                minRow = row;
                            }
                        });
                        result = { value: minValue, row: minRow, operation: "minimum" };
                        break;
                    }
                    case "sum": {
                        const sum = data.reduce((acc, row) => {
                            const val = Number(String(row[column]).replace(/[^0-9.-]+/g, ""));
                            return acc + (isNaN(val) ? 0 : val);
                        }, 0);
                        result = { value: sum, operation: "sum" };
                        break;
                    }
                    case "average": {
                        const values = data.map(row => Number(String(row[column]).replace(/[^0-9.-]+/g, ""))).filter(v => !isNaN(v));
                        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                        result = { value: avg, count: values.length, operation: "average" };
                        break;
                    }
                    case "count": {
                        result = { value: data.length, operation: "count" };
                        break;
                    }
                    case "group_by": {
                        const groups = {};
                        data.forEach(row => {
                            const groupKey = row[groupByColumn];
                            if (!groups[groupKey]) groups[groupKey] = [];
                            groups[groupKey].push(row[column]);
                        });

                        const summary = Object.entries(groups).map(([key, values]) => {
                            const numValues = values.map(v => Number(String(v).replace(/[^0-9.-]+/g, ""))).filter(v => !isNaN(v));
                            return {
                                group: key,
                                count: values.length,
                                sum: numValues.reduce((a, b) => a + b, 0),
                                avg: numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0
                            };
                        });

                        result = { groups: summary, operation: "group_by" };
                        break;
                    }
                    default:
                        result = { error: "Unknown operation" };
                }

                return {
                    type: "analysis_result",
                    question,
                    operation,
                    result,
                    headers: spreadsheetData.headers,
                    totalRows: data.length
                };
            }
        });

        // Generic AI processing tool for flexible transformations
        this.registerTool({
            name: "process_with_ai",
            description: "Process or transform spreadsheet data using AI for tasks that don't fit other tools (e.g., 'create random groups', 'shuffle and assign', 'categorize items', 'generate creative output from data'). Use this when the user wants to manipulate, reorganize, or creatively transform the data.",
            category: "spreadsheet",
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
            name: "summarize_data",
            description: "Generate a summary of key insights by specifying columns and metrics to calculate",
            parameters: {
                type: "object",
                properties: {
                    columns: {
                        type: "array",
                        items: { type: "number" },
                        description: "List of column indices to include in the summary"
                    },
                    metrics: {
                        type: "array",
                        items: { type: "string", enum: ["mean", "median", "mode", "std_dev", "count_distinct", "min", "max"] },
                        description: "Statistical metrics to calculate locally"
                    }
                },
                required: ["columns", "metrics"]
            },
            handler: async ({ columns, metrics }, context) => {
                return {
                    type: "summary_request",
                    columns,
                    metrics
                };
            }
        });

        this.registerTool({
            name: "compare_data",
            description: "Compare this table to another table by specifying a join key and columns to diff",
            parameters: {
                type: "object",
                properties: {
                    targetTable: {
                        type: "string",
                        description: "Name of the table to compare against"
                    },
                    primaryKey: {
                        type: "string",
                        description: "The column name to use as a primary key for joining"
                    },
                    diffColumns: {
                        type: "array",
                        items: { type: "string" },
                        description: "Specific columns to check for differences"
                    }
                },
                required: ["targetTable", "primaryKey"]
            },
            handler: async ({ targetTable, primaryKey, diffColumns }, context) => {
                return {
                    type: "comparison_request",
                    targetTable,
                    primaryKey,
                    diffColumns
                };
            }
        });

        this.registerTool({
            name: "sort_data",
            description: "Sort the data by a specific column",
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
            name: "suggest_chart",
            description: "Recommend the best visualization by specifying columns to analyze for statistics",
            parameters: {
                type: "object",
                properties: {
                    columns: {
                        type: "array",
                        items: { type: "number" },
                        description: "Column indices to analyze for chart suitability"
                    }
                },
                required: ["columns"]
            },
            handler: async ({ columns }, context) => {
                return {
                    type: "chart_suggestion_request",
                    columns
                };
            }
        });

        this.registerTool({
            name: "apply_template",
            description: "Transform this table to match a template table's structure",
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
            description: "Convert a SQL query between different database dialects",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The SQL query to convert"
                    },
                    targetDialect: {
                        type: "string",
                        description: "Target SQL dialect (e.g., 'postgresql', 'mysql', 'surrealdb')"
                    }
                },
                required: ["query", "targetDialect"]
            },
            handler: async ({ query, targetDialect }, context) => {
                return {
                    type: "dialect_conversion",
                    query,
                    targetDialect
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
