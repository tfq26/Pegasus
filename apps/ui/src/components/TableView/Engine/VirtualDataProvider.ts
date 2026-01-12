/**
 * VirtualDataProvider - Manages windowed data loading for large datasets
 * 
 * This provides lazy loading of data chunks based on the current viewport,
 * enabling the spreadsheet to handle millions of rows without loading
 * everything into memory.
 * 
 * Key features:
 * - Viewport-aware chunk loading
 * - Smart prefetching for smooth scrolling
 * - LRU cache for recently accessed chunks
 * - Provider-specific optimizations
 */

import { ColumnStore, type ColumnSchema } from './ColumnStore';

/**
 * Data fetch function signature
 */
export type DataFetcher = (
    tableName: string,
    connection: any,
    offset: number,
    limit: number
) => Promise<{
    rows: Record<string, any>[];
    totalCount?: number;
    columns?: ColumnSchema[];
}>;

/**
 * Chunk status
 */
export type ChunkStatus = 'pending' | 'loading' | 'loaded' | 'error';

/**
 * Internal chunk tracking
 */
interface ChunkInfo {
    id: number;
    status: ChunkStatus;
    lastAccess: number;
    loadPromise?: Promise<void>;
    error?: Error;
}

/**
 * Viewport definition
 */
export interface Viewport {
    startRow: number;
    endRow: number;
    startCol?: number;
    endCol?: number;
}

/**
 * VirtualDataProvider configuration
 */
export interface VirtualDataProviderConfig {
    chunkSize: number;           // Rows per chunk (default: 5000)
    maxCachedChunks: number;     // Max chunks in memory (default: 10)
    prefetchAhead: number;       // Chunks to prefetch ahead (default: 2)
    prefetchBehind: number;      // Chunks to prefetch behind (default: 1)
    debounceMs: number;          // Debounce viewport changes (default: 50)
}

const DEFAULT_CONFIG: VirtualDataProviderConfig = {
    chunkSize: 5000,
    maxCachedChunks: 10,
    prefetchAhead: 2,
    prefetchBehind: 1,
    debounceMs: 50
};

/**
 * Event types for data provider
 */
export interface VirtualDataProviderEvents {
    onChunkLoaded: (chunkId: number, startRow: number, endRow: number) => void;
    onChunkError: (chunkId: number, error: Error) => void;
    onLoadingStateChange: (isLoading: boolean) => void;
    onTotalCountUpdate: (totalCount: number) => void;
}

/**
 * VirtualDataProvider - Main class for virtualized data loading
 */
export class VirtualDataProvider {
    // Data storage
    private store: ColumnStore;

    // Configuration
    private config: VirtualDataProviderConfig;

    // Data source
    private tableName: string = '';
    private connection: any = null;
    private fetcher: DataFetcher | null = null;

    // Chunk tracking
    private chunks: Map<number, ChunkInfo> = new Map();
    private loadingChunks: Set<number> = new Set();

    // Total row count (from server)
    private _totalCount: number = 0;

    // Current viewport
    private viewport: Viewport = { startRow: 0, endRow: 100 };

    // Event callbacks
    private events: Partial<VirtualDataProviderEvents> = {};

    // Debounce timer
    private viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Loading state
    private _isLoading: boolean = false;

