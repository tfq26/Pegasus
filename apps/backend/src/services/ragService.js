import { db } from '../db/index.js';
import { knowledgeChunks } from '../db/schema.js';
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

        for (const content of chunks) {
            try {
                // 1. Generate Embedding
                const embedding = await aiClient.generateEmbedding(content, modelId);

                // 2. Store in Neon
                await db.insert(knowledgeChunks).values({
                    content,
                    embedding,
                    metadata: {
                        ...metadata,
                        indexed_at: new Date().toISOString()
                    },
                    userId: userId,
                    fileId: metadata.fileId,
                    noteId: metadata.noteId
                });
            } catch (e) {
                console.error(`[RAG] Failed to index chunk:`, e.message);
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

            // 2. Perform Hybrid Search in Neon
            // Using pgvector's cosine distance operator <=> (or cosine similarity 1 - (embedding <=> $1))
            const results = await db.select({
                id: knowledgeChunks.id,
                content: knowledgeChunks.content,
                metadata: knowledgeChunks.metadata,
                score: sql`1 - (${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector)`
            })
                .from(knowledgeChunks)
                .where(and(
                    eq(knowledgeChunks.userId, userId),
                    sql`${knowledgeChunks.content} ILIKE ${'%' + query + '%'}` // Keyword fallback
                ))
                .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector`)
                .limit(limit);

            return results || [];
        } catch (e) {
            console.error(`[RAG] Search failed: `, e.message);
            return [];
        }
    }

    /**
     * Deletes existing chunks for a specific source to allow re-indexing.
     */
    static async clearSource(sourceId, userId) {
        // Drizzle doesn't support deep JSON filtering easily in all abstraction levels, 
        // so we use a raw where condition for depth or exact match if structure allows.
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
            await this.clearSource(`doc_${slug} `, userId);
            await this.indexChunks(chunks, {
                source: `Documentation: ${guide.title} `,
                source_id: `doc_${slug} `,
                type: 'documentation'
            }, userId, modelId);
        }
    }

    /**
     * Specialized table data indexing.
     * Transforms rows into descriptive sentences for better semantic search.
     */
    static async indexTableData(rows, tableName, sourceId, userId, modelId = 'openai') {
        const rowToSentence = (row) => {
            const parts = [];
            // Try to identify a name or primary identifier first
            const name = row.Name || row.name || row.Title || row.title || row.ID || row.id;
            if (name) parts.push(`${name}`);

            // Add all other properties as descriptors
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
     * Fetches content -> Chunks -> Indexes.
     */
    static async indexFileFromStorage(storageId, filename, userId, modelId = 'openai') {
        try {
            const provider = await StorageManager.getProvider(userId);
            const url = await provider.getPresignedUrl(storageId);

            // Fetch content
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch file content from storage: ${response.statusText}`);

            // Determine parsing strategy based on extension
            const text = await response.text();
            // TODO: Add PDF/Doc parsing here if needed. For now assuming text/markdown/json/csv.

            const chunks = this.chunkMarkdown(text); // Basic text chunking

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
}
