<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-2xl">
          <div class="p-2 rounded-xl bg-gradient-to-br border" :class="[gradientClasses.bg, gradientClasses.border]">
            <component :is="limitIcon" class="h-6 w-6" :class="gradientClasses.icon" />
          </div>
          {{ title }}
        </DialogTitle>
        <DialogDescription class="text-base pt-2">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <!-- Current Usage -->
      <div v-if="showUsage && currentUsage !== undefined && limit !== undefined" class="my-4 p-4 rounded-xl bg-secondary/50 border border-border">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-muted-foreground">Current Usage</span>
          <span class="text-sm font-bold">{{ currentUsage }} / {{ limit }}</span>
        </div>
        <div class="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            class="h-full bg-gradient-to-r transition-all duration-300"
            :class="gradientClasses.bar"
            :style="{ width: `${Math.min((currentUsage / limit) * 100, 100)}%` }"
          />
        </div>
      </div>

      <!-- Benefits -->
      <div class="space-y-3 my-6">
        <p class="text-sm font-semibold text-foreground">{{ upgradeTarget }} includes:</p>
        <div class="space-y-2">
          <div v-for="benefit in benefits" :key="benefit" class="flex items-start gap-2">
            <Check class="h-4 w-4 mt-0.5 shrink-0" :class="gradientClasses.icon" />
            <span class="text-sm text-muted-foreground">{{ benefit }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2">
        <button
          @click="handleUpgrade"
          class="w-full py-3 px-4 rounded-xl bg-gradient-to-r text-white font-bold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          :class="[gradientClasses.button, gradientClasses.shadow]"
        >
          {{ upgradeButtonText }}
        </button>
        <button
          @click="$emit('update:open', false)"
          class="w-full py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-all"
        >
          Maybe Later
        </button>
      </div>

      <!-- Fine Print -->
      <p class="text-xs text-muted-foreground text-center mt-4">
        {{ finePrint }}
      </p>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Database, LayoutDashboard, Table, Sparkles, Check } from 'lucide-vue-next'

