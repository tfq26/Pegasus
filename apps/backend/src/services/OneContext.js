import { db } from '../db/index.js';
import { files, spaceNotes, connections, spaceFiles, knowledgeChunks, dataSpaces, spacePermissions, connectionWorkspaces } from '../db/schema.js';
import { eq, ilike, or, and, like, sql } from 'drizzle-orm';
import { RAGService } from './ragService.js';
import fs from 'fs';
import path from 'path';

export class OneContext {
    /**
     * Parse text for explicit mentions (!file, #db, $note)
     * Regex: /(?:^|\s)([!#$][a-zA-Z0-9_\-\.]+)/g
     */
    static parseMentions(text) {
        // Updated regex to support bracketed mentions like @[demo-data] or !file
        const regex = /(?:^|\s)([!#$@](?:\[[^\]]+\]|[a-zA-Z0-9_\-\.]+))/g;
        const matches = [...text.matchAll(regex)];
        const mentions = [];

        for (const match of matches) {
            const token = match[1];
            const typeChar = token[0];
            let name = token.slice(1);

            // Strip brackets if present
            if (name.startsWith('[') && name.endsWith(']')) {
                name = name.slice(1, -1);
            }

            let type = 'unknown';
            if (typeChar === '!') type = 'file';
            else if (typeChar === '#') type = 'table'; // Updated to table to match frontend
            else if (typeChar === '$') type = 'database';
            else if (typeChar === '@') type = 'note';

            // Heuristic: if @[dir-name], treat as local directory context if it's not a note
            // But 'note' type is just a label. We can resolve 'demo-data' as a directory later.

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
        const resolvedIds = new Set();

        // 0. Implicit Database Discovery (Semantic/Keyword)
        try {
            const allUserConnections = await db.select().from(connections).where(eq(connections.userId, userId));
            const lowerText = text.toLowerCase();

            for (const conn of allUserConnections) {
                // Check if connection name or alias is in the text
                const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
                const alias = config?.alias || config?.nickname;
                const name = conn.name;

                let isMatch = false;
                if (name && lowerText.includes(name.toLowerCase())) isMatch = true;
                if (alias && lowerText.includes(alias.toLowerCase())) isMatch = true;

                // Avoid matching common words if alias is too short (e.g. "db", "test")
                // Enforce word boundary for safety could be better: `\b${name}\b` logic
                // But simplified includes is a good start for now.

                if (isMatch) {
                    resolved.push({ ...conn, provider: conn.type, type: 'database', method: 'implicit' });
                    resolvedIds.add(conn.id);
                }
            }
        } catch (e) {
            console.warn('[OneContext] Implicit connection discovery failed:', e);
        }

        // 1. Explicit Resolution
        for (const mention of mentions) {
            let resource = null;

            if (mention.type === 'file') {
                // Special handling for local demo-data files (explicit path)
                if (mention.name.startsWith('demo-data/')) {
                    resolved.push({
                        id: `local-${mention.name}`,
                        name: mention.name.split('/').pop(),
                        type: 'file',
                        provider: 'duckdb', // Use DuckDB for local CSV/XLSX
                        config: { path: `${process.cwd()}/${mention.name}` },
                        is_virtual: true
                    });
                    continue;
                }

                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mention.name);
                const whereClause = isUUID
                    ? or(eq(files.id, mention.name), ilike(files.filename, `%${mention.name}%`))
                    : ilike(files.filename, `%${mention.name}%`);

                // Search in `files` and `spaceFiles`
                const fileResults = await db.select()
                    .from(files)
                    .where(and(
                        eq(files.userId, userId),
                        whereClause
                    ))
                    .limit(1);

                if (fileResults.length) {
                    resource = { ...fileResults[0], type: 'file', source: 'files' };
                }
            } else if (mention.type === 'database') {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mention.name);
                const whereClause = isUUID
                    ? or(eq(connections.id, mention.name), ilike(connections.name, `%${mention.name}%`))
                    : ilike(connections.name, `%${mention.name}%`);

                const connResults = await db.select()
                    .from(connections)
                    .where(and(
                        eq(connections.userId, userId),
                        whereClause
                    ))
                    .limit(1);

                if (connResults.length) {
                    resource = { ...connResults[0], provider: connResults[0].type, type: 'database' };
                }

            } else if (mention.type === 'note' || mention.type === 'unknown') {
                // Special handling for local directory context (e.g. @[demo-data])
                let localDirPath = path.resolve(process.cwd(), mention.name);

                // If not found in CWD, try one and two levels up (common in monorepos)
                if (!fs.existsSync(localDirPath)) {
                    const upOne = path.resolve(process.cwd(), '..', mention.name);
                    if (fs.existsSync(upOne)) localDirPath = upOne;
                    else {
                        const upTwo = path.resolve(process.cwd(), '../..', mention.name);
                        if (fs.existsSync(upTwo)) localDirPath = upTwo;
                    }
                }

                if (fs.existsSync(localDirPath) && fs.statSync(localDirPath).isDirectory()) {
                    console.log(`[OneContext] Scanning directory mention: ${mention.name} at ${localDirPath}`);

                    // 1. Resolve as a pseudo-connection for DuckDB to glob (CSVs, XLSX)
                    resolved.push({
                        id: `${mention.name}-local-db`,
                        name: `${mention.name} (Files)`,
                        type: 'file',
                        provider: 'duckdb',
                        config: { path: `${localDirPath}/*.{csv,xlsx,parquet}` },
                        is_virtual: true
                    });

                    // 2. Scan for and inject .md files as context NOTES
                    try {
                        const filesInDir = fs.readdirSync(localDirPath);
                        for (const fileName of filesInDir) {
                            if (fileName.endsWith('.md')) {
                                const filePath = path.join(localDirPath, fileName);
                                const content = fs.readFileSync(filePath, 'utf8');
                                const title = fileName.replace('.md', '');

                                resolved.push({
                                    id: `local-note-${mention.name}-${title}`,
                                    title: title,
                                    name: title,
                                    content: content,
                                    type: 'note',
                                    source: 'local_file'
                                });
                                console.log(`[OneContext] Injected local note from directory: ${fileName}`);
                            }
                        }
                    } catch (e) {
                        console.warn(`[OneContext] Failed to scan directory for notes: ${mention.name}`, e.message);
                    }
                    continue;
                }

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
                if (!resolvedIds.has(resource.id)) {
                    resolved.push(resource);
                    resolvedIds.add(resource.id);
                }
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

            // C. Implicit File Search
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

                // 3. Workspace Files
                try {
                    const workspaces = await db.select().from(connectionWorkspaces).where(eq(connectionWorkspaces.userId, userId));
                    for (const ws of workspaces) {
                        const tabs = ws.workspaceData?.tabs || ws.workspaceData?.config?.tabs || [];
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
                            }
                        }
                    }
                } catch (e) { }

                // 4. Scan Files Data for matches
                for (const f of filesData) {
                    let fName = (f.filename || '').toLowerCase();
                    if (/^[0-9a-f-]{36}-/.test(fName)) fName = fName.slice(37);

                    const baseName = fName.indexOf('.') !== -1 ? fName.split('.').slice(0, -1).join('.') : fName;
                    const slugFile = baseName.replace(/[^a-z0-9]/g, '');
                    const slugQuery = text.toLowerCase().replace(/[^a-z0-9]/g, '');

                    let match = slugFile.length >= 3 && (slugQuery.includes(slugFile) || slugFile.includes(slugQuery));
                    if (!match) {
                        const queryWords = text.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length >= 3);
                        if (queryWords.some(qw => baseName.toLowerCase().includes(qw))) match = true;
                    }

                    if (match) {
                        if (!resolved.find(r => r.id === f.id)) {
                            resolved.push({ ...f, type: 'file', implicit: true });
                            console.log(`[OneContext] Implicitly matched file: ${f.filename}`);
                        }
                    }
                }
            } catch (e) {
                console.warn('[OneContext] File implicit search failed:', e.message);
            }

