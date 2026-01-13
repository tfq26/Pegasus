#!/usr/bin/env bun
// Script to run Pegasus apps with different modes
// Usage:
//   bun run run-apps.js         # Run web version (db + backend + ui)
//   bun run run-apps.js --web   # Run web version (db + backend + ui)
//   bun run run-apps.js --desktop  # Run desktop version (db + backend + tauri)
//   bun run run-apps.js --all   # Run everything (db + backend + ui + tauri)

import { spawn, execSync } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args.includes('--desktop') ? 'desktop'
    : args.includes('--all') ? 'all'
        : 'web'; // Default to web

const isDevMode = args.includes('--dev');
if (isDevMode) {
    process.env.PEGASUS_DEV_MODE = 'true';
    process.env.VITE_PEGASUS_DEV_MODE = 'true';

    // Parse additional dev flags
    const filesToAdd = [];
    const connsToAdd = [];

    args.forEach((arg, i) => {
        if (arg === '--add-file' && args[i + 1]) {
            filesToAdd.push(args[i + 1]);
        }
        if (arg === '--add-connection' && args[i + 1]) {
            connsToAdd.push(args[i + 1]);
        }
    });

    if (filesToAdd.length > 0) {
        process.env.PEGASUS_AUTO_IMPORT_FILES = filesToAdd.join(',');
    }
    if (connsToAdd.length > 0) {
        process.env.PEGASUS_AUTO_IMPORT_CONNS = connsToAdd.join('|');
    }

    console.log("🛠️  Development mode enabled (bypassing auth, auto-populating test data)");
    if (filesToAdd.length) console.log(`📂  Auto-importing files: ${filesToAdd.join(', ')}`);
}

console.log(`\n🚀 Starting Pegasus in ${mode.toUpperCase()} mode...\n`);

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
        // Try Mac/Linux first
        const output = execSync(`lsof -ti:${port} 2>/dev/null || true`).toString().trim();
        if (output) {
            output.split('\n').forEach(pid => {
                if (pid) {
                    console.log(`Killing process on port ${port} (PID: ${pid})...`);
                    try {
                        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                    } catch (e) {
                        // ignore
                    }
                }
            });
        }
    } catch (e) {
        // Try Windows fallback
        try {
            const output = execSync(`netstat -ano | findstr :${port}`).toString();
            const lines = output.split('\n').filter(line => line.includes('LISTENING'));

            if (lines.length > 0) {
                const pidMatch = lines[0].trim().split(/\s+/).pop();
                if (pidMatch) {
                    console.log(`Killing process on port ${port} (PID: ${pidMatch})...`);
                    try {
                        execSync(`taskkill /PID ${pidMatch} /F`, { stdio: 'ignore' });
                    } catch (e) {
                        // ignore
                    }
                }
            }
        } catch (e) {
            // No process found
        }
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
        stdio: "inherit",
        shell: true
    });

    processes.push(proc);

    // Give it a moment to start
    return new Promise(resolve => setTimeout(resolve, 2000));
}

async function main() {
    const rootDir = import.meta.dir;

    killPort(3000); // Kill backend port
    killPort(5173); // Kill UI port
    if (mode === 'desktop' || mode === 'all') {
        killPort(1420); // Kill Tauri dev port
    }

    // Install dependencies
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
    const desktopDir = join(rootDir, "apps", "desktop");

    // Start backend in background using Node (for Socket.io support)
    // Using --watch to auto-restart on file changes
    runCommand("node", ["--watch", "--env-file=.env", "index.js"], backendDir, "Backend")
        .catch((err) => console.error("Backend error:", err));

    // Give backend a moment to connect to DB
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start UI if web or all mode
    if (mode === 'web' || mode === 'all') {
        runCommand("bun", ["dev"], uiDir, "UI (Web)")
            .catch((err) => console.error("UI error:", err));
    }

    // Start Tauri if desktop or all mode
    if (mode === 'desktop' || mode === 'all') {
        // Wait a bit more for UI dev server to start before Tauri
        await new Promise((resolve) => setTimeout(resolve, 3000));
        runCommand("bun", ["tauri", "dev"], desktopDir, "Tauri Desktop")
            .catch((err) => console.error("Tauri error:", err));
    }

    const modeLabel = mode === 'all' ? 'Web + Desktop' : mode === 'desktop' ? 'Desktop' : 'Web';
    console.log(`\n✅ All systems operational (${modeLabel}). Press Ctrl+C to stop.\n`);
    console.log("Available endpoints:");
    console.log("  • Backend API: http://localhost:3000");
    if (mode === 'web' || mode === 'all') {
        console.log("  • Web UI: http://localhost:5173");
    }
    if (mode === 'desktop' || mode === 'all') {
        console.log("  • Desktop: Tauri window (port 1420)");
    }
    console.log("");

    // Keep the script running
    await new Promise(() => { });
}

main().catch((err) => {
    console.error("Fatal error:", err);
    cleanup();
});
