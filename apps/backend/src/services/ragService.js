import { db } from '../db/index.js';
import { knowledgeChunks, connections } from '../db/schema.js';
import { aiClient } from '../../ai/AIClient.js';
import { eq, and, sql } from 'drizzle-orm';
import { StorageManager } from './storage/StorageManager.js';

export class RAGService {
    /**
     * Chunks markdown text while respecting headings.
     */
    static chunkMarkdown(text, maxChunkSize = 1000, overlap = 200) {
        const sections = text.split(/(?=^#{1,3} )/m); // Split by h1, h2, h3
        const chunks = [];
        let currentChunk = "";

        for (const section of sections) {
            if ((currentChunk.length + section.length) <= maxChunkSize) {
                currentChunk += (currentChunk ? "\n\n" : "") + section;
            } else {
                if (currentChunk) chunks.push(currentChunk);

                // If section itself is too large, split it further
                if (section.length > maxChunkSize) {
                    let start = 0;
                    while (start < section.length) {
                        const end = Math.min(start + maxChunkSize, section.length);
                        chunks.push(section.substring(start, end));
                        start += (maxChunkSize - overlap);
                    }
                    currentChunk = "";
                } else {
                    currentChunk = section;
                }
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * Chunks table data (array of objects) into readable text chunks.
     */
    static chunkTable(rows, tableName, rowsPerChunk = 10) {
        const chunks = [];
        for (let i = 0; i < rows.length; i += rowsPerChunk) {
            const slice = rows.slice(i, i + rowsPerChunk);
            const context = `Table: ${tableName}\n` + slice.map(row => JSON.stringify(row)).join("\n");
            chunks.push(context);
        }
        return chunks;
    }

    /**
     * Indexes text chunks into Neon/PostgreSQL.
     */
    static async indexChunks(chunks, metadata, userId, modelId = 'openai') {
        if (!db) return;

        console.log(`[RAG] Indexing ${chunks.length} chunks for ${metadata.source}...`);

        const BATCH_SIZE = metadata.type === 'table_data' ? 50 : 20;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            try {
                // 1. Generate Batch Embeddings
                const embeddings = await aiClient.generateEmbedding(batch, modelId);

                if (!embeddings || embeddings.length === 0) {
                    console.warn(`[RAG] Skipping batch starting at ${i}: No embeddings generated`);
                    continue;
                }

                // 2. Prepare Batch Insert
                const values = batch.map((content, idx) => ({
                    content,
                    embedding: Array.isArray(embeddings[0]) ? embeddings[idx] : (idx === 0 ? embeddings : null),
                    metadata: {
                        ...metadata,
                        indexed_at: new Date().toISOString()
                    },
                    userId: userId,
                    fileId: metadata.fileId || null,
                    noteId: metadata.noteId || null
                })).filter(v => v.embedding);

                if (values.length > 0) {
                    await db.insert(knowledgeChunks).values(values);
                }
            } catch (e) {
                console.error(`[RAG] Failed to index batch starting at ${i}:`, e);
            }
        }
    }

    /**
     * Hybrid Search: Combines Vector (Semantic) and Keyword
     */
    static async hybridSearch(query, userId, limit = 5, modelId = 'openai') {
        if (!db) return [];

        try {
            // 1. Vectorize Query
            const queryVector = await aiClient.generateEmbedding(query, modelId);
            const hasVector = queryVector && queryVector.length > 0;

            // 2. Perform Hybrid Search in Neon
            const queryBuilder = db.select({
                id: knowledgeChunks.id,
                content: knowledgeChunks.content,
                metadata: knowledgeChunks.metadata,
                score: hasVector
                    ? sql`1 - (${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector)`
                    : sql`1.0`
            })
                .from(knowledgeChunks)
                .where(and(
                    eq(knowledgeChunks.userId, userId),
                    sql`${knowledgeChunks.content} ILIKE ${'%' + query + '%'}` // Keyword fallback
                ));

            if (hasVector) {
                queryBuilder.orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector`);
            }

            const results = await queryBuilder.limit(limit);

            return results || [];
        } catch (e) {
            console.error(`[RAG] Search failed: `, e.message);
            return [];
        }
    }

    /**
     * Pure Vector Search (Semantic)
     * Matches based on embedding similarity only.
     */
    static async vectorSearch(query, userId, spaceId, limit = 5, modelId = 'openai') {
        if (!db) return [];

        try {
            // 1. Vectorize Query
            const queryVector = await aiClient.generateEmbedding(query, modelId);
            if (!queryVector || queryVector.length === 0) {
                console.warn(`[RAG] Vector search failed: No embedding generated for query`);
                return [];
            }

            // 2. Perform Vector Search
            const results = await db.select({
                id: knowledgeChunks.id,
                content: knowledgeChunks.content,
                metadata: knowledgeChunks.metadata,
                score: sql`1 - (${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector)`
            })
                .from(knowledgeChunks)
                .where(and(
                    eq(knowledgeChunks.userId, userId),
                    spaceId ? sql`metadata->>'spaceId' = ${spaceId}` : undefined
                ))
                .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector`)
                .limit(limit);

            return results || [];
        } catch (e) {
            console.error(`[RAG] Vector search failed: `, e);
            return [];
        }
    }

    /**
     * Deletes existing chunks for a specific source to allow re-indexing.
     */
    static async clearSource(sourceId, userId) {
        await db.delete(knowledgeChunks)
            .where(and(
                eq(knowledgeChunks.userId, userId),
                sql`${knowledgeChunks.metadata}->>'source_id' = ${sourceId}`
            ));
    }

    /**
     * Specialized documentation indexing.
     */
    static async indexDocs(userId, modelId = 'openai') {
        const { getGuides, getGuide } = await import('./docsService.js');
        const guides = await getGuides();

        for (const slug of guides) {
            const guide = await getGuide(slug);
            const chunks = this.chunkMarkdown(guide.content);
            await this.clearSource(`doc_${slug}`, userId);
            await this.indexChunks(chunks, {
                source: `Documentation: ${guide.title}`,
                source_id: `doc_${slug}`,
                type: 'documentation'
            }, userId, modelId);
        }
    }

    /**
     * Specialized table data indexing.
     */
    static async indexTableData(rows, tableName, sourceId, userId, modelId = 'openai') {
        const rowToSentence = (row) => {
            const parts = [];
            const name = row.Name || row.name || row.Title || row.title || row.ID || row.id;
            if (name) parts.push(`${name}`);

            for (const [key, value] of Object.entries(row)) {
                if (['name', 'Name', 'title', 'Title', 'id', 'ID'].includes(key)) continue;
                if (value === null || value === undefined) continue;
                parts.push(`${key}: ${value}`);
            }

            return `Data from ${tableName}: ` + parts.join(', ') + '.';
        };

        const chunks = rows.map(row => rowToSentence(row));
        await this.clearSource(sourceId, userId);
        await this.indexChunks(chunks, {
            source: `Table: ${tableName}`,
            source_id: sourceId,
            type: 'table_data'
        }, userId, modelId);
    }

    /**
     * Index a file directly from Object Storage.
     */
    static async indexFileFromStorage(storageId, filename, userId, modelId = 'openai') {
        try {
            const provider = await StorageManager.getProvider(userId);
            const url = await provider.getPresignedUrl(storageId);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch file content from storage: ${response.statusText}`);

            const text = await response.text();
            const chunks = this.chunkMarkdown(text);

            const sourceId = `file_${storageId}`;
            await this.clearSource(sourceId, userId);

            await this.indexChunks(chunks, {
                source: `File: ${filename}`,
                source_id: sourceId,
                type: 'file_content',
                storage_id: storageId
            }, userId, modelId);

            return { success: true, chunks: chunks.length };
        } catch (e) {
            console.error("[RAG] File Indexing Error:", e);
            throw e;
        }
    }

    /**
     * Index a note directly.
     */
    static async indexNote(noteId, title, content, userId, modelId = 'openai') {
        try {
            const chunks = this.chunkMarkdown(content);
            const sourceId = `note_${noteId}`;

            await this.clearSource(sourceId, userId);

            await this.indexChunks(chunks, {
                source: `Note: ${title}`,
                source_id: sourceId,
                type: 'note',
                noteId: noteId
            }, userId, modelId);

            return { success: true, chunks: chunks.length };
        } catch (e) {
            console.error("[RAG] Note Indexing Error:", e);
            throw e;
        }
    }

    /**
     * Specialized connection metadata indexing.
     */
    static async indexConnectionMetadata(connection, userId, modelId = 'openai') {
        try {
            const config = typeof connection.config === 'string' ? JSON.parse(connection.config) : connection.config;
            const sourceId = `conn_${connection.id}`;
            const parts = [];

            parts.push(`Connection Name: ${connection.name}`);
            if (config?.alias) parts.push(`Alias: ${config.alias}`);
            parts.push(`Type: ${connection.type}`);

            if (config?.tables && Array.isArray(config.tables)) {
                parts.push(`Tables: ${config.tables.join(', ')}`);
            } else if (connection.name.toLowerCase().includes('sales')) {
                parts.push(`Contains sales data and revenue metrics.`);
            }

            const content = parts.join('\n');
            const chunks = [content];

            await this.clearSource(sourceId, userId);

            await this.indexChunks(chunks, {
                source: `Database: ${connection.name}`,
                source_id: sourceId,
                type: 'connection_metadata',
                connectionId: connection.id,
                spaceId: connection.spaceId
            }, userId, modelId);

            return { success: true };
        } catch (e) {
            console.error(`[RAG] Failed to index connection ${connection.name}:`, e);
            throw e;
        }
    }

    /**
     * Batch index all connections in a space.
     */
    static async indexSpaceConnections(spaceId, userId) {
        if (!db) return;

        const spaceConns = await db.query.connections.findMany({
            where: and(eq(connections.userId, userId), eq(connections.spaceId, spaceId))
        });

        console.log(`[RAG] Indexing ${spaceConns.length} connections for space ${spaceId}...`);

        for (const conn of spaceConns) {
            await this.indexConnectionMetadata(conn, userId);
        }
    }
}
