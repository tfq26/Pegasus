<script setup lang="ts">
import { ref } from 'vue'
import type { ConnectionFormState } from '@/views/settings/types'
import { Eye, EyeOff, Info } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const showSecret = ref(false)

const regions = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
]
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="text-xs font-semibold  tracking-wider text-muted-foreground">AWS Region</label>
          <select 
            v-model="props.connectionForm.dynamodb.region"
            class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
          >
            <option v-for="r in regions" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>
        
        <div class="space-y-2">
            <label class="text-xs font-semibold  tracking-wider text-muted-foreground">Endpoint URL (Optional)</label>
            <input
              v-model="props.connectionForm.dynamodb.endpoint"
              type="text"
              placeholder="http://localhost:8000"
              class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
            />
            <p class="text-[10px] text-muted-foreground">Leave empty for AWS cloud. Set for local development.</p>
        </div>
    </div>

    <div class="space-y-2">
      <label class="text-xs font-semibold  tracking-wider text-muted-foreground">Access Key ID</label>
      <input
        v-model="props.connectionForm.dynamodb.accessKeyId"
        type="text"
        placeholder="AKIA..."
        class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground font-mono"
      />
    </div>

    <div class="space-y-2">
      <label class="text-xs font-semibold  tracking-wider text-muted-foreground">Secret Access Key</label>
      <div class="relative">
        <input
          v-model="props.connectionForm.dynamodb.secretAccessKey"
          :type="showSecret ? 'text' : 'password'"
          placeholder="Required"
          class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground font-mono pr-10"
        />
        <button 
          type="button"
          @click="showSecret = !showSecret"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <component :is="showSecret ? EyeOff : Eye" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Live Cache Toggle -->
    <div class="mt-4 border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <div class="text-xs font-medium">Enable Live Cache</div>
                <p class="text-[10px] text-muted-foreground">Polls database periodically for live dashboard data.</p>
            </div>
            <Switch :checked="props.connectionForm.dynamodb.enableLiveCache" @update:checked="(v) => props.connectionForm.dynamodb.enableLiveCache = v" />
        </div>
        
        <div v-if="props.connectionForm.dynamodb.enableLiveCache" class="space-y-3">
              <div class="space-y-1.5">
                <label class="text-[10px]  tracking-wide text-muted-foreground">Polling Interval (seconds)</label>
                <input 
                    v-model.number="props.connectionForm.dynamodb.pollingInterval" 
                    type="number"
                    min="10"
                    placeholder="300" 
                    class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
                />
                <p class="text-[10px] text-muted-foreground">Minimum 10 seconds. Default 300 (5 mins).</p>
              </div>

              <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex gap-3 items-start">
                <Info class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div class="space-y-1">
                    <p class="text-xs font-medium text-green-500">Live Dashboard Ready</p>
                    <p class="text-[10px] text-muted-foreground leading-relaxed">
                        Data will be cached in Pegasus Cloud. Dashboards will stream updates in real-time.
                    </p>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>
