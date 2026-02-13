import { OneContext } from '../src/services/OneContext.js';
import { SearchService } from '../src/services/SearchService.js';
import 'dotenv/config';

async function testEnrichment() {
    const userId = 'dev_user';
    const connectionId = null;

    console.log("=== Testing Context Enrichment ===");

    // Case 1: Complex Domain Term (Should trigger research)
    const query1 = "Explain our GAAP compliance in the current quarter.";
    console.log(`\nQuery 1: "${query1}"`);
    const results1 = await OneContext.resolveContext(query1, userId, connectionId);
    const researchResults1 = results1.filter(r => r.type === 'research_note');

    console.log(`Research Notes found: ${researchResults1.length}`);
    researchResults1.forEach(r => {
        console.log(`- [${r.method}] Title: ${r.title}`);
        console.log(`  Preview: ${r.content?.substring(0, 100)}...`);
    });

    // Case 2: Quantitative Query (Should NOT trigger research)
    const query2 = "Show me the total revenue for 2023.";
    console.log(`\nQuery 2: "${query2}"`);
    const results2 = await OneContext.resolveContext(query2, userId, connectionId);
    const researchResults2 = results2.filter(r => r.type === 'research_note');

    console.log(`Research Notes found: ${researchResults2.length}`);

    // Case 3: Prompt Injection Check
    console.log("\n=== Testing Prompt Block Rendering ===");
    const promptBlock = OneContext.buildContextBlock(results1);
    if (promptBlock.includes('[RESEARCH NOTES (Web Enrichment)]')) {
        console.log("✅ Success: Research notes found in prompt block.");
        console.log(promptBlock.substring(0, 500) + "...");
    } else {
        console.log("❌ Failure: Research notes missing from prompt block.");
    }

    process.exit(0);
}

testEnrichment().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
