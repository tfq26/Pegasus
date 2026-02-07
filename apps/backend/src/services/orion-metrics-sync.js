import { liveDataService } from "./LiveDataService.js";
import { CosmosAdapter } from "../../adapters/cosmosAdapter.js";

export class OrionMetricsSync {
    constructor() {
        this.isRunning = false;
        this.monitorId = "system:orion_metrics";
    }

    async start() {
        if (this.isRunning) return;

        console.log("[OrionSync] Initializing via LiveDataService...");

        if (process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY) {
            try {
                this.isRunning = true;

                // Create dedicated adapter for the listener
                const metricsAdapter = new CosmosAdapter({
                    endpoint: process.env.COSMOS_ENDPOINT,
                    key: process.env.COSMOS_KEY,
                    database: 'PegasusLive',
                    container: 'OrionMetrics'
                });

                // Connect explicitly (optional, but good practice before handing off)
                await metricsAdapter.connect();

                // Start Generic Monitor
                // We use 'OrionMetrics' as resource name, which matches the container
                // The service will pick ChangeFeedStrategy for 'cosmosdb'
                await liveDataService.startMonitor(
                    metricsAdapter,
                    'cosmosdb',
                    'OrionMetrics',
                    this.monitorId,
                    {
                        targetRoom: 'orion:live',
                        eventName: 'metric_update',
                        emitRaw: true
                    }
                );

                console.log("[OrionSync] Delegated monitoring to LiveDataService.");

            } catch (e) {
                console.error("[OrionSync] Failed to start:", e);
                this.isRunning = false;
            }
        } else {
            console.warn("[OrionSync] Skipped: Missing Cosmos credentials.");
        }
    }

    stop() {
        if (this.isRunning) {
            liveDataService.stopMonitor(this.monitorId);
            this.isRunning = false;
            console.log("[OrionSync] Stopped.");
        }
    }
}

export const orionMetricsSync = new OrionMetricsSync();
