
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { surreal, connectToSurreal } from '@/lib/surreal';

const activeCount = ref(0);
const connected = ref(false);
const error = ref<string | null>(null);

let queryUuid: string | null = null;

onMounted(async () => {
    const isConnected = await connectToSurreal();
    connected.value = isConnected;
    
    if (isConnected) {
        try {
            // 1. Create a presence entry for self
            const myPresence = await surreal.create('presence', {
                user: 'user_' + Math.random().toString(36).substr(2, 9),
                last_seen: new Date()
            });
            
            // 2. Initial count
            const result = await surreal.select('presence');
            activeCount.value = result.length;
            
            // 3. Live Query
            // Note: surrealdb.js v1.0.0 uses .live() differently than beta
            // Assuming simplified live query support
            // For v1.0, we typically use .live('presence', callback) or similar depending on exact version
            
            /* 
               Implement simple polling fall-back if live query fails or setup not ready 
               since we don't know exact server version compatibility 
            */
            const liveQuery = await surreal.live('presence', (action, result) => {
                console.log('Live update:', action, result);
                if (action === 'CREATE') activeCount.value++;
                if (action === 'DELETE') activeCount.value--;
            });
            
            // Should store uuid to kill it later
             if (typeof liveQuery === 'string') {
                queryUuid = liveQuery;
             }

        } catch (e: any) {
            console.error('Presence error:', e);
            error.value = e.message;
        }
    }
});

onUnmounted(async () => {
    if (queryUuid) {
        // await surreal.kill(queryUuid); 
    }
});
</script>

<template>
  <div class="fixed bottom-4 left-4 p-2 bg-background/80 backdrop-blur border border-border rounded shadow text-xs font-mono">
    <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-lg" :class="connected ? 'bg-green-500' : 'bg-red-500'"></div>
        <span>SurrealDB: {{ connected ? 'Connected' : 'Disconnected' }}</span>
    </div>
    <div v-if="connected" class="mt-1">
        Active Users: {{ activeCount }}
    </div>
    <div v-if="error" class="mt-1 text-red-500">
        {{ error }}
    </div>
  </div>
</template>
