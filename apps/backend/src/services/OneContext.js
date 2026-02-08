import { db } from '../db/index.js';
import { files, spaceNotes, connections, spaceFiles, knowledgeChunks, dataSpaces, spacePermissions, connectionWorkspaces } from '../db/schema.js';
import { eq, ilike, or, and, like, sql } from 'drizzle-orm';
import { RAGService } from './ragService.js';
import fs from 'fs';
import path from 'path';

/**
 * OneContext - Universal Context Resolution System
 * 
 * This service acts as the central context provider for AI agents, resolving
 * user queries into actionable resources (files, databases, notes, knowledge chunks).
 * 
 * KEY CAPABILITIES:
 * - Explicit mention parsing (@mentions, !files, #tables, $databases)
 * - Implicit semantic discovery (vector search, keyword matching)
 * - Multi-source context aggregation (personal, shared, workspace)
 * - Space-aware filtering and scoping
 * - Local filesystem integration
 * 
 * ARCHITECTURE:
 * 1. Mention Parsing: Extract explicit references from user text
 * 2. Context Resolution: Convert mentions to database resources
 * 3. Implicit Discovery: Find relevant context without explicit mentions
 * 4. Context Building: Format resources into AI-readable prompt blocks
 */
export class OneContext {
    // Configuration constants
    static NOISE_WORDS = new Set([
        'global', 'market', 'data', 'sales', 'report', 'file',
        'analysis', 'summary', 'compare', 'region', 'total',
        'growth', 'loss', 'gain', 'general', 'overview'
    ]);

    static MIN_QUERY_LENGTH = 10;
    static MIN_WORD_LENGTH = 3;
    static MIN_SLUG_LENGTH = 3;
    static VECTOR_SEARCH_LIMIT = 5;
    static SEMANTIC_SCORE_THRESHOLD = 0.4;
    static MIN_TOKEN_OVERLAP = 2;

