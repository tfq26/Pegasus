<script setup lang="ts">
import type { ConnectionFormState } from '@/views/settings/types'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

defineProps<{
  connectionForm: ConnectionFormState
}>()

const providers = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Anthropic', value: 'anthropic' },
    { label: 'Azure OpenAI', value: 'azure_openai' }
]
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <div class="space-y-1.5 md:col-span-2">
      <label class="text-[10px]  tracking-wide text-muted-foreground">AI Service</label>
      <Select v-model="connectionForm.ai_provider.service">
        <SelectTrigger class="w-full h-9 rounded-lg border-input bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
            <SelectItem v-for="p in providers" :key="p.value" :value="p.value">
                {{ p.label }}
            </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-1.5 md:col-span-2">
      <label class="text-[10px]  tracking-wide text-muted-foreground">API Key / Token</label>
      <input 
        v-model="connectionForm.ai_provider.apiKey" 
        type="password"
        placeholder="sk-..." 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
      <p class="text-[10px] text-muted-foreground">
        Stored securely. In production, this will be encrypted.
      </p>
    </div>

    <div v-if="connectionForm.ai_provider.service === 'azure_openai'" class="space-y-1.5 md:col-span-2">
        <label class="text-[10px]  tracking-wide text-muted-foreground">Endpoint Base URL</label>
        <input 
            v-model="connectionForm.ai_provider.baseUrl" 
            placeholder="https://my-resource.openai.azure.com/" 
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
    </div>

    <div class="space-y-1.5 md:col-span-2">
        <label class="text-[10px]  tracking-wide text-muted-foreground">Default Model</label>
        <input 
            v-model="connectionForm.ai_provider.defaultModel" 
            placeholder="gpt-4o" 
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
    </div>
  </div>
</template>
