
import { db } from '../../apps/backend/src/db/index.js';
import { knowledgeChunks } from '../../apps/backend/src/db/schema.js';
import { ilike } from 'drizzle-orm';

async function search() {
    console.log("Searching for 'App Server 2' in knowledgeChunks...");
    const results = await db.select()
        .from(knowledgeChunks)
        .where(ilike(knowledgeChunks.content, '%App Server 2%'))
        .limit(10);

    console.log(`Found ${results.length} matches.`);
    results.forEach((r, i) => {
        console.log(`\n--- Match ${i + 1} ---`);
        console.log(`Content: ${r.content}`);
        console.log(`Metadata: ${JSON.stringify(r.metadata)}`);
    });

    console.log("\nSearching for '2026-02-12' in knowledgeChunks...");
    const results2 = await db.select()
        .from(knowledgeChunks)
        .where(ilike(knowledgeChunks.content, '%2026-02-12%'))
        .limit(10);

    console.log(`Found ${results2.length} matches.`);
    results2.forEach((r, i) => {
        console.log(`\n--- Match ${i + 1} ---`);
        console.log(`Content: ${r.content}`);
        console.log(`Metadata: ${JSON.stringify(r.metadata)}`);
    });

    process.exit(0);
}

search().catch(err => {
    console.error(err);
    process.exit(1);
});
