<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { localAI } from '@/services/LocalAIService'
import { Loader2, Wand2, ArrowRight, Check, Copy, AlertCircle } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const inputData = ref('ID: 101 - Product A (Active)\nID: 102 - Product B (Inactive)\nID: 103 - Product C (Active)')
const exampleInput = ref('ID: 101 - Product A (Active)')
const exampleOutput = ref('{"id": 101, "name": "Product A", "status": "Active"}')

const isProcessing = ref(false)
const generatedCode = ref('')
const results = ref<string[]>([])
const availableModels = ref<string[]>([])
const currentModel = ref('')
const aiReady = ref(false)

onMounted(async () => {
  // Only allow on desktop
  if (!('__TAURI_INTERNALS__' in window)) {
    router.push('/dashboard')
    return
  }
  
  // Check Ollama status and get available models
  const status = await localAI.getStatus()
  if (status.is_running && status.models.length > 0) {
    availableModels.value = status.models
    currentModel.value = status.models[0] // Use first available model
    aiReady.value = true
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

    // 2. Call Local AI
    const response = await localAI.chat(currentModel.value, [
      { role: 'system', content: 'You are a code generator. Output only valid JavaScript code.' },
      { role: 'user', content: prompt }
    ])
    
    const data = await response.json()
    let code = data.message?.content || ''
    
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

  } catch (e) {
    console.error(e)
    results.value = ['Error generating transformation. Ensure Local AI is running.']
  } finally {
    isProcessing.value = false
  }
}

const copyToClipboard = () => {
  navigator.clipboard.writeText(results.value.join('\n'))
}
</script>

<template>
  <div class="h-full flex flex-col p-6 max-w-6xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Wand2 class="w-8 h-8 text-violet-500" />
          Data Wrangler
        </h1>
        <p class="text-muted-foreground mt-1">Transform messy data instantly by providing a single example.</p>
      </div>
      <div>
        <div class="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full text-xs font-mono text-muted-foreground border border-border">
          <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          Powered by Local AI
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
      
      <!-- Left: Inputs -->
      <div class="flex flex-col gap-4 lg:col-span-1">
        <div class="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
          <label class="text-sm font-semibold text-foreground">1. Paste Messy Data</label>
          <textarea 
            v-model="inputData"
            class="flex-1 min-h-[200px] w-full bg-background border border-input rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Paste your raw data here..."
          ></textarea>
        </div>

        <button 
          @click="transformData"
          :disabled="isProcessing"
          class="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-2"
        >
          <Loader2 v-if="isProcessing" class="w-5 h-5 animate-spin" />
          <Wand2 v-else class="w-5 h-5" />
          {{ isProcessing ? 'Wrangling...' : 'Auto-Transform' }}
        </button>
      </div>

      <!-- Center: The Example (The Magic) -->
      <div class="flex flex-col gap-4 lg:col-span-1">
        <div class="bg-card border border-border rounded-xl p-4 flex flex-col gap-4 shadow-sm h-full relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
          
          <div>
            <label class="text-sm font-semibold text-foreground flex items-center gap-2">
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
             <label class="text-sm font-semibold text-foreground flex items-center gap-2">
              <span class="flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 text-xs text-center">3</span>
              Show ideal output
            </label>
            <textarea 
              v-model="exampleOutput"
              class="mt-2 w-full h-32 bg-background border border-input rounded-lg p-2 text-xs font-mono resize-none"
            ></textarea>
          </div>

          <div v-if="generatedCode" class="mt-auto pt-4 border-t border-border">
            <label class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Generated Logic</label>
            <pre class="bg-muted p-2 rounded-lg text-[10px] font-mono overflow-x-auto text-muted-foreground whitespace-pre-wrap">{{ generatedCode }}</pre>
          </div>
        </div>
      </div>

      <!-- Right: Results -->
      <div class="flex flex-col gap-4 lg:col-span-1">
        <div class="bg-card border border-border rounded-xl p-4 flex flex-col h-full shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <label class="text-sm font-semibold text-foreground">Clean Data</label>
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
  </div>
</template>
