<script lang="ts" setup>
import type { FileProps, TreeContextProps } from "./types";
import { computed, inject, toRefs } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";
import Icon from "./icon.vue";
import { CheckSquare, Square } from "lucide-vue-next";
import type { HTMLAttributes } from "vue";


const props = withDefaults(defineProps<FileProps>(), {
  isSelectable: true,
});

const { id, name, isSelectable, isSelect, fileIcon: propFileIcon } = toRefs(props);

const treeContext = inject<TreeContextProps>(TREE_CONTEXT_SYMBOL);
if (!treeContext) {
  throw new Error("[File] must be used inside <Tree>");
}

const { selectedId, selectItem, direction, fileIcon: ctxFileIcon, isDeleteMode } = treeContext;

const currentFileIcon = computed(() => propFileIcon?.value || ctxFileIcon);

const isSelected = computed<boolean>(() => {
  return isSelect?.value || selectedId.value === id.value;
});

const showCheckbox = computed(() => isDeleteMode && isDeleteMode.value);

function onClickHandler(event: MouseEvent) {
  if (!isSelectable.value) return;
  selectItem(id.value, event);
}
</script>

<template>
  <button
    type="button"
    :disabled="!isSelectable"
    class="group flex w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[12px] duration-200 ease-out transition-all hover:border-border/60 hover:bg-accent/30"
    :class="[
      [
        isSelected && isSelectable ? 'border-border/70 bg-card text-accent-foreground shadow-[0_10px_24px_-20px_rgba(15,23,42,0.5)]' : 'text-foreground/80',
        isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        $props.class,
      ],
    ]"
    :dir="direction"
    @click="onClickHandler"
  >
    <component 
      v-if="showCheckbox"
      :is="isSelected ? CheckSquare : Square"
      class="w-4 h-4 shrink-0 transition-colors"
      :class="isSelected ? 'text-rose-500' : 'text-muted-foreground/70'"
    />
    <Icon
      :name="currentFileIcon"
      :size="16"
      class="shrink-0 text-muted-foreground"
    />
    <slot>
      <span class="select-none truncate">{{ name }}</span>
    </slot>
  </button>
</template>
