<template>
  <div class="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
    <div class="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-2xl text-center">
      <!-- Icon -->
      <div class="mb-6 flex justify-center">
        <div v-if="severity === 'warning'" class="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div v-else class="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
      </div>

      <h1 class="text-2xl font-bold mb-2">{{ title }}</h1>
      <p class="text-muted-foreground mb-8">{{ message }}</p>

      <div class="space-y-3">
        <button 
          v-if="actionLabel"
          @click="handleAction"
          class="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
        >
          {{ actionLabel }}
        </button>
        
        <button 
          @click="goHome"
          class="w-full px-4 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
        >
          {{ actionLabel ? 'Cancel' : 'Return Home' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ErrorCodes, ErrorHandlers, type ErrorCode } from '@/lib/errorCodes'

const route = useRoute()
const router = useRouter()

const code = computed(() => route.query.code as ErrorCode | undefined)
const customMessage = computed(() => route.query.message as string | undefined)

const handler = computed(() => {
  if (code.value && ErrorHandlers[code.value]) {
    return ErrorHandlers[code.value]
  }
  return ErrorHandlers[ErrorCodes.UNKNOWN_ERROR]
})

const title = computed(() => handler.value.title)
const message = computed(() => customMessage.value || 'An unexpected error occurred.')
const actionLabel = computed(() => handler.value.actionLabel)
const severity = computed(() => handler.value.severity)

const handleAction = () => {
  if (handler.value.redirect) {
    router.push(handler.value.redirect)
  } else {
    // Retry or go back for unknown/misc errors
    if (window.history.length > 2) {
       router.go(-1) 
    } else {
       router.push('/')
    }
  }
}

const goHome = () => {
  router.push('/')
}
</script>
