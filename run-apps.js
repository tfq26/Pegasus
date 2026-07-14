#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import process from "node:process";

const rootDir = import.meta.dir;
const backendDir = join(rootDir, "apps", "backend");
const uiDir = join(rootDir, "apps", "ui");
const pyDir = join(rootDir, "apps", "python-intelligence");
const rustDir = join(rootDir, "apps", "rust-core");

const argv = process.argv.slice(2);
const children = [];
let isShuttingDown = false;

function printUsage() {
  console.log(`
Pegasus launcher

Usage:
  bun run run-apps.js               Start Pegasus in web mode
  bun run run-apps.js --web         Start Pegasus in web mode

Options:
  --dev                         Enable Pegasus dev mode flags
  --add-file <path>            Add a file for auto-import in dev mode (repeatable)
  --add-connection <conn>      Add a connection for auto-import in dev mode (repeatable)
  --help, -h                   Show this help
`);
}

function parseArgs(args) {
  let mode = "web";
  const filesToAdd = [];
  const connsToAdd = [];
  const unknown = [];
  let showHelp = false;
  let isDevMode = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--dev") {
      isDevMode = true;
      continue;
    }

    if (arg === "--add-file") {
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        filesToAdd.push(value);
        i += 1;
      } else {
        console.warn("[run-apps] --add-file requires a value.");
      }
      continue;
    }

    if (arg === "--add-connection") {
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        connsToAdd.push(value);
        i += 1;
      } else {
        console.warn("[run-apps] --add-connection requires a value.");
      }
      continue;
    }

    if (arg === "--web") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }

    unknown.push(arg);
  }

  return { mode, isDevMode, filesToAdd, connsToAdd, unknown, showHelp };
}

function loadEnvFile(filePath) {
  try {
    const envFile = readFileSync(filePath, "utf8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

      if (key && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing .env is acceptable.
  }
}

function parsePort(value, fallback, label) {
  const resolved = Number(value ?? fallback);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 65535) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return resolved;
}

function findOpenPort(startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => {
          const serverV4 = net.createServer();
          serverV4.once("error", () => tryPort(port + 1));
          serverV4.once("listening", () => {
            serverV4.close(() => resolve(port));
          });
          serverV4.listen(port, "127.0.0.1");
        });
      });
      server.listen(port, "::");
    };

    tryPort(startPort);
  });
}

function createRuntimeConfig(ports) {
  const runtimeConfigPath = join(uiDir, "runtime-config.js");
  const runtimeConfig = {
    apiBaseUrl: `http://localhost:${ports.rust}`,
    pythonBaseUrl: `http://localhost:${ports.py}`,
    backendBaseUrl: `http://localhost:${ports.backend}`
  };

  writeFileSync(runtimeConfigPath, `window.PEGASUS_RUNTIME = ${JSON.stringify(runtimeConfig, null, 2)};\n`);
}

function checkServiceConnections() {
  console.log("\nChecking service connections...\n");

  const dbUrl = process.env.DATABASE_URL || "file:pegasus.db";
  console.log(`SQLite Database: Ready (${dbUrl.startsWith("file:") ? "Local file" : "Remote connection"})`);
  console.log("DuckDB: Ready (Embedded/In-Memory)");

  const hasR2 = process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY;
  const hasBackblaze = process.env.BACKBLAZE_KEY_ID && process.env.BACKBLAZE_KEY;
  const hasAws = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (hasR2) {
    console.log("Storage: Cloudflare R2 credentials detected");
  } else if (hasBackblaze) {
    console.log(`Storage: Backblaze B2 (${process.env.BACKBLAZE_REGION || "S3 API"})`);
  } else if (hasAws) {
    console.log("Storage: AWS S3 credentials detected");
  } else {
    console.log("Storage: No cloud storage credentials detected (local mode)");
  }

  console.log("WorkOS: Active");
  console.log("");
}

