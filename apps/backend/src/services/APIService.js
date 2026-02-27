import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { activityService } from "./ActivityService.js";

/**
 * Generic API Service for fetching external data and syncing it to Neon/Postgres.
 * Supports polling, custom mappers, and persistent storage.
 */
export class APIService {
    constructor(config = {}) {
        this.name = config.name || 'GenericAPI';
        this.url = config.url;
        this.table = config.table;
        this.pk = config.pk || 'id'; // Primary key field
        this.interval = config.interval || 60000;
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
     * Fetches data from the API and syncs it to the configured table.
     */
    async sync() {
        if (activityService.isIdle()) return;
        try {
            if (!db) return;

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

            if (Array.isArray(mappedData)) {
                for (const item of mappedData) {
                    await this.upsert(item);
                }
            } else {
                await this.upsert(mappedData);
            }

        } catch (e) {
            console.error(`[${this.name}] Sync failed:`, e.message);
        }
    }

    async upsert(item) {
        if (!this.table || !db) return;

        // Determine primary key name and value
        const pkField = this.pk || 'id';
        const pkValue = item[pkField] || item.id || item.symbol || item.uuid || (pkField === 'id' ? crypto.randomUUID() : null);

        if (!pkValue && pkField !== 'id') {
            console.warn(`[${this.name}] Skipping upsert: Missing primary key '${pkField}'`);
            return;
        }

        const content = {
            ...item,
            [pkField]: pkValue
        };

        // Only add updated_at if it's a common field or explicitly requested
        // For weather_cache we use cached_at/expiresAt already in the mapper
        if (!content.updatedAt && !content.updated_at && !content.cached_at && !content.cachedAt) {
            content.updated_at = new Date();
        }

        const keys = Object.keys(content);
        const columnNames = keys.map(k => `"${k}"`).join(', ');
        const updates = keys.filter(k => k !== pkField).map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');

        const query = sql`
            INSERT INTO "${sql.raw(this.table)}" (${sql.raw(columnNames)})
            VALUES (${sql.join(keys.map(k => sql`${content[k]}`), sql`, `)})
            ON CONFLICT ("${sql.raw(pkField)}") DO UPDATE SET ${sql.raw(updates)}
        `;

        try {
            await db.execute(query);
        } catch (e) {
            console.error(`[${this.name}] Upsert failed for table ${this.table}:`, e.message);
            // console.debug(`[${this.name}] Failed query with keys:`, keys);
        }
    }
}

/**
 * Default Recyclable API Configurations
 */
export const API_DEFAULTS = {
    STOCK_SIMULATOR: {
        name: 'StockSimulator',
        table: 'stock',
        interval: 300000,
        url: null, // Signals simulation mode
    },
    WEATHER: {
        name: 'WeatherService',
        table: 'weather_cache',
        pk: 'location',
        interval: 300000, // 5 minutes
        url: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current_weather=true',
        mapper: (data) => ({
            location: 'New York',
            temp: data.current_weather.temperature,
            wind_speed: data.current_weather.windspeed,
            condition: String(data.current_weather.weathercode),
            cached_at: new Date(),
            expires_at: new Date(Date.now() + 300000)
        })
    }
};
