import { db } from '../db/index.js';
import { files, spaceNotes, connections, spaceFiles, knowledgeChunks, dataSpaces, spacePermissions, connectionWorkspaces } from '../db/schema.js';
import { eq, ilike, or, and, like, sql } from 'drizzle-orm';
import { RAGService } from './ragService.js';

export class OneContext {
    /**
     * Parse text for explicit mentions (!file, #db, $note)
     * Regex: /(?:^|\s)([!#$][a-zA-Z0-9_\-\.]+)/g
     */
    static parseMentions(text) {
        const regex = /(?:^|\s)([!#$][a-zA-Z0-9_\-\.]+)/g;
        const matches = [...text.matchAll(regex)];
        const mentions = [];

        for (const match of matches) {
            const token = match[1];
            const typeChar = token[0];
            const name = token.slice(1);

            let type = 'unknown';
            if (typeChar === '!') type = 'file';
            else if (typeChar === '#') type = 'database';
            else if (typeChar === '$') type = 'note';

            mentions.push({ type, name, token });
        }

        return mentions;
    }

    /**
     * Resolve mentions to actual DB resources
     */
    static async resolveContext(text, userId, connectionId = null) {
        // Resolve spaceId if connectionId is provided
        let spaceId = null;
        if (connectionId) {
            try {
                const conn = await db.query.connections.findFirst({
                    where: eq(connections.id, connectionId)
                });
                if (conn) spaceId = conn.spaceId;
            } catch (e) {
                console.warn('[OneContext] Failed to resolve spaceId for connection:', connectionId);
            }
        }

        const mentions = this.parseMentions(text);
        const resolved = [];
        const missing = [];

        // 1. Explicit Resolution
        for (const mention of mentions) {
            let resource = null;

            if (mention.type === 'file') {
                // Search in `files` and `spaceFiles`
                const fileResults = await db.select()
                    .from(files)
                    .where(and(
                        eq(files.userId, userId),
                        or(eq(files.id, mention.name), ilike(files.filename, `%${mention.name}%`))
                    ))
                    .limit(1);

                if (fileResults.length) {
                    resource = { ...fileResults[0], type: 'file', source: 'files' };
                }
            } else if (mention.type === 'database') {
                const connResults = await db.select()
                    .from(connections)
                    .where(and(
                        eq(connections.userId, userId),
                        or(eq(connections.id, mention.name), ilike(connections.name, `%${mention.name}%`))
                    ))
                    .limit(1);

                if (connResults.length) {
                    resource = { ...connResults[0], provider: connResults[0].type, type: 'database' };
                }

            } else if (mention.type === 'note') {
                const notesResult = await db.execute(sql`
                    SELECT n.id, n.title, n.content, n.preview 
                    FROM space_note n
                    JOIN data_space s ON n.space_id = s.id
                    LEFT JOIN space_permission sp ON s.id = sp.space_id
                    WHERE (s.user_id = ${userId} OR sp.user_id = ${userId})
                    AND (n.id::text = ${mention.name} OR n.title ILIKE ${'%' + mention.name + '%'})
                    LIMIT 1
                `);

                const notes = Array.isArray(notesResult) ? notesResult : (notesResult.rows || []);
                if (notes.length) {
                    resource = { ...notes[0], type: 'note' };
                }
            }

            if (resource) {
                resolved.push(resource);
            } else {
                missing.push(mention);
            }
        }

        // 2. Implicit Discovery
        if (mentions.length === 0 && text.length > 10) {
            console.log('[OneContext] No explicit mentions, running implicit discovery...');

            // A. Vector Search for Chunks
            try {
                const chunks = await RAGService.hybridSearch(text, userId, 3).catch(e => {
                    console.warn('[OneContext] Hybrid search failed:', e.message);
                    return [];
                });
                chunks.forEach(chunk => {
                    resolved.push({
                        type: 'chunk',
                        content: chunk.content,
                        metadata: chunk.metadata,
                        score: chunk.score
                    });
                });
            } catch (e) {
                console.warn('[OneContext] RAG search error:', e.message);
            }

            // B. Schema Search (Databases) 
            try {
                const connectionsData = await db.select()
                    .from(connections)
                    .where(eq(connections.userId, userId));

                for (const conn of connectionsData) {
                    const slugConn = conn.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const slugQuery = text.toLowerCase().replace(/[^a-z0-9]/g, '');
                    let match = slugQuery.length >= 3 && (slugQuery.includes(slugConn) || slugConn.includes(slugQuery));
                    if (match) {
                        resolved.push({ ...conn, provider: conn.type, type: 'database', implicit: true });
                    }
                }
            } catch (e) {
                console.warn('[OneContext] Connection search failed:', e.message);
            }

            // C. Implicit File Search (The core fix)
            try {
                const filesData = [];

                // 1. Personal Files
                try {
                    const pFiles = await db.select({
                        id: files.id,
                        filename: files.filename,
                        storageId: files.storageId
                    }).from(files).where(eq(files.userId, userId));
                    filesData.push(...pFiles);
                } catch (e) { }

                // 2. Space Files
                try {
                    const sharedFiles = await db.select({
                        id: spaceFiles.id,
                        filename: spaceFiles.filename,
                        storageId: spaceFiles.storageId
                    })
                        .from(spaceFiles)
                        .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
                        .leftJoin(spacePermissions, eq(dataSpaces.id, spacePermissions.spaceId))
                        .where(or(eq(dataSpaces.userId, userId), eq(spacePermissions.userId, userId)));
                    filesData.push(...sharedFiles);
                } catch (e) { }

                // 3. Workspace Files (Files open in tabs across all workspaces)
                try {
                    const workspaces = await db.select().from(connectionWorkspaces).where(eq(connectionWorkspaces.userId, userId));
                    for (const ws of workspaces) {
                        const data = ws.workspaceData || {};
                        if (ws === workspaces[0]) {
                            console.log(`[OneContext] DEBUG: Workspace data structure: ${JSON.stringify(data).slice(0, 500)}...`);
                        }
                        const tabs = data.tabs || data.config?.tabs || [];

                        if (tabs.length > 0) {
                            console.log(`[OneContext] WS ${ws.connectionId}: processing ${tabs.length} tabs.`);
                        }

                        for (const tab of tabs) {
                            const conn = tab.data?.source?.connection || tab.config?.connection || tab.connection || (tab.data?.connection);
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
                                    source: 'workspace'
                                });
                                console.log(`[OneContext] Discovered workspace file: ${name} (path: ${path})`);
                            } else if (tab.label) {
                                console.log(`[OneContext] Tab ${tab.label} skipped (no path or duckdb type found)`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[OneContext] Workspace tab scan failed:', e.message);
                }

                // 4. Space-mate Connections (All DBs/Files in the same space)
                try {
                    let spaceConns = [];
                    if (spaceId) {
                        spaceConns = await db.select().from(connections)
                            .where(and(eq(connections.spaceId, spaceId), eq(connections.userId, userId)));
                        if (spaceConns.length > 0) console.log(`[OneContext] Found ${spaceConns.length} space-mate connections.`);
                    }

                    // Global DuckDB files for this user
                    const personalDuck = await db.select().from(connections)
                        .where(and(eq(connections.userId, userId), eq(connections.type, 'duckdb')));

                    const allResources = [...spaceConns];
                    personalDuck.forEach(pd => {
                        if (!allResources.find(ad => ad.id === pd.id)) allResources.push(pd);
                    });

                    console.log(`[OneContext] Found ${allResources.length} candidate connections.`);
                    for (const conn of allResources) {
                        console.log(`[OneContext] Discovered: ${conn.name} (${conn.type})`);
                        const cfg = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config || {};
                        filesData.push({
                            id: conn.id,
                            filename: conn.name,
                            storageId: cfg.path || cfg.duckdb?.path || cfg.config?.path,
                            provider: conn.type,
                            type: conn.type === 'duckdb' ? 'file' : 'database',
                            source: 'connection'
                        });
                    }
                } catch (e) {
                    console.warn('[OneContext] Connection discovery failed:', e.message);
                }

                // 5. Data Source Table (Legacy/Alternate Fallback)
                try {
                    const dsRes = await db.execute(sql`SELECT id, name, type, config FROM data_source`);
                    const dsList = Array.isArray(dsRes) ? dsRes : (dsRes.rows || []);
                    if (dsList.length > 0) console.log(`[OneContext] Data sources found: ${dsList.length}`);
                    for (const ds of dsList) {
                        const cfg = typeof ds.config === 'string' ? JSON.parse(ds.config) : ds.config || {};
                        const path = cfg.path || cfg.duckdb?.path;
                        if (path || ds.type === 'duckdb') {
                            filesData.push({
                                id: ds.id,
                                filename: ds.name,
                                storageId: path,
                                provider: ds.type || 'duckdb',
                                source: 'data_source'
                            });
                        }
                    }
                } catch (e) { }

                console.log(`[OneContext] Discovery scan finished. total resources: ${filesData.length}`);

                for (const f of filesData) {
                    let fName = (f.filename || '').toLowerCase();
                    // Strip the UUID prefix if present (e.g. 612e25db-...-FileName.csv)
                    if (/^[0-9a-f-]{36}-/.test(fName)) {
                        fName = fName.slice(37);
                    }

                    const baseName = fName.indexOf('.') !== -1 ? fName.split('.').slice(0, -1).join('.') : fName;
                    const slugFile = baseName.replace(/[^a-z0-9]/g, '');
                    const slugQuery = text.toLowerCase().replace(/[^a-z0-9]/g, '');

                    console.log(`[OneContext] Checking file: "${f.filename}" -> slug: "${slugFile}" against query slug snippet: "${slugQuery.slice(0, 30)}..."`);

                    // 1. Exact/Slug Match
                    let match = slugFile.length >= 3 && (slugQuery.includes(slugFile) || slugFile.includes(slugQuery));
                    let matchedReason = match ? 'filename_match' : null;

                    // 2. Keyword Match
                    if (!match) {
                        const fileKeywords = baseName.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length >= 3);
                        const queryWords = text.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length >= 3);
                        for (const kw of fileKeywords) {
                            if (queryWords.includes(kw) || slugQuery.includes(kw)) {
                                match = true;
                                matchedReason = `keyword:${kw}`;
                                break;
                            }
                        }
                    }

                    // 3. Domain Heuristics (e.g. 'Indices' matching 'Nifty' or 'Market')
                    if (!match) {
                        const domainMap = {
                            indices: ['nifty', 'sensex', 'market', 'benchmark', 'index'],
                            performance: ['return', 'gain', 'loss', 'profit', 'yield'],
                            portfolio: ['holdings', 'investment', 'asset', 'stock']
                        };

                        for (const [key, synonyms] of Object.entries(domainMap)) {
                            if (fName.includes(key)) {
                                if (synonyms.some(s => slugQuery.includes(s))) {
                                    match = true;
                                    matchedReason = `domain:${key}`;
                                    break;
                                }
                            }
                        }
                    }

                    // 4. Force Include: If from 'workspace' or 'connection' (space-mate/active context)
                    if (!match && (f.source === 'workspace' || f.source === 'connection') && text.length > 30) {
                        match = true;
                        matchedReason = 'active_context_heuristic';
                    }

                    if (match) {
                        resolved.push({ ...f, type: 'file', implicit: true });
                        console.log(`[OneContext] Implicitly matched resource: ${f.filename} (Reason: ${matchedReason})`);
                    }
                }
            } catch (e) {
                console.warn('[OneContext] File implicit search failed:', e.message);
            }
        }

        return resolved;
    }

    /**
     * Build the system prompt with injected context
     */
    static buildContextBlock(resources) {
        if (!resources.length) return "";

        let contextParams = ["\n--- RELEVANT CONTEXT (OneContext) ---"];
        const files = resources.filter(r => r.type === 'file');
        const dbs = resources.filter(r => r.type === 'database');
        const notes = resources.filter(r => r.type === 'note');
        const chunks = resources.filter(r => r.type === 'chunk');

        if (files.length) {
            contextParams.push(`\n[FILES]`);
            files.forEach(f => {
                contextParams.push(`- ${f.filename} (ID: ${f.id})`);
            });
        }

        if (notes.length) {
            contextParams.push(`\n[NOTES]`);
            notes.forEach(n => {
                contextParams.push(`Title: ${n.title}\nContent:\n${n.content.slice(0, 1000)}...`);
            });
        }

        if (dbs.length) {
            contextParams.push(`\n[DATABASES]`);
            dbs.forEach(d => {
                contextParams.push(`- ${d.name} (${d.type}) - ID: ${d.id}`);
            });
        }

        if (chunks.length) {
            contextParams.push(`\n[RELEVANT KNOWLEDGE]`);
            chunks.forEach(c => {
                contextParams.push(`Source: ${c.metadata.source}\n"${c.content}"`);
            });
        }

        contextParams.push("--- END CONTEXT ---\n");
        return contextParams.join("\n");
    }
}
