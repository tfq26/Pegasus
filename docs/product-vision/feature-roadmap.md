# Pegasus Product Vision & Feature Roadmap

This document outlines the strategic roadmap for Pegasus, focusing on features that differentiate it from modern competitors like **DB Pro**. Our goal is to shift from being a "Database Client" to an **"AI-Powered Data Platform."**

## 1. Competitive Analysis: Pegasus vs. DB Pro

| Category | DB Pro (The Modern Standard) | Pegasus (The Intelligent Edge) |
| :--- | :--- | :--- |
| **Philosophy** | "Fast & Visual Desktop Client" | "AI-First Collaborative Data Platform" |
| **State Management** | Visual Edit Highlights | **Immutable Snapshots & Versioning** (Track table history) |
| **Editing Mode** | Standard Grid | **Excel-compatible Spreadsheet** (Formulas & Engine) |
| **AI Integration** | NL to SQL Querying | **Deep Reasoning, Translation & Explanation** |
| **Workflow** | Visual Node Builder | **Conversational Context-Aware Stream** |

---

## 2. High-Impact "Killer Features"

### A. The "Sandbox Explorer" (Private Mode Evolution)
*   **Problem:** Testing destructive queries or schema changes on live databases is terrifying. DB Pro shows a preview, but not a sandbox.
*   **The Idea:** Evolve Pegasus's "Private Mode" into a full virtual branch.
*   **The Pegasus Edge:** 
    *   One button "Branch Database" creates a temporary, isolated schema.
    *   AI populates the branch with matching **Mock Data** based on real distributions.
    *   User tests queries, and when satisfied, Pegasus generates the **Migration Script (DDL)** to apply changes to production.

### B. AI-Powered "Magic Relationships" (Relationship Discovery)
*   **Problem:** Data analysts often don't know the schema perfectly. Foreign keys are often missing in legacy databases.
*   **The Idea:** AI analyzes data patterns in real-time to suggest links.
*   **The Pegasus Edge:** 
    *   While browsing `Orders`, the sidebar suggests: *"Found 98% overlap between 'cid' and 'users.id'. Treat as a join?"*
    *   Generates virtual relationship maps that persist only in Pegasus, aiding cross-table exploration without schema modification.

### C. "Live Mirror" Dashboards (The BI layer)
*   **Problem:** Users have to switch to Tools like Tableau or Metabase to visualize data permanently.
*   **The Idea:** A third primary mode: **Dashboard Mode**.
*   **The Pegasus Edge:** 
    *   Users can "Mirror to Dashboard" any query result or spreadsheet selection.
    *   Pegasus maintains a live connection to that "Mirror," updating the visualization every X minutes.
    *   AI recommends the best chart type (Line, Sankey, Stat Card) based on the result set heuristics.

### D. AI Schema Architect (Visual ERD Evolution)
*   **Problem:** Designing a new database from scratch is error-prone.
*   **The Idea:** A conversation-driven schema builder.
*   **The Pegasus Edge:** 
    *   User: *"I'm building an Uber clone. I need riders, drivers, and trips."*
    *   Pegasus: Draws a **Visual ERD** in a new tab, handles normalization, and suggests indexes for trip performance.
    *   User can drag-and-drop nodes in the ERD to modify structure, and Pegasus updates the backend code automatically.

---

## 3. Immediate Implementation Priorities

1.  **Visual Schema Explorer (ERD):** Build an interactive canvas (using `v-network-graph` or `paper.js`) that visualizes the sidebar connections.
2.  **AI Metadata Layer:** Use the AI to "Tag" tables (e.g., "Finance", "Internal-Only") so the Explorer is organized semantically rather than alphabetically.
3.  **Collaborative Chat History:** Allow users to share a specific "Chat Tab" link with a teammate so they can see the exact query result and AI explanation.

---

## 4. Technical Sketches

### Sandbox Logic
```typescript
interface SandboxBranch {
  id: string;
  baseConnection: string;
  virtualSchema: Map<string, VirtualTable>;
  migrationLog: string[];
}
```

### Dashboard Widget Config
```typescript
interface DashboardWidget {
  type: 'chart' | 'stat' | 'table';
  sourceQuery: string;
  refreshInterval: number;
  config: ChartConfig;
}
```