    /**
     * Parse text for explicit mentions with support for multiple formats
     * 
     * Supported mention types:
     * - !filename or ![file name]  → Files
     * - #table or #[table name]    → Tables
     * - $database or $[db name]    → Databases
     * - @note or @[note name]      → Notes/Directories
     * 
     * @param {string} text - User input text to parse
     * @returns {Array<{type: string, name: string, token: string}>} Parsed mentions
     * 
     * @example
     * parseMentions("Use !sales.csv and @[demo-data]")
     * // Returns: [{type: 'file', name: 'sales.csv', token: '!sales.csv'}, ...]
     */
    static parseMentions(text) {
        const regex = /(?:^|\s)([!#$@](?:\[[^\]]+\]|[a-zA-Z0-9_\-\.]+))/g;
        const matches = [...text.matchAll(regex)];
        const mentions = [];

        for (const match of matches) {
            const token = match[1];
            const typeChar = token[0];
            let name = token.slice(1);

            // Strip brackets if present: @[demo-data] → demo-data
            if (name.startsWith('[') && name.endsWith(']')) {
                name = name.slice(1, -1);
            }

            let type = 'unknown';
            if (typeChar === '!') type = 'file';
            else if (typeChar === '#') type = 'table';
            else if (typeChar === '$') type = 'database';
            else if (typeChar === '@') type = 'note';
            else if (typeChar === '*') type = 'wildcard';

            mentions.push({ type, name, token });
        }

        return mentions.filter(m => {
            // Ignore technical metadata mentions that aren't real resources
            const isTechnical = m.name.includes('TerminalName') || m.name.includes('ProcessId');
            return !isTechnical;
        });
    }

    /**
     * Resolve context from user query with comprehensive discovery
     * 
     * RESOLUTION STRATEGY:
     * 1. Parse explicit mentions first
     * 2. Resolve mentions to database resources
     * 3. Run implicit discovery (semantic + keyword)
     * 4. Filter by space scope if connectionId provided
     * 5. Deduplicate results
     * 
     * @param {string} text - User query text
     * @param {string} userId - Current user ID
     * @param {string|null} connectionId - Optional connection context for scoping
     * @returns {Promise<Array>} Resolved context resources
     */
    static async resolveContext(text, userId, connectionId = null) {
        const resolved = [];
        const missing = [];
        const resolvedIds = new Set();

        // Resolve space context if connectionId provided
        let spaceId = null;
        if (connectionId) {
            spaceId = await this._resolveSpaceId(connectionId);
        }

        // Step 1: Parse explicit mentions
        const mentions = this.parseMentions(text);

        // Step 2: Implicit database discovery (run early for all queries)
        await this._discoverDatabases(text, userId, spaceId, resolved, resolvedIds);

        // Step 3: Resolve explicit mentions
        for (const mention of mentions) {
            const resource = await this._resolveMention(mention, userId, spaceId);
            if (resource) {
                // Handle array results (e.g., directory scans)
                if (Array.isArray(resource)) {
                    resource.forEach(r => {
                        if (!resolvedIds.has(r.id)) {
                            resolved.push(r);
                            resolvedIds.add(r.id);
                        }
                    });
                } else if (!resolvedIds.has(resource.id)) {
                    resolved.push(resource);
                    resolvedIds.add(resource.id);
                }
            } else {
                missing.push(mention);
            }
        }

        // Step 4: Implicit discovery (only if no explicit mentions)
        if (mentions.length === 0 && text.length >= this.MIN_QUERY_LENGTH) {
            await this._runImplicitDiscovery(text, userId, spaceId, connectionId, resolved, resolvedIds);
        }

        // Step 5: Log resolution summary
        this._logResolutionSummary(resolved, missing, spaceId);

        return resolved;
    }

    /**
     * Resolve spaceId from connectionId
     * @private
     */
    static async _resolveSpaceId(connectionId) {
        try {
            const conn = await db.query.connections.findFirst({
                where: eq(connections.id, connectionId)
            });
            return conn?.spaceId || null;
        } catch (e) {
            console.warn('[OneContext] Failed to resolve spaceId:', e.message);
            return null;
        }
    }

    /**
     * Resolve a single mention to database resource
     * @private
     */
    static async _resolveMention(mention, userId, spaceId) {
        switch (mention.type) {
            case 'file':
                return await this._resolveFile(mention, userId);
            case 'database':
                return await this._resolveDatabase(mention, userId);
            case 'note':
            case 'unknown':
                return await this._resolveNoteOrDirectory(mention, userId, spaceId);
            case 'table':
                // Tables are resolved via database connections
                return await this._resolveTable(mention, userId, spaceId);
            case 'wildcard':
                return await this._resolveWildcard(mention, userId, spaceId);
            default:
                return null;
        }
    }

    /**
     * Resolve file mention
     * @private
     */
    static async _resolveFile(mention, userId) {
        // Handle local file paths (e.g., !demo-data/sales.csv)
        if (mention.name.startsWith('demo-data/')) {
            return {
                id: `local-${mention.name}`,
                name: mention.name.split('/').pop(),
                type: 'file',
                provider: 'duckdb',
                config: { path: `${process.cwd()}/${mention.name}` },
                is_virtual: true,
                method: 'explicit'
            };
        }

        // Global Wildcard: !*
        if (mention.name === '*') {
            const allFiles = await db.select()
                .from(files)
                .where(eq(files.userId, userId))
                .limit(20); // Safety limit
            return allFiles.map(f => ({ ...f, type: 'file', source: 'files', method: 'explicit' }));
        }

        // Search database for file
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mention.name);
        const whereClause = isUUID
            ? or(eq(files.id, mention.name), ilike(files.filename, `%${mention.name}%`))
            : ilike(files.filename, `%${mention.name}%`);

        const fileResults = await db.select()
            .from(files)
            .where(and(eq(files.userId, userId), whereClause))
            .limit(1);

        if (fileResults.length) {
            return { ...fileResults[0], type: 'file', source: 'files', method: 'explicit' };
        }

        return null;
    }

    /**
     * Resolve wildcard mention (*any, *visualization, *latest, *schema)
     * @private
     */
    static async _resolveWildcard(mention, userId, spaceId) {
        const name = mention.name?.toLowerCase();

        // 1. System Metrics Shortcut
        if (name === 'metrics' || name === 'orion') {
            return {
                id: 'system:orion_metrics',
                name: 'Orion System Metrics',
                provider: 'cosmosdb',
                type: 'database',
                method: 'explicit',
                aiInsights: ['Contains real-time CPU and memory metrics for Orion servers.']
            };
        }

        // 2. Schema Explorer Shortcut
        if (name === 'schema') {
            return {
                id: 'system:schema_explorer',
                name: 'Data Schema Explorer',
                type: 'note',
                content: 'This resource provides metadata about all available connections and tables for the user.',
                method: 'explicit'
            };
        }

        // 3. Command Modifiers (Handled by IntentClassifier, but we can tag them for clarity)
        if (['visualization', 'query', 'analysis', 'summary'].includes(name)) {
            return {
                id: `cmd:${name}`,
                name: `Mode: ${name.toUpperCase()}`,
                type: 'instruction',
                instruction: `FORCE_INTENT_${name.toUpperCase()}`,
                method: 'explicit'
            };
        }

        // 4. Grouping Wildcards
        if (name === 'all') {
            // Resolve to all tables in current space? Or just a hint
            return { id: 'group:all', name: 'All Resources', type: 'collection', method: 'explicit' };
        }

        return null;
    }

    /**
     * Resolve database mention
     * @private
     */
    static async _resolveDatabase(mention, userId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mention.name);
        const whereClause = isUUID
            ? or(eq(connections.id, mention.name), ilike(connections.name, `%${mention.name}%`))
            : ilike(connections.name, `%${mention.name}%`);

        const connResults = await db.select()
            .from(connections)
            .where(and(eq(connections.userId, userId), whereClause))
            .limit(1);

        if (connResults.length) {
            return {
                ...connResults[0],
                provider: connResults[0].type,
                type: 'database',
                method: 'explicit'
            };
        }

        // Global Wildcard: $*
        if (mention.name === '*') {
            const allConns = await db.select()
                .from(connections)
                .where(eq(connections.userId, userId));
            return allConns.map(c => ({
                ...c,
                provider: c.type,
                type: 'database',
                method: 'explicit'
            }));
        }

        return null;
    }

