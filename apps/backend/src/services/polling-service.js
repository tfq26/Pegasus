import cron from 'node-cron';
import { db } from '../db/index.js';
import { dataSources, cellBindings } from '../db/schema.js';
import { getIO } from '../socket.js';
import { eq, and, sql, lte, or, isNull } from 'drizzle-orm';

/**
 * Polling Service
 * Periodically checks for data sources that need to be refreshed.
 */
export const startPollingService = () => {
    console.log('[PollingService] Initializing background polling worker (Every 1m check)...');

    // Check every minute for due tasks
    cron.schedule('* * * * *', async () => {
        try {
            // Find active data sources that are due for a refresh
            // Logic: last_fetched is NULL OR (last_fetched + polling_interval) <= NOW
            const now = new Date();

            // In Postgres, we can do date math
            const dueSources = await db.select()
                .from(dataSources)
                .where(and(
                    eq(dataSources.isActive, true),
                    or(
                        isNull(dataSources.lastFetched),
                        sql`${dataSources.lastFetched} + (${dataSources.pollingInterval} * interval '1 second') <= now()`
                    )
                ));

            if (!dueSources || dueSources.length === 0) return;

            console.log(`[PollingService] Detected ${dueSources.length} sources due for refresh.`);

            for (const source of dueSources) {
                // Run refresh in background
                refreshDataSource(source).catch(err => {
                    console.error(`[PollingService] Async refresh failed for ${source.id}:`, err.message);
                });
            }
        } catch (e) {
            console.error('[PollingService] Cron job cycle failed:', e);
        }
    });
};

/**
 * Refreshes a single data source based on its type
 */
export const refreshDataSource = async (source) => {
    try {
        console.log(`[PollingService] Fetching: ${source.name} [${source.type}]`);

        let data = null;

        switch (source.type) {
            case 'stock':
                data = await fetchStockData(source.config);
                break;
            case 'weather':
                data = await fetchWeatherData(source.config);
                break;
            case 'crypto':
                data = await fetchCryptoData(source.config);
                break;
            case 'custom':
                data = await fetchCustomData(source.config);
                break;
            default:
                console.warn(`[PollingService] Unknown source type: ${source.type}`);
        }

        if (data) {
            // Update source record
            // We need to add 'last_fetched' and 'last_result' to schema if missing, 
            // but for now we'll use sql templates if they aren't in the schema yet.
            await db.update(dataSources)
                .set({
                    // lastResult: data, // If we add it to schema
                    // lastFetched: new Date(),
                    // error: null
                    ... ({
                        lastResult: data,
                        lastFetched: new Date(),
                        error: null
                    })
                })
                .where(eq(dataSources.id, source.id));

            // Propagate updates to bound spreadsheet cells
            await processCellUpdates(source.id, data, source.userId);

            // Notify via WebSocket
            const io = getIO();
            if (io) {
                io.to(source.userId).emit('data_source_updated', {
                    sourceId: source.id,
                    data,
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error(`[PollingService] Provider error for ${source.id}:`, e.message);
        await db.update(dataSources)
            .set({ error: e.message })
            .where(eq(dataSources.id, source.id));
    }
};

/**
 * Updates all cells bound to a specific data source
 */
const processCellUpdates = async (sourceId, data, userId) => {
    const bindings = await db.select()
        .from(cellBindings)
        .where(eq(cellBindings.dataSourceId, sourceId));

    if (!bindings || bindings.length === 0) return;

    console.log(`[PollingService] Syncing ${bindings.length} bound cells for ${sourceId}`);

    for (const binding of bindings) {
        const newValue = resolveValue(data, binding.fieldPath);

        await db.update(cellBindings)
            .set({
                lastValue: newValue, // Need to add this to schema
                updatedAt: new Date()
            })
            .where(eq(cellBindings.id, binding.id));

        // Notify spreadsheet listeners
        const io = getIO();
        if (io) {
            io.to(`spreadsheet:${binding.spreadsheetId}`).emit('cell_binding_updated', {
                cellId: binding.cellId,
                value: newValue,
                spreadsheetId: binding.spreadsheetId,
                dataSourceId: sourceId
            });
        }
    }
};

const resolveValue = (obj, path) => {
    if (!path || path === '.') return obj;
    try {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    } catch (e) {
        return null;
    }
};

// --- API Provider Implementations ---

const fetchStockData = async (config) => {
    const apiKey = process.env.ALPHAVANTAGE_KEY;
    if (!apiKey) throw new Error('ALPHAVANTAGE_KEY missing');
    if (!config.symbol) throw new Error('Symbol missing');
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${config.symbol}&apikey=${apiKey}`;
    const resp = await fetch(url);
    const result = await resp.json();
    const quote = result['Global Quote'];
    if (!quote) throw new Error('Failed to fetch stock quote');
    return {
        symbol: quote['01. symbol'],
        price: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        changePercent: quote['10. change percent'],
        volume: parseInt(quote['06. volume']),
        lastUpdated: quote['07. latest trading day']
    };
};

const fetchWeatherData = async (config) => {
    const apiKey = process.env.OPENWEATHER_KEY;
    if (!apiKey) throw new Error('OPENWEATHER_KEY missing');
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${config.lat}&lon=${config.lon}&appid=${apiKey}&units=metric`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Weather error: ${resp.status}`);
    const data = await resp.json();
    return {
        temp: data.main.temp,
        feels_like: data.main.feels_like,
        condition: data.weather[0]?.main,
        city: data.name
    };
};

const fetchCustomData = async (config) => {
    if (!config.url) throw new Error('URL missing');
    const resp = await fetch(config.url, {
        method: config.method || 'GET',
        headers: config.headers || {}
    });
    return await resp.json();
};

const fetchCryptoData = async (config) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=usd`;
    const resp = await fetch(url);
    const data = await resp.json();
    return { price: data[config.coinId]?.usd };
};
