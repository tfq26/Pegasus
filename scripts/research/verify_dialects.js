
import { buildDialectInstructions } from './apps/backend/ai/prompts/fetching.js';

const schema = {
    tables: ['Users'],
    detailedSchema: {
        'Users': [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'varchar' }]
    }
};

const settings = { aiDetail: 1 };

function testPrompt(dialect) {
    console.log(`\n--- Testing Dialect: ${dialect} ---`);
    const { schemaPresentation, dialectInstructions } = buildDialectInstructions(dialect, schema, settings);
    console.log("SCHEMA PRESENTATION:\n", schemaPresentation.trim());
    console.log("\nDIALECT INSTRUCTIONS:\n", dialectInstructions.trim());
}

testPrompt('postgres');
testPrompt('cosmosdb');
testPrompt('kusto');
testPrompt('mongodb');
