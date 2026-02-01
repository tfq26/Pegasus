<script lang="ts" setup>
import type { FolderProps, TreeContextProps } from "./types";
import { computed, inject, toRefs } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";
import Icon from "./icon.vue";
import TreeIndicator from "./tree-indicator.vue";
import { ChevronRight, ChevronDown } from "lucide-vue-next";
import type { HTMLAttributes } from "vue";


const props = withDefaults(defineProps<FolderProps>(), {
  isSelectable: true,
});

const { id, name, isSelectable, isSelect, openIcon: propOpenIcon, closeIcon: propCloseIcon } = toRefs(props);

const treeContext = inject<TreeContextProps>(TREE_CONTEXT_SYMBOL);
if (!treeContext) {
  throw new Error("[Folder] must be used inside <Tree>");
}

const { expandedItems, handleExpand, openIcon: ctxOpenIcon, closeIcon: ctxCloseIcon, direction, indicator } = treeContext;

const isExpanded = computed<boolean>(() => {
  return !!expandedItems.value?.includes(id.value);
});

const currentOpenIcon = computed(() => propOpenIcon?.value || ctxOpenIcon);
const currentCloseIcon = computed(() => propCloseIcon?.value || ctxCloseIcon);

function onTriggerClick(event: MouseEvent) {
  if (!isSelectable.value || !treeContext) return;
  handleExpand(id.value);
  treeContext.selectItem(id.value, event);
}
</script>

<template>
  <div class="relative h-full overflow-hidden explorer-folder">
    <div
      class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all duration-200 hover:bg-accent/50 group"
      :class="[
        [
          isSelect && isSelectable ? 'bg-accent text-accent-foreground' : '',
          !isSelectable ? 'cursor-not-allowed opacity-50' : '',
          $props.class,
        ],
      ]"
      :dir="direction"
      @click="onTriggerClick"
    >
      <!-- Expand/Collapse Chevron -->
      <component 
        :is="isExpanded ? ChevronDown : ChevronRight" 
        class="w-4 h-4 text-muted-foreground/70 shrink-0 transition-transform duration-200"
        :class="{ 'rotate-0': !isExpanded }"
      />
      
      <!-- Folder Icon -->
      <Icon
        v-if="isExpanded"
        :name="currentOpenIcon"
        :size="18"
        class="shrink-0"
      />
      <Icon
        v-else
        :name="currentCloseIcon"
        :size="18"
        class="shrink-0"
      />

      <span class="select-none flex-1 flex items-center font-medium">
        <slot name="label">{{ name }}</slot>
      </span>
    </div>

    <div
      v-if="isExpanded"
      class="relative text-sm animate-in slide-in-from-top-1 duration-200"
    >
      <TreeIndicator
        v-if="name && indicator"
        aria-hidden="true"
      />
      <div
        class="ml-4 flex flex-col gap-0.5 py-1 pl-2 border-l border-border/50 rtl:mr-5"
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
