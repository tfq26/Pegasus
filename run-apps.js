#!/usr/bin/env bun
// Script to run both UI and backend apps in Pegasus project using Bun
// Cross-platform compatible (Windows & Mac)

import { spawn } from "child_process";
import { join } from "path";

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

async function runCommand(command, args, cwd, label) {
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
            reject(err);
        });

        proc.on("exit", (code) => {
            console.log(`${label} exited with code ${code}`);
            resolve(code);
        });
    });
}

async function main() {
    const rootDir = process.cwd();

    // Start installs in parallel
    // Install dependencies at root (workspace)
    console.log("Installing dependencies...");
    await runCommand("bun", ["install"], rootDir, "Root Install");

    const backendDir = join(rootDir, "apps", "backend");
    const uiDir = join(rootDir, "apps", "ui");

    // Start backend in background with hot reload
    runCommand("bun", ["run", "--hot", "index.js"], backendDir, "Backend")
        .catch((err) => console.error("Backend error:", err));

    // Give backend a moment to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start UI in background
    runCommand("bun", ["dev"], uiDir, "UI")
        .catch((err) => console.error("UI error:", err));

    console.log("\nBoth apps are running. Press Ctrl+C to stop.");

    // Keep the script running
    await new Promise(() => { });
}

main().catch((err) => {
    console.error("Fatal error:", err);
    cleanup();
});
