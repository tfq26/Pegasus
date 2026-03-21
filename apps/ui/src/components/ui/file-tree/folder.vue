<script lang="ts" setup>
import type { FolderProps, TreeContextProps } from "./types";
import { computed, inject, toRefs } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";
import Icon from "./icon.vue";
import TreeIndicator from "./tree-indicator.vue";
import { ChevronRight, ChevronDown, CheckSquare, Square } from "lucide-vue-next";
import type { HTMLAttributes } from "vue";


const props = withDefaults(defineProps<FolderProps>(), {
  isSelectable: true,
});

const { id, name, isSelectable, isSelect, openIcon: propOpenIcon, closeIcon: propCloseIcon } = toRefs(props);

const treeContext = inject<TreeContextProps>(TREE_CONTEXT_SYMBOL);
if (!treeContext) {
  throw new Error("[Folder] must be used inside <Tree>");
}

const { expandedItems, handleExpand, openIcon: ctxOpenIcon, closeIcon: ctxCloseIcon, direction, indicator, isDeleteMode } = treeContext;

const isExpanded = computed<boolean>(() => {
  return !!expandedItems.value?.includes(id.value);
});

const currentOpenIcon = computed(() => propOpenIcon?.value || ctxOpenIcon);
const currentCloseIcon = computed(() => propCloseIcon?.value || ctxCloseIcon);

const showCheckbox = computed(() => isDeleteMode && isDeleteMode.value);

function onTriggerClick(event: MouseEvent) {
  if (!isSelectable.value || !treeContext) return;
  // In delete mode, folder click should strictly just select (toggle check) and NOT expand/collapse necessarily?
  // User might want to expand to find items to delete.
  // Standard tree behavior: Expand caret works always. Row click toggles selection.
  // Here the whole row is click trigger.
  // So we do BOTH: Handle Expand AND Select.
  handleExpand(id.value);
  treeContext.selectItem(id.value, event);
}
</script>

<template>
  <div class="relative h-full overflow-hidden explorer-folder">
    <div
      class="group flex w-full cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] transition-all duration-200 hover:border-border/60 hover:bg-accent/35"
      :class="[
        [
          isSelect && isSelectable ? 'border-border/70 bg-card text-accent-foreground shadow-[0_10px_24px_-20px_rgba(15,23,42,0.55)]' : 'text-foreground/88',
          !isSelectable ? 'cursor-not-allowed opacity-50' : '',
          $props.class,
        ],
      ]"
      :dir="direction"
      @click="onTriggerClick"
    >
      <component 
        v-if="showCheckbox"
        :is="isSelect ? CheckSquare : Square"
        class="w-4 h-4 shrink-0 transition-colors mr-1"
        :class="isSelect ? 'text-rose-500' : 'text-muted-foreground/70'"
      />
      
      <!-- Expand/Collapse Chevron -->
      <component 
        :is="isExpanded ? ChevronDown : ChevronRight" 
        class="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200"
        :class="{ 'rotate-0': !isExpanded }"
      />
      
      <!-- Folder Icon -->
      <Icon
        v-if="isExpanded"
        :name="currentOpenIcon"
        :size="17"
        class="shrink-0 text-muted-foreground"
      />
      <Icon
        v-else
        :name="currentCloseIcon"
        :size="17"
        class="shrink-0 text-muted-foreground"
      />

      <span class="flex flex-1 select-none items-center font-medium">
        <slot name="label">{{ name }}</slot>
      </span>
    </div>

    <div
      v-if="isExpanded"
      class="relative animate-in slide-in-from-top-1 text-sm duration-200"
    >
      <TreeIndicator
        v-if="name && indicator"
        aria-hidden="true"
      />
      <div
        class="ml-4 flex flex-col gap-1 py-1.5 pl-2.5 rtl:mr-5"
        :dir="direction"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer-folder {
  --folder-indent: 1rem;
}
</style>
