import type { CellData } from './types';

/**
 * Source metadata for persistence
 */
export interface SourceMetadata {
    table: string | null;
    connection: any;
    provider: string | null;
    columns: string[];
}

/**
 * Storage format version 2
 */
interface StorageDataV2 {
    version: 2;
    cells: [string, CellData][];
    source: SourceMetadata;
}

/**
 * StorageManager - Handles localStorage persistence for spreadsheet data
 * 
 * Responsibilities:
 * - Save cell data to localStorage
 * - Load cell data from localStorage
 * - Handle storage quota exceeded errors
 * - Support both legacy (v1) and current (v2) storage formats
 */
export class StorageManager {
    private storageKey: string;
    private maxCellsForStorage = 5000; // Skip localStorage for large non-DB sheets

    constructor(storageKey: string) {
        this.storageKey = storageKey;
    }

    /**
     * Save engine state to localStorage
     * @param cells - Map of cell positions to cell data
     * @param source - Source metadata (table name, connection, etc.)
     * @returns true if save succeeded, false if skipped/failed
     */
    save(cells: Map<string, CellData>, source: SourceMetadata): boolean {
        try {
            const data = Array.from(cells.entries());

            // If cells map is empty, remove the localStorage item entirely
            if (data.length === 0) {
                localStorage.removeItem(this.storageKey);
                return true;
            }

            // For large datasets without database backing, skip localStorage persistence
            // This prevents quota issues and improves performance
            if (data.length > this.maxCellsForStorage && !source.table) {
                console.warn('[StorageManager] Skipping localStorage for large non-database sheet');
                return false;
            }

            const storageData: StorageDataV2 = {
                version: 2,
                cells: data,
                source
            };

            localStorage.setItem(this.storageKey, JSON.stringify(storageData));
            return true;
        } catch (e: any) {
            return this.handleStorageError(e, cells, source);
        }
    }

    /**
     * Load engine state from localStorage
     * @returns Object with cells and source metadata, or null if not found
     */
    load(): { cells: Map<string, CellData>; source: SourceMetadata } | null {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return null;

            const parsed = JSON.parse(stored);

            // Check if it's the old format (array) or new format (object)
            if (Array.isArray(parsed)) {
                // V1 format: just cells array
                return {
                    cells: new Map(parsed as [string, CellData][]),
                    source: { table: null, connection: null, provider: null, columns: [] }
                };
            } else if (parsed.version === 2) {
                // V2 format: cells + source metadata
                return {
                    cells: new Map(parsed.cells),
                    source: parsed.source || { table: null, connection: null, provider: null, columns: [] }
                };
            }

            return null;
        } catch (e) {
            console.error('[StorageManager] Failed to load from localStorage:', e);
            return null;
        }
    }

    /**
     * Clear storage for this key
     */
    clear(): void {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.error('[StorageManager] Failed to clear localStorage:', e);
        }
    }

    /**
     * Get all spreadsheet-related storage keys
     */
    static getAllSpreadsheetKeys(): string[] {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('spreadsheet-tab-')) {
                keys.push(key);
            }
        }
        return keys;
    }

    /**
     * Clear all spreadsheet storage except the specified key
     */
    static clearOtherSpreadsheetData(exceptKey: string): number {
        const keysToRemove = this.getAllSpreadsheetKeys().filter(k => k !== exceptKey);
        keysToRemove.forEach(key => localStorage.removeItem(key));
        return keysToRemove.length;
    }

    /**
     * Get estimated storage usage in bytes
     */
    static getStorageUsage(): { used: number; available: number } {
        let used = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key);
                if (value) {
                    // Rough estimate: 2 bytes per character (UTF-16)
                    used += (key.length + value.length) * 2;
                }
            }
        }
        // Most browsers have ~5-10MB limit
        return { used, available: 5 * 1024 * 1024 };
    }

    /**
     * Handle quota exceeded and other storage errors
     */
    private handleStorageError(e: any, cells: Map<string, CellData>, source: SourceMetadata): boolean {
        // Handle quota exceeded error
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn('[StorageManager] localStorage quota exceeded, clearing old data');

            // Clear old spreadsheet tab data to free up space
            const cleared = StorageManager.clearOtherSpreadsheetData(this.storageKey);
            console.log(`[StorageManager] Cleared ${cleared} old spreadsheet entries`);

            // Try saving again after cleanup
            try {
                const data = Array.from(cells.entries());
                const storageData: StorageDataV2 = {
                    version: 2,
                    cells: data,
                    source
                };
                localStorage.setItem(this.storageKey, JSON.stringify(storageData));
                console.log('[StorageManager] Successfully saved after cleanup');
                return true;
            } catch (e2) {
                console.error('[StorageManager] Still failed after cleanup:', e2);
                return false;
            }
        } else {
            console.error('[StorageManager] Failed to save to localStorage:', e);
            return false;
        }
    }
}
