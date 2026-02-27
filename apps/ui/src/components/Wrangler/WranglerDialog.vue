<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { localAI } from '@/services/LocalAIService'
import { getAIModels, wrangleData } from '@/lib/api'
import { Loader2, Wand2, ArrowRight, Check, Copy, AlertCircle, Server, Cloud } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const inputData = ref('ID: 101 - Product A (Active)\nID: 102 - Product B (Inactive)\nID: 103 - Product C (Active)')
const exampleInput = ref('ID: 101 - Product A (Active)')
const exampleOutput = ref('{"id": 101, "name": "Product A", "status": "Active"}')

const isProcessing = ref(false)
const generatedCode = ref('')
const results = ref<string[]>([])

const aiProvider = ref<'local' | 'cloud'>('local')
const localModels = ref<string[]>([])
const cloudModels = ref<any[]>([])
const currentModel = ref('')
const aiReady = ref(false)

const availableModels = computed(() => {
  return aiProvider.value === 'local' ? localModels.value : cloudModels.value.map(m => m.id)
})

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

onMounted(async () => {
  // 1. Check Local AI
  localAI.getStatus().then(status => {
    if (status.is_running && status.models.length > 0) {
      localModels.value = status.models
      if (aiProvider.value === 'local' && !currentModel.value) {
        // Preferred: User's default local model
        const s = settings.value as any
        if (s.localModel && status.models.includes(s.localModel)) {
          currentModel.value = s.localModel
        } else {
          // Fallback: First available
          currentModel.value = status.models[0] || ''
        }
      }
      aiReady.value = true
    }
  })

  // 2. Load Cloud Models
  try {
    const models = await getAIModels()
    cloudModels.value = models
  } catch (e) {
    console.error('Failed to load cloud models', e)
  }
})

// Watch provider change to set default model
watch(aiProvider, (newProvider: 'local' | 'cloud') => {
  if (newProvider === 'local') {
    currentModel.value = localModels.value[0] || ''
  } else {
    // Default to a smart model
    const smart = cloudModels.value.find(m => m.id.includes('gpt-4') || m.id.includes('claude-3-opus'))
    currentModel.value = smart ? smart.id : (cloudModels.value[0]?.id || '')
  }
})

const transformData = async () => {
  if (!currentModel.value) {
    results.value = ['Error: No local AI model available. Please start Ollama and pull a model.']
    return
  }
  
  isProcessing.value = true
  results.value = []
  generatedCode.value = ''

  try {
    // 1. Construct the prompt
    const prompt = `
    You are a data transformation expert.
    I have a list of strings that follow a specific pattern.
    
    Here is an example input:
    "${exampleInput.value}"
    
    Here is the desired output for that input (JSON format):
    ${exampleOutput.value}
    
    TASK: Write a specific JavaScript arrow function named 'transform' that takes a single string argument 'input' and returns the transformed JSON object.
    Do NOT explain. Return ONLY the code for the arrow function. Use Regex if needed.
    `

    // 2. Execution
    let code = ''
    
    if (aiProvider.value === 'cloud') {
       const res = await wrangleData(prompt, currentModel.value)
       code = res.code || ''
    } else {
      // Local AI
      const response = await localAI.chat(currentModel.value, [
        { role: 'system', content: 'You are a code generator. Output only valid JavaScript code.' },
        { role: 'user', content: prompt }
      ])
      const data = await response.json()
      code = data.message?.content || ''
    }
    
    // Clean up code (strip markdown code blocks if present)
    code = code.replace(/```javascript/g, '').replace(/```/g, '').trim()
    
    // Extract just the function if it added extra text
    const match = code.match(/(const|let|var)?\s*transform\s*=\s*\(.*?\)\s*=>\s*{[\s\S]*?}|function\s*transform\s*\(.*?\)\s*{[\s\S]*?}/)
    if (match) {
        code = match[0]
    }

    generatedCode.value = code

    // 3. Execute the generated code
    const transformFn = new Function(`return ${code}`)()

    // 4. Apply to all rows
    const lines = inputData.value.split('\n').filter(l => l.trim())
    results.value = lines.map(line => {
      try {
        const res = transformFn(line)
        return JSON.stringify(res)
      } catch (e) {
        return `Error: ${e}`
      }
    })

  } catch (e: any) {
    console.error(e)
    const errorMsg = e.message || 'Error generating transformation.'
    results.value = [`Error: ${errorMsg}`]
  } finally {
    isProcessing.value = false
  }
}

