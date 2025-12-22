#!/usr/bin/env python3
"""
Revert storeToRefs approach and use computed properties instead
"""

import re

# Read the file
with open('apps/ui/src/components/Workspace/Workspace.vue', 'r') as f:
    content = f.read()

# Step 1: Remove storeToRefs import
content = content.replace(
    "import { useWorkspaceStore } from '@/stores/workspace';\nimport { storeToRefs } from 'pinia';",
    "import { useWorkspaceStore } from '@/stores/workspace';"
)

# Step 2: Remove storeToRefs destructuring
old_init = """// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();
const { tabs, activeTabId, activeTab } = storeToRefs(workspaceStore);

// Load tabs from storage on mount"""

new_init = """// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();

// Load tabs from storage on mount"""

content = content.replace(old_init, new_init)

# Step 3: Replace tabs.value with workspaceStore.tabs (direct access)
content = re.sub(r'\btabs\.value\b', 'workspaceStore.tabs', content)

# Step 4: Replace activeTabId.value with workspaceStore.activeTabId
content = re.sub(r'\bactiveTabId\.value\b', 'workspaceStore.activeTabId', content)

# Step 5: Replace activeTab.value with workspaceStore.activeTab
content = re.sub(r'\bactiveTab\.value\b', 'workspaceStore.activeTab', content)

print("✅ Reverted storeToRefs approach")
print("✅ Using direct store access instead")

# Write the modified content
with open('apps/ui/src/components/Workspace/Workspace.vue', 'w') as f:
    f.write(content)

print("\n✅ Migration fixes complete!")
