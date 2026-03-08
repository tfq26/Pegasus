
import { classifyIntent } from '../ai/prompts/intent.js';

async function testScope() {
    console.log('--- Testing AI Scope Enforcement ---');

    const testCases = [
        { msg: 'Hello, who are you? Tell me a joke.', expectedType: 'chat', expectedOutOfScope: true },
        { msg: 'What is the capital of France?', expectedType: 'chat', expectedOutOfScope: true },
        { msg: 'Write a poem about SQL.', expectedType: 'chat', expectedOutOfScope: true },
        { msg: 'How many users are in the database?', expectedType: 'query', expectedOutOfScope: false },
        { msg: 'Visualize my revenue growth.', expectedType: 'visualization', expectedOutOfScope: false },
        { msg: 'Explain why my costs are high.', expectedType: 'analysis', expectedOutOfScope: false }
    ];

    let passed = 0;

    testCases.forEach((tc, i) => {
        const result = classifyIntent(tc.msg);
        const typeMatch = result.type === tc.expectedType;
        const scopeMatch = !!result.isOutOfScope === tc.expectedOutOfScope;

        if (typeMatch && scopeMatch) {
            console.log(`✅ Test ${i + 1}: PASSED - "${tc.msg}"`);
            passed++;
        } else {
            console.log(`❌ Test ${i + 1}: FAILED - "${tc.msg}"`);
            console.log(`   Expected: { type: '${tc.expectedType}', isOutOfScope: ${tc.expectedOutOfScope} }`);
            console.log(`   Got:      { type: '${result.type}', isOutOfScope: ${!!result.isOutOfScope} }`);
        }
    });

    console.log(`\nResults: ${passed}/${testCases.length} tests passed.`);
    process.exit(passed === testCases.length ? 0 : 1);
}

testScope().catch(err => {
    console.error(err);
    process.exit(1);
});
