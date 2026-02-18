
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExportService } from './src/services/ExportService.js';
import { PassThrough } from 'stream';

// Mock Adapter
class MockAdapter {
    constructor(data) {
        this.data = data;
    }

    async query(q) {
        if (q === 'FAIL') return null;
        return this.data;
    }
}

describe('ExportService Streaming Logic', () => {
    it('Should stream pure BigInts as strings', async () => {
        const rows = [{ id: 9007199254740995n, val: 123 }];
        const adapter = new MockAdapter(rows);
        const stream = new PassThrough();

        let output = '';
        stream.on('data', chunk => output += chunk.toString());

        // Mock the writable interface expected by streamCsv
        const writable = {
            write: async (chunk) => stream.write(chunk),
            end: async () => stream.end()
        };

        await ExportService.streamCsv(adapter, 'SELECT *', writable);

        // Wait for stream to end
        await new Promise(resolve => stream.on('end', resolve));

        // Header
        assert.ok(output.includes('id,val'));
        // Value: 9007199254740995 (exact string)
        assert.ok(output.includes('9007199254740995,123'));
    });

    it('Should escape special characters', async () => {
        const rows = [
            { text: 'Hello, World', note: 'Line\nBreak' },
            { text: 'Say "Hello"', note: null }
        ];
        const adapter = new MockAdapter(rows);
        const stream = new PassThrough();

        let output = '';
        stream.on('data', chunk => output += chunk.toString());

        const writable = {
            write: async (chunk) => stream.write(chunk),
            end: async () => stream.end()
        };

        await ExportService.streamCsv(adapter, 'SELECT *', writable);
        await new Promise(resolve => stream.on('end', resolve));

        // Check escaping
        // "Hello, World" -> wrapped in quotes
        assert.ok(output.includes('"Hello, World"'));
        // "Line\nBreak" -> wrapped in quotes
        assert.ok(output.includes('"Line\nBreak"'));
        // Say "Hello" -> "Say ""Hello"""
        assert.ok(output.includes('"Say ""Hello"""'));
    });
});
