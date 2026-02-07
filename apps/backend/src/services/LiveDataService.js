
import { getIO } from "../socket.js";
import { metricsContainer } from "../../lib/cosmos.ts";

// ==========================================
// Strategies
// ==========================================

class ChangeFeedStrategy {
    constructor(adapter, containerName) {
        this.adapter = adapter;
        this.containerName = containerName;
        this.isRunning = false;
        this.pollingInterval = 3000;
        this.iterator = null;
    }

    async start(onNewData, onError) {
        if (!this.adapter.container) {
            throw new Error("CosmosAdapter container not initialized");
        }

        console.log(`[ChangeFeedStrategy] Starting for ${this.containerName} (CosmosDB)`);
        this.isRunning = true;

        // Initialize Iterator (Start from NOW, not beginning)
        // Note: For 'metricsContainer' which is imported from lib, we might need special handling
        // But generalized adapter should have .container

        try {
            this.iterator = this.adapter.container.items.getChangeFeedIterator({
                startFromBeginning: false
            });
        } catch (e) {
            // Fallback for special system container if adapter wrapper is different
            if (this.containerName === 'OrionMetrics') {
                this.iterator = metricsContainer.items.getChangeFeedIterator({ startFromBeginning: false });
            } else {
                throw e;
            }
        }

        this.loop(onNewData, onError);
    }

    async loop(onNewData, onError) {
        while (this.isRunning) {
            try {
                if (this.iterator && this.iterator.hasMoreResults) {
                    const response = await this.iterator.readNext();

                    if (response.statusCode === 200 || response.statusCode === 304) {
                        if (response.resources && response.resources.length > 0) {
                            onNewData(response.resources);
                        }
                    }
                }
            } catch (err) {
                onError(err);
            }
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
        }
    }

    stop() {
        this.isRunning = false;
        console.log(`[ChangeFeedStrategy] Stopped for ${this.containerName}`);
    }
}

class PollingStrategy {
    constructor(adapter, tableName, dateColumn = 'created_at') {
        this.adapter = adapter;
        this.tableName = tableName;
        this.dateColumn = dateColumn;
        this.isRunning = false;
        this.pollingInterval = 5000;
        this.lastCheck = new Date().toISOString();
    }

    async start(onNewData, onError) {
        console.log(`[PollingStrategy] Starting for ${this.tableName} (Column: ${this.dateColumn})`);
        this.isRunning = true;
        this.loop(onNewData, onError);
    }

    async loop(onNewData, onError) {
        while (this.isRunning) {
            try {
                // Generic SQL Query for new records
                // Note: DuckDB/Postgres compatible
                const query = `SELECT * FROM "${this.tableName}" WHERE "${this.dateColumn}" > '${this.lastCheck}' ORDER BY "${this.dateColumn}" ASC`;

                const results = await this.adapter.query(query);

                if (results && results.length > 0) {
                    // Update watermark to the latest record's timestamp
                    const lastRecord = results[results.length - 1];
                    if (lastRecord[this.dateColumn]) {
                        // Ensure we format it back to ISO string if it's a Date object
                        const nextCheck = new Date(lastRecord[this.dateColumn]);
                        this.lastCheck = nextCheck.toISOString();
                    }

                    onNewData(results);
                }
            } catch (err) {
                onError(err);
            }

            await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
        }
    }

    stop() {
        this.isRunning = false;
    }
}

// ==========================================
// Service Manager
// ==========================================

export class LiveDataService {
    constructor() {
        this.monitors = new Map(); // id -> { strategy, socketRoom, history }
    }

    /**
     * Start monitoring a data source
     * @param {object} adapter - The database adapter
     * @param {string} provider - 'cosmosdb', 'postgres', etc.
     * @param {string} resourceName - Table or Container name
     * @param {string} monitorId - Unique ID for this monitor
     * @param {object} options - { dateColumn } for polling
     */
    async startMonitor(adapter, provider, resourceName, monitorId, options = {}) {
        if (this.monitors.has(monitorId)) {
            console.log(`[LiveDataService] Monitor ${monitorId} already running.`);
            return;
        }

        let strategy;

        // SELECT STRATEGY
        if (provider === 'cosmosdb' || provider === 'cosmos') {
            strategy = new ChangeFeedStrategy(adapter, resourceName);
        } else {
            // Default to polling for SQL
            strategy = new PollingStrategy(adapter, resourceName, options.dateColumn || 'created_at');
        }

        const monitorState = {
            strategy,
            monitorId,
            history: [], // Keep last 50 items
            room: options.targetRoom || `monitor:${monitorId}`,
            eventName: options.eventName || 'live_data_update'
        };

        // SETUP CALLBACKS
        const onNewData = (items) => {
            console.log(`[LiveDataService] ${monitorId}: ${items.length} new items.`);

            // 1. Update History
            monitorState.history.push(...items);
            if (monitorState.history.length > 50) {
                monitorState.history = monitorState.history.slice(-50);
            }

            // 2. Emit via Socket.IO
            const io = getIO();
            if (io) {
                io.to(monitorState.room).emit(monitorState.eventName, {
                    monitorId,
                    resourceName,
                    items,
                    timestamp: new Date()
                });

                // For backward compatibility (Orion expects just the array in some cases?)
                // Actually the old sync emitted existing raw resources.
                // If it's a custom event, we probably want to send the payload exactly as expected?
                // Old: emit("metric_update", response.resources);
                // My new code sends an object wrapper.

                if (options.emitRaw) {
                    io.to(monitorState.room).emit(monitorState.eventName, items);
                }
            }
        };

        const onError = (err) => {
            console.error(`[LiveDataService] ${monitorId} ERROR:`, err.message);
        };

        // START
        this.monitors.set(monitorId, monitorState);
        await strategy.start(onNewData, onError);

        return monitorState;
    }

    stopMonitor(monitorId) {
        const m = this.monitors.get(monitorId);
        if (m) {
            m.strategy.stop();
            this.monitors.delete(monitorId);
            console.log(`[LiveDataService] Stopped monitor ${monitorId}`);
        }
    }

    getSnapshot(monitorId) {
        return this.monitors.get(monitorId)?.history || [];
    }

    // New: Helper to get generic system monitor name
    getOrionMonitorId() {
        return "system:orion_metrics";
    }
}

export const liveDataService = new LiveDataService();
