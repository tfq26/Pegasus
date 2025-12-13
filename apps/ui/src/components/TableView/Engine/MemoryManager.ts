import type { ProgressCallback } from './DataLoader';

/**
 * Provider capabilities for different database adapters
 */
export interface ProviderCapabilities {
    supportsOffset: boolean;
    supportsServerCopy: boolean;
    supportsServerSort: boolean;
    maxBatchSize: number;
}

/**
 * Memory usage info
 */
export interface MemoryUsage {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    percentage: number;
}

/**
 * Provider capability matrix
 */
const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
    sqlite: {
        supportsOffset: true,
        supportsServerCopy: true,
        supportsServerSort: true,
        maxBatchSize: 1000
    },
    kusto: {
        supportsOffset: true,  // via 'skip' operator
        supportsServerCopy: false,  // KQL doesn't support INSERT
        supportsServerSort: true,   // via 'order by'
        maxBatchSize: 50000  // Kusto handles large results well
    },
    mysql: {
        supportsOffset: true,
        supportsServerCopy: true,
        supportsServerSort: true,
        maxBatchSize: 1000
    },
    postgres: {
        supportsOffset: true,
        supportsServerCopy: true,
        supportsServerSort: true,
        maxBatchSize: 1000
    },
    mongodb: {
        supportsOffset: true,  // via skip()
        supportsServerCopy: false,  // No direct table copy
        supportsServerSort: true,   // via sort()
        maxBatchSize: 10000
    }
};

/**
 * Default capabilities for unknown providers
 */
const DEFAULT_CAPABILITIES: ProviderCapabilities = {
    supportsOffset: true,
    supportsServerCopy: false,
    supportsServerSort: false,
    maxBatchSize: 1000
};

/**
 * MemoryManager - Handles large dataset operations with memory efficiency
 * 
 * Responsibilities:
 * - Monitor browser memory usage
 * - Manage chunked data loading
 * - Provide provider-specific capabilities
 * - Handle memory cleanup when needed
 */
export class MemoryManager {
    private static CHUNK_SIZE = 5000;
    private static MEMORY_WARNING_THRESHOLD = 0.8; // 80% of heap limit
    private static baseUrl = import.meta.env?.VITE_QUERY_API_URL || '';

    /**
     * Get capabilities for a specific provider
     */
    static getProviderCapabilities(provider: string): ProviderCapabilities {
        return PROVIDER_CAPABILITIES[provider] || DEFAULT_CAPABILITIES;
    }

    /**
     * Get current memory usage (if available)
     */
    static getMemoryUsage(): MemoryUsage | null {
        // @ts-ignore - performance.memory is non-standard but available in Chrome
        const memory = performance.memory;
        if (!memory) return null;

        return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            percentage: memory.usedJSHeapSize / memory.jsHeapSizeLimit
        };
    }

    /**
     * Check if memory usage is high
     */
    static isMemoryHigh(): boolean {
        const usage = this.getMemoryUsage();
        if (!usage) return false;
        return usage.percentage > this.MEMORY_WARNING_THRESHOLD;
    }

    /**
     * Hint to garbage collector (no guarantee it will run)
     */
    static releaseMemory(): void {
        // Clear any cached data structures
        // The actual GC is up to the browser
        if (typeof window !== 'undefined' && 'gc' in window) {
            try {
                // @ts-ignore - gc() is available when Chrome is started with --expose-gc
                window.gc();
            } catch (e) {
                // GC not available, that's fine
            }
        }
    }

    /**
     * Get optimal chunk size based on provider and current memory
     */
    static getOptimalChunkSize(provider: string): number {
        const capabilities = this.getProviderCapabilities(provider);
        const memoryUsage = this.getMemoryUsage();

        // If memory is high, reduce chunk size
        if (memoryUsage && memoryUsage.percentage > 0.5) {
            return Math.floor(capabilities.maxBatchSize / 2);
        }

        return capabilities.maxBatchSize;
    }

    /**
     * Stream table metadata (row count, chunk info) - requires /stream endpoint
     */
    static async getStreamInfo(
        tableName: string,
        connection: any,
        provider: string
    ): Promise<{ totalRows: number; chunkCount: number; chunkSize: number }> {
        const chunkSize = this.getOptimalChunkSize(provider);

        try {
            const response = await fetch(`${this.baseUrl}/api/table/${tableName}/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ connection, provider, chunkSize })
            });

            if (!response.ok) {
                // Fallback: endpoint not implemented yet
                return { totalRows: 0, chunkCount: 0, chunkSize };
            }

            const body = await response.json();
            return {
                totalRows: body.totalRows || 0,
                chunkCount: body.chunkCount || 0,
                chunkSize
            };
        } catch (e) {
            // Fallback if endpoint doesn't exist
            console.warn('[MemoryManager] Stream endpoint not available, using fallback');
            return { totalRows: 0, chunkCount: 0, chunkSize };
        }
    }

    /**
     * Load a specific chunk of data - requires /stream/:chunkId endpoint
     */
    static async loadChunk(
        tableName: string,
        connection: any,
        provider: string,
        chunkId: number,
        chunkSize: number
    ): Promise<Record<string, any>[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/table/${tableName}/stream/${chunkId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ connection, provider, chunkSize })
            });

            if (!response.ok) {
                throw new Error('Failed to load chunk');
            }

            const body = await response.json();
            return body.rows || [];
        } catch (e) {
            console.error(`[MemoryManager] Failed to load chunk ${chunkId}:`, e);
            throw e;
        }
    }

    /**
     * Request server-side table copy
     */
    static async copyTable(
        source: { table: string; connection: any; provider: string },
        target: { table: string; connection: any; provider: string },
        onProgress?: ProgressCallback
    ): Promise<boolean> {
        const capabilities = this.getProviderCapabilities(source.provider);

        if (!capabilities.supportsServerCopy) {
            console.warn(`[MemoryManager] Provider ${source.provider} does not support server-side copy`);
            return false;
        }

        onProgress?.({ current: 0, total: 1, phase: 'Copying table...' });

        try {
            const response = await fetch(`${this.baseUrl}/api/table/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ source, target })
            });

            onProgress?.({ current: 1, total: 1, phase: 'Complete' });
            return response.ok;
        } catch (e) {
            console.error('[MemoryManager] Copy table failed:', e);
            return false;
        }
    }

    /**
     * Request server-side table sort
     */
    static async sortTable(
        tableName: string,
        connection: any,
        provider: string,
        sortColumn: string,
        order: 'ASC' | 'DESC',
        onProgress?: ProgressCallback
    ): Promise<boolean> {
        const capabilities = this.getProviderCapabilities(provider);

        if (!capabilities.supportsServerSort) {
            console.warn(`[MemoryManager] Provider ${provider} does not support server-side sort`);
            return false;
        }

        onProgress?.({ current: 0, total: 1, phase: 'Sorting table...' });

        try {
            const response = await fetch(`${this.baseUrl}/api/table/${tableName}/sort`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ connection, provider, column: sortColumn, order })
            });

            onProgress?.({ current: 1, total: 1, phase: 'Complete' });
            return response.ok;
        } catch (e) {
            console.error('[MemoryManager] Sort table failed:', e);
            return false;
        }
    }

    /**
     * Format bytes for display
     */
    static formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}
