# Pinia Migration - Things That Could Break

## Critical Features to Test After Migration

### 1. Tab Management
- [ ] Create new chat tab
- [ ] Create new query tab  
- [ ] Create new table/spreadsheet tab
- [ ] Switch between tabs
- [ ] Close tabs (not last one)
- [ ] Close tab and auto-switch to another
- [ ] Tab persistence across page refresh
- [ ] Tab state saved to localStorage

### 2. Chat Functionality
- [ ] Load chat from history
- [ ] Chat messages display correctly
- [ ] Send message in chat mode
- [ ] AI responses appear
- [ ] Chat history persists per tab
- [ ] Multiple chat tabs with independent history
- [ ] Create new chat (empty state)
- [ ] Delete chat
- [ ] Clear all chats

### 3. Query/Write Mode
- [ ] Execute SQL query
- [ ] Query results display
- [ ] Save query to tab
- [ ] Query tab content persists
- [ ] Multiple query tabs
- [ ] Syntax highlighting works

### 4. Spreadsheet/Table Mode
- [ ] Load table into spreadsheet
- [ ] Edit cells
- [ ] Save changes to database
- [ ] Formula mode
- [ ] AI mode
- [ ] Private mode (branching)
- [ ] Merge changes
- [ ] Export to CSV/Excel
- [ ] Visualizations
- [ ] Sanitize data
- [ ] Version history
- [ ] Multiple spreadsheet tabs

### 5. Connection Management
- [ ] Select connection
- [ ] Connection persists across tabs
- [ ] Different connections per tab
- [ ] Add new connection
- [ ] Edit connection
- [ ] Delete connection

### 6. State Persistence
- [ ] Tabs persist on refresh
- [ ] Active tab remembered
- [ ] Tab data (chat history, query content, table state) persists
- [ ] Connection selection persists
- [ ] Mode (chat/write/spreadsheet) persists per tab

### 7. UI/UX
- [ ] Tab labels display correctly
- [ ] Tab icons show correct type
- [ ] Active tab highlighted
- [ ] Close button appears on hover
- [ ] Plus button dropdown works
- [ ] Sidebar toggle works
- [ ] Results panel toggle works

## Components That Depend on Workspace/Chat

### Direct Dependencies
1. **Chat.vue** (parent component)
   - Passes `chatHistory` prop to Workspace
   - Receives mode updates from Workspace
   - Manages chat list sidebar
   - Handles chat creation/selection

2. **Workspace.vue** (being refactored)
   - Manages tabs state
   - Renders TabsManager
   - Renders ChatEditor for chat/query tabs
   - Renders Grid for spreadsheet tabs
   - Handles tab switching logic

3. **TabsManager.vue**
   - Receives `tabs` and `activeTabId` props
   - Emits `add`, `close`, `update:activeTabId` events
   - Renders tab UI

4. **ChatEditor.vue**
   - Receives `history` prop (chat messages)
   - Receives `input` prop
   - Emits `update:input` and `submit` events

5. **Grid.vue** (spreadsheet)
   - Receives table data from tab.data
   - Manages Engine instance
   - Handles cell edits

### Indirect Dependencies
6. **ChatSidebar.vue**
   - Shows list of chats
   - Emits `create-chat`, `select-chat` events

7. **ResultsPanel.vue**
   - Shows query results
   - Depends on query execution state

8. **ChatToolbar.vue**
   - Mode selector (chat/write/spreadsheet)
   - Connection selector
   - AI/query options

## Data Flow to Preserve

### Current Flow (Before Pinia)
```
Chat.vue
  ├─ chatHistory (ref)
  ├─ selectedChatId (ref)
  └─ Workspace.vue
      ├─ tabs (ref) - localStorage
      ├─ activeTabId (ref) - localStorage
      ├─ tab.data.chatHistory (synced from parent)
      └─ TabsManager
          └─ Renders tabs UI
```

