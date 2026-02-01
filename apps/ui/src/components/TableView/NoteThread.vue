<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Note } from './Engine/types'
import { Check, Trash2, User, Clock, CheckCircle2 } from 'lucide-vue-next'
import NoteInput from './NoteInput.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const props = defineProps<{
    notes: Note[]
    title?: string
}>()

const emit = defineEmits<{
    (e: 'add', content: string): void
    (e: 'resolve', noteId: string, resolved: boolean): void
    (e: 'delete', noteId: string): void
    (e: 'close'): void
}>()

const formatTime = (ts: number) => new Date(ts).toLocaleString()
</script>

<template>
    <div class="flex flex-col h-full bg-background border rounded-lg shadow-xl w-[320px] max-h-[500px]">
        <!-- Header -->
        <div class="p-3 border-b flex items-center justify-between bg-muted/30">
            <h3 class="font-medium text-sm">{{ title || 'Notes' }}</h3>
            <button @click="emit('close')" class="text-zinc-400 hover:text-zinc-600">
                &times;
            </button>
        </div>

        <!-- Thread -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
            <div v-if="notes.length === 0" class="text-center py-8 text-muted-foreground text-sm">
                No notes yet. Start a discussion!
            </div>
            
            <div v-for="note in notes" :key="note.id" class="group relative bg-card border rounded-lg p-3 shadow-sm transition-all" :class="{'opacity-60': note.resolved}">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-1.5">
                        <div class="w-5 h-5 rounded-lg bg-primary/10 flex items-center justify-center">
                            <User class="w-3 h-3 text-primary" />
                        </div>
                        <span class="text-xs font-semibold">{{ note.author }}</span>
                        <span class="text-[10px] text-muted-foreground">{{ formatTime(note.timestamp) }}</span>
                    </div>
                    
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            @click="emit('resolve', note.id, !note.resolved)"
                            class="p-1 rounded hover:bg-muted text-green-600"
                            :title="note.resolved ? 'Unresolve' : 'Mark as resolved'"
                         >
                            <CheckCircle2 class="w-3.5 h-3.5" :class="{'fill-green-100': note.resolved}" />
                         </button>
                         <button 
                            @click="emit('delete', note.id)"
                            class="p-1 rounded hover:bg-muted text-red-500"
                            title="Delete note"
                         >
                            <Trash2 class="w-3.5 h-3.5" />
                         </button>
                    </div>
                </div>
                
                <div class="text-[13px] pl-0.5 leading-relaxed" :class="{'line-through text-muted-foreground opacity-50': note.resolved}">
                    <MarkdownRenderer :content="note.content" />
                </div>
            </div>
        </div>

        <!-- Input -->
        <NoteInput @submit="(c) => emit('add', c)" />
    </div>
</template>
