# Backend AI System Analysis & Refactoring Plan

> [!SUCCESS]
> **PoC Validation Complete**: The "Zero-Copy" architecture was validated with `tests/poc-s3-zero-copy.js`. DuckDB successfully queried a remote CSV via `httpfs` in ~640ms without local download, confirming Phase 4 is viable.

## Executive Summary
The current backend architecture for feeding data to the AI is functional but suffers from **high complexity, redundant logic, and "god function" patterns**. The system is overly reliant on runtime context assembly in the route handler (`chat.js`), leading to brittle connections and difficulty in maintaining state or context across turns.

To achieve a "comprehensive and cohesive system," we must shift from **On-Demand Context Assembly** to a **Semantic Data Mesh** approach.

---

## 1. Current State Analysis

### A. The "God Route" (`chat.js`)
The `/ai/generate` endpoint is doing too much:
1.  **Auth & Quota**: Standard.
2.  **Context Resolution Results**: Calls `OneContext`.
3.  **Adapter Orchestration**: Manually instantiates adapters (DuckDB, Postgres, etc.) based on raw config strings.
4.  **Schema Crawling**: Calls `ConnectionAnalyzer` loop for every connection.
5.  **Schema Merging**: Manually dedupes and merges detailed schemas.
6.  **Tool Execution**: Handles the tool loop and response parsing.
7.  **Error Handling**: Contains one-off fixes (e.g., BigInt serialization) that should be global.

**Impact**: This makes `chat.js` 1000+ lines long and fragile. Adding a new data source or logic requires modifying this central file.

### B. Context Resolution (`OneContext.js`)
*   **Current Logic**: Relies heavily on explicit regex (`#db`, `!file`) or a simple keyword search.
*   **Deficiency**: It returns "metadata" about resources, but not the *capabilities* or *semantics* of those resources. It doesn't know *what* is inside the file until `ConnectionAnalyzer` scans it later.

### C. Schema Analysis (`ConnectionAnalyzer.js`)
*   **Current Logic**: Fetches the first 10 tables + schemas + samples.
*   **Deficiency**:
    *   **Noise**: Floods the AI context with irrelevant tables if the workspace is large.
    *   **Lack of Semantics**: It presents `table_name` and `column_name`. If a user uploads `data_export_final.csv`, the AI has no idea it contains "Sales Data" unless it guesses from column names.

### D. Tool Redundancy (`SpreadsheetToolService.js`)
*   **Issue**: There is a split between **JavaScript Tools** (`analyze_data`) and **Database Tools** (`query_data`).
*   **Tech Debt**: `analyze_data` performs calculations (sum, max, filter) in JavaScript on a *sample* of the data. This is dangerous for large datasets and redundant since we have a powerful embedded DuckDB instance that can handle millions of rows via `query_data`.

---

## 2. Identified Tech Debt & "Convoluted" Subsystems

| Subsystem | Issue | Severity |
| :--- | :--- | :--- |
| **Route Handler** | `chat.js` handles data connectivity, schema merging, and tool execution. | 🔴 Critical |
| **JS Analysis Tools** | `analyze_data` operates on in-memory samples, leading to inaccurate results for large files. | 🟠 High |
| **Context Selection** | "First 10 tables" heuristic causes context window pollution. | 🟠 High |
| **Semantic Gap** | AI sees filenames (`Sheet1`) instead of semantic meanings (`Quarterly Revenue`). | 🟡 Medium |
| **One-off Fixes** | Logic like "active table detection" and "JSON cleaning" is scattered in the route. | 🟡 Medium |

### E. Storage Strategy (`StorageManager.js` & `DuckDBAdapter.js`)
*   **Current Logic**:
    *   `StorageManager.getLocalPath()` downloads the *entire* file from S3 to a local temp directory (`PEGASUS_CACHE`).
    *   DuckDB then queries the local file.
*   **Deficiency**:
    *   **Latency**: Querying a 1GB CSV requires downloading 1GB first. This kills real-time chat performance.
    *   **Disk Usage**: The backend server fills up with temp files.
    *   **Missed Opportunity**: DuckDB has a native `httpfs` extension that can query S3/Parquet files directly using range requests (fetching only the needed bytes).

---

## 3. Proposed Architecture: Semantic Data Mesh

We should refute the current pipeline into three distinct layers:

### Phase 1: The "Unified Data Layer" (Streamline)
**Goal**: Remove JS analysis tools and route *everything* through DuckDB (or the respective SQL adapter).
1.  **Deprecate `analyze_data`**: Remove the JS-based calculator.
2.  **Boost `query_data`**: Ensure it is the *only* way to access data. The AI writes a JSON Intent, the backend writes SQL.
3.  **Result**: Consistent results for 10 rows or 10 million rows.

### Phase 2: The "Semantic Registry" (Context)
**Goal**: Make the AI understand *what* the data is, not just what it is named.
1.  **New Service: `SemanticRegistry`**:
    *   When a file is uploaded/registered, run a background AI job to generate a 1-sentence description (e.g., "Contains transaction records with dates and amounts").
    *   Store this in the DB (`schema_metadata` table).
2.  **Smarter Prompting**:
    *   Instead of dumping 10 schemas, dump 50 *semantic descriptions*.
    *   AI selects relevant tables based on description.
    *   Only *then* fetch the full column schema for the selected tables.

### Phase 3: The "DataContext Service" (Refactor)
**Goal**: Clean up `chat.js`.
1.  **New Service: `DataContextService`**:
    *   Method `buildContext(userQuery, userId)`:
        *   Calls `OneContext` to find resources.
        *   Instantiates Adapters (managed pool).
        *   Fetches Semantic Metadata.
        *   Returns a clean `schemaContext` object.
2.  **`chat.js` becomes a thin controller**:
    *   `auth -> DataContextService.build() -> AI.generate() -> Response`.

### Phase 4: Zero-Copy Retrieval (Optimization)
**Goal**: Query S3 directly without downloading.
1.  **Update `DuckDBAdapter`**: 
    *   Install `httpfs` and `aws` extensions on startup.
    *   Instead of downloading the file, generate a signed S3 URL.
    *   Register the table as a view: `CREATE VIEW my_table AS SELECT * FROM read_csv_auto('https://s3.url/signed?token=...')`.
2.  **Result**: Instant queries on large datasets, zero disk usage on backend.

---

## 4. Implementation Roadmap

### Immediate Steps (Low Effort, High Value)
1.  **Consolidate Tools**: instruct AI to strictly use `query_data`. Mark `analyze_data` as deprecated in the system prompt.
2.  **Extract Adapter Logic**: Move the massive adapter instantiation block from `chat.js` into `ConnectionAnalyzer` or `DataContextService`.

### Strategic Steps
1.  **Implement Semantic Tagging**: Add a column `semantic_description` to the `files` and `connections` tables. Populating this will seemingly fix the "Ambiguous Table" errors permanently.
2.  **Refactor `chat.js`**: Split the file into `ChatController.js` (routes) and `ChatService.js` (logic).

## Conclusion
The current system is "convuluted" because it tries to discover, analyze, and query data *at request time* inside a single function. Moving to a **Semantic Registry** (pre-analyzed metadata) and a **Unified SQL Engine** (DuckDB for everything) will make the system robust, faster, and much easier to maintain.

## PoC Validation: Zero-Copy Retrieval (S3/httpfs)

**Date**: 2026-01-27
**Objective**: Validate performance benefits of reading directly from S3 using DuckDB's `httpfs` extension vs. the legacy "Download & Local Read" approach.

### Methodology
- **File**: 3.37 MB CSV file (~50,000 rows).
- **Environment**: Local MacBook Pro, S3 (us-east-1).
- **Test Script**: `scripts/benchmark-zero-copy.js`
- **Metrics**: Time to Connect + Time to Register View (including download for local) + Time to Execute `COUNT(*)` query.

### Results
| Method | Total Time (ms) | Notes |
| :--- | :--- | :--- |
| **Zero-Copy (httpfs)** | **492.65 ms** | Direct read via signed URL. Network bound by query size, not file size. |
| **Local Download** | **886.48 ms** | Includes downloading file to /tmp cache before reading. |

### Conclusion
**Zero-Copy is ~44% faster** for this file size. The gain is expected to increase significantly with larger files (100MB+), as `httpfs` allows DuckDB to stream only necessary byte ranges (reading headers/metadata) rather than downloading the entire blob, especially for Parquet files.

### Recommendation
fully operationalized. Retain local download fallback for:
1. Complex Excel files requiring custom parsing (if `st_read` fails).
2. Unreliable network conditions.
3. Providers that don't support signed URLs (e.g., local filesystem provider).

