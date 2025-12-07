<template>
  <div class="w-full min-h-full bg-background p-4 space-y-6">
    
    <!-- Header -->
    <div class="text-center space-y-2 pt-2">
      <h1 class="text-2xl font-bold text-foreground">Send Feedback</h1>
      <p class="text-sm text-muted-foreground">
        Help us improve Pegasus
      </p>
    </div>

    <!-- Feedback Form -->
    <form @submit.prevent="handleSubmit" class="space-y-5">
      
      <!-- Feature Category -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-foreground">What feature? *</label>
        <Select v-model="form.featureCategory">
          <SelectTrigger class="h-12 text-base">
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
        <label class="text-sm font-semibold text-foreground">Specify Feature</label>
        <input
          v-model="form.customFeature"
          placeholder="Enter feature name"
          class="flex h-12 w-full rounded-lg border-2 border-input bg-transparent px-4 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>

      <!-- Issue Type -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-foreground">What type? *</label>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="type in issueTypes"
            :key="type.value"
            type="button"
            @click="form.issueType = type.value"
            class="h-14 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1"
            :class="form.issueType === type.value 
              ? 'border-primary bg-primary/10 text-primary font-semibold' 
              : 'border-border bg-card text-muted-foreground hover:border-primary/50'"
          >
            <component :is="type.icon" class="w-5 h-5" />
            <span class="text-xs">{{ type.label }}</span>
          </button>
        </div>
      </div>

      <!-- Description -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-foreground">Tell us more *</label>
        <textarea
          v-model="form.description"
          placeholder="Describe your feedback in detail..."
          rows="6"
          class="flex w-full rounded-lg border-2 border-input bg-transparent px-4 py-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 resize-none"
        ></textarea>
        <div class="flex justify-between items-center">
          <p class="text-xs text-muted-foreground">{{ form.description.length }} / 1000</p>
          <p v-if="form.description.length < 20" class="text-xs text-amber-500">At least 20 characters</p>
        </div>
      </div>

      <!-- Email (optional) -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-foreground">Your email (optional)</label>
        <input
          v-model="form.userEmail"
          type="email"
          placeholder="your@email.com"
          class="flex h-12 w-full rounded-lg border-2 border-input bg-transparent px-4 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        <p class="text-xs text-muted-foreground">We'll follow up if needed</p>
      </div>

      <!-- Mark as Urgent -->
      <div class="p-4 rounded-lg bg-muted/30 border border-border">
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            id="urgent"
            v-model="form.isUrgent"
            type="checkbox"
            class="w-5 h-5 rounded border-input text-primary focus:ring-primary mt-0.5 shrink-0"
          />
          <div class="flex-1">
            <span class="text-sm font-semibold text-foreground block">Mark as urgent</span>
            <span class="text-xs text-muted-foreground">For critical issues only</span>
          </div>
        </label>
      </div>

      <!-- Submit Buttons -->
      <div class="flex flex-col gap-3 pt-2">
        <button
          type="submit"
          :disabled="!isFormValid || isSubmitting"
          class="h-14 w-full rounded-lg font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
        >
          <Send class="w-5 h-5" />
          {{ isSubmitting ? 'Sending...' : 'Send Feedback' }}
        </button>
        <button
          type="button"
          @click="resetForm"
          class="h-12 w-full rounded-lg font-medium text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          Clear Form
        </button>
      </div>
    </form>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { submitFeedback } from '@/lib/api'
import { toast } from 'vue-sonner'
import { Send, Bug, Lightbulb, Wrench, HelpCircle } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

defineOptions({ name: 'MobileFeedback' })

const issueTypes = [
  { value: 'Bug', label: 'Bug', icon: Bug },
  { value: 'Feature Request', label: 'Feature', icon: Lightbulb },
  { value: 'Improvement', label: 'Improve', icon: Wrench },
  { value: 'Question', label: 'Question', icon: HelpCircle },
]

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
         form.value.description.trim().length >= 20 &&
         form.value.description.length <= 1000
})

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

    toast.success('Feedback sent!', {
      description: form.value.isUrgent 
        ? 'We\'ll review this urgent feedback immediately.' 
        : 'Thank you for helping us improve.'
    })

    resetForm()
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    toast.error('Failed to send', {
      description: 'Please try again later.'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>
