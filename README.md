# Pegasus — workspace helpers

This repository contains multiple projects (web UI, desktop app, API projects). The files added here provide convenient ways to start the Vue frontend and the desktop app from the repository root or using VS Code tasks.

What I added
- `package.json` (root) — npm scripts:
  - `npm run ui` — cd into `pegasus-ui`, install deps, run the Vite dev server.
  - `npm run desktop` — cd into `pegasus-desktop`, install deps, run the desktop dev script.
- `.vscode/tasks.json` — tasks to start the UI or Desktop from the Run Tasks UI.
- `.vscode/launch.json` — helper launch config to open the UI in the browser once the UI task is run.

How to use

From a shell (recommended):

1. Start the Vue UI:

   npm run ui

   (This runs `cd pegasus-ui && npm install && npm run dev`.)

2. In a second terminal, start the desktop app:

   npm run desktop

   (This runs `cd pegasus-desktop && npm install && npm run dev`.)

From VS Code:

1. Open the Command Palette (Cmd+Shift+P) and run "Tasks: Run Task" and pick "Start Pegasus UI" or "Start Pegasus Desktop".
2. After the UI task is running, use the Run and Debug panel to run the "Open Pegasus UI in Browser" launch config.

Notes and prerequisites

- The UI (`pegasus-ui`) is a Vite + Vue dev server; it typically serves on http://localhost:5173. If your local dev server uses a different port, update `.vscode/launch.json`.
- The desktop project (`pegasus-desktop`) appears to be a Tauri app (it contains Rust and a `src-tauri` folder). To run the desktop dev server you'll need the Tauri/Rust toolchain installed on your machine (Rust, cargo, and any platform-specific prerequisites). See the `pegasus-desktop` README for details if present.
- I intentionally kept the root scripts simple so they don't add new dependencies. If you'd like a single command to run both servers concurrently, I can add `concurrently` or `npm-run-all` and wire a `start:both` script.

Next steps (optional)

- Add a `start:both` script using `concurrently` so one command launches both dev servers.
- Add port checks and smarter detection if `pegasus-ui` uses a non-default Vite port.
- Add platform-specific docs for building the Tauri desktop app.

If you want, I can add the `start:both` script now and wire up a single VS Code compound task to run both at once.
