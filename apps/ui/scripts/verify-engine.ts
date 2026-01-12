
import { Engine } from '../src/components/TableView/Engine/Engine';
import { CellType } from '../src/components/TableView/Engine/types';

// Mock Browser Environment
const mockStorage = new Map<string, string>();
global.localStorage = {
    getItem: (key: string) => mockStorage.get(key) || null,
    setItem: (key: string, value: string) => mockStorage.set(key, value),
    removeItem: (key: string) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
    key: (i: number) => Array.from(mockStorage.keys())[i] || null,
    length: 0
} as any;

global.window = {
    addEventListener: () => { },
    removeEventListener: () => { },
    requestAnimationFrame: (cb: any) => setTimeout(cb, 16),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    localStorage: global.localStorage,
    VITE_QUERY_API_URL: 'http://test-api'
} as any;

// Mock Fetch
global.fetch = (async (url: any, options: any) => {
    // console.log('Fetch called:', url, options?.body);
    // Parse body to see offset
    let offset = 0;
    let limit = 100;

    if (options?.body) {
        const body = JSON.parse(options.body as string);
        offset = body.query?.offset || 0;
        limit = body.query?.limit || 100;
    }

    const rows = Array(limit).fill(0).map((_, i) => {
        const rowId = offset + i;
        return {
            __id: `row_${rowId}`,
            col1: `Row${rowId}`,
            col2: rowId * 10
        };
    });

    return {
        ok: true,
        json: async () => ({
            rows,
            totalCount: 10000,
            columns: [
                { name: 'col1', type: 'string' },
                { name: 'col2', type: 'number' }
            ]
        })
    };
}) as any;

// Mock import.meta (for Engine.ts usage)
// @ts-ignore
(global as any).import = { meta: { env: { VITE_API_URL: 'http://test-api' } } };

async function runVerification() {
    console.log('🚀 Starting Engine Verification...');

    // 1. Initialize Engine
    const config = { rowCount: 100, colCount: 10 };
    const engine = new Engine(config);
    console.log('✅ Engine initialized');

    // 2. Setup Data Source
    // We mock the connection object
    engine.setSource('test_table', { id: 'conn1' }, ['col1', 'col2'], 'test-provider');
    console.log('✅ Data Source set');

    // 3. Verify Virtualization
    if (!engine.isVirtualized) throw new Error('Engine should be virtualized');
    console.log('✅ Virtualization enabled');

    // 4. Trigger Load (Viewport)
    // Engine starts with viewport 0-100.
    // VirtualDataProvider should trigger default load.
    engine.setViewport(0, 50);

    // Wait for async fetch simulation
    console.log('⏳ Waiting for data load...');
    await new Promise(r => setTimeout(r, 200));

    // 5. Verify Data Loaded
    // Try to get Row 0, Col 0 ('col1') -> Should be "Row0"
    // Since getCell is slightly hybrid, it checks map then ColumnStore.
    // Map is empty. ColumnStore should have data IF fetch succeeded AND onChunkLoaded fired.

    // Debug: Check if data loaded
    // We can't access columnStore directly if private, but we can verify via public API
    const cell0 = engine.getCell({ row: 0, col: 0 });
    // row 0 in grid is typically row index 0. `getCell` uses 0-based.
    // Engine `setOriginalData` logic uses 1-based rowIdMap but ColumnStore uses 0-based index.
    // Let's assume 0-based consistency.

    if (cell0?.value !== 'Row0') {
        // Retry once more
        await new Promise(r => setTimeout(r, 200));
        const cellRetry = engine.getCell({ row: 0, col: 0 });
        if (cellRetry?.value !== 'Row0') {
            throw new Error(`Expected 'Row0', got '${cellRetry?.value ?? 'null'}' (raw: ${cellRetry?.rawInput})`);
        }
    }
    console.log('✅ Data loading verified (ColumnStore Read)');

    // 6. Verify Edit (Simple Value -> ColumnStore)
    console.log('📝 Testing Simple Edit...');
    await engine.setValue({ row: 0, col: 1 }, "999");
    const cellEdit = engine.getCell({ row: 0, col: 1 }); // col2

    // ColumnStore should return number 999
    if (Number(cellEdit?.value) !== 999) {
        throw new Error(`Expected 999, got ${cellEdit?.value}`);
    }
    console.log('✅ Simple Value Edit verified');

    // 7. Verify Formula (Sparse Map)
    console.log('📝 Testing Formula...');
    await engine.setValue({ row: 1, col: 1 }, "=50+50"); // row 1, col 1
    const cellFormula = engine.getCell({ row: 1, col: 1 });

    if (cellFormula?.type !== CellType.FORMULA) throw new Error('Expected FORMULA type');
    if (Number(cellFormula?.value) !== 100) {
        throw new Error(`Expected 100, got ${cellFormula?.value}`);
    }
    console.log('✅ Formula Edit verified (Sparse Map + Recalc)');

    // 8. Verify Persistence of Formula
    // Ensure it wasn't wiped by a column store refresh (though we didn't refresh)
    const cellFormula2 = engine.getCell({ row: 1, col: 1 });
    if (Number(cellFormula2?.value) !== 100) throw new Error('Formula value lost');

    // 9. Verify Memory/Performance (Simulated)
    // Load range 5000-5050
    console.log('🔄 Testing Scroll/Prefetch...');
    engine.setViewport(5000, 5050);
    await new Promise(r => setTimeout(r, 200)); // Wait for fetch

    const cell5000 = engine.getCell({ row: 5000, col: 0 });
    // Fetch mocks: "Row" + offset.
    if (cell5000?.value !== 'Row5000') {
        throw new Error(`Expected 'Row5000', got '${cell5000?.value ?? 'null'}'`);
    }
    console.log('✅ Scroll/Prefetch verified');

    console.log('🎉 All Engine Integration Tests Passed!');
}

runVerification().catch(e => {
    console.error('❌ Verification Failed:', e);
    process.exit(1);
});
