#!/usr/bin/env python3
"""
Script to migrate Workspace.vue from local state to Pinia store.
Replaces all tabs.value and activeTabId.value references.
"""

import re

# Read the file
with open('apps/ui/src/components/Workspace/Workspace.vue', 'r') as f:
    content = f.read()

# Step 1: Replace imports
content = content.replace(
    "import type { Tab } from './TabsManager.vue';",
    "import { useWorkspaceStore } from '@/stores/workspace';\nimport type { Tab } from '@/stores/workspace';"
)

# Step 2: Replace state initialization section (lines 37-75)
old_state_section = """// --- State ---
// --- State ---
const WORKSPACE_STORAGE_KEY = 'pegasus-workspace-tabs';

// Load initial state from storage if available
const loadInitialState = () => {
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        tabs: parsed.tabs || [{ id: '1', label: 'Query Editor', type: 'chat' }],
        activeTabId: parsed.activeTabId || '1'
      };
    }
  } catch (e) {
    console.error('Failed to load workspace state:', e);
  }
  return {
    tabs: [{ id: '1', label: 'Query Editor', type: 'chat' }],
    activeTabId: '1'
  };
};

const initialState = loadInitialState();
const tabs = ref<Tab[]>(initialState.tabs);
const activeTabId = ref<string>(initialState.activeTabId);

// Persistence watcher
watch([tabs, activeTabId], () => {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      tabs: tabs.value,
      activeTabId: activeTabId.value
    }));
  } catch (e) {
    console.error('Failed to save workspace state:', e);
  }
}, { deep: true });"""

new_state_section = """// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();

// Load tabs from storage on mount
onMounted(() => {
  workspaceStore.loadFromStorage();
});"""

content = content.replace(old_state_section, new_state_section)

# Step 3: Replace chatHistory sync watcher
old_sync = """// Sync chatHistory prop to active chat tab's data
watch(() => props.chatHistory, (newHistory) => {
  const activeTab = tabs.value.find(t => t.id === activeTabId.value);
  if (activeTab && activeTab.type === 'chat' && newHistory) {
    if (!activeTab.data) activeTab.data = {};
    activeTab.data.chatHistory = newHistory;
    console.log('[Workspace] Synced chatHistory to active tab:', { tabId: activeTab.id, historyLength: newHistory.length });
  }
}, { deep: true });"""

new_sync = """// Sync chatHistory prop to active chat tab's data
watch(() => props.chatHistory, (newHistory) => {
  if (newHistory && workspaceStore.activeTab?.type === 'chat') {
    workspaceStore.updateActiveTabData({ chatHistory: newHistory });
    console.log('[Workspace] Synced chatHistory to active tab:', { 
      tabId: workspaceStore.activeTabId, 
      historyLength: newHistory.length 
    });
  }
}, { deep: true });"""

content = content.replace(old_sync, new_sync)

# Step 4: Replace all tabs.value with workspaceStore.tabs
content = re.sub(r'\btabs\.value\b', 'workspaceStore.tabs', content)

# Step 5: Replace all activeTabId.value with workspaceStore.activeTabId
content = re.sub(r'\bactiveTabId\.value\b', 'workspaceStore.activeTabId', content)

# Step 6: Fix template bindings (need to keep as workspaceStore.tabs not .value)
# The template section should already be correct after the above replacements

# Write the modified content
with open('apps/ui/src/components/Workspace/Workspace.vue', 'w') as f:
    f.write(content)

print("✅ Migration complete!")
print("Replaced:")
print("  - Import statements")
print("  - State initialization")
print("  - ChatHistory sync watcher")
print("  - All tabs.value → workspaceStore.tabs")
print("  - All activeTabId.value → workspaceStore.activeTabId")
