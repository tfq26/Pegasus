
import { classifyIntent } from './ai/prompts/intent.js';

console.log('Running Intent Classifier Tests...\n');

const tests = [
    { input: '/visualization Show me server stats', expected: 'visualization' },
    { input: '/query SELECT * FROM users', expected: 'query' },
    { input: 'Show me all users', expected: 'query' },
    { input: 'Why did the server crash?', expected: 'analysis' },
    { input: 'Can you chart the revenue growth?', expected: 'visualization' },
    { input: 'Hello, how are you?', expected: 'chat' }
];

let passed = 0;

tests.forEach(test => {
    const result = classifyIntent(test.input);
    const success = result.type === test.expected;
    if (success) passed++;
    console.log(`Input: "${test.input}" -> Detected: ${result.type} [${success ? 'PASS' : 'FAIL'}]`);
});

console.log(`\nPassed ${passed}/${tests.length} tests.`);
if (passed === tests.length) {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
} else {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
}
