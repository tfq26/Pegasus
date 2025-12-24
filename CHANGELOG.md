# Changelog

## v0.7.1 - 2025-12-24

### Features

- **Workspace Persistence**: 
  - Implemented backend storage for workspace tabs (chat, spreadsheets, queries) per connection.
  - Tabs are now tied to specific database connections.
  - Added "Temporary Workspace" for unsaved sessions (expires in 48h).
  - Implemented auto-save mechanism for tab state.

- **Sidebar Improvements**:
  - **Tables/Tabs Toggle**: Added a toggle in the connection list to switch between viewing database tables and open/saved tabs.
  - **Tab Management**: Users can now see and close active tabs directly from the sidebar.

- **Migration Workflow**:
  - Added specific UI warning when working in a temporary workspace with unsaved files.
  - Implemented a migration dialog ("Move to Connection" vs "Discard") when switching from a temporary workspace to a saved connection.

### Technical Details

- **Backend**:
  - Added `connection_workspaces` table to database schema.
  - Created `WorkspaceService` for managing workspace state and expiry.
  - Added standard API routes (`GET`, `POST`) for workspace persistence.

- **Frontend**:
  - Rewrote `useWorkspaceStore` to synchronize with backend API.
  - Removed dependency on local storage for primary persistence (retained as fallback/migration path).
  - Updated `ConnectionItem.vue` and created `TabList.vue`.
