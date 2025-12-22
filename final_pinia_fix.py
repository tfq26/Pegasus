#!/usr/bin/env python3
"""
Final fix: Add .value to all workspaceStore.tabs and workspaceStore.activeTabId accesses in script
"""

import re

# Read the file
with open('apps/ui/src/components/Workspace/Workspace.vue', 'r') as f:
    lines = f.readlines()

# Find the template start
template_start = -1
script_end = -1
for i, line in enumerate(lines):
    if '<template>' in line:
        template_start = i
        break
    if '</script>' in line:
        script_end = i

print(f"Script section: lines 0-{script_end}")
print(f"Template section: lines {template_start}-end")

# Process only the script section (before template)
script_lines = lines[:script_end+1]
template_lines = lines[script_end+1:]

# In script section: add .value to store property accesses
script_content = ''.join(script_lines)

# Replace workspaceStore.tabs (but not workspaceStore.tabs.value or in method calls)
script_content = re.sub(r'\bworkspaceStore\.tabs\b(?!\.value)', 'workspaceStore.tabs.value', script_content)

# Replace workspaceStore.activeTabId (but not workspaceStore.activeTabId.value)
script_content = re.sub(r'\bworkspaceStore\.activeTabId\b(?!\.value)', 'workspaceStore.activeTabId.value', script_content)

# Replace workspaceStore.activeTab (but not workspaceStore.activeTab.value)
script_content = re.sub(r'\bworkspaceStore\.activeTab\b(?!\.value)', 'workspaceStore.activeTab.value', script_content)

# Combine back
final_content = script_content + ''.join(template_lines)

# Write the modified content
with open('apps/ui/src/components/Workspace/Workspace.vue', 'w') as f:
    f.write(final_content)

print("✅ Added .value to all store accesses in script section")
print("✅ Template section left unchanged (Vue auto-unwraps)")
print("\n✅ Migration complete!")
