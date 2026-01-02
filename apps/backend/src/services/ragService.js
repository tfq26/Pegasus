import { db } from '../../db/surreal.js';
import { aiClient } from '../../ai/AIClient.js';

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
     * Indexes text chunks into SurrealDB.
     */
    static async indexChunks(chunks, metadata, userId, modelId = 'openai') {
        if (!db) return;

        console.log(`[RAG] Indexing ${chunks.length} chunks for ${metadata.source}...`);

        for (const content of chunks) {
            try {
                // 1. Generate Embedding
                const embedding = await aiClient.generateEmbedding(content, modelId);

                // 2. Store in SurrealDB
                await db.create('knowledge_chunk', {
                    content,
                    embedding,
                    metadata: {
                        ...metadata,
                        indexed_at: new Date().toISOString()
                    },
                    user: `user:${userId}`,
                    created_at: new Date().toISOString()
                });
            } catch (e) {
                console.error(`[RAG] Failed to index chunk:`, e.message);
            }
        }
    }

    /**
     * Hybrid Search: Combines Vector (Semantic) and FTS (Keyword)
     */
    static async hybridSearch(query, userId, limit = 5, modelId = 'openai') {
        if (!db) return [];

        try {
            // 1. Vectorize Query
            const queryVector = await aiClient.generateEmbedding(query, modelId);

            // 2. Perform Hybrid Search in SurrealDB
            // We use SurrealQL to combine vector similarity and BM25 ranking
            const results = await db.query(`
                SELECT 
                    *,
                    vector::similarity::cosine(embedding, $vector) AS score
                FROM knowledge_chunk
                WHERE 
                    user = $user
                    AND (
                        embedding <|1536|> $vector  -- Vector similarity
                        OR string::lowercase(content) CONTAINS string::lowercase($query) -- Keyword fallback
                    )
                ORDER BY score DESC
                LIMIT $limit
            `, {
                vector: queryVector,
                user: `user:${userId}`,
                query: query,
                limit: limit
            });

            return results[0] || [];
        } catch (e) {
            console.error(`[RAG] Search failed: `, e.message);
            return [];
        }
    }

    /**
     * Deletes existing chunks for a specific source to allow re-indexing.
     */
    static async clearSource(sourceId, userId) {
        await db.query(`
            DELETE knowledge_chunk 
            WHERE user = $user AND metadata.source_id = $sourceId
                `, {
            user: `user:${userId} `,
            sourceId: sourceId
        });
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
}
