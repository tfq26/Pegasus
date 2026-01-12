#!/usr/bin/env bun
/**
 * Test Data Generator for Pegasus Spreadsheet Engine
 * 
 * Generates large CSV datasets for performance testing.
 * 
 * Usage:
 *   bun run scripts/generate-test-data.ts --rows 1000000 --output test_data.csv
 *   bun run scripts/generate-test-data.ts --rows 1000000 --format json --output test_data.json
 */

import { parseArgs } from "util";
import { writeFileSync, createWriteStream } from "fs";
import { join } from "path";

// Parse command line arguments
const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        rows: { type: "string", default: "1000000" },
        cols: { type: "string", default: "26" },
        output: { type: "string", default: "test_data.csv" },
        format: { type: "string", default: "csv" }, // csv or json
        help: { type: "boolean", default: false }
    }
});

if (values.help) {
    console.log(`
Test Data Generator for Pegasus Spreadsheet Engine

Usage:
  bun run scripts/generate-test-data.ts [options]

Options:
  --rows <number>    Number of rows (default: 1000000)
  --cols <number>    Number of columns (default: 26)
  --output <file>    Output filename (default: test_data.csv)
  --format <type>    Output format: csv or json (default: csv)
  --help             Show this help message

Examples:
  bun run scripts/generate-test-data.ts --rows 500000
  bun run scripts/generate-test-data.ts --rows 1000000 --cols 50 --output large_data.csv
  bun run scripts/generate-test-data.ts --rows 100000 --format json --output test.json
`);
    process.exit(0);
}

const rowCount = parseInt(values.rows || "1000000");
const colCount = parseInt(values.cols || "26");
const outputFile = values.output || "test_data.csv";
const format = values.format || "csv";

console.log(`
╔════════════════════════════════════════════════════════╗
║   Pegasus Test Data Generator                          ║
╚════════════════════════════════════════════════════════╝

Configuration:
  Rows:    ${rowCount.toLocaleString()}
  Columns: ${colCount}
  Format:  ${format.toUpperCase()}
  Output:  ${outputFile}
`);

// Column types for realistic data
type ColumnType = "id" | "string" | "number" | "date" | "boolean" | "email" | "currency";

interface ColumnDef {
    name: string;
    type: ColumnType;
}

// Generate column definitions
function generateColumns(count: number): ColumnDef[] {
    const types: ColumnType[] = ["id", "string", "number", "date", "boolean", "email", "currency"];
    const columns: ColumnDef[] = [];

    // First column is always ID
    columns.push({ name: "id", type: "id" });

    // Generate varied column types
    const names = [
        "name", "email", "phone", "address", "city", "country", "zip_code",
        "amount", "quantity", "price", "discount", "total", "tax", "balance",
        "created_at", "updated_at", "due_date", "birth_date",
        "is_active", "is_verified", "is_premium", "has_subscription",
        "notes", "description", "category", "status", "priority", "department"
    ];

    for (let i = 1; i < count; i++) {
        const name = names[i % names.length] + (i >= names.length ? `_${Math.floor(i / names.length)}` : "");
        const type = types[(i % (types.length - 1)) + 1]; // Skip 'id' for subsequent columns
        columns.push({ name, type });
    }

    return columns;
}

// Random data generators
const firstNames = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry", "Ivy", "Jack"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Taylor"];
const domains = ["gmail.com", "outlook.com", "yahoo.com", "company.co", "example.org"];
const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio"];
const statuses = ["pending", "approved", "rejected", "processing", "completed"];

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number = 2): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomDate(startYear: number = 2020, endYear: number = 2024): string {
    const year = randomInt(startYear, endYear);
    const month = randomInt(1, 12).toString().padStart(2, "0");
    const day = randomInt(1, 28).toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function randomBoolean(): boolean {
    return Math.random() > 0.5;
}

function randomString(row: number): string {
    const first = firstNames[row % firstNames.length];
    const last = lastNames[Math.floor(row / firstNames.length) % lastNames.length];
    return `${first} ${last}`;
}

function randomEmail(row: number): string {
    const first = firstNames[row % firstNames.length].toLowerCase();
    const last = lastNames[Math.floor(row / firstNames.length) % lastNames.length].toLowerCase();
    const domain = domains[row % domains.length];
    const num = row > 100 ? row : "";
    return `${first}.${last}${num}@${domain}`;
}

function generateValue(type: ColumnType, rowIndex: number): any {
    switch (type) {
        case "id":
            return rowIndex + 1;
        case "string":
            return randomString(rowIndex);
        case "number":
            return randomInt(1, 10000);
        case "date":
            return randomDate();
        case "boolean":
            return randomBoolean();
        case "email":
            return randomEmail(rowIndex);
        case "currency":
            return randomFloat(10, 5000);
        default:
            return "";
    }
}

// Generate data
const columns = generateColumns(colCount);
const startTime = Date.now();

console.log("Generating data...");

if (format === "csv") {
    // Stream CSV to file for memory efficiency
    const outputPath = join(process.cwd(), outputFile);
    const stream = createWriteStream(outputPath);

    // Write header
    stream.write(columns.map(c => c.name).join(",") + "\n");

    // Write rows in batches
    const batchSize = 10000;
    let written = 0;

    for (let batch = 0; batch < Math.ceil(rowCount / batchSize); batch++) {
        const batchStart = batch * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, rowCount);
        let batchData = "";

        for (let row = batchStart; row < batchEnd; row++) {
            const values = columns.map(col => {
                const val = generateValue(col.type, row);
                // Escape CSV values
                if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            batchData += values.join(",") + "\n";
        }

        stream.write(batchData);
        written = batchEnd;

        // Progress update
        if (batch % 10 === 0) {
            const percent = Math.round((written / rowCount) * 100);
            process.stdout.write(`\r  Progress: ${percent}% (${written.toLocaleString()} / ${rowCount.toLocaleString()} rows)`);
        }
    }

    stream.end();

    // Wait for stream to finish
    await new Promise((resolve) => stream.on("finish", resolve));

} else if (format === "json") {
    // For JSON, we need to be careful with memory
    // Write as NDJSON (newline-delimited JSON) for streaming
    const outputPath = join(process.cwd(), outputFile);
    const stream = createWriteStream(outputPath);

    const batchSize = 10000;
    let written = 0;

    for (let row = 0; row < rowCount; row++) {
        const obj: Record<string, any> = {};
        columns.forEach(col => {
            obj[col.name] = generateValue(col.type, row);
        });
        stream.write(JSON.stringify(obj) + "\n");
        written++;

        if (row % batchSize === 0) {
            const percent = Math.round((written / rowCount) * 100);
            process.stdout.write(`\r  Progress: ${percent}% (${written.toLocaleString()} / ${rowCount.toLocaleString()} rows)`);
        }
    }

    stream.end();
    await new Promise((resolve) => stream.on("finish", resolve));
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
const fileSizeBytes = Bun.file(join(process.cwd(), outputFile)).size;
const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

console.log(`\n
✓ Generation complete!

  File:     ${outputFile}
  Size:     ${fileSizeMB} MB
  Rows:     ${rowCount.toLocaleString()}
  Columns:  ${colCount}
  Time:     ${elapsed}s

To load in Pegasus:
  1. Start the app: bun run run-apps.js --web
  2. Use File Upload to import ${outputFile}
  3. Or connect to a database and import via SQL
`);
