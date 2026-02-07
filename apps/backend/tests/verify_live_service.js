
import { LiveDataService } from "../src/services/LiveDataService.js";
import { expect, test, mock } from "bun:test";

// Mock Socket.IO
const mockEmit = mock();
const mockTo = mock(() => ({ emit: mockEmit }));
mock.module("../src/socket.js", () => ({
    getIO: () => ({
        to: mockTo
    })
}));

// Mock Adapters
class MockSqlAdapter {
    constructor() {
        this.data = [
            { id: 1, created_at: new Date(Date.now() - 10000).toISOString(), value: 'old' },
            { id: 2, created_at: new Date().toISOString(), value: 'new' }
        ];
    }
    async query(q) {
        console.log(`[MockSQL] Query: ${q}`);
        // Simple mock: return data if it matches criterion (heuristic)
        if (q.includes('>')) {
            return [this.data[1]]; // Return the 'new' item
        }
        return [];
    }
}

class MockCosmosAdapter {
    constructor() {
        this.container = {
            items: {
                getChangeFeedIterator: () => ({
                    hasMoreResults: true,
                    readNext: async () => ({
                        statusCode: 200,
                        resources: [{ id: 'c1', _ts: 12345 }]
                    })
                })
            }
        };
    }
}

const service = new LiveDataService();

console.log("🧪 Testing LiveDataService...");

// Test 1: SQL Polling
console.log("   1. Testing SQL Polling Strategy...");
const sqlAdapter = new MockSqlAdapter();
await service.startMonitor(sqlAdapter, 'postgres', 'users', 'mon:1', { dateColumn: 'created_at' });

// Wait a bit for polling loop
await new Promise(r => setTimeout(r, 100));

if (mockTo.mock.calls.length > 0 && mockEmit.mock.calls.length > 0) {
    console.log("✅ SQL Polling emitted event!");
    console.log("   Room:", mockTo.mock.calls[0][0]);
    console.log("   Event:", mockEmit.mock.calls[0][0]);
    console.log("   Data:", mockEmit.mock.calls[0][1]);
} else {
    console.error("❌ SQL Polling FAILED to emit event.");
    process.exit(1);
}

// Test 2: Cosmos Change Feed
console.log("\n   2. Testing Cosmos Change Feed Strategy...");
// Reset mocks
mockTo.mockClear();
mockEmit.mockClear();

const cosmosAdapter = new MockCosmosAdapter();
// We limit the loop by mocking stop? No, we just start and stop quickly.
// Since loop is async, we start it, wait, then stop.
const p = service.startMonitor(cosmosAdapter, 'cosmosdb', 'items', 'mon:2');

// Wait for loop
await new Promise(r => setTimeout(r, 100));
service.stopMonitor('mon:2');

if (mockTo.mock.calls.length > 0) {
    console.log("✅ Cosmos Change Feed emitted event!");
} else {
    console.error("❌ Cosmos Change Feed FAILED to emit event.");
    process.exit(1);
}

console.log("\n✅ All LiveDataService tests passed.");
process.exit(0);
