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
    class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm duration-200 ease-out hover:bg-accent/40 group transition-all"
    :class="[
      [
        isSelected && isSelectable ? 'bg-accent/60 text-accent-foreground font-medium' : 'text-foreground/80',
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
      :size="18"
      class="shrink-0"
    />
    <slot>
      <span class="select-none truncate">{{ name }}</span>
    </slot>
  </button>
</template>
