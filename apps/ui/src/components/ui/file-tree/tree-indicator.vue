<script lang="ts" setup>
import type { TreeContextProps } from "./types";
import { inject } from "vue";
import { TREE_CONTEXT_SYMBOL } from "./types";

const treeContext = inject<TreeContextProps>(TREE_CONTEXT_SYMBOL);
if (!treeContext) {
  throw new Error("[TreeIndicator] must be used inside <Tree>");
}

const { direction } = treeContext;
</script>

<template>
  <div
    :dir="direction"
    class="absolute left-2 h-full w-px bg-gradient-to-b from-border via-border/50 to-transparent rtl:right-2"
  />
</template>

