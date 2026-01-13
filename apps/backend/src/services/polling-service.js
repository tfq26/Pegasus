import cron from 'node-cron';
import { db, ensureConnection } from '../../db/surreal.js';
import { getIO } from '../socket.js';

/**
 * Polling Service
 * Periodically checks for data sources that need to be refreshed.
 */
export const startPollingService = () => {
    console.log('[PollingService] Initializing background polling worker (Every 1m check)...');

    // Check every minute for due tasks
    cron.schedule('* * * * *', async () => {
        try {
            await ensureConnection();

            // Find active data sources that are due for a refresh
            // Logic: last_fetched is NULL OR (last_fetched + polling_interval) <= NOW
            const now = new Date();
            const [dueSources] = await db.query(`
                SELECT * FROM data_source 
                WHERE is_active = true 
                AND (
                    last_fetched = NONE 
                    OR (last_fetched + polling_interval * 1s) <= time::now()
                )
            `);

            if (!dueSources || dueSources.length === 0) return;

            console.log(`[PollingService] Detected ${dueSources.length} sources due for refresh.`);

            for (const source of dueSources) {
                // Run refresh in background without awaiting sequence to avoid drift
                refreshDataSource(source).catch(err => {
                    console.error(`[PollingService] Async refresh failed for ${source.id}:`, err.message);
                });
            }
        } catch (e) {
            console.error('[PollingService] Cron job cycle failed:', e.message);
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

        // Dynamic provider dispatch
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
            // Update source record with results
            await db.query(`
                UPDATE ${source.id} SET 
                    last_result = $data,
                    last_fetched = time::now(),
                    error = NONE;
            `, { data });

            // Propagate updates to bound spreadsheet cells
            await processCellUpdates(source.id, data, source.user);

            // Notify the user globally via WebSocket
            const io = getIO();
            if (io) {
                const userId = source.user.id || source.user.toString();
                io.to(userId).emit('data_source_updated', {
                    sourceId: source.id,
                    data,
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error(`[PollingService] Provider error for ${source.id}:`, e.message);
        await db.query(`UPDATE ${source.id} SET error = $error`, { error: e.message });
    }
};

/**
 * Updates all cells bound to a specific data source
 */
const processCellUpdates = async (sourceId, data, userId) => {
    const rawId = sourceId.includes(':') ? sourceId : `data_source:${sourceId}`;
    const [bindings] = await db.query(`
        SELECT * FROM cell_binding WHERE data_source = type::thing('data_source', $id)
    `, { id: rawId.split(':')[1] || rawId });

    if (!bindings || bindings.length === 0) return;

    console.log(`[PollingService] Syncing ${bindings.length} bound cells for ${sourceId}`);

    for (const binding of bindings) {
        const newValue = resolveValue(data, binding.field_path);

        // Only update if value changed? (Optional optimization)
        await db.query(`
            UPDATE ${binding.id} SET 
                last_value = $value,
                updated_at = time::now()
        `, { value: newValue });

        // Notify spreadsheet listeners for real-time UI updates
        const io = getIO();
        if (io) {
            io.to(`spreadsheet:${binding.spreadsheet_id}`).emit('cell_binding_updated', {
                cellId: binding.cell_id,
                value: newValue,
                spreadsheetId: binding.spreadsheet_id,
                dataSourceId: sourceId
            });
        }
    }
};

/**
 * Simple JSON property resolver (e.g., 'current.temp')
 */
const resolveValue = (obj, path) => {
    if (!path || path === '.') return obj;
    try {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    } catch (e) {
        return null;
    }
};

// --- API Provider Implementations (Phase 2 & 3) ---

const fetchStockData = async (config) => {
    const apiKey = process.env.ALPHAVANTAGE_KEY;
    if (!apiKey) throw new Error('ALPHAVANTAGE_KEY missing in server environment');
    if (!config.symbol) throw new Error('Stock symbol missing in source config');

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${config.symbol}&apikey=${apiKey}`;
    const resp = await fetch(url);
    const result = await resp.json();

    const quote = result['Global Quote'];
    if (!quote) {
        throw new Error(result['Note'] || result['Error Message'] || 'Failed to fetch stock quote');
    }

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
    if (!apiKey) throw new Error('OPENWEATHER_KEY missing in server environment');
    if (!config.lat || !config.lon) throw new Error('Weather coordinates (lat/lon) missing in source config');

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${config.lat}&lon=${config.lon}&appid=${apiKey}&units=metric`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OpenWeather returned ${resp.status}`);

    const data = await resp.json();
    return {
        temp: data.main.temp,
        feels_like: data.main.feels_like,
        humidity: data.main.humidity,
        condition: data.weather[0]?.main,
        description: data.weather[0]?.description,
        wind_speed: data.wind.speed,
        city: data.name
    };
};

const fetchCustomData = async (config) => {
    if (!config.url) throw new Error('Custom API URL missing');

    const options = {
        method: config.method || 'GET',
        headers: config.headers || {}
    };

    if (config.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
        options.body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
        if (!options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
    }

    const resp = await fetch(config.url, options);
    if (!resp.ok) throw new Error(`Custom API ${config.url} returned ${resp.status}`);

    return await resp.json();
};

const fetchCryptoData = async (config) => {
    if (!config.coinId) throw new Error('Coin ID (e.g., bitcoin) missing in source config');
    const vsCurrency = config.vsCurrency || 'usd';

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=${vsCurrency}&include_24hr_change=true&include_last_updated_at=true`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`CoinGecko returned ${resp.status}`);

    const data = await resp.json();
    const coinData = data[config.coinId];
    if (!coinData) throw new Error(`Coin ${config.coinId} not found in CoinGecko response`);

    return {
        id: config.coinId,
        price: coinData[vsCurrency],
        change24h: coinData[`${vsCurrency}_24h_change`],
        last_updated: coinData.last_updated_at,
        currency: vsCurrency
    };
};
