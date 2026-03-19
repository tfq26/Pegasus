import { db } from '../db/index.js';
import { spaceFiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from './Logger.js';

/**
 * Table Metadata Service ("Table Docs")
 * Handles generation and persistence of table metadata to aid AI understanding.
 */
export class TableMetadataService {
    /**
     * Generate metadata for a table by sampling data and profiling columns.
     * @param {object} adapter - Database adapter
     * @param {string} tableName - Table name
     * @param {Array} columns - Column definitions
     */
    static async generate(adapter, tableName, columns) {
        logger.info(`[TableMetadata] Generating metadata for: ${tableName}`);
        
        const metadata = {
            tableName,
            description: "",
            columns: {},
            samples: {},
            uniqueTerms: new Set(),
            generatedAt: new Date().toISOString()
        };

        for (const col of columns) {
            const colName = col.name;
            const colType = col.type.toLowerCase();
            
            metadata.columns[colName] = {
                type: colType,
                description: col.description || ""
            };

            // Sample unique terms for categorical-friendly columns
            if (this._isCategorical(colName, colType)) {
                try {
                    const sampleQuery = `SELECT DISTINCT "${colName}" FROM "${tableName}" WHERE "${colName}" IS NOT NULL LIMIT 20`;
                    const results = await adapter.query(sampleQuery);
                    const values = results.map(r => r[colName]);
                    
                    metadata.samples[colName] = values;
                    values.forEach(v => {
                        if (v && typeof v === 'string') {
                            metadata.uniqueTerms.add(v.toLowerCase());
                        }
                    });
                } catch (e) {
                    logger.warn(`[TableMetadata] Failed to sample column ${colName}:`, e.message);
                }
            }
        }

        // Convert Set to Array for JSON storage
        metadata.uniqueTerms = Array.from(metadata.uniqueTerms);
        return metadata;
    }

    /**
     * Save metadata for a specific table/file.
     */
    static async saveMetadata(fileId, metadata) {
        try {
            await db.update(spaceFiles)
                .set({ 
                    aiInsights: metadata,
                    updatedAt: new Date()
                })
                .where(eq(spaceFiles.id, fileId));
            return true;
        } catch (e) {
            logger.error(`[TableMetadata] Failed to save metadata for ${fileId}:`, e);
            return false;
        }
    }

    /**
     * Get metadata for a specific table name.
     */
    static async getByTableName(tableName, connectionId) {
        try {
            const file = await db.query.spaceFiles.findFirst({
                where: (files, { and, eq }) => and(
                    eq(files.connectionId, connectionId),
                    eq(files.name, tableName)
                )
            });
            return file?.aiInsights || null;
        } catch (e) {
            logger.error(`[TableMetadata] Failed to get metadata for ${tableName}:`, e);
            return null;
        }
    }

    /**
     * Map a user term to a sampled value using simple fuzzy matching.
     */
    static mapTermToValue(term, metadata) {
        if (!metadata || !metadata.uniqueTerms) return null;
        const lowTerm = term.toLowerCase();
        
        // Direct match
        if (metadata.uniqueTerms.includes(lowTerm)) return lowTerm;
        
        // Synonym mapping (Basic)
        const synonyms = {
            'failed': ['error', 'failure', 'offline', 'crashed', 'down'],
            'healthy': ['online', 'ok', 'active', 'up'],
            'high': ['critical', 'warning', 'maximum'],
        };

        for (const [key, values] of Object.entries(synonyms)) {
            if (lowTerm === key || values.includes(lowTerm)) {
                // Check if any of these exist in the metadata
                const match = [key, ...values].find(v => metadata.uniqueTerms.includes(v));
                if (match) return match;
            }
        }

        return null;
    }

    /**
     * Internal: Checks if a column is likely categorical.
     */
    static _isCategorical(name, type) {
        const categoricalTypes = ['text', 'string', 'varchar', 'char'];
        const blacklistedNames = ['id', 'uuid', 'password', 'token', 'key', 'email', 'url', 'path', 'description', 'content', 'comment'];
        
        if (!categoricalTypes.includes(type)) return false;
        if (blacklistedNames.some(b => name.toLowerCase().includes(b))) return false;
        
        return true;
    }
}