            // D. Implicit Note Search
            try {
                const notesRes = await db.execute(sql`
                    SELECT n.id, n.title, n.content, n.preview 
                    FROM space_note n
                    JOIN data_space s ON n.space_id = s.id
                    LEFT JOIN space_permission sp ON s.id = sp.space_id
                    WHERE (s.user_id = ${userId} OR sp.user_id = ${userId})
                `);
                const allNotes = Array.isArray(notesRes) ? notesRes : (notesRes.rows || []);

                for (const n of allNotes) {
                    const nTitle = n.title.toLowerCase();
                    const slugNote = nTitle.replace(/[^a-z0-9]/g, '');
                    const slugQuery = text.toLowerCase().replace(/[^a-z0-9]/g, '');

                    let match = slugNote.length >= 3 && (slugQuery.includes(slugNote) || slugNote.includes(slugQuery));
                    if (!match) {
                        const queryWords = text.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length >= 4);
                        if (queryWords.some(qw => nTitle.includes(qw))) match = true;
                    }

                    if (match) {
                        if (!resolved.find(r => r.id === n.id && r.type === 'note')) {
                            resolved.push({ ...n, type: 'note', implicit: true });
                            console.log(`[OneContext] Implicitly matched note: ${n.title}`);
                        }
                    }
                }
            } catch (e) {
                console.warn('[OneContext] Note implicit search failed:', e.message);
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