    /**
     * Resolve table mention (searches within database connections)
     * @private
     */
    static async _resolveTable(mention, userId, spaceId) {
        // For table mentions, we need to find databases that contain this table
        // This requires querying connection schemas (implementation depends on your schema storage)
        const query = db.select().from(connections);

        if (spaceId) {
            query.where(and(eq(connections.userId, userId), eq(connections.spaceId, spaceId)));
        } else {
            query.where(eq(connections.userId, userId));
        }

        const allConnections = await query;

        // Global Wildcard: #* (All tables across all connections)
        if (mention.name === '*') {
            const results = [];
            for (const conn of allConnections) {
                const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
                const schema = config?.schema || config?.tables || [];
                schema.forEach(table => {
                    results.push({
                        ...conn,
                        provider: conn.type,
                        type: 'database',
                        targetTable: table.name || table,
                        method: 'explicit'
                    });
                });
            }
            return results.slice(0, 30); // Safety limit
        }

        // Search for table in connection metadata
        for (const conn of allConnections) {
            const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
            const schema = config?.schema || config?.tables || [];

            // Check if this connection contains the table
            if (schema.some(table => {
                const tableName = (table.name || table).toLowerCase();
                const mentionName = mention.name.toLowerCase();
                const tableSlug = tableName.replace(/[^a-z0-9]/g, '');
                const mentionSlug = mentionName.replace(/[^a-z0-9]/g, '');

                // Direct match or slug match
                if (tableName === mentionName || tableSlug === mentionSlug) return true;

                // Fuzzy match: if mention contains the table name slug (handles extensions/temp suffixes)
                if (mentionSlug.includes(tableSlug) && tableSlug.length > 5) return true;
                if (tableSlug.includes(mentionSlug) && mentionSlug.length > 5) return true;

                return false;
            })) {
                return {
                    ...conn,
                    provider: conn.type,
                    type: 'database',
                    targetTable: mention.name,
                    method: 'explicit'
                };
            }
        }

        return null;
    }

