import { db, isConnected } from "../../db/surreal.js";

/**
 * Generic API Service for fetching external data and syncing it to SurrealDB.
 * Supports polling, custom mappers, and persistent storage.
 */
export class APIService {
    constructor(config = {}) {
        this.name = config.name || 'GenericAPI';
        this.url = config.url;
        this.table = config.table;
        this.interval = config.interval || 60000; // Default 1 minute
        this.mapper = config.mapper || ((data) => data);
        this.isRunning = false;
        this.intervalId = null;
        this.headers = config.headers || {};
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[${this.name}] Starting service for ${this.url || 'Simulation'}...`);

        // Immediate first fetch
        await this.sync();

        // Start polling
        this.intervalId = setInterval(() => this.sync(), this.interval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log(`[${this.name}] Stopped.`);
    }

    /**
     * Fetches data from the API and syncs it to the configured SurrealDB table.
     */
    async sync() {
        try {
            // Wait for DB to be fully ready (connected and authenticated)
            if (!isConnected) {
                return;
            }

            if (!this.url) {
                // If no URL and no override sync (like StockService), it's a no-op generic
                return;
            }

            const response = await fetch(this.url, { headers: this.headers });
            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const mappedData = await this.mapper(data);
            // console.log(`[${this.name}] Successfully fetched and mapped data.`);

            if (Array.isArray(mappedData)) {
                for (const item of mappedData) {
                    await this.upsert(item);
                }
            } else {
                await this.upsert(mappedData);
            }

        } catch (e) {
            if (e.message && e.message.includes('NoActiveSocket')) {
                // Graceful ignore during startup/disconnection
            } else {
                console.error(`[${this.name}] Sync failed:`, e.message);
            }
        }
    }

    async upsert(item) {
        if (!this.table) return;

        const id = item.id || `${this.table}:${item.symbol || item.uuid || crypto.randomUUID().replace(/-/g, '')}`;

        const content = {
            ...item,
            updated_at: new Date().toISOString()
        };
        delete content.id;

        await db.query(`
            INSERT INTO ${this.table} ($content) 
            ON DUPLICATE KEY UPDATE 
                updated_at = time::now();
        `, { content: { ...content, id } });
    }
}

/**
 * Default Recyclable API Configurations
 */
export const API_DEFAULTS = {
    STOCK_SIMULATOR: {
        name: 'StockSimulator',
        table: 'stock',
        interval: 5000,
        url: null, // Signals simulation mode
    },
    WEATHER: {
        name: 'WeatherService',
        table: 'weather_data',
        interval: 300000, // 5 minutes
        url: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current_weather=true',
        mapper: (data) => ({
            id: 'weather_data:nyc',
            location: 'New York',
            temp: data.current_weather.temperature,
            windspeed: data.current_weather.windspeed,
            condition: data.current_weather.weathercode,
            unit: 'celsius'
        })
    }
};
