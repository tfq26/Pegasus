<script lang="ts" setup>
import type { TreeContextProps, TreeProps, TreeViewElement } from "./types";
import { onMounted, provide, ref, toRefs } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";
import type { HTMLAttributes } from "vue";


const props = withDefaults(defineProps<TreeProps>(), {
  indicator: true,
  dir: "ltr",
  openIcon: "lucide:folder-open",
  closeIcon: "lucide:folder",
  fileIcon: "lucide:file",
});

const {
  initialSelectedId,
  indicator,
  elements,
  initialExpandedItems,
  openIcon,
  closeIcon,
  fileIcon,
  direction,
} = toRefs(props);

const selectedId = ref<string | undefined>(initialSelectedId.value);
const expandedItems = ref<string[] | undefined>(initialExpandedItems.value);

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent]
}>()

function handleExpand(id: string) {
  expandedItems.value = expandedItems.value ?? [];
  if (expandedItems.value.includes(id)) {
    // If already expanded, collapse it
    expandedItems.value = expandedItems.value.filter((item) => item !== id);
  } else {
    // Otherwise, expand it
    expandedItems.value.push(id);
  }
}

function selectItem(id: string, event?: MouseEvent) {
  selectedId.value = id;
  emit('select', id, event);
}

function setExpandedItemsFn(items: string[] | undefined) {
  expandedItems.value = items;
}

provide<TreeContextProps>(TREE_CONTEXT_SYMBOL, {
  selectedId,
  expandedItems,
  indicator: indicator.value,
  openIcon: openIcon.value,
  closeIcon: closeIcon.value,
  fileIcon: fileIcon.value,
  direction: direction.value === "rtl" ? "rtl" : "ltr",
  handleExpand,
  selectItem,
  setExpandedItems: setExpandedItemsFn,
});

function expandSpecificTargetedElements(list?: TreeViewElement[], selectId?: string) {
  if (!list || !selectId) return;
  function findParent(current: TreeViewElement, path: string[] = []) {
    const isSelectable = current.isSelectable ?? true;
    const newPath = [...path, current.id];
    if (current.id === selectId) {
      if (isSelectable) {
        expandedItems.value = [...(expandedItems.value ?? []), ...newPath];
      } else {
        // if not selectable, pop the last item (itself)
        newPath.pop();
        expandedItems.value = [...(expandedItems.value ?? []), ...newPath];
      }
      return;
    }
    if (current.children?.length) {
      current.children.forEach((child: TreeViewElement) => findParent(child, newPath));
    }
  }
  list.forEach((element: TreeViewElement) => findParent(element));
}

onMounted(() => {
  if (initialSelectedId.value) {
    expandSpecificTargetedElements(elements.value, initialSelectedId.value);
  }
});
</script>

<template>
  <div
    class="size-full explorer-tree"
    :class="[$props.class]"
  >
    <div
      class="relative h-full overflow-auto px-1 py-2"
      :dir="direction"
    >
      <div class="flex flex-col gap-1">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer-tree {
  /* Custom scrollbar for the explorer */
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
}

.explorer-tree::-webkit-scrollbar {
  width: 6px;
}

.explorer-tree::-webkit-scrollbar-track {
  background: transparent;
}

.explorer-tree::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}

.explorer-tree::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