    /**
     * Resolve note or local directory mention
     * @private
     */
    static async _resolveNoteOrDirectory(mention, userId, spaceId) {
        const resources = [];

        // Try local directory first
        const localResources = await this._scanLocalDirectory(mention.name);
        if (localResources.length > 0) {
            return localResources;
        }

        // Search database for notes
        const notesResult = await db.execute(sql`
            SELECT n.id, n.title, n.content, n.preview 
            FROM space_note n
            JOIN data_space s ON n.space_id = s.id
            LEFT JOIN space_permission sp ON s.id = sp.space_id
            WHERE (s.user_id = ${userId} OR sp.user_id = ${userId})
            ${spaceId ? sql`AND n.space_id = ${spaceId}` : sql``}
            AND (n.id::text = ${mention.name} OR n.title ILIKE ${'%' + mention.name + '%'})
            LIMIT 1
        `);

        const notes = Array.isArray(notesResult) ? notesResult : (notesResult.rows || []);
        if (notes.length) {
            return { ...notes[0], type: 'note', method: 'explicit' };
        }

        return null;
    }

    /**
     * Scan local directory for context files
     * @private
     */
    static async _scanLocalDirectory(dirName) {
        const resources = [];

        // Resolve directory path (check CWD, one level up, two levels up)
        let localDirPath = path.resolve(process.cwd(), dirName);

        if (!fs.existsSync(localDirPath)) {
            const upOne = path.resolve(process.cwd(), '..', dirName);
            if (fs.existsSync(upOne)) {
                localDirPath = upOne;
            } else {
                const upTwo = path.resolve(process.cwd(), '../..', dirName);
                if (fs.existsSync(upTwo)) localDirPath = upTwo;
            }
        }

        if (!fs.existsSync(localDirPath) || !fs.statSync(localDirPath).isDirectory()) {
            return resources;
        }

        console.log(`[OneContext] Scanning directory: ${dirName} at ${localDirPath}`);

        // Add glob pattern for data files
        resources.push({
            id: `${dirName}-local-db`,
            name: `${dirName} (Files)`,
            type: 'file',
            provider: 'duckdb',
            config: { path: `${localDirPath}/*.{csv,xlsx,parquet}` },
            is_virtual: true,
            method: 'explicit'
        });

        // Scan for markdown notes
        try {
            const filesInDir = fs.readdirSync(localDirPath);
            for (const fileName of filesInDir) {
                if (fileName.endsWith('.md')) {
                    const filePath = path.join(localDirPath, fileName);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const title = fileName.replace('.md', '');

                    resources.push({
                        id: `local-note-${dirName}-${title}`,
                        title: title,
                        name: title,
                        content: content,
                        type: 'note',
                        source: 'local_file',
                        method: 'explicit'
                    });
                    console.log(`[OneContext] Added local note: ${fileName}`);
                }
            }
        } catch (e) {
            console.warn(`[OneContext] Failed to scan directory: ${e.message}`);
        }

        return resources;
    }

