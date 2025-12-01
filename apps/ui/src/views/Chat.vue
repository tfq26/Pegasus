<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Explorer sidebar -->
    <ChatSidebar v-if="sidebarOpen" :side="sidebarSide" @toggle="toggleSidebar" />
    <button
      v-else
      class="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-r-lg bg-stone-900/80 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all"
      @click="toggleSidebar"
      aria-label="Open sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </button>

    <!-- Editor workspace -->
    <section class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar -->
      <ChatToolbar :mode="mode" @update:mode="mode = $event" />

      <div class="border-b border-stone-800 bg-stone-900/70 px-4 py-3 text-sm">
        <div class="flex flex-wrap items-end gap-4">
          <div class="flex flex-col gap-1 min-w-[220px]">
            <span class="text-xs uppercase tracking-[0.2em] text-stone-500">Connection</span>
            <Select v-model="selectedConnectionId" class="w-full">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select a saved connection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="conn in connections"
                  :key="conn.id"
                  :value="conn.id"
                >
                  {{ conn.nickname }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex-1 min-w-60 space-y-1 text-xs text-stone-400">
            <p v-if="selectedConnection" class="text-stone-200">
              {{ selectedConnection.nickname }} · {{ selectedConnection.provider.toUpperCase() }}
            </p>
            <p v-else class="text-rose-400">
              Define named connections in Settings → Database Connections.
            </p>
            <p class="text-[10px] text-stone-500">
              Queries run through <span class="font-mono text-stone-200">{{ queryApiUrl }}</span>
            </p>
            <p v-if="selectedConnection?.description" class="text-[10px] italic text-stone-500">
              {{ selectedConnection.description }}
            </p>
          </div>
        </div>
      </div>

      <!-- Editor -->
      <ChatEditor :mode="mode" :input="input" @update:input="input = $event" />

      <!-- Footer -->
        <ChatFooter :mode="mode" :loading="mode === 'write' && isExecuting" @run="run" @clear="clear" />

        <div
          v-if="mode === 'write' && (queryResult || queryError || lastQuery)"
          class="px-4 py-3 space-y-2 text-xs text-stone-300"
        >
          <p v-if="lastQuery" class="text-stone-400">
            Last query:
            <span class="font-mono text-stone-100 break-all">{{ lastQuery }}</span>
          </p>
          <div v-if="queryError" class="rounded-md border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-rose-200">
            {{ queryError }}
          </div>
          <pre
            v-else-if="queryResult"
            class="max-h-60 overflow-y-auto rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-[11px]"
          >
            {{ queryResultText }}
          </pre>
          <p v-else class="text-stone-500">Run a query to see results here.</p>
        </div>

    </section>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { toast } from 'vue-sonner'
import ChatSidebar from '../components/Chat/ChatSidebar.vue'
import ChatToolbar from '../components/Chat/ChatToolbar.vue'
import ChatEditor from '../components/Chat/ChatEditor.vue'
import ChatFooter from '../components/Chat/ChatFooter.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONNECTION_STORAGE_KEY, defaultConnections, buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { QUERY_API_URL } from '@/lib/api'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'

const queryApiUrl = QUERY_API_URL
const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')

const selectedConnection = computed(() =>
  connections.value.find((conn) => conn.id === selectedConnectionId.value) ?? null,
)

const loadConnections = () => {
  if (typeof window === 'undefined') {
    connections.value = [...defaultConnections]
    selectedConnectionId.value = connections.value[0]?.id ?? ''
    return
  }

  const stored = window.localStorage.getItem(CONNECTION_STORAGE_KEY)
  let parsed

  try {
    parsed = stored ? JSON.parse(stored) : null
  } catch {
    parsed = null
  }

  connections.value = Array.isArray(parsed) && parsed.length ? parsed : [...defaultConnections]
  if (!connections.value.length) {
    connections.value = [...defaultConnections]
  }
  if (!connections.value.some((conn) => conn.id === selectedConnectionId.value)) {
    selectedConnectionId.value = connections.value[0]?.id ?? ''
  }
}

const handleStorageEvent = (event: StorageEvent) => {
  if (event.key === CONNECTION_STORAGE_KEY) {
    loadConnections()
  }
}

onMounted(async () => {
  loadConnections()
  window.addEventListener('storage', handleStorageEvent)
  window.addEventListener('pegasus:connections-updated', loadConnections)
  encryptionKey.value = await generateKey()
  // Load chat history from IndexedDB
  const encrypted = await db.conversations.get('current')
  if (encrypted && encryptionKey.value) {
    try {
      const decrypted = await decryptData(encryptionKey.value, encrypted.messages)
      chatHistory.value = decrypted
    } catch (e) {
      chatHistory.value = []
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorageEvent)
  window.removeEventListener('pegasus:connections-updated', loadConnections)
})

const queryResult = ref<unknown>(null)
const queryError = ref('')
const lastQuery = ref('')
const isExecuting = ref(false)
const mode = ref<'chat' | 'write'>('chat')
const input = ref('')
const chatHistory = ref([])
const encryptionKey = ref(null)
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')

const queryResultText = computed(() => {
  if (!queryResult.value) return ''
  return JSON.stringify(queryResult.value, null, 2)
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
  sidebarSide.value = sidebarOpen.value ? (sidebarSide.value === 'left' ? 'right' : 'left') : sidebarSide.value
}

const run = async () => {
  if (!input.value.trim()) return
  if (!selectedConnection.value) {
    queryError.value = 'Pick a saved database connection in Settings → Database Connections.'
    return
  }

  const payload = input.value.trim()
  const timestamp = Date.now()

  if (mode.value === 'write') {
    isExecuting.value = true
    queryError.value = ''
    queryResult.value = null
    lastQuery.value = payload

    try {
      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: payload,
        }),
      })

      const body = await response.json()

      if (!response.ok || body.error) {
        throw new Error(body.error ?? 'Unable to execute query')
      }

      queryResult.value = body.result ?? null
      toast.success('Query executed', {
        description: selectedConnection.value
          ? `${selectedConnection.value.nickname}: ${Array.isArray(body.result)
              ? `${body.result.length} row${body.result.length === 1 ? '' : 's'} returned`
              : 'Query completed'}`
          : 'Query completed',
        position: 'top-right',
      })
      // Save query to chat history
      chatHistory.value.push({ role: 'user', content: payload, timestamp })
      chatHistory.value.push({ role: 'system', content: JSON.stringify(body.result), timestamp })
      if (encryptionKey.value) {
        const encrypted = await encryptData(encryptionKey.value, chatHistory.value)
        await db.conversations.put({ id: 'current', messages: encrypted, updatedAt: Date.now() })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      queryError.value = message
      toast.error('Query failed', { description: message, position: 'top-right' })
    } finally {
      isExecuting.value = false
    }
  } else {
    // Save chat message
    chatHistory.value.push({ role: 'user', content: payload, timestamp })
    if (encryptionKey.value) {
      const encrypted = await encryptData(encryptionKey.value, chatHistory.value)
      await db.conversations.put({ id: 'current', messages: encrypted, updatedAt: Date.now() })
    }
    console.log('Chat:', payload)
  }

  input.value = ''
}

const clear = () => {
  input.value = ''
  queryError.value = ''
  queryResult.value = null
  lastQuery.value = ''
}
</script>
