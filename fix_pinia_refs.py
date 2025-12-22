#!/usr/bin/env python3
"""
Script to fix remaining Pinia migration issues in Workspace.vue
"""

import re

# Read the file
with open('apps/ui/src/components/Workspace/Workspace.vue', 'r') as f:
    content = f.read()

# Fix 1: Change workspaceStore.tabs.find() to work with Pinia
# Pinia stores expose arrays directly, not as refs in the script
# But TypeScript is complaining. We need to ensure proper typing.

# The issue is that workspaceStore.tabs is typed as a ref in TypeScript
# We need to access the actual array value

# Actually, looking at the store definition, tabs is a ref()
# So in the component, we should access it as workspaceStore.tabs (Pinia auto-unwraps)
# The TypeScript error suggests it's not being unwrapped properly

# Let's check if we're in template vs script
# In script: workspaceStore.tabs should work (Pinia unwraps)
# The error says it's a ref, so we might need .value

# Actually, re-reading the Pinia docs: in setup(), store properties are NOT auto-unwrapped
# We need to use storeToRefs() or access .value

# Solution: Import storeToRefs and destructure
print("Fixing Pinia ref access...")

# Add storeToRefs import
content = content.replace(
    "import { useWorkspaceStore } from '@/stores/workspace';",
    "import { useWorkspaceStore } from '@/stores/workspace';\nimport { storeToRefs } from 'pinia';"
)

# After workspaceStore initialization, add destructuring
old_store_init = """// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();

// Load tabs from storage on mount"""

new_store_init = """// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();
const { tabs, activeTabId, activeTab } = storeToRefs(workspaceStore);

// Load tabs from storage on mount"""

content = content.replace(old_store_init, new_store_init)

# Now replace workspaceStore.tabs with tabs.value and workspaceStore.activeTabId with activeTabId.value
# But be careful not to replace method calls like workspaceStore.createTab()

# Replace workspaceStore.tabs (but not workspaceStore.tabs followed by a method call)
content = re.sub(r'\bworkspaceStore\.tabs\b(?!\.)', 'tabs.value', content)

# Replace workspaceStore.activeTabId (but not in method calls)
content = re.sub(r'\bworkspaceStore\.activeTabId\b(?!\.)', 'activeTabId.value', content)

# Replace workspaceStore.activeTab
content = re.sub(r'\bworkspaceStore\.activeTab\b', 'activeTab.value', content)

print("✅ Fixed Pinia ref access")
print("✅ Added storeToRefs import and destructuring")
print("✅ Replaced workspaceStore.tabs → tabs.value")
print("✅ Replaced workspaceStore.activeTabId → activeTabId.value")
print("✅ Replaced workspaceStore.activeTab → activeTab.value")

# Write the modified content
with open('apps/ui/src/components/Workspace/Workspace.vue', 'w') as f:
    f.write(content)

print("\n✅ Migration fixes complete!")
