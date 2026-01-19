import { db } from "../db/index.js";

/**
 * Service for generating SQL queries for API-sourced dashboard widgets
 * Widgets use auto-generated queries against cached API data (stocks, weather)
 */
export class WidgetTemplateService {
    /**
     * Generate query for Stock Portfolio widget
     * Shows user's current holdings with profit/loss
     */
    getStockPortfolioQuery(userId) {
        return `
            SELECT 
                symbol,
                SUM(CASE 
                    WHEN type = 'BUY' THEN quantity 
                    WHEN type = 'SELL' THEN -quantity 
                    ELSE 0 
                END) as shares,
                AVG(CASE WHEN type = 'BUY' THEN price END) as avg_buy_price,
                (SELECT price FROM stock WHERE stock.symbol = $parent.symbol LIMIT 1)[0] as current_price
            FROM stock_transaction
            WHERE user = type::thing('user', '${userId}')
            GROUP BY symbol
            HAVING shares > 0
            ORDER BY shares DESC;
        `;
    }

    /**
     * Generate query for Market Ticker widget
     * Shows live prices for selected symbols
     */
    getMarketTickerQuery(symbols) {
        if (!symbols || symbols.length === 0) {
            symbols = ['AAPL', 'GOOGL', 'AMZN']; // Default symbols
        }
        const symbolList = symbols.map(s => `'${s}'`).join(',');
        return `
            SELECT 
                symbol, 
                price, 
                change, 
                change_percent,
                last_updated
            FROM stock
            WHERE symbol IN [${symbolList}]
            ORDER BY symbol ASC;
        `;
    }

    /**
     * Generate query for Weather widget
     * Shows current weather and forecast for a location
     */
    getWeatherQuery(location) {
        return `
            SELECT 
                temp, 
                feels_like,
                condition, 
                icon, 
                humidity,
                wind_speed,
                forecast,
                cached_at
            FROM weather_cache
            WHERE location = '${location}'
            AND expires_at > time::now()
            LIMIT 1;
        `;
    }

    /**
     * Get widget configuration metadata
     * Returns display name, default config, and query template
     */
    getWidgetMetadata(widgetType) {
        const metadata = {
            stock_portfolio: {
                title: 'Stock Portfolio',
                description: 'View your current holdings and performance',
                defaultConfig: {
                    showChart: true,
                    autoRefresh: 30000 // 30 seconds
                },
                visualizationType: 'table'
            },
            market_ticker: {
                title: 'Market Ticker',
                description: 'Live prices for selected stocks',
                defaultConfig: {
                    symbols: ['AAPL', 'GOOGL', 'AMZN', 'MSFT'],
                    autoRefresh: 10000 // 10 seconds
                },
                visualizationType: 'ticker'
            },
            weather: {
                title: 'Weather',
                description: 'Current weather and forecast',
                defaultConfig: {
                    location: 'San Francisco',
                    units: 'imperial',
                    autoRefresh: 600000 // 10 minutes
                },
                visualizationType: 'weather'
            }
        };

        return metadata[widgetType] || null;
    }

    /**
     * Validate widget configuration
     */
    validateConfig(widgetType, config) {
        switch (widgetType) {
            case 'stock_portfolio':
                return true; // No required config for portfolio
            case 'market_ticker':
                if (!config.symbols || !Array.isArray(config.symbols)) {
                    throw new Error('Market ticker requires symbols array');
                }
                return true;
            case 'weather':
                if (!config.location) {
                    throw new Error('Weather widget requires location');
                }
                return true;
            default:
                throw new Error(`Unknown widget type: ${widgetType}`);
        }
    }
}

export const widgetTemplateService = new WidgetTemplateService();