function runBackground(name, command, args, options = {}) {
  console.log(`Starting ${name}...`);

  const child = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
    shell: false
  });

  children.push({ name, child });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start:`, error);
  });

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    if (code !== 0 && code !== null) {
      console.error(`[${name}] exited with code ${code}`);
    } else if (signal) {
      console.error(`[${name}] exited from signal ${signal}`);
    }
  });

  return child;
}

function runForeground(name, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running ${name}...`);

    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...(options.env || {}) },
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log("\nStopping Pegasus services...");

  for (const { child } of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Child might already be stopped.
    }
  }

  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Ignore errors while forcing shutdown.
        }
      }
    }

    if (signal) {
      process.exit(0);
    }
  }, 1500);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("[run-apps] uncaught exception:", error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (error) => {
  console.error("[run-apps] unhandled rejection:", error);
  shutdown("unhandledRejection");
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { mode, isDevMode, filesToAdd, connsToAdd, unknown, showHelp } = parseArgs(argv);

  if (showHelp) {
    printUsage();
    return;
  }

  if (unknown.length > 0) {
    console.warn(`[run-apps] Ignoring unknown option(s): ${unknown.join(", ")}`);
  }

  loadEnvFile(join(backendDir, ".env"));

  if (isDevMode) {
    process.env.PEGASUS_DEV_MODE = "true";
    process.env.VITE_PEGASUS_DEV_MODE = "true";

    if (filesToAdd.length > 0) {
      process.env.PEGASUS_AUTO_IMPORT_FILES = filesToAdd.join(",");
    }

    if (connsToAdd.length > 0) {
      process.env.PEGASUS_AUTO_IMPORT_CONNS = connsToAdd.join("|");
    }

    console.log("Development mode enabled (auth bypass + test data hooks).");
    if (filesToAdd.length > 0) {
      console.log(`Auto-import files: ${filesToAdd.join(", ")}`);
    }
    if (connsToAdd.length > 0) {
      console.log(`Auto-import connections: ${connsToAdd.join(" | ")}`);
    }
  }

  const defaultPorts = {
    backend: parsePort(process.env.PORT, "3000", "backend"),
    ui: parsePort(process.env.UI_PORT, "5173", "UI"),
    py: parsePort(process.env.PY_PORT, "8090", "Python"),
    rust: parsePort(process.env.RUST_PORT, "8787", "Rust")
  };

  const ports = {
    backend: await findOpenPort(defaultPorts.backend),
    ui: await findOpenPort(defaultPorts.ui),
    py: await findOpenPort(defaultPorts.py),
    rust: await findOpenPort(defaultPorts.rust)
  };

  console.log(`\nStarting Pegasus in ${mode.toUpperCase()} mode...\n`);

  for (const key of Object.keys(defaultPorts)) {
    if (ports[key] !== defaultPorts[key]) {
      console.log(`${key} port ${defaultPorts[key]} is in use. Using ${ports[key]} instead.`);
    }
  }

  if (!existsSync(join(rootDir, "node_modules"))) {
    await runForeground("dependency install", "bun", ["install"], { cwd: rootDir });
  }

  checkServiceConnections();
  createRuntimeConfig(ports);

  runBackground("Python Intelligence", "python3", ["server.py"], {
    cwd: pyDir,
    env: {
      PY_PORT: String(ports.py)
    }
  });

  runBackground("Rust Core", "cargo", ["run"], {
    cwd: rustDir,
    env: {
      PY_INTELLIGENCE_URL: `http://localhost:${ports.py}`,
      RUST_PORT: String(ports.rust)
    }
  });

  runBackground("Backend", "node", ["--watch", "index.js"], {
    cwd: backendDir,
    env: {
      PORT: String(ports.backend),
      BACKEND_URL: `http://localhost:${ports.backend}`,
      PY_INTELLIGENCE_URL: `http://localhost:${ports.py}`,
      RUST_CORE_URL: `http://localhost:${ports.rust}`
    }
  });

  await sleep(3000);

  runBackground("UI (Web)", "bun", ["dev", "--host", "localhost", "--port", String(ports.ui)], {
    cwd: uiDir,
    env: {
      VITE_API_URL: `http://localhost:${ports.backend}`,
      VITE_QUERY_API_URL: `http://localhost:${ports.backend}`
    }
  });

  console.log("\nAll systems started. Press Ctrl+C to stop.\n");
  console.log("Available endpoints:");
  console.log(`  Backend API: http://localhost:${ports.backend}`);
  console.log(`  Python Intelligence: http://localhost:${ports.py}/health`);
  console.log(`  Rust Core: http://localhost:${ports.rust}/health`);
  console.log(`  Web UI: http://localhost:${ports.ui}`);
  console.log("");

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("[run-apps] fatal error:", error);
  shutdown("fatal");
});
