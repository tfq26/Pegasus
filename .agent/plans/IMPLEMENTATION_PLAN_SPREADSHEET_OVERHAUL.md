# Spreadsheet Overhaul Implementation Plan (Revised)

## Objective
Overhaul the spreadsheet experience to provide a "Google Sheets/Excel-like" interaction where users can freely edit, manipulate data, and save changes directly to the database. We will replace the current limited `Grid.vue` with the more capable `ExcelEditor.vue` (Handsontable).

## Context
The current `Grid` implementation is restrictive and lacks reliable saving. The user wants the freedom to type in cells, interact without friction, and have those changes persist. The recent backend `ReferenceError: spaceFiles` hindered testing and has now been fixed.

## Strategy
We will transition the primary table view to use `ExcelEditor`, which leverages `Handsontable` and `HyperFormula`. This will provide:
-   **Free-form Editing**: No need to "enter" edit mode explicitly for every change.
-   **Formula Support**: Native support for cell formulas.
-   **Bulk Saving**: Emitting the updated state for synchronization with the backend.

## Roadmap

### Phase 1: Backend Stability & Infrastructure
- [x] **Fix Upload Metadata**: Resolved `ReferenceError: spaceFiles` in `apps/backend/index.js`.
- [ ] **Data Sync Endpoint**: Implement a dedicated `POST /api/table/:tableName/save` or enhance existing import routes to handle bulk updates from the UI.
  - *Note*: Since the user wants to "save it to the DB", we need a reliable way to overwrite/update the SurrealDB table with the UI's state.

### Phase 2: UI Reintegration
- [ ] **Swap Grid for ExcelEditor**:
  - [MODIFY] [Workspace.vue](file:///Users/taufeeqali/Projects/Pegasus/Pegasus-Application/apps/ui/src/components/Workspace/Workspace.vue)
  - Replace `<Grid />` with `<ExcelEditor />` for all `spreadsheet` and `table` type tabs.
  - Update `getEngineForTab` logic to provide raw data arrays for `ExcelEditor` instead of `Engine` instances where appropriate.
- [ ] **Toolbar Integration**:
  - Ensure the "Save" and "Export" buttons in the [Toolbar](file:///Users/taufeeqali/Projects/Pegasus/Pegasus-Application/apps/ui/src/components/Workspace/Toolbar.vue) trigger the correct actions in `ExcelEditor`.

### Phase 3: Enhanced Functionality
- [ ] **New Table Creation**: Enable the "New Sheet" action to create a blank Handsontable and allow saving it as a new physical table in the database.
- [ ] **AI-Assisted Operations**: Connect the `FormulaBar` in `ExcelEditor` to the Pegasus AI service for natural language data manipulation.

## Technical Details

### Component Integration in `Workspace.vue`
```vue
<ExcelEditor
  v-if="tab.type === 'table'"
  :data="tab.data.rows"
  :read-only="false"
  @save="handleSpreadsheetSave(tab.id, $event)"
/>
```

### Save Logic
The `ExcelEditor` emits a `@save` event containing the full array of objects.
```typescript
const handleSpreadsheetSave = async (tabId: string, data: any[]) => {
  const tab = tabs.value.find(t => t.id === tabId);
  if (!tab?.data?.tableName) return;
  
  try {
    await api.post(`/api/table/${tab.data.tableName}/save`, { 
      data,
      connection: tab.data.connection 
    });
    toast.success('Spreadsheet saved successfully');
  } catch (e) {
    toast.error('Failed to save spreadsheet');
  }
}
```

## Verification Plan
1. **Upload**: Upload the `PortfolioGain-LossReport.xlsx`.
2. **Interact**: Verify the table opens in the new editor. Try typing in multiple cells rapidly.
3. **Save**: Click "Save" and refresh the page. Verify changes persist.
4. **Create**: Create a new tab, add data, and save it as a new table.
