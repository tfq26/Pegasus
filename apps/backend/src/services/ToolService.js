import { db } from "../../db/surreal.js";

/**
 * ToolService manages external API integrations and tool definitions for the AI.
 */
export class ToolService {
    constructor() {
        this.tools = new Map();
        this.initializeBuiltinTools();
    }

    initializeBuiltinTools() {
        // Stock Price Tool
        this.registerTool({
            name: "get_stock_price",
            description: "Get the current stock price and market data for a given symbol.",
            parameters: {
                type: "object",
                properties: {
                    symbol: { type: "string", description: "The stock ticker symbol (e.g., AAPL, TSLA)" }
                },
                required: ["symbol"]
            },
            handler: async ({ symbol }) => {
                // In a real app, we'd call Alpha Vantage or Yahoo Finance
                // For now, we'll interface with our StockService's simulated data in SurrealDB
                const id = `stock:${symbol.toUpperCase()}`;
                const [results] = await db.query(`SELECT * FROM ${id}`);

                if (!results || results.length === 0) {
                    return { error: `Stock symbol ${symbol} not found.` };
                }

                return results[0];
            }
        });

        // Weather Tool
        this.registerTool({
            name: "get_weather",
            description: "Get the current weather for a specific city.",
            parameters: {
                type: "object",
                properties: {
                    city: { type: "string", description: "The city name (e.g., London, New York)" }
                },
                required: ["city"]
            },
            handler: async ({ city }) => {
                // Check if OPENWEATHER_API_KEY is available
                const apiKey = process.env.OPENWEATHER_API_KEY;
                if (!apiKey) {
                    // Fallback simulation if no API key
                    return {
                        city,
                        temperature: "22°C",
                        condition: "Sunny",
                        humidity: "45%",
                        info: "Simulated data (OPENWEATHER_API_KEY not set)"
                    };
                }

                try {
                    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`);
                    const data = await response.json();
                    if (data.cod !== 200) return { error: data.message };

                    return {
                        city: data.name,
                        temperature: `${data.main.temp}°C`,
                        condition: data.weather[0].main,
                        description: data.weather[0].description,
                        humidity: `${data.main.humidity}%`,
                        wind_speed: `${data.wind.speed} m/s`
                    };
                } catch (e) {
                    return { error: "Failed to fetch weather data." };
                }
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
            parameters: t.parameters
        }));
    }

    async callTool(name, args) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        console.log(`[ToolService] Calling tool: ${name} with args:`, args);
        return await tool.handler(args);
    }

    /**
     * Allows users to register their own custom API tools.
     * This would ideally persist in the database linked to the user.
     */
    async registerCustomTool(userId, config) {
        // Validation: Ensure URL is provided and safe
        if (!config.url || !config.url.startsWith('https://')) {
            throw new Error("Custom tool URL must use HTTPS.");
        }

        const toolId = `tool_${crypto.randomUUID().replace(/-/g, '')}`;

        await db.create('custom_tool', {
            id: toolId,
            user: `user:${userId}`,
            name: config.name,
            description: config.description,
            url: config.url,
            method: config.method || 'GET',
            headers: config.headers || {},
            parameters: config.parameters || {},
            created_at: new Date().toISOString()
        });

        return { toolId, name: config.name };
    }

    async getCustomTools(userId) {
        const [tools] = await db.query(`SELECT * FROM custom_tool WHERE user = $user`, {
            user: `user:${userId}`
        });
        return tools || [];
    }
}

export const toolService = new ToolService();
