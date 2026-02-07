# Changelog

All notable changes to this project will be documented in this file.

## [v0.9.1.0] - 2026-02-07

### 🚀 New Features
- **Live Dashboard Updates**: Real-time, element-level collaborative updates using WebSockets. No more full page refreshes when teammates edit!
- **Dashboard Activity Feed**: Added a session-based history of element changes. Access it via `Ctrl + Click` on the **Save** button.
- **High-Density Visualizations**: Automatic temporal aggregation (binning/bucketing) for datasets over 500 rows to ensure readability.
- **UI Transitions**: Added premium slide-in/fade-out transitions for dashboard elements and sidebars.
- **Mobile UX**: Optimized dashboard layouts and interactions specifically for mobile devices.

### 🧠 AI & Prompt Engineering
- **Modular Prompt Architecture**: Refactored the core AI engine into specialized modules: `intent`, `fetching`, `processing`, and `visualization`.
- **Dialect Dictionary**: Centralized SQL rules for 7+ dialects (Postgres, Cosmos, Kusto, etc.) to dramatically improve query accuracy.
- **Prompt Scratchpad**: Added an internal reasoning step for the AI to reduce hallucinations and improve logical flow.
- **Intent Classifier**: New robust intent detection to differentiate between data queries, visualization requests, and deep analysis.

### 🔧 Fixes & Stability
- **Cosmos DB SQL Stability**: Fixed critical aliasing issues in `GROUP BY`, `ORDER BY`, and aggregate functions.
- **Gemini API Robustness**: Improved chat history management to prevent role-mismatch errors.
- **Data Truncation Security**: Implemented a 10kb limit on intermediate prompt data to prevent API quota hits and improve performance.
- **RAG Safety**: Added checks to skip vector operations when embeddings are missing, preventing system crashes.
- **Snake_to_Camel Translation**: Automatic resolution of AI-generated snake_case columns to Cosmos DB camelCase properties.

### 🧪 Integration & Infrastructure
- **Kusto Query Support**: Implemented initial support for Kusto query execution and result parsing.
- **Azure Unified Form**: Consolidated Cosmos DB and Kusto connections into a single, intuitive Azure connection workflow.
