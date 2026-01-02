/**
 * Widget Preset Configurations
 * Defines default settings for API-sourced dashboard widgets
 */

export const WIDGET_PRESETS = {
    stock_portfolio: {
        title: 'My Stock Portfolio',
        type: 'table',
        widgetType: 'stock_portfolio',
        description: 'View your current stock holdings and performance',
        config: {
            autoRefresh: 30000, // 30 seconds
            showChart: true,
        }
    },

    market_ticker: {
        title: 'Market Ticker',
        type: 'table',
        widgetType: 'market_ticker',
        description: 'Live prices for selected stocks',
        config: {
            symbols: ['AAPL', 'GOOGL', 'AMZN', 'MSFT'],
            autoRefresh: 10000, // 10 seconds
        }
    },

    weather: {
        title: 'Weather',
        type: 'weather',
        widgetType: 'weather',
        description: 'Current weather and forecast',
        config: {
            location: 'San Francisco',
            units: 'imperial',
            autoRefresh: 600000, // 10 minutes
        }
    }
}

/**
 * Get widget preset by type
 */
export function getWidgetPreset(widgetType: string) {
    return WIDGET_PRESETS[widgetType as keyof typeof WIDGET_PRESETS] || null
}

/**
 * Create widget element data structure
 */
export function createWidgetElement(widgetType: string, customConfig?: any) {
    const preset = getWidgetPreset(widgetType)
    if (!preset) {
        throw new Error(`Unknown widget type: ${widgetType}`)
    }

    return {
        ...preset,
        config: {
            ...preset.config,
            ...customConfig
        }
    }
}
