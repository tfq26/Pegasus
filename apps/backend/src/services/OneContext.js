import { db } from '../db/index.js';
import { files, spaceNotes, connections, spaceFiles, knowledgeChunks } from '../db/schema.js';
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
    static async resolveContext(text, userId) {
        const mentions = this.parseMentions(text);
        const resolved = [];
        const missing = [];

        // 1. Explicit Resolution
        for (const mention of mentions) {
            let resource = null;

            if (mention.type === 'file') {
                // Search in `files` and `spaceFiles`
                // Try exact match on ID or fuzzy on name
                const fileResults = await db.select()
                    .from(files)
                    .where(and(
                        eq(files.userId, userId),
                        or(eq(files.id, mention.name), ilike(files.filename, `%${mention.name}%`))
                    ))
                    .limit(1);

                if (fileResults.length) {
                    resource = { ...fileResults[0], type: 'file', source: 'files' };
                } else {
                    // Try spaceFiles
                    // We need to join with dataSpaces to check userId
                    // simplifiction: assume unique filename across user spaces or just pick first
                    // ideally we join. 
                    // For MVP let's skip spaceFiles complex join for explicit mention unless needed.
                }

            } else if (mention.type === 'database') {
                // Search connections
                const connResults = await db.select()
                    .from(connections)
                    .where(and(
                        eq(connections.userId, userId),
                        or(eq(connections.id, mention.name), ilike(connections.name, `%${mention.name}%`))
                    ))
                    .limit(1);

                if (connResults.length) {
                    resource = { ...connResults[0], type: 'database' };
                }

            } else if (mention.type === 'note') {
                // Search spaceNotes
                // Notes are inside spaces. Join required?
                // spaceNotes has spaceId. 
                // Let's do a direct search on spaceNotes where spaceId in (user's spaces)
                // Performance: suboptimal but functional for MVP
                const noteResults = await db.select({
                    id: spaceNotes.id,
                    title: spaceNotes.title,
                    content: spaceNotes.content,
                    preview: spaceNotes.preview
                })
                    .from(spaceNotes)
                    .innerJoin(connections, eq(spaceNotes.spaceId, connections.spaceId)) // Wait, connections link spaces? No.
                // Join spaceNotes -> dataSpaces -> users
                // Actually simpler: 
                // select * from space_note where space_id in (select id from data_space where user_id = ?) and (id = ? or title ilike ?)
                // Drizzle:
                // ...
                // For now, let's implement a helper query
                const notes = await db.execute(sql`
                    SELECT n.* FROM space_note n
                    JOIN data_space s ON n.space_id = s.id
                    WHERE s.user_id = ${userId}
                    AND (n.id = ${mention.name} OR n.title ILIKE ${'%' + mention.name + '%'})
                    LIMIT 1
                 `);

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

        // 2. Implicit Discovery (if no explicit mentions AND query looks like it needs context)
        // Heuristic: specific keywords or length? 
        // Or always run a light weight semantic search if explicit list is empty?
        if (mentions.length === 0 && text.length > 10) {
            console.log('[OneContext] No explicit mentions, running implicit discovery...');

            // A. Vector Search for Chunks (Files/Notes)
            const chunks = await RAGService.hybridSearch(text, userId, 3); // Top 3 chunks

            // Format chunks as "resolved" resources
            chunks.forEach(chunk => {
                resolved.push({
                    type: 'chunk',
                    content: chunk.content,
                    metadata: chunk.metadata,
                    score: chunk.score
                });
            });

            // B. Schema Search (Databases) 
            // Simple keyword match on Connection Names for now
            // If connection name appears in text
            const connectionsData = await db.select({ id: connections.id, name: connections.name, type: connections.type })
                .from(connections)
                .where(eq(connections.userId, userId));

            for (const conn of connectionsData) {
                if (text.toLowerCase().includes(conn.name.toLowerCase())) {
                    resolved.push({ ...conn, type: 'database', implicit: true });
                }
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

        // Group by type
        const files = resources.filter(r => r.type === 'file');
        const dbs = resources.filter(r => r.type === 'database');
        const notes = resources.filter(r => r.type === 'note');
        const chunks = resources.filter(r => r.type === 'chunk');

        if (files.length) {
            contextParams.push(`\n[FILES]`);
            files.forEach(f => {
                // Ideally we have content. For MVP only meta is here unless we fetch.
                // If it's a file, we might assume RAGService will fetch chunks.
                // BUT if explicit !file is used, user expects FULL content or focused RAG.
                // For now, let's just list it. RAGService logic should be separate?
                // Actually, resolved needs to contain the content or we fetch it here.
                contextParams.push(`- ${f.filename} (ID: ${f.id})`);
            });
        }

        if (notes.length) {
            contextParams.push(`\n[NOTES]`);
            notes.forEach(n => {
                contextParams.push(`Title: ${n.title}\nContent:\n${n.content.slice(0, 1000)}... (truncated)`);
            });
        }

        if (dbs.length) {
            contextParams.push(`\n[DATABASES]`);
            dbs.forEach(d => {
                contextParams.push(`- ${d.name} (${d.type}) - ID: ${d.id}`);
                // TODO: Inject Schema here?
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
