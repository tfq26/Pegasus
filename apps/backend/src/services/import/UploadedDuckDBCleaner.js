import { eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { spaceFiles } from '../../db/schema.js';
import { TableCleanerService } from './TableCleanerService.js';
import { StructuredDuckDBImportService } from './StructuredDuckDBImportService.js';

function sanitizeIdentifier(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class UploadedDuckDBCleaner {
    static async getUploadFile(connectionPath) {
        if (!connectionPath) return null;
        return await db.query.spaceFiles.findFirst({
            where: or(
                eq(spaceFiles.storagePath, connectionPath),
                eq(spaceFiles.storageId, connectionPath),
                sql`${spaceFiles.parsedSchema} ->> 'duckdb_path' = ${connectionPath}`
            )
        });
    }

    static async resolveConnectionTarget(connectionPath) {
        const uploadFile = await this.getUploadFile(connectionPath);
        if (!uploadFile) {
            return { uploadFile: null, preferredPath: connectionPath };
        }

        const parsedSchema = typeof uploadFile.parsedSchema === 'string'
            ? JSON.parse(uploadFile.parsedSchema)
            : (uploadFile.parsedSchema || {});

        const preferredPath = parsedSchema.duckdb_path || uploadFile.storagePath || connectionPath;
        return {
            uploadFile,
            parsedSchema,
            preferredPath
        };
    }

    static async prepare(adapter, connectionPath, activeTable = null) {
        const uploadFile = await this.getUploadFile(connectionPath);
        if (!uploadFile) {
            return null;
        }

        const parsedSchema = typeof uploadFile.parsedSchema === 'string'
            ? JSON.parse(uploadFile.parsedSchema)
            : (uploadFile.parsedSchema || {});

        const currentTables = await adapter.listCollections();
        const aliasMap = {};

        if (parsedSchema.cleaning?.length) {
            const preferredTables = currentTables.filter((table) => parsedSchema.tables?.includes(table));
            if (preferredTables.length > 0) {
                return {
                    uploadFile,
                    parsedSchema,
                    tableFilter: preferredTables,
                    preferredActiveTable: this.resolvePreferredActiveTable(activeTable, preferredTables, aliasMap),
                    aliasMap
                };
            }
        }

        const shouldGenerateShadowTables = uploadFile.fileType === 'xlsx' || Boolean(parsedSchema.excel_mapping);
        if (!shouldGenerateShadowTables) {
            return null;
        }

        const cleaner = new TableCleanerService();
        const cleanedTables = [];

        for (const rawTableName of currentTables) {
            if (rawTableName.endsWith('__clean')) continue;
            const rows = await adapter.query(`SELECT * FROM "${rawTableName}"`);
            if (!Array.isArray(rows) || rows.length === 0) continue;

            const cleaned = cleaner.cleanDataset({
                tableName: rawTableName,
                rows,
                sourceType: uploadFile.fileType || 'duckdb',
                parsingHints: {
                    excelMapping: parsedSchema.excel_mapping || null,
                    cleaning: parsedSchema.cleaning || null
                }
            });

            for (const table of cleaned.tables) {
                if (!table.rows.length) continue;
                const cleanedName = `${sanitizeIdentifier(table.name || rawTableName)}__clean`;
                await StructuredDuckDBImportService.importTable(adapter, cleanedName, table.rows, {
                    temporary: true,
                    replace: true
                });
                cleanedTables.push(cleanedName);
                aliasMap[rawTableName] = cleanedName;
                aliasMap[slugify(rawTableName)] = cleanedName;
            }
        }

        if (cleanedTables.length === 0) {
            return null;
        }

        return {
            uploadFile,
            parsedSchema,
            tableFilter: cleanedTables,
            preferredActiveTable: this.resolvePreferredActiveTable(activeTable, cleanedTables, aliasMap),
            aliasMap
        };
    }

    static resolvePreferredActiveTable(activeTable, tables, aliasMap = {}) {
        if (activeTable) {
            const mapped = aliasMap[activeTable] || aliasMap[slugify(activeTable)];
            if (mapped && tables.includes(mapped)) return mapped;
            const direct = tables.find((table) => table.toLowerCase() === String(activeTable).toLowerCase());
            if (direct) return direct;
        }
        return tables[0] || activeTable || null;
    }
}
