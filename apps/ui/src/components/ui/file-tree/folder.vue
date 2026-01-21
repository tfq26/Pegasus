<script lang="ts" setup>
import type { FolderProps, TreeContextProps } from "./types";
import { computed, inject, toRefs } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";
import Icon from "./icon.vue";
import TreeIndicator from "./tree-indicator.vue";
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
  <div class="relative h-full overflow-hidden">
    <div
      class="flex w-full cursor-pointer items-center gap-1 rounded-md text-sm transition-all duration-200"
      :class="[
        [
          isSelect && isSelectable ? 'bg-muted' : '',
          !isSelectable ? 'cursor-not-allowed opacity-50' : '',
          $props.class,
        ],
      ]"
      :dir="direction"
      @click="onTriggerClick"
    >
      <Icon
        v-if="isExpanded"
        :name="currentOpenIcon"
        :size="16"
      />
      <Icon
        v-else
        :name="currentCloseIcon"
        :size="16"
      />

      <span class="select-none flex-1 flex items-center">
        <slot name="label">{{ name }}</slot>
      </span>
    </div>

    <div
      v-if="isExpanded"
      class="relative text-sm"
    >
      <TreeIndicator
        v-if="name && indicator"
        aria-hidden="true"
      />
      <div
        class="ml-5 flex flex-col gap-1 py-1 rtl:mr-5"
        :dir="direction"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