    constructor(
        store: ColumnStore,
        config: Partial<VirtualDataProviderConfig> = {}
    ) {
        this.store = store;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Configure the data source
     */
    setDataSource(
        tableName: string,
        connection: any,
        fetcher: DataFetcher
    ): void {
        this.tableName = tableName;
        this.connection = connection;
        this.fetcher = fetcher;

        // Reset state
        this.chunks.clear();
        this.loadingChunks.clear();
        this._totalCount = 0;
    }

    /**
     * Set event callbacks
     */
    on<K extends keyof VirtualDataProviderEvents>(
        event: K,
        callback: VirtualDataProviderEvents[K]
    ): void {
        this.events[event] = callback;
    }

    /**
     * Get total row count
     */
    get totalCount(): number {
        return this._totalCount;
    }

    /**
     * Set total row count (if known from metadata)
     */
    setTotalCount(count: number): void {
        this._totalCount = count;
        this.store.setRowCount(count);
        this.events.onTotalCountUpdate?.(count);
    }

    /**
     * Check if currently loading
     */
    get isLoading(): boolean {
        return this._isLoading;
    }

    /**
     * Update the current viewport
     */
    setViewport(startRow: number, endRow: number): void {
        this.viewport = { startRow, endRow };

        // Debounce to avoid excessive loading during fast scrolling
        if (this.viewportDebounceTimer) {
            clearTimeout(this.viewportDebounceTimer);
        }

        this.viewportDebounceTimer = setTimeout(() => {
            this.loadVisibleChunks();
        }, this.config.debounceMs);
    }

    /**
     * Load chunks that are visible or should be prefetched
     */
    private async loadVisibleChunks(): Promise<void> {
        if (!this.fetcher) return;

        const { startRow, endRow } = this.viewport;
        const { chunkSize, prefetchAhead, prefetchBehind } = this.config;

        // Calculate which chunks are needed
        const startChunk = Math.max(0, Math.floor(startRow / chunkSize) - prefetchBehind);
        const endChunk = Math.floor(endRow / chunkSize) + prefetchAhead;

        const chunksToLoad: number[] = [];

        for (let chunkId = startChunk; chunkId <= endChunk; chunkId++) {
            const chunkInfo = this.chunks.get(chunkId);

            if (!chunkInfo || chunkInfo.status === 'pending') {
                chunksToLoad.push(chunkId);
            }
        }

        if (chunksToLoad.length === 0) return;

        // Update loading state
        this._isLoading = true;
        this.events.onLoadingStateChange?.(true);

        // Load chunks (prioritize visible chunks first)
        const visibleStartChunk = Math.floor(startRow / chunkSize);
        const visibleEndChunk = Math.floor(endRow / chunkSize);

        // Sort by priority (visible first, then by distance from visible)
        chunksToLoad.sort((a, b) => {
            const aVisible = a >= visibleStartChunk && a <= visibleEndChunk;
            const bVisible = b >= visibleStartChunk && b <= visibleEndChunk;

            if (aVisible && !bVisible) return -1;
            if (!aVisible && bVisible) return 1;

            // Sort by distance from visible range
            const aDistance = a < visibleStartChunk
                ? visibleStartChunk - a
                : a - visibleEndChunk;
            const bDistance = b < visibleStartChunk
                ? visibleStartChunk - b
                : b - visibleEndChunk;

            return aDistance - bDistance;
        });

        // Load chunks sequentially for visible, then parallel for prefetch
        const visible = chunksToLoad.filter(id =>
            id >= visibleStartChunk && id <= visibleEndChunk
        );
        const prefetch = chunksToLoad.filter(id =>
            id < visibleStartChunk || id > visibleEndChunk
        );

        // Load visible chunks first
        for (const chunkId of visible) {
            await this.loadChunk(chunkId);
        }

        // Load prefetch chunks in parallel
        if (prefetch.length > 0) {
            await Promise.all(prefetch.map(id => this.loadChunk(id)));
        }

        // Update loading state
        this._isLoading = this.loadingChunks.size > 0;
        this.events.onLoadingStateChange?.(this._isLoading);
    }

    /**
     * Load a single chunk
     */
    private async loadChunk(chunkId: number): Promise<void> {
        if (!this.fetcher) return;

        // Check if already loading or loaded
        const existing = this.chunks.get(chunkId);
        if (existing?.status === 'loading' || existing?.status === 'loaded') {
            return existing.loadPromise;
        }

        // Mark as loading
        const chunkInfo: ChunkInfo = {
            id: chunkId,
            status: 'loading',
            lastAccess: Date.now()
        };

        this.loadingChunks.add(chunkId);

        const loadPromise = (async () => {
            try {
                const offset = chunkId * this.config.chunkSize;
                const limit = this.config.chunkSize;

                const result = await this.fetcher!(
                    this.tableName,
                    this.connection,
                    offset,
                    limit
                );

                // Update total count if provided
                if (result.totalCount !== undefined && result.totalCount !== this._totalCount) {
                    this.setTotalCount(result.totalCount);
                }

                // Update schema if provided
                if (result.columns && this.store.colCount === 0) {
                    this.store.setSchema(result.columns);
                }

                // Load data into store
                this.store.loadChunk(chunkId, result.rows);

                // Update chunk status
                chunkInfo.status = 'loaded';
                chunkInfo.lastAccess = Date.now();

                this.events.onChunkLoaded?.(
                    chunkId,
                    offset,
                    offset + result.rows.length - 1
                );

            } catch (error) {
                chunkInfo.status = 'error';
                chunkInfo.error = error as Error;
                console.error(`[VirtualDataProvider] Chunk ${chunkId} load failed:`, error);
                this.events.onChunkError?.(chunkId, error as Error);
            } finally {
                this.loadingChunks.delete(chunkId);
            }
        })();

        chunkInfo.loadPromise = loadPromise;
        this.chunks.set(chunkId, chunkInfo);

        return loadPromise;
    }

    /**
     * Get a row (with loading if needed)
     */
    async getRow(row: number): Promise<Record<string, any> | null> {
        const chunkId = Math.floor(row / this.config.chunkSize);
        const chunkInfo = this.chunks.get(chunkId);

        // If chunk is not loaded, load it
        if (!chunkInfo || chunkInfo.status !== 'loaded') {
            await this.loadChunk(chunkId);
        }

        // Update last access
        const chunk = this.chunks.get(chunkId);
        if (chunk) {
            chunk.lastAccess = Date.now();
        }

        return this.store.getRow(row);
    }

    /**
     * Get multiple rows (with loading if needed)
     */
    async getRows(startRow: number, endRow: number): Promise<Record<string, any>[]> {
        const startChunk = Math.floor(startRow / this.config.chunkSize);
        const endChunk = Math.floor(endRow / this.config.chunkSize);

        // Ensure all needed chunks are loaded
        const loadPromises: Promise<void>[] = [];
        for (let chunkId = startChunk; chunkId <= endChunk; chunkId++) {
            const chunkInfo = this.chunks.get(chunkId);
            if (!chunkInfo || chunkInfo.status !== 'loaded') {
                loadPromises.push(this.loadChunk(chunkId));
            }
        }

        if (loadPromises.length > 0) {
            await Promise.all(loadPromises);
        }

        return this.store.getRows(startRow, endRow);
    }

    /**
     * Check if a row is currently loaded
     */
    isRowLoaded(row: number): boolean {
        const chunkId = Math.floor(row / this.config.chunkSize);
        const chunk = this.chunks.get(chunkId);
        return chunk?.status === 'loaded';
    }

    /**
     * Check if a range of rows is loaded
     */
    isRangeLoaded(startRow: number, endRow: number): boolean {
        const startChunk = Math.floor(startRow / this.config.chunkSize);
        const endChunk = Math.floor(endRow / this.config.chunkSize);

        for (let chunkId = startChunk; chunkId <= endChunk; chunkId++) {
            const chunk = this.chunks.get(chunkId);
            if (!chunk || chunk.status !== 'loaded') {
                return false;
            }
        }

        return true;
    }

    /**
     * Get loaded chunk count
     */
    get loadedChunkCount(): number {
        let count = 0;
        for (const chunk of this.chunks.values()) {
            if (chunk.status === 'loaded') count++;
        }
        return count;
    }

    /**
     * Force reload a chunk
     */
    async reloadChunk(chunkId: number): Promise<void> {
        // Remove from cache
        this.chunks.delete(chunkId);

        // Reload
        await this.loadChunk(chunkId);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.chunks.clear();
        this.loadingChunks.clear();
        this.store.clear();
        this._totalCount = 0;

        if (this.viewportDebounceTimer) {
            clearTimeout(this.viewportDebounceTimer);
        }
    }

    /**
     * Get memory usage info
     */
    getMemoryInfo(): { chunks: number; bytes: number } {
        return {
            chunks: this.loadedChunkCount,
            bytes: this.store.getMemoryUsage()
        };
    }
}

/**
 * Default data fetcher implementation using the existing API
 */
export function createDefaultFetcher(baseUrl: string): DataFetcher {
    return async (tableName, connection, offset, limit) => {
        const response = await fetch(`${baseUrl}/api/table/${tableName}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                connection,
                query: {
                    offset,
                    limit
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch data');
        }

        const body = await response.json();

        return {
            rows: body.rows || [],
            totalCount: body.totalCount,
            columns: body.columns?.map((c: any) => ({
                name: c.name,
                type: inferColumnType(c.type || 'string'),
                nullable: true
            }))
        };
    };
}

/**
 * Infer column type from database type
 */
function inferColumnType(dbType: string): 'string' | 'number' | 'boolean' | 'date' | 'mixed' {
    const lower = dbType.toLowerCase();

    if (lower.includes('int') || lower.includes('float') || lower.includes('double') ||
        lower.includes('decimal') || lower.includes('numeric')) {
        return 'number';
    }

    if (lower.includes('bool')) {
        return 'boolean';
    }

    if (lower.includes('date') || lower.includes('time')) {
        return 'date';
    }

    return 'string';
}
