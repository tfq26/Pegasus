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
        const { activeTable, adHocSchema, userMessage } = options;

        console.log(`[DataContext] Building context for user ${userId}, conn: ${connectionId}`);

        // 1. Resolve Connection
        let connRow = null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (connectionId && connectionId !== 'undefined' && connectionId !== 'null' && connectionId !== 'local' && connectionId !== 'connection:local') {
            if (!connectionId.startsWith('system:') && uuidRegex.test(connectionId)) {
                connRow = await db.query.connections.findFirst({
                    where: eq(connections.id, connectionId)
                });
            }
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

        let normalizedSchema = {
            tables: [],
            detailedSchema: {},
            mappings: { tables: {}, columns: {} },
            sourceRegistry: {}, // Unified registry for all sources
            semanticContext: { knowledgeBase: [], sourceInsights: {} },
            unloadedResources: options.unloadedResources || []
        };
        let adapter = null;
        const extraAdapters = [];
        const resourceToAdapter = {};
        const resourceToProvider = {};

        // Helper to analyze
        const analyzeConnection = async (targetAdapter, targetProvider, isActive, metadata = {}) => {
            try {
                await targetAdapter.connect();
                console.log(`[DataContext] Analyzing ${isActive ? 'active' : 'extra'} connection (${targetProvider})...`);
                const result = await ConnectionAnalyzer.analyze(targetAdapter, targetProvider, isActive ? activeTable : null, metadata.userMessage);

                // Determine structure type
                let structureType = 'STRUCTURED';
                if (['duckdb', 'sqlite'].includes(targetProvider.toLowerCase())) structureType = 'SEMI_STRUCTURED';
                if (metadata.type === 'note') structureType = 'UNSTRUCTURED';

                // Merge Results
                normalizedSchema.tables = [...new Set([...normalizedSchema.tables, ...result.normalizedSchema.tables])];
                Object.assign(normalizedSchema.detailedSchema, result.normalizedSchema.detailedSchema);

                // Populate Registry
                result.normalizedSchema.tables.forEach(t => {
                    normalizedSchema.sourceRegistry[t] = {
                        name: t,
                        origin: metadata.name || targetProvider,
                        type: structureType,
                        provider: targetProvider,
                        id: metadata.id || 'primary'
                    };
                });

                // Populate AI Insights
                if (metadata.aiInsights && metadata.aiInsights.length > 0) {
                    result.normalizedSchema.tables.forEach(t => {
                        normalizedSchema.semanticContext.sourceInsights[t] = metadata.aiInsights;
                    });
                }

                if (result.normalizedSchema.mappings) {
                    Object.assign(normalizedSchema.mappings.tables, result.normalizedSchema.mappings.tables || {});
                    Object.assign(normalizedSchema.mappings.columns, result.normalizedSchema.mappings.columns || {});
                }

                // Routing Maps: Populate with all possible variants for robust lookup
                result.normalizedSchema.tables.forEach(t => {
                    const slug = t.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const underscoreSlug = t.toLowerCase().replace(/[^a-z0-9_]/g, '');

                    resourceToAdapter[t] = targetAdapter;
                    resourceToAdapter[slug] = targetAdapter;
                    resourceToAdapter[underscoreSlug] = targetAdapter;

                    resourceToProvider[t] = targetProvider;
                    resourceToProvider[slug] = targetProvider;
                    resourceToProvider[underscoreSlug] = targetProvider;

                    // If it was a file, register the title slug too
                    if (metadata.name) {
                        const titleSlug = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        resourceToAdapter[titleSlug] = targetAdapter;
                        resourceToProvider[titleSlug] = targetProvider;
                    }
                });

                // Also register real table names from mappings to support direct querying of raw tables
                if (result.normalizedSchema.mappings?.tables) {
                    Object.entries(result.normalizedSchema.mappings.tables).forEach(([norm, realName]) => {
                        const realSlug = realName.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const realUnderscoreSlug = realName.toLowerCase().replace(/[^a-z0-9_]/g, '');

                        resourceToAdapter[realName] = targetAdapter;
                        resourceToAdapter[realSlug] = targetAdapter;
                        resourceToAdapter[realUnderscoreSlug] = targetAdapter;

                        resourceToProvider[realName] = targetProvider;
                        resourceToProvider[realSlug] = targetProvider;
                        resourceToProvider[realUnderscoreSlug] = targetProvider;
                    });
                }

                // DEBUG: Log registry entries for verification
                const sampleTables = result.normalizedSchema.tables.slice(0, 3);
                console.log(`[DataContext] Registry check for ${targetProvider}:`);
                sampleTables.forEach(t => {
                    console.log(` - Table: ${t} -> Origin: '${normalizedSchema.sourceRegistry[t]?.origin}', ID: ${normalizedSchema.sourceRegistry[t]?.id}`);
                });

            } catch (e) {
                console.warn(`[DataContext] Analysis failed for ${targetProvider}:`, e.message);
            }
        };

        // 3. Initialize Active Adapter
        if (provider === 'local' && connRow.is_virtual) {
            if (adHocSchema) {
                normalizedSchema.detailedSchema[activeTable] = adHocSchema;
                normalizedSchema.sourceRegistry[activeTable] = {
                    name: activeTable,
                    origin: 'Ad-hoc Schema',
                    type: 'STRUCTURED',
                    provider: 'local',
                    id: 'ad-hoc'
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
                await analyzeConnection(adapter, provider, true, {
                    name: connRow.name,
                    id: connRow.id,
                    aiInsights: connRow.aiInsights,
                    userMessage
                });
            }
        }

        // 4. OneContext Integration (if prompted/needed, passed via options? Or we resolve here?)
        // The chat.js logic resolves OneContext BEFORE calling this, usually. 
        // But if we want to encapsulate logic...
        // Let's allow passing resolvedResources if already resolved.
        // 4. OneContext Integration (Databases, Files, Notes)
        const allResolved = options.resolvedResources || [];
        const analysisPromises = [];

        for (const meta of allResolved) {
            // Avoid re-analyzing the primary connection
            if (meta.id === connectionId && meta.type === 'database') continue;

            if (meta.type === 'note') {
                // 1. Register UNSTRUCTURED note in registry
                const noteName = meta.title || meta.name || 'Untitled Note';
                const normName = noteName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const slug = noteName.toLowerCase().replace(/[^a-z0-9]/g, '');

                const noteRegistryEntry = {
                    name: noteName,
                    origin: 'User Note',
                    type: 'UNSTRUCTURED',
                    provider: 'notes',
                    id: meta.id
                };

                normalizedSchema.sourceRegistry[normName] = noteRegistryEntry;
                normalizedSchema.sourceRegistry[slug] = noteRegistryEntry;
                normalizedSchema.sourceRegistry[noteName] = noteRegistryEntry;

                // 2. Inject into Knowledge Base (System Prompt)
                if (meta.content) {
                    if (!normalizedSchema.semanticContext.knowledgeBase) {
                        normalizedSchema.semanticContext.knowledgeBase = [];
                    }
                    normalizedSchema.semanticContext.knowledgeBase.push({
                        id: meta.id,
                        source: noteName,
                        content: meta.content
                    });
                }
                continue;
            }

            if (meta.type === 'database' || meta.type === 'file') {
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
                    analysisPromises.push(analyzeConnection(otherAdapter, otherProvider, false, {
                        name: meta.name || meta.title,
                        id: meta.id,
                        type: meta.type,
                        aiInsights: meta.aiInsights,
                        userMessage
                    }));
                }
            }
        }

        if (analysisPromises.length > 0) {
            await Promise.all(analysisPromises);
        }

        // 5. System Injection: OrionMetrics (Cosmos DB)
        // If system checks are healthy, we auto-inject the metrics table for AI visibility
        if (process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY) {
            try {
                const { CosmosAdapter } = await import('../../adapters/cosmosAdapter.js');
                const metricsAdapter = new CosmosAdapter({
                    endpoint: process.env.COSMOS_ENDPOINT,
                    key: process.env.COSMOS_KEY,
                    database: 'PegasusLive',
                    container: 'OrionMetrics'
                });

                // Analyze this system connection
                await analyzeConnection(metricsAdapter, 'cosmosdb', false, {
                    name: 'System Metrics',
                    id: 'system:orion_metrics',
                    type: 'database',
                    aiInsights: [
                        'Contains CPU usage, memory stats, and health metrics for app servers',
                        'Columns: serverId (string), serverName (string), serverType (string), status (string: online/offline), cpuPercent (number), memoryPercent (number), errorMessage (string), timestamp (datetime)',
                        'To query a specific server: WHERE serverName = \'App server 2\' or WHERE serverId = \'app-server-2\'',
                        'To get latest metrics: ORDER BY timestamp DESC LIMIT 10',
                        'Example: SELECT * FROM OrionMetrics WHERE serverName = \'App server 2\' ORDER BY timestamp DESC LIMIT 10'
                    ]
                });

                // Specifically register 'OrionMetrics' as a resource
                extraAdapters.push(metricsAdapter);

                // Ensure it's reachable by simple name
                resourceToAdapter['OrionMetrics'] = metricsAdapter;
                resourceToAdapter['orionmetrics'] = metricsAdapter;
                resourceToProvider['OrionMetrics'] = 'cosmosdb';
                resourceToProvider['orionmetrics'] = 'cosmosdb';

                console.log('[DataContext] Injected System: OrionMetrics (Cosmos DB)');
            } catch (e) {
                console.warn('[DataContext] Failed to inject OrionMetrics:', e.message);
            }
        }

        // 6. Populate Descriptions (Semantic Registry)
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

        // 6. Minimal Semantic Spark (For generic headers)
        try {
            const sparkPromises = [];
            for (const tableName of normalizedSchema.tables) {
                const schema = normalizedSchema.detailedSchema[tableName];
                const hasGenericHeaders = schema?.some(c => (/^field[0-9]+$/i.test(c.name) || /^column_[0-9]+$/i.test(c.name) || /^[A-Z]$/.test(c.name)));

                if (hasGenericHeaders) {
                    const targetAdapter = resourceToAdapter[tableName] || adapter;
                    const targetProvider = resourceToProvider[tableName] || provider;
                    if (targetAdapter) {
                        const realName = normalizedSchema.mappings?.tables?.[tableName] || tableName;
                        sparkPromises.push((async () => {
                            const samples = await targetAdapter.query(`SELECT * FROM "${realName}" LIMIT 3`);
                            if (samples?.length > 0) {
                                if (!normalizedSchema.semanticContext.samples) normalizedSchema.semanticContext.samples = {};
                                normalizedSchema.semanticContext.samples[tableName] = samples;
                            }
                        })());
                    }
                }
            }
            if (sparkPromises.length > 0) await Promise.all(sparkPromises);
        } catch (e) { /* Ignore - non-critical */ }

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
