
import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock the serialization logic from table.js
function serializeRow(row) {
    const newRow = {};
    for (const [key, value] of Object.entries(row)) {
        newRow[key] = typeof value === 'bigint' ? String(value) : value;
    }
    return newRow;
}

describe('Data Export Integrity Test', () => {
    it('Should preserve large integers via string serialization', () => {
        const largeInt = 9007199254740995n; // Number.MAX_SAFE_INTEGER + 4
        const row = {
            id: largeInt,
            name: 'Test Item'
        };

        const serialized = serializeRow(row);

        // Check that it is a string
        assert.strictEqual(typeof serialized.id, 'string');

        // Check exact value match
        assert.strictEqual(serialized.id, '9007199254740995');

        // Verify JSON stringify works (JSON.stringify handles strings fine)
        const json = JSON.stringify(serialized);
        assert.ok(json.includes('"id":"9007199254740995"'));
    });

    it('Should handle mixed types correctly', () => {
        const row = {
            id: 123n,
            val: 45.5,
            text: 'hello',
            nullVal: null
        };
        const serialized = serializeRow(row);

        assert.strictEqual(serialized.id, '123');
        assert.strictEqual(serialized.val, 45.5);
        assert.strictEqual(serialized.text, 'hello');
        assert.strictEqual(serialized.nullVal, null);
    });
});
