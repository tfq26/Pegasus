import { db } from '../db/index.js';
import { connections, files, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { adapters } from '../../adapters/index.js';
import { ConnectionAnalyzer } from './ConnectionAnalyzer.js';
import { OneContext } from './OneContext.js';

export class DataContextService {
    /**
     * Build a complete context for AI generation.
     * Handles connection resolution, schema normalization, and semantic context injection.
     * 
     * @param {string} userId 
     * @param {string} connectionId (Optional)
     * @param {object} options { activeTable, adHocSchema }
     * @returns {object} { normalizedSchema, adapter, extraAdapters, resourceToAdapter, resourceToProvider }
     */
    static async buildContext(userId, connectionId, options = {}) {
        const { activeTable, adHocSchema } = options;

        console.log(`[DataContext] Building context for user ${userId}, conn: ${connectionId}`);

        // 1. Resolve Connection
        let connRow = null;
        if (connectionId && connectionId !== 'undefined' && connectionId !== 'null' && connectionId !== 'local') {
            connRow = await db.query.connections.findFirst({
                where: eq(connections.id, connectionId)
            });
        }

        // Handle local/virtual
        if (!connRow && connectionId === 'connection:local') {
            connRow = { type: 'local', provider: 'local', config: {}, is_virtual: true };
        }
        if (!connRow && (adHocSchema || (options.resolvedResources && options.resolvedResources.length > 0))) {
            connRow = { type: 'local', provider: 'local', config: {}, is_virtual: true };
        }

        if (!connRow) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        // 2. Resolve Config & Adapter
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config || {};
        let provider = connRow.type || connRow.provider || 'local';

        // Infer provider if missing but config exists
        if (provider === 'local' && !connRow.is_virtual && config) { // 'local' might be placeholder
            const keys = Object.keys(config).filter(k => ['mongodb', 'mysql', 'kusto', 'sqlite', 'postgres', 'duckdb'].includes(k.toLowerCase()));
            if (keys.length > 0) provider = keys[0];
        }

        let adapterConfig = config[provider] || config[provider?.toLowerCase()];
        if (!adapterConfig || Object.keys(adapterConfig).length === 0) {
            if (config.path || config.database || config.host) {
                adapterConfig = config;
            }
        }

        let normalizedSchema = { tables: [], detailedSchema: {}, mappings: { tables: {}, columns: {} } };
        let adapter = null;
        const extraAdapters = [];
        const resourceToAdapter = {};
        const resourceToProvider = {};

        // Helper to analyze
        const analyzeConnection = async (targetAdapter, targetProvider, isActive) => {
            try {
                await targetAdapter.connect();
                console.log(`[DataContext] Analyzing ${isActive ? 'active' : 'extra'} connection (${targetProvider})...`);
                const result = await ConnectionAnalyzer.analyze(targetAdapter, targetProvider, isActive ? activeTable : null);

                // Merge Results
                normalizedSchema.tables = [...new Set([...normalizedSchema.tables, ...result.normalizedSchema.tables])];
                Object.assign(normalizedSchema.detailedSchema, result.normalizedSchema.detailedSchema);
                if (result.normalizedSchema.mappings) {
                    Object.assign(normalizedSchema.mappings.tables, result.normalizedSchema.mappings.tables || {});
                    Object.assign(normalizedSchema.mappings.columns, result.normalizedSchema.mappings.columns || {});
                }

                // Routing Maps
                result.normalizedSchema.tables.forEach(t => {
                    const slug = t.toLowerCase().replace(/[^a-z0-9]/g, '');
                    resourceToAdapter[t] = targetAdapter;
                    resourceToAdapter[slug] = targetAdapter;
                    resourceToProvider[t] = targetProvider;
                    resourceToProvider[slug] = targetProvider;
                });
            } catch (e) {
                console.warn(`[DataContext] Analysis failed for ${targetProvider}:`, e.message);
            }
        };

        // 3. Initialize Active Adapter
        if (provider === 'local' && connRow.is_virtual) {
            if (adHocSchema) {
                normalizedSchema = {
                    tables: [activeTable],
                    detailedSchema: { [activeTable]: adHocSchema },
                    mappings: { tables: {}, columns: {} }
                };
                resourceToAdapter[activeTable] = null;
            }
        } else {
            const AdapterClass = adapters[provider] || adapters[provider?.toLowerCase()];
            if (AdapterClass) {
                let finalAdapterConfig = adapterConfig || {};
                // Fallback
                if (!finalAdapterConfig.path && !finalAdapterConfig.database && config.path) {
                    finalAdapterConfig = config;
                }
                adapter = new AdapterClass(finalAdapterConfig);
                await analyzeConnection(adapter, provider, true);
            }
        }

        // 4. OneContext Integration (if prompted/needed, passed via options? Or we resolve here?)
        // The chat.js logic resolves OneContext BEFORE calling this, usually. 
        // But if we want to encapsulate logic...
        // Let's allow passing resolvedResources if already resolved.
        // 4. OneContext Integration
        const otherDbResources = (options.resolvedResources || []).filter(r => (r.type === 'database' || r.type === 'file') && r.id !== connectionId);

        for (const meta of otherDbResources) {
            let otherProvider = meta.provider || meta.type;
            if (meta.type === 'file' && !meta.provider) otherProvider = 'duckdb';

            const OtherAdapterClass = adapters[otherProvider] || adapters[otherProvider?.toLowerCase()];
            if (OtherAdapterClass) {
                let otherCfg = typeof meta.config === 'string' ? JSON.parse(meta.config) : meta.config || {};

                // For files found via OneContext discovery, map storageId to path
                if (meta.type === 'file' && !otherCfg.path) {
                    const sid = meta.storage_id || meta.storageId;
                    if (sid) {
                        otherCfg = { path: sid, ...otherCfg };
                    }
                }

                const nestedCfg = otherCfg[otherProvider] || otherCfg[otherProvider?.toLowerCase()] || otherCfg;

                const otherAdapter = new OtherAdapterClass(nestedCfg, userId);
                extraAdapters.push(otherAdapter);
                await analyzeConnection(otherAdapter, otherProvider, false);
            }
        }

        // 5. Populate Descriptions (Semantic Registry)
        try {
            const userFiles = await db.select({ filename: files.filename, description: files.description })
                .from(files)
                .where(eq(files.userId, userId));

            // Merge titles from resolvedResources (for unsaved/ad-hoc files)
            const metaDescriptions = (options.resolvedResources || []).reduce((acc, r) => {
                if (r.title) {
                    const base = r.title.split('.').slice(0, -1).join('.');
                    acc[base.toLowerCase().replace(/[^a-z0-9]/g, '_')] = r.title;
                    if (r.description) acc[base.toLowerCase().replace(/[^a-z0-9]/g, '_')] = r.description;
                }
                return acc;
            }, {});

            normalizedSchema.tableDescriptions = normalizedSchema.tableDescriptions || {};

            normalizedSchema.tables.forEach(t => {
                const lowTable = t.toLowerCase();

                // Check user files from DB
                userFiles.forEach(f => {
                    const baseName = f.filename.split('.').slice(0, -1).join('.');
                    const slug = baseName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    if (lowTable.includes(slug)) {
                        normalizedSchema.tableDescriptions[t] = f.description || f.filename;
                    }
                });

                // Check meta from resolved resources
                Object.entries(metaDescriptions).forEach(([slug, desc]) => {
                    if (lowTable.includes(slug)) {
                        normalizedSchema.tableDescriptions[t] = desc;
                    }
                });
            });
        } catch (e) {
            console.warn("[DataContext] Failed to fetch descriptions:", e);
        }

        return {
            provider,
            adapter,
            normalizedSchema,
            extraAdapters,
            resourceToAdapter,
            resourceToProvider
        };
    }
}
