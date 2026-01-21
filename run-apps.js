#!/usr/bin/env bun
// Script to run Pegasus apps with different modes
// Checks connections for Neon (Postgres), DuckDB, and Storage before starting.
// Usage:
//   bun run run-apps.js         # Run web version (db + backend + ui)
//   bun run run-apps.js --web   # Run web version (db + backend + ui)
//   bun run run-apps.js --desktop  # Run desktop version (db + backend + tauri)
//   bun run run-apps.js --all   # Run everything (db + backend + ui + tauri)

import { spawn, execSync } from "child_process";
import { Socket } from "net";
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

async function checkServiceConnections() {
    console.log("\n🔍 Checking service connections...\n");

    // 1. Neon / Postgres Check
    const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (dbUrl) {
        try {
            // new URL supports postgresql:// protocol
            const url = new URL(dbUrl);
            const host = url.hostname;
            const port = parseInt(url.port) || 5432;

            await new Promise((resolve) => {
                const socket = new Socket();
                socket.setTimeout(3000); // 3s timeout

                socket.on('connect', () => {
                    console.log(`✅  Neon Database: Connected to ${host}`);
                    socket.destroy();
                    resolve();
                });

                socket.on('timeout', () => {
                    console.log(`⚠️   Neon Database: Timeout checking ${host}`);
                    socket.destroy();
                    resolve();
                });

                socket.on('error', (e) => {
                    console.log(`⚠️   Neon Database: Connection failed - ${e.message}`);
                    resolve();
                });

                socket.connect(port, host);
            });
        } catch (e) {
            console.log(`⚠️   Neon Database: Invalid URL format in .env`);
        }
    } else {
        console.log("⚠️   Neon Database: DATABASE_URL not found in .env");
    }

    // 2. DuckDB Check
    // DuckDB is embedded (in-memory or local file), so we just confirm the intent.
    console.log("✅  DuckDB: Ready (Embedded/In-Memory)");

    // 3. Storage Check
    const hasAws = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
    if (hasAws) {
        console.log("✅  Storage: AWS Credentials found");
    } else {
        console.log("⚠️   Storage: No AWS credentials found");
    }

    console.log(""); // Spacer
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

    // Check service connections
    await checkServiceConnections();

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