interface Props {
  open: boolean
  limitType?: 'connections' | 'dashboards' | 'tables' | 'tokens' | 'storage' | 'models' | 'byom'
  overrideTitle?: string
  overrideDescription?: string
  overrideBenefits?: string[]
  overrideButtonText?: string
  targetTier?: 'pro' | 'pro_plus' | 'teams' | 'enterprise'
  currentTier?: 'free' | 'pro' | 'pro_plus' | 'teams' | 'enterprise'
  currentUsage?: number
  limit?: number
  showUsage?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentTier: 'free',
  showUsage: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()

const limitIcon = computed(() => {
  if (!props.limitType) return Sparkles
  switch (props.limitType) {
    case 'connections': return Database
    case 'dashboards': return LayoutDashboard
    case 'tables': return Table
    case 'tokens': return Sparkles
    case 'storage': return Database
    case 'models': return Sparkles
    default: return Sparkles
  }
})

const config = computed(() => {
  if (!props.limitType) return null
  
  const configs = {
    connections: {
      title: 'Upgrade to Unlock More Connections',
      description: `You've reached your ${props.currentTier === 'free' ? 'Free tier' : 'current'} limit of ${props.limit} connection${props.limit !== 1 ? 's' : ''}. Upgrade to connect to unlimited data sources.`,
      benefits: [
        'Unlimited database connections',
        'Unlimited tables across all connections',
        props.currentTier === 'free' ? '10 dashboards' : 'Unlimited dashboards',
        'Advanced AI models (GPT-4o, Gemini Pro, o1-mini)',
        props.currentTier === 'free' ? '200k monthly tokens' : '600k monthly tokens'
      ],
      upgradeTarget: props.currentTier === 'free' ? 'Pro' : 'Pro+',
      upgradeButtonText: props.currentTier === 'free' ? 'Upgrade to Pro - $10/mo' : 'Upgrade to Pro+ - $30/mo'
    },
    dashboards: {
      title: 'Upgrade for More Dashboards',
      description: `You've reached your ${props.currentTier === 'free' ? 'Free tier' : 'Pro'} limit of ${props.limit} dashboard${props.limit !== 1 ? 's' : ''}. Upgrade to create ${props.currentTier === 'free' ? '10 dashboards' : 'unlimited dashboards'}.`,
      benefits: [
        props.currentTier === 'free' ? '10 dashboards' : 'Unlimited dashboards',
        'Unlimited connections and tables',
        'Advanced AI models',
        props.currentTier === 'free' ? '200k monthly tokens' : '600k monthly tokens',
        props.currentTier === 'pro' ? 'Experimental features access' : 'Priority support'
      ],
      upgradeTarget: props.currentTier === 'free' ? 'Pro' : 'Pro+',
      upgradeButtonText: props.currentTier === 'free' ? 'Upgrade to Pro - $10/mo' : 'Upgrade to Pro+ - $30/mo'
    },
    tables: {
      title: 'Upgrade for Unlimited Tables',
      description: `You've reached your Free tier limit of ${props.limit} tables. Upgrade to Pro for unlimited table access across all your connections.`,
      benefits: [
        'Unlimited tables',
        'Unlimited database connections',
        '10 dashboards',
        'Advanced AI models (GPT-4o, Gemini Pro, o1-mini)',
        '200k monthly tokens'
      ],
      upgradeTarget: 'Pro',
      upgradeButtonText: 'Upgrade to Pro - $10/mo'
    },
    tokens: {
      title: 'Token Limit Reached',
      description: `You've used your ${props.limit?.toLocaleString()} monthly tokens. Your limit resets next month, or upgrade for more capacity.`,
      benefits: [
        props.currentTier === 'free' ? '200k monthly tokens (3.3x more)' : '600k monthly tokens (3x more)',
        'Purchase additional token packs anytime',
        'Unlimited connections and tables',
        props.currentTier === 'free' ? '10 dashboards' : 'Unlimited dashboards',
        'Advanced AI models'
      ],
      upgradeTarget: props.currentTier === 'free' ? 'Pro' : 'Pro+',
      upgradeButtonText: props.currentTier === 'free' ? 'Upgrade to Pro - $10/mo' : 'Upgrade to Pro+ - $30/mo'
    },
    storage: {
      title: 'Storage Limit Reached',
      description: `You've reached your storage limit. Upgrade for ${props.currentTier === 'free' ? '500 MB' : '10 GB'} of secure vault storage.`,
      benefits: [
        props.currentTier === 'free' ? '500 MB storage (5x more)' : '10 GB storage (20x more)',
        'Purchase additional storage anytime',
        'Unlimited connections and tables',
        props.currentTier === 'free' ? '10 dashboards' : 'Unlimited dashboards',
        'Advanced AI models'
      ],
      upgradeTarget: props.currentTier === 'free' ? 'Pro' : 'Pro+',
      upgradeButtonText: props.currentTier === 'free' ? 'Upgrade to Pro - $10/mo' : 'Upgrade to Pro+ - $30/mo'
    },
    models: {
      title: 'Unlock Advanced AI Models',
      description: 'This AI model requires a Pro subscription. Upgrade to access GPT-4o, Gemini Pro, o1-mini, and more.',
      benefits: [
        'GPT-4o (Advanced reasoning)',
        'Gemini 1.5 Pro (Powerful analysis)',
        'o1-mini (Deep reasoning)',
        'Unlimited connections and tables',
        '200k monthly tokens'
      ],
      upgradeTarget: 'Pro',
      upgradeButtonText: 'Upgrade to Pro - $10/mo'
    },
    byom: {
      title: 'Connect Your Own Cloud',
      description: 'Connecting external cloud providers like AWS, Azure, and Google Cloud is a Teams+ feature. Bring your own models and credits.',
      benefits: [
        'Bring Your Own Model (BYOM)',
        'AWS Bedrock Integration',
        'Azure OpenAI Integration',
        'Google Cloud Vertex AI',
        'Centralized Team Management'
      ],
      upgradeTarget: 'Teams+',
      upgradeButtonText: 'Upgrade to Teams'
    }
  }

  return configs[props.limitType as keyof typeof configs]
})

const title = computed(() => props.overrideTitle || config.value?.title || 'Upgrade to Continue')
const description = computed(() => props.overrideDescription || config.value?.description || 'Unlock this feature by upgrading your plan.')
const benefits = computed(() => props.overrideBenefits || config.value?.benefits || [])
const upgradeTarget = computed(() => {
    // If targetTier prop is set, format it (Pro, Teams+, etc)
    if (props.targetTier) {
        if (props.targetTier === 'pro') return 'Pro'
        if (props.targetTier === 'pro_plus') return 'Pro+'
        if (props.targetTier === 'teams') return 'Teams+'
        if (props.targetTier === 'enterprise') return 'Enterprise'
    }
    return config.value?.upgradeTarget || 'Pro'
})
const upgradeButtonText = computed(() => props.overrideButtonText || config.value?.upgradeButtonText || 'Upgrade Plan')

const gradientClasses = computed(() => {
  const tier = props.targetTier || upgradeTarget.value?.toLowerCase().replace('+', '_plus') || 'pro'
  
  const styles = {
    free: {
       bg: 'from-slate-500 to-gray-500',
       button: 'from-slate-600 to-gray-600 hover:from-slate-500 hover:to-gray-500',
       border: 'border-gray-200 dark:border-gray-800',
       icon: 'text-slate-500',
       bar: 'from-slate-500 to-gray-400',
       shadow: 'shadow-slate-500/20'
    },
    pro: {
       bg: 'from-purple-500/10 to-indigo-500/10',
       alert: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
       icon: 'text-purple-600 dark:text-purple-400',
       bar: 'from-purple-600 to-indigo-500',
       button: 'from-purple-600 via-violet-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400',
       border: 'border-purple-500/20',
       shadow: 'shadow-purple-500/20'
    },
    pro_plus: {
       bg: 'from-fuchsia-500/10 to-pink-500/10',
       alert: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
       icon: 'text-fuchsia-600 dark:text-fuchsia-400',
       bar: 'from-fuchsia-600 to-pink-500',
       button: 'from-fuchsia-600 via-pink-600 to-rose-500 hover:from-fuchsia-500 hover:to-rose-400',
       border: 'border-fuchsia-500/20',
       shadow: 'shadow-fuchsia-500/20'
    },
    teams: {
       bg: 'from-orange-500/10 to-amber-500/10',
       alert: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
       icon: 'text-orange-600 dark:text-orange-400',
       bar: 'from-orange-600 to-amber-500',
       button: 'from-orange-600 via-amber-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400',
       border: 'border-orange-500/20',
       shadow: 'shadow-orange-500/20'
    },
    enterprise: {
       bg: 'from-blue-600/10 to-cyan-500/10',
       alert: 'bg-blue-600/10 text-blue-600 border-blue-500/20',
       icon: 'text-blue-600 dark:text-blue-400',
       bar: 'from-blue-600 to-cyan-500',
       button: 'from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-teal-400',
       border: 'border-blue-500/20',
       shadow: 'shadow-blue-500/20'
    }
  }

  // Handle 'teams+' or other variations
  if (tier.includes('teams')) return styles.teams
  if (tier.includes('enterprise')) return styles.enterprise
  if (tier.includes('pro_plus')) return styles.pro_plus
  
  return styles[tier as keyof typeof styles] || styles.pro
})

const finePrint = computed(() => {
  return 'Cancel anytime. No long-term commitment required.'
})

const handleUpgrade = () => {
  emit('update:open', false)
  router.push('/pricing')
}
</script>
