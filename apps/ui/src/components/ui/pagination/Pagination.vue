<script setup lang="ts">
const props = defineProps<{
  page: number
  hasPrev: boolean
  hasNext: boolean
  totalPages?: number
}>()
const emit = defineEmits<{ (event: 'page-change', page: number): void }>()

const goToPage = (nextPage: number) => {
  emit('page-change', nextPage)
}
</script>

<template>
  <nav class="flex items-center gap-2 text-xs font-semibold text-stone-200">
    <button
      :disabled="!props.hasPrev"
      @click="goToPage(props.page - 1)"
      class="rounded-md border border-stone-800 bg-stone-900 px-3 py-1 transition disabled:opacity-40 disabled:cursor-not-allowed hover:border-violet-500"
    >
      Prev
    </button>

    <span class="rounded-md border border-stone-800 bg-stone-900 px-3 py-1">
      Page {{ props.page }}<span v-if="props.totalPages"> of {{ props.totalPages }}</span>
    </span>

    <button
      :disabled="!props.hasNext"
      @click="goToPage(props.page + 1)"
      class="rounded-md border border-stone-800 bg-stone-900 px-3 py-1 transition disabled:opacity-40 disabled:cursor-not-allowed hover:border-violet-500"
    >
      Next
    </button>
  </nav>
</template>
