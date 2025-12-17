#!/usr/bin/env bun
// Script to run both UI and backend apps in Pegasus project using Bun
// Cross-platform compatible (Windows & Mac)

import { spawn, execSync } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";

// Load environment variables from backend .env file
try {
    const envPath = join(import.meta.dir, "apps", "backend", ".env");
    const envFile = readFileSync(envPath, "utf8");
    envFile.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=");
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join("=").trim();
            }
        }
    });
} catch (e) {
    // .env file doesn't exist, use defaults
}

const processes = [];

// Function to handle cleanup on exit
function cleanup() {
    console.log("\nStopping background processes...");
    processes.forEach((proc) => {
        try {
            proc.kill();
        } catch (err) {
            // Process might already be dead
        }
    });
    console.log("Cleanup complete.");
    process.exit(0);
}

// Set up cleanup handlers
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

function killPort(port) {
    try {
        // Windows-compatible port killing using netstat and taskkill
        const output = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = output.split('\n').filter(line => line.includes('LISTENING'));

        if (lines.length > 0) {
            const pidMatch = lines[0].trim().split(/\s+/).pop();
            if (pidMatch) {
                console.log(`Killing process on port ${port} (PID: ${pidMatch})...`);
                try {
                    execSync(`taskkill /PID ${pidMatch} /F`, { stdio: 'ignore' });
                } catch (e) {
                    // ignore - process might already be dead
                }
            }
        }
    } catch (e) {
        // No process found on port or command failed
    }
}

async function runCommand(command, args, cwd, label, ignoreError = false) {
    return new Promise((resolve, reject) => {
        console.log(`Starting ${label}...`);

        const proc = spawn(command, args, {
            cwd,
            stdio: "inherit",
            shell: true,
        });

        processes.push(proc);

        proc.on("error", (err) => {
            console.error(`Error starting ${label}:`, err);
            if (!ignoreError) reject(err);
        });

        proc.on("exit", (code) => {
            if (code !== 0 && code !== null && !ignoreError) {
                console.log(`${label} exited with code ${code}`);
                // resolve(code); // Don't reject, just resolve code
            }
            resolve(code);
        });
    });
}

async function startSurrealDB(rootDir) {
    killPort(8000); // Ensure port is free

    console.log("Starting SurrealDB...");
    const dbPath = join(rootDir, "pegasus.db");
    const args = ["start", "--user", "root", "--pass", "root", "--bind", "127.0.0.1:8000", `file:${dbPath}`];

    const proc = spawn("surreal", args, {
        cwd: rootDir,
        stdio: "inherit", // Pipe output so we can see DB logs
        shell: true
    });

    processes.push(proc);

    // Give it a moment to start
    return new Promise(resolve => setTimeout(resolve, 2000));
}

async function main() {
    const rootDir = import.meta.dir;

    killPort(3000); // Kill backend port
    killPort(5173); // Kill UI port (optional, vite usually handles it, but safer)

    // Start installs in parallel
    console.log("Installing dependencies...");
    await runCommand("bun", ["install"], rootDir, "Root Install");

    // Check if using cloud database
    const surrealUrl = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
    const isCloudDatabase = surrealUrl.startsWith('wss://');

    if (isCloudDatabase) {
        console.log("\n🌐 ========================================");
        console.log("🌐  USING SURREAL CLOUD DATABASE");
        console.log("🌐  URL:", surrealUrl);
        console.log("🌐  Skipping local SurrealDB startup");
        console.log("🌐 ========================================\n");
    } else {
        console.log("\n⚠️  ========================================");
        console.log("⚠️   WARNING: USING LOCAL DATABASE");
        console.log("⚠️   URL:", surrealUrl);
        console.log("⚠️   Data is stored locally, not in cloud");
        console.log("⚠️  ========================================\n");

        // Start local DB only if not using cloud
        await startSurrealDB(rootDir);
    }

    const backendDir = join(rootDir, "apps", "backend");
    const uiDir = join(rootDir, "apps", "ui");

    // Start backend in background with hot reload
    runCommand("bun", ["run", "--hot", "index.js"], backendDir, "Backend")
        .catch((err) => console.error("Backend error:", err));

    // Give backend a moment to connect to DB
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start UI in background
    runCommand("bun", ["dev"], uiDir, "UI")
        .catch((err) => console.error("UI error:", err));

    console.log("\nAll systems operational (DB, Backend, UI). Press Ctrl+C to stop.");

    // Keep the script running
    await new Promise(() => { });
}

main().catch((err) => {
    console.error("Fatal error:", err);
    cleanup();
});
