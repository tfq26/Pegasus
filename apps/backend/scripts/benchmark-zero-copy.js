
import { DuckDBAdapter } from '../adapters/duckdbAdapter.js';
import { StorageManager } from '../src/services/storage/StorageManager.js';
import fs from 'fs/promises';
import path from 'path';

async function benchmark() {
    console.log("Starting Zero-Copy vs Local Benchmark...");

    // Setup: We need a reasonably sized file.
    // If one doesn't exist, we might need to create/upload one or use an existing one.
    // For this PoC, we'll try to use an existing upload or create a dummy one if possible.

    // 1. Create a dummy CSV (approx 5MB to notice difference)
    const testFile = 'benchmark_data.csv';
    const rowCount = 50000;
    console.log(`Generating ${rowCount} rows test file...`);

    const header = "id,name,value,category,timestamp\n";
    let content = header;
    for (let i = 0; i < rowCount; i++) {
        content += `${i},Item ${i},${Math.random() * 1000},Category ${i % 5},${new Date().toISOString()}\n`;
    }

    await fs.writeFile(testFile, content);
    console.log(`Created ${testFile} (${(content.length / 1024 / 1024).toFixed(2)} MB)`);

    // 2. Upload to S3 (simulate user upload)
    const userId = 'benchmark_user';
    const key = `uploads/${testFile}`;

    // We can use StorageManager to upload if it supports it, or just use S3Provider directly if exposed.
    // Adapters don't usually upload. Let's use StorageManager.getProvider().
    const provider = await StorageManager.getProvider(userId);

    console.log(`Uploading to ${provider.providerType}...`);
    // Ensure bucket exists or handle error (S3Provider handles auto-create in write/upload)
    await provider.upload(key, Buffer.from(content), 'text/csv');
    console.log("Upload complete.");

    // 3. Benchmark Zero-Copy
    console.log("\n--- Benchmarking Zero-Copy (HTTPFS) ---");
    const zeroCopyConfig = { path: key, provider: 'duckdb' };
    const t0 = performance.now();

    const adapterZC = new DuckDBAdapter(zeroCopyConfig, userId);
    await adapterZC.connect();

    // Force a read (e.g. count rows)
    const countZC = await adapterZC.query(`SELECT COUNT(*) as c FROM "${Object.keys(await adapterZC.getSchema())[0]}"`);

    const t1 = performance.now();
    console.log(`Zero-Copy Time: ${(t1 - t0).toFixed(2)} ms`);
    console.log(`Row Count: ${countZC[0].c}`);
    await adapterZC.disconnect();


    // 4. Benchmark Local Download
    console.log("\n--- Benchmarking Local Download (Legacy) ---");
    // We need to bypass the "preferSignedUrl" optimization in DuckDBAdapter
    // Ideally we would toggle a flag, but since it's hardcoded to try URL first for data files,
    // we might need to simulate a failure or just call resolveDatabasePath manually to measure download time + connect time.

    const t2 = performance.now();

    // First, strictly measure download time
    const localpath = await StorageManager.getLocalPath(userId, key); // Downloads to cache

    // Then connect to local file
    const adapterLocal = new DuckDBAdapter({ path: localpath, provider: 'duckdb' }, userId);
    await adapterLocal.connect();

    const countLocal = await adapterLocal.query(`SELECT COUNT(*) as c FROM "${Object.keys(await adapterLocal.getSchema())[0]}"`);

    const t3 = performance.now();
    console.log(`Local Download + Query Time: ${(t3 - t2).toFixed(2)} ms`);
    console.log(`Row Count: ${countLocal[0].c}`);

    await adapterLocal.disconnect();

    // Cleanup
    await fs.unlink(testFile);
    // await provider.delete(key); // Optional: keep for manual inspection

    console.log("\nBenchmark Complete.");
}

benchmark().catch(console.error);
