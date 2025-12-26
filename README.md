<div align="center">
  <img src="apps/ui/public/pegasus-purple.svg" alt="Pegasus Logo" width="120" height="auto" />
  <h1>Pegasus</h1>
  <p><strong>The Intelligent Data Workspace</strong></p>
</div>

Pegasus is a modern, AI-native data platform designed to bridge the gap between database management, spreadsheet analysis, and business intelligence. It unifies your data workflows into a single, collaborative interface powered by advanced AI.

## Key Features

### AI-Powered Analysis
- **Natural Language Querying**: Interact with your databases using plain English. The AI understands your schema and generates accurate queries (SQL/SurrealQL).
- **Intelligent Visualizations**: Automatically generate charts and dashboards based on your data queries.
- **Smart Context**: The chat system maintains context across your session, allowing for iterative analysis.

### Advanced Spreadsheet Engine
- **Excel-Compatible Interface**: a custom-built, high-performance spreadsheet engine that feels familiar.
- **AI Formulas**: Generate complex formulas and data transformations using AI prompts.
- **Data Integration**: seamless sync between database query results and spreadsheet analysis.

### Real-Time Collaboration
- **Live Presence**: See who is viewing or editing data in real-time.
- **Collaborative Chat**: built-in team communication tools integrated directly into your data workspace.
- **Shared Workspaces**: Work together on dashboards and analysis sessions.

### Workspace Persistence
- **Connection-Aware State**: Your tabs, queries, and chats are automatically saved and associated with specific database connections.
- **Auto-Save**: Never lose work with robust auto-saving mechanisms.
- **Session Management**: Switch contexts without losing your place.

### Enterprise Ready
- **Pro Subscriptions**: Integrated Stripe billing for premium features and higher AI limits.
- **Role-Based Access**: Granular privacy controls for dashboards and shared assets.
- **Performance**: Optimized for large datasets with virtualized rendering and efficient data fetching.

## Getting Started

### Prerequisites
- **Bun** (v1.2+): This project relies on the Bun runtime for fast script execution and package management.

### Installation

Install all dependencies across the monorepo:

```bash
bun install
```

### Running the Application

Start the development server:

```bash
bun run start
```

This will launch all necessary services and the frontend application.

## Architecture

Pegasus is built as a monorepo using:
- **Frontend**: Vue 3, TailwindCSS, Pinia
- **Backend**: Node.js/Bun, SurrealDB
- **Tooling**: TurboRepo, Playwright (Testing)
 
