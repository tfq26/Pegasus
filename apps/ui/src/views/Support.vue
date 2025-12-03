<template>
  <div class="w-full min-h-full bg-background">
    <div class="max-w-6xl mx-auto p-6 sm:p-10 space-y-12">
      
      <!-- Header -->
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold text-foreground">Support & Feedback</h1>
        <p class="text-muted-foreground text-lg">
          Check out what's new and let us know how we can improve
        </p>
      </div>

      <!-- Changelog Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles class="w-6 h-6 text-primary" />
          Latest Updates
        </h2>
        
        <div class="space-y-4">
          <div v-for="(update, index) in changelog" :key="index" class="rounded-xl border border-border bg-card overflow-hidden">
            <button
              @click="toggleExpanded(index)"
              class="w-full p-6 text-left hover:bg-accent/50 transition-colors"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="px-2 py-1 rounded-full text-xs font-medium" :class="getBadgeClass(update.type)">
                      {{ update.type }}
                    </span>
                    <span class="text-sm text-muted-foreground">{{ update.date }}</span>
                  </div>
                  <h3 class="text-lg font-semibold text-foreground mb-2">{{ update.title }}</h3>
                  <p class="text-muted-foreground">{{ update.description }}</p>
                </div>
                <div class="shrink-0 transition-transform duration-200" :class="{ 'rotate-180': expandedItems.has(index) }">
                  <svg class="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>
            
            <div 
              v-if="expandedItems.has(index) && update.items"
              class="px-6 pb-6 border-t border-border bg-muted/20"
            >
              <ul class="mt-4 space-y-2">
                <li v-for="(item, i) in update.items" :key="i" class="text-sm text-muted-foreground flex items-start gap-2">
                  <Check class="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Feedback Form Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare class="w-6 h-6 text-primary" />
          Send Feedback
        </h2>

        <div class="p-8 rounded-xl border border-border bg-card">
          <form @submit.prevent="handleSubmit" class="space-y-6">
            
            <!-- Feature Category -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Feature Category *</label>
              <Select v-model="form.featureCategory">
                <SelectTrigger>
                  <SelectValue placeholder="Select a feature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dashboard">Dashboard</SelectItem>
                  <SelectItem value="Query">Query</SelectItem>
                  <SelectItem value="AI">AI</SelectItem>
                  <SelectItem value="Database Connections">Database Connections</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Custom Feature (shown when Other is selected) -->
            <div v-if="form.featureCategory === 'Other'" class="space-y-2">
              <label class="text-sm font-medium text-foreground">Specify Feature</label>
              <input
                v-model="form.customFeature"
                placeholder="Enter feature name"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <!-- Issue Type -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Issue Type *</label>
              <Select v-model="form.issueType">
                <SelectTrigger>
                  <SelectValue placeholder="Select issue type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bug">Bug</SelectItem>
                  <SelectItem value="Feature Request">Feature Request</SelectItem>
                  <SelectItem value="Improvement">Improvement</SelectItem>
                  <SelectItem value="Question">Question</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Description -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Description *</label>
              <textarea
                v-model="form.description"
                placeholder="Please describe your feedback in detail..."
                rows="6"
                class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              ></textarea>
              <p class="text-xs text-muted-foreground">{{ form.description.length }} / 1000 characters</p>
            </div>

            <!-- Email (optional) -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Email (optional)</label>
              <input
                v-model="form.userEmail"
                type="email"
                placeholder="your@email.com"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p class="text-xs text-muted-foreground">We'll use this to follow up if needed</p>
            </div>

            <!-- Mark as Urgent -->
            <div class="flex items-center gap-2">
              <input
                id="urgent"
                v-model="form.isUrgent"
                type="checkbox"
                class="w-4 h-4 rounded border-input text-primary focus:ring-primary"
              />
              <label for="urgent" class="text-sm font-medium text-foreground cursor-pointer">
                Mark as urgent (critical issues only)
              </label>
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end gap-3 pt-4">
              <button
                type="button"
                @click="resetForm"
                class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
              >
                Clear
              </button>
              <button
                type="submit"
                :disabled="!isFormValid || isSubmitting"
                class="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send class="w-4 h-4" />
                {{ isSubmitting ? 'Sending...' : 'Send Feedback' }}
              </button>
            </div>
          </form>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { submitFeedback } from '@/lib/api'
import { toast } from 'vue-sonner'
import { Sparkles, MessageSquare, Check, Send } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

defineOptions({ name: 'SupportView' })

const changelog = ref<any[]>([])
const expandedItems = ref(new Set<number>())

// Load changelog from JSON file
onMounted(async () => {
  try {
    const response = await fetch('/changelog.json')
    changelog.value = await response.json()
  } catch (error) {
    console.error('Failed to load changelog:', error)
    // Fallback to empty array if loading fails
    changelog.value = []
  }
})

const toggleExpanded = (index: number) => {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
  // Trigger reactivity
  expandedItems.value = new Set(expandedItems.value)
}

const form = ref({
  featureCategory: '',
  customFeature: '',
  issueType: '',
  description: '',
  userEmail: '',
  isUrgent: false
})

const isSubmitting = ref(false)

const isFormValid = computed(() => {
  return form.value.featureCategory && 
         form.value.issueType && 
         form.value.description.trim().length > 0 &&
         form.value.description.length <= 1000
})

const getBadgeClass = (type: string) => {
  const classes = {
    'New Feature': 'bg-primary/10 text-primary border border-primary/20',
    'Improvement': 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    'Bug Fix': 'bg-green-500/10 text-green-500 border border-green-500/20',
    'Breaking Change': 'bg-destructive/10 text-destructive border border-destructive/20'
  }
  return classes[type as keyof typeof classes] || classes['New Feature']
}

const resetForm = () => {
  form.value = {
    featureCategory: '',
    customFeature: '',
    issueType: '',
    description: '',
    userEmail: '',
    isUrgent: false
  }
}

const handleSubmit = async () => {
  if (!isFormValid.value) return

  isSubmitting.value = true
  try {
    const browserInfo = navigator.userAgent
    
    await submitFeedback({
      ...form.value,
      browserInfo
    })

    toast.success('Feedback submitted successfully!', {
      description: form.value.isUrgent 
        ? 'We\'ll review this urgent feedback immediately.' 
        : 'Thank you for helping us improve Pegasus.'
    })

    resetForm()
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    toast.error('Failed to submit feedback', {
      description: 'Please try again later or contact support directly.'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>