const copyToClipboard = () => {
  navigator.clipboard.writeText(results.value.join('\n'))
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-6xl h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader class="shrink-0 mb-4">
            <div class="flex items-center justify-between">
              <div>
                <DialogTitle class="text-2xl font-bold flex items-center gap-2">
                  <Wand2 class="w-6 h-6 text-violet-500" />
                  Data Wrangler
                </DialogTitle>
                <DialogDescription>
                  Transform messy data instantly by providing a single example.
                </DialogDescription>
              </div>
              
              <!-- Settings in Header -->
              <div class="flex items-center gap-3">
                  <div class="flex items-center bg-muted p-1 rounded-lg">
                     <button 
                      @click="aiProvider = 'local'"
                      class="px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2"
                      :class="aiProvider === 'local' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'"
                     >
                        <Server class="w-3 h-3" /> <span class="hidden sm:inline">Local</span>
                     </button>
                     <button 
                      @click="aiProvider = 'cloud'"
                      class="px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2"
                      :class="aiProvider === 'cloud' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'"
                     >
                        <Cloud class="w-3 h-3" /> <span class="hidden sm:inline">Cloud</span>
                     </button>
                  </div>
        
                  <Select v-model="currentModel">
                    <SelectTrigger class="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="m in availableModels" :key="m" :value="m">
                        {{ m }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
              </div>
            </div>
        </DialogHeader>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
          
          <!-- Left: Inputs -->
          <div class="flex flex-col gap-4 lg:col-span-1 h-full overflow-hidden">
            <div class="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm h-full overflow-hidden">
              <label class="text-xs font-bold uppercase tracking-wider text-foreground">1. Paste Messy Data</label>
              <textarea 
                v-model="inputData"
                class="flex-1 w-full bg-background border border-input rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary h-full"
                placeholder="Paste your raw data here..."
              ></textarea>
            </div>
          </div>
    
          <!-- Center: The Example -->
          <div class="flex flex-col gap-4 lg:col-span-1 h-full overflow-hidden">
             <!-- Action Button Mobile -->
            <button 
              @click="transformData"
              :disabled="isProcessing"
              class="lg:hidden w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Loader2 v-if="isProcessing" class="w-4 h-4 animate-spin" />
              <Wand2 v-else class="w-4 h-4" />
              {{ isProcessing ? 'Wrangling...' : 'Auto-Transform' }}
            </button>

            <div class="bg-card border border-border rounded-xl p-4 flex flex-col gap-4 shadow-sm h-full relative overflow-hidden">
              <div class="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
              
              <div>
                <label class="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span class="flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 text-xs text-center">2</span>
                  Pick one row
                </label>
                <input 
                  v-model="exampleInput"
                  class="mt-2 w-full bg-background border border-input rounded-lg p-2 text-xs font-mono"
                />
              </div>
    
              <div class="flex justify-center text-muted-foreground">
                <ArrowRight class="w-5 h-5" />
              </div>
    
              <div>
                 <label class="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span class="flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 text-xs text-center">3</span>
                  Show ideal output
                </label>
                <textarea 
                  v-model="exampleOutput"
                  class="mt-2 w-full h-24 bg-background border border-input rounded-lg p-2 text-xs font-mono resize-none"
                ></textarea>
              </div>

               <!-- Action Button Desktop -->
               <button 
                @click="transformData"
                :disabled="isProcessing"
                class="hidden lg:flex mt-auto w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-violet-500/20 transition-all items-center justify-center gap-2"
              >
                <Loader2 v-if="isProcessing" class="w-5 h-5 animate-spin" />
                <Wand2 v-else class="w-5 h-5" />
                {{ isProcessing ? 'Wrangling...' : 'Auto-Transform' }}
              </button>
    
              <div v-if="generatedCode" class="mt-4 pt-4 border-t border-border max-h-[150px] overflow-y-auto">
                <label class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Generated Logic</label>
                <pre class="bg-muted p-2 rounded-lg text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">{{ generatedCode }}</pre>
              </div>
            </div>
          </div>
    
          <!-- Right: Results -->
          <div class="flex flex-col gap-4 lg:col-span-1 h-full overflow-hidden">
            <div class="bg-card border border-border rounded-xl p-4 flex flex-col h-full shadow-sm overflow-hidden">
              <div class="flex items-center justify-between mb-3 shrink-0">
                <label class="text-xs font-bold uppercase tracking-wider text-foreground">Clean Data</label>
                 <button @click="copyToClipboard" class="text-xs flex items-center gap-1 text-violet-500 hover:text-violet-600">
                   <Copy class="w-3 h-3" /> Copy
                 </button>
              </div>
              
              <div class="flex-1 bg-background border border-input rounded-lg p-3 overflow-y-auto">
                <div v-if="results.length === 0" class="h-full flex items-center justify-center text-muted-foreground text-sm italic">
                  Results will appear here
                </div>
                <div v-else class="space-y-1">
                  <div v-for="(line, i) in results" :key="i" class="text-xs font-mono p-1 hover:bg-muted/50 rounded break-all border-b border-border/50 last:border-0">
                    {{ line }}
                  </div>
                </div>
              </div>
            </div>
          </div>
    
        </div>
    </DialogContent>
  </Dialog>
</template>