    /**
     * Discover databases through semantic and keyword matching
     * @private
     */
    static async _discoverDatabases(text, userId, spaceId, resolved, resolvedIds) {
        try {
            // Get all user connections (space-scoped if applicable)
            const query = db.select().from(connections);
            if (spaceId) {
                query.where(and(eq(connections.userId, userId), eq(connections.spaceId, spaceId)));
            } else {
                query.where(eq(connections.userId, userId));
            }
            const allConnections = await query;

            const lowerText = text.toLowerCase();

            // Strategy 1: Direct name/alias matching
            for (const conn of allConnections) {
                const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
                const alias = config?.alias || config?.nickname;
                const name = conn.name;

                if (this._matchesConnection(name, alias, lowerText)) {
                    if (!resolvedIds.has(conn.id)) {
                        resolved.push({
                            ...conn,
                            provider: conn.type,
                            type: 'database',
                            method: 'implicit-keyword'
                        });
                        resolvedIds.add(conn.id);
                    }
                }
            }

            // Strategy 2: Token overlap matching
            for (const conn of allConnections) {
                if (resolvedIds.has(conn.id)) continue;

                const name = conn.name;
                if (!name) continue;

                const nameTokens = name.toLowerCase()
                    .split(/[^a-z0-9]+/)
                    .filter(t => t.length > 1 && !this.NOISE_WORDS.has(t));

                const textTokens = new Set(lowerText.split(/[^a-z0-9]+/));
                const matchingTokens = nameTokens.filter(t => textTokens.has(t));

                if (this._meetsTokenOverlapThreshold(nameTokens, matchingTokens)) {
                    resolved.push({
                        ...conn,
                        provider: conn.type,
                        type: 'database',
                        method: 'implicit-token-overlap'
                    });
                    resolvedIds.add(conn.id);
                }
            }

            // Strategy 3: Global scope expansion
            if (spaceId && (lowerText.includes('global') || lowerText.includes('all market') || lowerText.includes('international') || lowerText.includes('market'))) {
                for (const conn of allConnections) {
                    if (resolvedIds.has(conn.id)) continue;

                    const name = conn.name.toLowerCase();
                    if (name.includes('sales') || name.includes('revenue')) {
                        resolved.push({
                            ...conn,
                            provider: conn.type,
                            type: 'database',
                            method: 'implicit-global-scope'
                        });
                        resolvedIds.add(conn.id);
                    }
                }
            }

            // Strategy 4: Vector/Semantic search for connection metadata
            if (spaceId) {
                await this._vectorSearchConnections(text, userId, spaceId, allConnections, resolved, resolvedIds);
            }
        } catch (e) {
            console.warn('[OneContext] Database discovery failed:', e.message);
        }
    }

    /**
     * Check if connection matches query text
     * @private
     */
    static _matchesConnection(name, alias, queryText) {
        if (!name && !alias) return false;

        const checkMatch = (value) => {
            if (!value) return false;
            const lower = value.toLowerCase();
            return !this.NOISE_WORDS.has(lower) && queryText.includes(lower);
        };

        return checkMatch(name) || checkMatch(alias);
    }

    /**
     * Check if token overlap meets threshold for matching
     * @private
     */
    static _meetsTokenOverlapThreshold(nameTokens, matchingTokens) {
        if (nameTokens.length === 0) return false;

        const matchCount = matchingTokens.length;
        const firstTokenMatches = matchingTokens.includes(nameTokens[0]);

        // Single token: must match exactly
        if (nameTokens.length === 1 && matchCount === 1) return true;

        // Multiple tokens: need at least 2 matches
        if (nameTokens.length > 1 && matchCount >= this.MIN_TOKEN_OVERLAP) return true;

        // First token match with significant length (handles "US", "UK", etc.)
        if (firstTokenMatches && nameTokens[0].length >= 2) return true;

        return false;
    }

    /**
     * Vector search for connection metadata
     * @private
     */
    static async _vectorSearchConnections(text, userId, spaceId, allConnections, resolved, resolvedIds) {
        try {
            const vectorResults = await RAGService.vectorSearch(
                text,
                userId,
                spaceId,
                this.VECTOR_SEARCH_LIMIT,
                'gemini'
            );

            for (const res of vectorResults) {
                if (res.metadata?.type === 'connection_metadata' && res.metadata?.connectionId) {
                    const connId = res.metadata.connectionId;
                    const targetConn = allConnections.find(c => c.id === connId);

                    if (targetConn && !resolvedIds.has(connId) && res.score > this.SEMANTIC_SCORE_THRESHOLD) {
                        resolved.push({
                            ...targetConn,
                            provider: targetConn.type,
                            type: 'database',
                            method: 'semantic',
                            semanticScore: res.score
                        });
                        resolvedIds.add(connId);
                    }
                }
            }
        } catch (e) {
            console.warn('[OneContext] Vector search for connections failed:', e.message);
        }
    }

    /**
     * Run comprehensive implicit discovery
     * @private
     */
    static async _runImplicitDiscovery(text, userId, spaceId, connectionId, resolved, resolvedIds) {
        console.log('[OneContext] Running implicit discovery...');

        // A. Vector search for knowledge chunks
        await this._searchKnowledgeChunks(text, userId, spaceId, resolved);

        // B. Implicit file discovery
        await this._discoverFiles(text, userId, spaceId, connectionId, resolved, resolvedIds);

        // C. Implicit note discovery
        await this._discoverNotes(text, userId, spaceId, resolved, resolvedIds);
    }

