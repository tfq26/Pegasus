<script setup lang="ts">
import { ref } from 'vue'
import { Send } from 'lucide-vue-next'

const props = defineProps<{
    placeholder?: string
    buttonText?: string
}>()

const emit = defineEmits<{
    (e: 'submit', content: string): void
}>()

const content = ref('')

const handleSubmit = () => {
    if (!content.value.trim()) return
    emit('submit', content.value)
    content.value = ''
}
</script>

<template>
    <div class="flex gap-2 items-start p-2 border-t mt-2">
        <textarea
            v-model="content"
            class="flex-1 min-h-[40px] max-h-[120px] resize-y p-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            :placeholder="placeholder || 'Type a note...'"
            @keydown.enter.meta="handleSubmit"
        ></textarea>
        <button
            @click="handleSubmit"
            :disabled="!content.trim()"
            class="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <Send class="w-4 h-4" />
        </button>
    </div>
</template>
