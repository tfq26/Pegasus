import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables BEFORE any other imports that might use them
dotenv.config({ path: path.resolve(process.cwd(), 'apps/backend/.env') });

async function indexStrategies() {
    const { RAGService } = await import('../../apps/backend/src/services/ragService.js');
    const userId = 'tfq26'; // Default user for internal indexing
    const filePath = path.resolve('apps/backend/ai/knowledge/analysis_strategies.md');

    console.log(`Reading strategies from ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');

    // RAGService uses chunking and embedding
    const chunks = RAGService.chunkMarkdown(content);
    console.log(`Split into ${chunks.length} chunks.`);

    try {
        const sourceId = 'internal_analysis_strategies';
        // Clear existing to avoid duplication
        await RAGService.clearSource(sourceId, userId);

        await RAGService.indexChunks(chunks, {
            source: 'System: Analysis Strategies',
            source_id: sourceId,
            type: 'documentation'
        }, userId, 'gemini'); // Use gemini for embeddings to match buildContext

        console.log('Successfully indexed analysis strategies.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to index strategies:', error);
        process.exit(1);
    }
}

indexStrategies();
