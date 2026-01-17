import { Database } from 'duckdb-async';

class DuckManager {
    static instance;

    static async getInstance() {
        if (!this.instance) {
            console.log('[DuckDB] Initializing in-memory analytical engine...');
            this.instance = await Database.create(':memory:');

            // Install and load common extensions
            const db = this.instance;
            await db.all('INSTALL httpfs; LOAD httpfs;');
            await db.all('INSTALL sqlite; LOAD sqlite;');
            await db.all('INSTALL postgres; LOAD postgres;');
        }
        return this.instance;
    }

    static async query(sql, params = []) {
        const db = await this.getInstance();
        return db.all(sql, ...params);
    }
}

export const duck = DuckManager;