    /**
     * Search knowledge base chunks via vector similarity
     * @private
     */
    static async _searchKnowledgeChunks(text, userId, spaceId, resolved) {
        try {
            const chunks = await RAGService.vectorSearch(text, userId, spaceId, this.VECTOR_SEARCH_LIMIT)
                .catch(e => {
                    console.warn('[OneContext] Vector search failed:', e.message);
                    return [];
                });

            console.log(`[OneContext] Vector search returned ${chunks.length} chunks`);

            for (const chunk of chunks) {
                // Filter by space if applicable
                if (!spaceId || chunk.metadata?.spaceId === spaceId) {
                    resolved.push({
                        type: 'chunk',
                        content: chunk.content,
                        metadata: chunk.metadata,
                        score: chunk.score
                    });
                } else {
                    console.log(`[OneContext] Chunk filtered: space mismatch`);
                }
            }
        } catch (e) {
            console.warn('[OneContext] Knowledge chunk search failed:', e.message);
        }
    }

    /**
     * Discover files through fuzzy matching
     * @private
     */
    static async _discoverFiles(text, userId, spaceId, connectionId, resolved, resolvedIds) {
        try {
            const filesData = [];

            // Collect files from all sources
            if (!spaceId) {
                const pFiles = await db.select({
                    id: files.id,
                    filename: files.filename,
                    storageId: files.storageId
                }).from(files).where(eq(files.userId, userId));
                filesData.push(...pFiles);
            }

            // Space files
            const sharedFilesQuery = db.select({
                id: spaceFiles.id,
                filename: spaceFiles.filename,
                storageId: spaceFiles.storageId,
                spaceId: spaceFiles.spaceId
            })
                .from(spaceFiles)
                .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
                .leftJoin(spacePermissions, eq(dataSpaces.id, spacePermissions.spaceId));

            if (spaceId) {
                sharedFilesQuery.where(and(
                    eq(spaceFiles.spaceId, spaceId),
                    or(eq(dataSpaces.userId, userId), eq(spacePermissions.userId, userId))
                ));
            } else {
                sharedFilesQuery.where(or(
                    eq(dataSpaces.userId, userId),
                    eq(spacePermissions.userId, userId)
                ));
            }

            const sharedFiles = await sharedFilesQuery;
            filesData.push(...sharedFiles);

            // Workspace files
            await this._collectWorkspaceFiles(userId, spaceId, connectionId, filesData);

            // Match files against query
            const queryWords = this._extractQueryWords(text);
            for (const f of filesData) {
                // Skip temporary conversion files
                if (f.filename && f.filename.endsWith('.temp.csv')) continue;

                if (this._matchesFile(f, text, queryWords) && !resolvedIds.has(f.id)) {
                    resolved.push({ ...f, type: 'file', method: 'implicit' });
                    resolvedIds.add(f.id);
                    console.log(`[OneContext] Matched file: ${f.filename}`);
                }
            }
        } catch (e) {
            console.warn('[OneContext] File discovery failed:', e.message);
        }
    }

