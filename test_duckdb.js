
import { Database } from 'duckdb-async';

async function test() {
    try {
        console.log("Connecting to DuckDB...");
        const db = await Database.create(':memory:');
        console.log("Running test query...");
        const result = await db.all('SELECT 1 + 1 as sum');
        console.log("Result:", result);
        if (result[0].sum === 2) {
            console.log("SUCCESS: DuckDB binary is working!");
        } else {
            console.log("FAILURE: Unexpected query result.");
        }
        await db.close();
    } catch (e) {
        console.error("FAILURE: DuckDB binary failed to load or execute:", e.message);
    }
}

test();