### New Flow (After Pinia)
```
workspaceStore (Pinia)
  ├─ tabs (state)
  ├─ activeTabId (state)
  └─ Actions: createTab, closeTab, setActiveTab, updateTabData

chatStore (Pinia)
  ├─ chats (state)
  ├─ selectedChatId (state)
  └─ Actions: loadChats, createChat, loadChatHistory, saveMessage

Chat.vue
  └─ Uses chatStore
  └─ Workspace.vue
      └─ Uses workspaceStore
      └─ TabsManager
```

## Potential Breaking Points

### 1. Tab Data Structure
**Risk:** Tab interface mismatch between old and new
**Mitigation:** Keep Tab interface identical, just change where it's stored

### 2. localStorage Format
**Risk:** Old localStorage data incompatible with new format
**Mitigation:** workspaceStore.loadFromStorage() should handle old format

### 3. Prop Drilling Removal
**Risk:** Components expecting props that no longer exist
**Mitigation:** Gradually migrate, keep props temporarily

### 4. Event Emissions
**Risk:** Parent components listening for events that change
**Mitigation:** Keep event names identical

### 5. Reactivity
**Risk:** Vue reactivity breaks when moving from ref() to Pinia
**Mitigation:** Pinia is reactive by default, should work

### 6. Engine Cache
**Risk:** Engine instances tied to tab IDs might break
**Mitigation:** Keep engineCache logic in Workspace, just use store for tab IDs

## Migration Checklist

### Phase 1: Workspace.vue Migration
- [ ] Replace `tabs` ref with `workspaceStore.tabs`
- [ ] Replace `activeTabId` ref with `workspaceStore.activeTabId`
- [ ] Replace `onAddTab` with `workspaceStore.createTab`
- [ ] Replace `onTabClose` with `workspaceStore.closeTab`
- [ ] Replace direct tab mutations with `workspaceStore.updateTabData`
- [ ] Remove localStorage logic (now in store)
- [ ] Test all tab operations

### Phase 2: Chat.vue Migration
- [ ] Replace `chats` ref with `chatStore.chats`
- [ ] Replace `selectedChatId` ref with `chatStore.selectedChatId`
- [ ] Replace `chatHistory` ref with store-based approach
- [ ] Replace `loadChats` with `chatStore.loadChats`
- [ ] Replace `createChat` with `chatStore.createChat`
- [ ] Test all chat operations

### Phase 3: Integration
- [ ] Remove chatHistory prop passing
- [ ] Update Workspace to read from chatStore
- [ ] Ensure tab.data.chatHistory syncs with chatStore
- [ ] Test cross-component communication

### Phase 4: Cleanup
- [ ] Remove old state management code
- [ ] Remove unused props
- [ ] Remove unused events
- [ ] Update TypeScript types

## Rollback Plan

If things break badly:
```bash
# Discard all changes
git checkout main
git branch -D feature/pinia-migration-backup

# Or cherry-pick specific fixes
git checkout feature/pinia-migration-backup
git cherry-pick <commit-hash>
```

## Testing Script

After migration, run through this script:

1. **Fresh Start**
   - Clear localStorage
   - Refresh page
   - Should see 1 default chat tab

2. **Create Tabs**
   - Create new chat tab → Should be empty
   - Create query tab → Should be empty
   - Create table tab → Should be empty

3. **Load Chat**
   - Select chat from history
   - Should load in current tab
   - Create new chat tab
   - Should be empty (not duplicate)

4. **Switch Tabs**
   - Load different chat in each tab
   - Switch between tabs
   - Each should show correct history

5. **Persistence**
   - Refresh page
   - All tabs should restore
   - Active tab should be remembered

6. **Close Tabs**
   - Close middle tab
   - Should auto-select another
   - Close all but one
   - Should not allow closing last tab

## Success Criteria

✅ All features in "Critical Features to Test" work
✅ No console errors
✅ No TypeScript errors
✅ localStorage format compatible
✅ Performance not degraded
✅ User experience identical or better