    /**
     * Collect files from workspace tabs
     * @private
     */
    static async _collectWorkspaceFiles(userId, spaceId, connectionId, filesData) {
        try {
            const workspaces = await db.select()
                .from(connectionWorkspaces)
                .where(eq(connectionWorkspaces.userId, userId));

            for (const ws of workspaces) {
                const tabs = ws.workspaceData?.tabs || ws.workspaceData?.config?.tabs || [];

                for (const tab of tabs) {
                    const conn = tab.data?.source?.connection ||
                        tab.config?.connection ||
                        tab.connection ||
                        tab.data?.connection;

                    // Filter by connection if specified
                    if (connectionId && conn?.id && conn.id !== connectionId) continue;

                    const source = tab.data?.source || tab.source;
                    const path = conn?.path || conn?.config?.path || source?.path;
                    const type = conn?.type || source?.type || source?.provider || conn?.provider;
                    const name = conn?.name || tab.label || source?.table || source?.name;

                    if (path || type === 'duckdb') {
                        filesData.push({
                            id: tab.id || conn?.id || `ws-tab-${Math.random()}`,
                            filename: name || 'Untitled File',
                            storageId: path,
                            provider: type === 'duckdb' ? 'duckdb' : undefined,
                            source: 'workspace',
                            spaceId: spaceId
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('[OneContext] Workspace file collection failed:', e.message);
        }
    }

    /**
     * Extract meaningful query words (filter noise words)
     * @private
     */
    static _extractQueryWords(text) {
        return text.toLowerCase()
            .split(/[^a-z0-9]/)
            .filter(w => w.length >= this.MIN_WORD_LENGTH && !this.NOISE_WORDS.has(w));
    }

    /**
     * Check if file matches query
     * @private
     */
    static _matchesFile(file, queryText, queryWords) {
        let filename = (file.filename || '').toLowerCase();

        // Strip UUID prefix if present
        if (/^[0-9a-f-]{36}-/.test(filename)) {
            filename = filename.slice(37);
        }

        const baseName = filename.indexOf('.') !== -1
            ? filename.split('.').slice(0, -1).join('.')
            : filename;

        const slugFile = baseName.replace(/[^a-z0-9]/g, '');
        const slugQuery = queryText.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Direct slug match
        if (slugFile.length >= this.MIN_SLUG_LENGTH && !this.NOISE_WORDS.has(slugFile)) {
            if (slugQuery.includes(slugFile) || slugFile.includes(slugQuery)) return true;
        }

        // Word overlap
        if (queryWords.length > 0 && queryWords.some(qw => baseName.includes(qw))) {
            return true;
        }

        return false;
    }

    /**
     * Discover notes through fuzzy matching
     * @private
     */
    static async _discoverNotes(text, userId, spaceId, resolved, resolvedIds) {
        try {
            const notesRes = await db.execute(sql`
                SELECT n.id, n.title, n.content, n.preview 
                FROM space_note n
                JOIN data_space s ON n.space_id = s.id
                LEFT JOIN space_permission sp ON s.id = sp.space_id
                WHERE (s.user_id = ${userId} OR sp.user_id = ${userId})
                ${spaceId ? sql`AND n.space_id = ${spaceId}` : sql``}
            `);

            const allNotes = Array.isArray(notesRes) ? notesRes : (notesRes.rows || []);
            const queryWords = this._extractQueryWords(text);
            const slugQuery = text.toLowerCase().replace(/[^a-z0-9]/g, '');

            for (const note of allNotes) {
                if (this._matchesNote(note, slugQuery, queryWords) &&
                    !resolvedIds.has(note.id)) {
                    resolved.push({ ...note, type: 'note', method: 'implicit' });
                    resolvedIds.add(note.id);
                    console.log(`[OneContext] Matched note: ${note.title}`);
                }
            }
        } catch (e) {
            console.warn('[OneContext] Note discovery failed:', e.message);
        }
    }

    /**
     * Check if note matches query
     * @private
     */
    static _matchesNote(note, slugQuery, queryWords) {
        const title = note.title.toLowerCase();
        const slugNote = title.replace(/[^a-z0-9]/g, '');

        if (this.NOISE_WORDS.has(slugNote)) return false;

        // Direct slug match
        if (slugNote.length >= this.MIN_SLUG_LENGTH &&
            (slugQuery.includes(slugNote) || slugNote.includes(slugQuery))) {
            return true;
        }

        // Word overlap
        if (queryWords.length > 0 && queryWords.some(qw => title.includes(qw))) {
            return true;
        }

        return false;
    }

    /**
     * Log resolution summary for debugging
     * @private
     */
    static _logResolutionSummary(resolved, missing, spaceId) {
        console.log(`[OneContext] Resolution complete:`, {
            total: resolved.length,
            files: resolved.filter(r => r.type === 'file').length,
            databases: resolved.filter(r => r.type === 'database').length,
            notes: resolved.filter(r => r.type === 'note').length,
            chunks: resolved.filter(r => r.type === 'chunk').length,
            missing: missing.length,
            spaceScoped: !!spaceId
        });

        if (missing.length > 0) {
            console.warn('[OneContext] Unresolved mentions:', missing.map(m => m.token));
        }
    }

    /**
     * Build formatted context block for AI prompt injection
     * 
     * CONTEXT STRUCTURE:
     * 1. Files section
     * 2. Notes section (with truncated content)
     * 3. Databases section
     * 4. Knowledge chunks section
     * 5. Grounding instructions
     * 
     * @param {Array} resources - Resolved context resources
     * @returns {string} Formatted context block
     */
    static buildContextBlock(resources) {
        if (!resources.length) return "";

        const contextParts = ["\n--- RELEVANT CONTEXT (OneContext) ---"];

        const files = resources.filter(r => r.type === 'file');
        const dbs = resources.filter(r => r.type === 'database');
        const notes = resources.filter(r => r.type === 'note');
        const chunks = resources.filter(r => r.type === 'chunk');

        // Files section
        if (files.length) {
            contextParts.push('\n[FILES]');
            files.forEach(f => {
                const method = f.method ? ` (${f.method})` : '';
                const space = f.spaceId ? ` [Space: ${f.spaceId}]` : '';
                contextParts.push(`- ${f.filename} (ID: ${f.id})${method}${space}`);
            });
        }

        // Notes section
        if (notes.length) {
            contextParts.push('\n[NOTES]');
            notes.forEach(n => {
                const preview = n.content.slice(0, 3000);
                const truncated = n.content.length > 3000 ? '...' : '';
                contextParts.push(`Title: ${n.title}\nContent:\n${preview}${truncated}\n`);
            });
        }

        // Databases section
        if (dbs.length) {
            contextParts.push('\n[DATABASES]');
            dbs.forEach(d => {
                const method = d.method ? ` (${d.method})` : '';
                const score = d.semanticScore ? ` [Score: ${d.semanticScore.toFixed(2)}]` : '';
                const target = d.targetTable ? ` → Table: ${d.targetTable}` : '';
                contextParts.push(`- ${d.name} (${d.provider}) - ID: ${d.id}${method}${score}${target}`);
            });
        }

        // Knowledge chunks section
        if (chunks.length) {
            contextParts.push('\n[RELEVANT KNOWLEDGE]');
            chunks.forEach(c => {
                const source = c.metadata?.source || 'Unknown';
                const score = c.score ? ` [Score: ${c.score.toFixed(2)}]` : '';
                contextParts.push(`Source: ${source}${score}\n"${c.content}"\n`);
            });
        }

        // Grounding instructions
        contextParts.push(
            '\n[GROUNDING RULES]',
            '1. NEVER say "I need more information" if there are UNEXPLORED sources above',
            '2. ALWAYS use get_sample_data or query_data to inspect available sources first',
            '3. If a user asks for data (e.g., "US Sales"), CHECK the loaded sources',
            '4. Prioritize sources with higher semantic scores when multiple matches exist',
            '5. For table-specific queries, use the targetTable field if present',
            '6. Explain which sources you\'re using and why',
            '--- END CONTEXT ---\n'
        );

        return contextParts.join('\n');
    }

    /**
     * Get context statistics for monitoring
     * @param {Array} resources - Resolved resources
     * @returns {Object} Statistics object
     */
    static getContextStats(resources) {
        return {
            total: resources.length,
            byType: {
                files: resources.filter(r => r.type === 'file').length,
                databases: resources.filter(r => r.type === 'database').length,
                notes: resources.filter(r => r.type === 'note').length,
                chunks: resources.filter(r => r.type === 'chunk').length
            },
            byMethod: {
                explicit: resources.filter(r => r.method === 'explicit').length,
                implicit: resources.filter(r => r.method?.startsWith('implicit')).length,
                semantic: resources.filter(r => r.method === 'semantic').length
            },
            avgSemanticScore: resources
                .filter(r => r.semanticScore)
                .reduce((sum, r) => sum + r.semanticScore, 0) /
                (resources.filter(r => r.semanticScore).length || 1)
        };
    }
}