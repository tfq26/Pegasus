<template>
  <div class="h-full bg-background overflow-hidden relative">
    <LoadingScreen 
      v-if="isLoadingList || (isLoadingContent && !content && !releaseData)" 
      title="Retrieving Intelligence"
      message="Fetching latest documentation from encrypted protocols..."
    />
    <div v-else class="flex h-full w-full animate-in fade-in duration-700">
      <!-- Sidebar Navigation -->
      <aside class="w-72 border-r border-border bg-card/30 backdrop-blur-xl flex flex-col pt-4">
        <div class="px-6 mb-8 flex items-center gap-2">
          <div class="p-2 rounded-lg bg-violet-600/10 border border-violet-500/20">
            <BookOpen class="w-5 h-5 text-violet-500" />
          </div>
          <h1 class="text-lg font-bold tracking-tight">Documentation</h1>
        </div>

        <div class="flex-1 overflow-y-auto px-3 space-y-8 pb-10">
          <!-- Guides Section -->
          <div class="space-y-2">
            <div class="px-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              <FileText class="w-3 h-3" /> Guides & Tutorials
            </div>
            <div class="space-y-1">
              <button
                v-for="slug in guides"
                :key="slug"
                @click="selectItem('guide', slug)"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group',
                  activeType === 'guide' && activeSlug === slug
                    ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                ]"
              >
                <div class="relative flex items-center justify-center w-5 h-5">
                   <img 
                     v-if="getProviderLogo(slug)" 
                     :src="getProviderLogo(slug)" 
                     class="w-4 h-4 object-contain transition-all group-hover:scale-110" 
                     :alt="slug"
                   />
                   <div v-else :class="[
                    'w-1.5 h-1.5 rounded-full transition-all',
                    activeType === 'guide' && activeSlug === slug ? 'bg-violet-500 scale-110 shadow-[0_0_8px_rgba(139,92,246,0.5)]' : 'bg-transparent group-hover:bg-muted-foreground/30'
                  ]"></div>
                </div>
                {{ formatTitle(slug) }}
              </button>
            </div>
          </div>

          <!-- Releases Section -->
          <div class="space-y-2">
            <div class="px-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              <History class="w-3 h-3" /> Releases & Updates
            </div>
            <div class="space-y-1">
              <button
                v-for="(slug, index) in changelogs"
                :key="slug"
                @click="selectItem('release', slug)"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group',
                  activeType === 'release' && activeSlug === slug
                    ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                ]"
              >
                <div :class="[
                  'w-1.5 h-1.5 rounded-full transition-all',
                  activeType === 'release' && activeSlug === slug ? 'bg-violet-500 scale-110 shadow-[0_0_8px_rgba(139,92,246,0.5)]' : 'bg-transparent group-hover:bg-muted-foreground/30'
                ]"></div>
                <span class="flex-1 truncate">Version {{ slug }}</span>
                <Sparkles 
                  v-if="index === 0" 
                  class="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" 
                />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto">
        <!-- Hero Banner with Unsplash Background -->
        <div 
          v-if="activeSlug && unsplashUrl"
          class="relative h-48 md:h-64 w-full overflow-hidden"
        >
          <img 
            :src="unsplashUrl" 
            :alt="activeSlug"
            class="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <!-- Gradient Overlays -->
          <div class="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent"></div>
          <div class="absolute inset-0 bg-gradient-to-r from-background/40 to-transparent"></div>
          
          <!-- Content on the banner -->
          <div class="absolute bottom-0 left-0 right-0 p-8 max-w-4xl mx-auto">
            <div v-if="activeType === 'release' && releaseData" class="space-y-2">
              <span class="text-sm text-white/70">{{ releaseData.date }}</span>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-white drop-shadow-lg">{{ releaseData.title }}</h1>
            </div>
            <div v-else class="space-y-2">
              <span class="px-3 py-1 rounded-lg text-xs font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30 backdrop-blur-sm">
                Guide
              </span>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-white drop-shadow-lg capitalize">
                {{ formatTitle(activeSlug) }}
              </h1>
            </div>
          </div>
        </div>

        <div class="max-w-4xl mx-auto px-8 py-12">
          <BlurReveal :trigger-key="activeSlug" :duration="0.5" :blur="'8px'" :y-offset="15">
            <!-- Release Description (moved below banner) -->
            <div v-if="activeType === 'release' && releaseData" class="mb-10">
              <p class="text-lg text-muted-foreground leading-relaxed">{{ releaseData.description }}</p>
            </div>

            <!-- Markdown Content -->
            <div v-if="contentType === 'markdown'" class="markdown-body prose dark:prose-invert max-w-none" v-html="content"></div>
            
            <!-- HTML Content -->
            <div v-else-if="contentType === 'html'" v-html="content"></div>

            <!-- Release Sections (if release) -->
            <div v-if="activeType === 'release' && releaseData?.sections" class="mt-12 space-y-12">
              <div v-for="section in releaseData.sections" :key="section.category" class="space-y-6">
                <div class="flex items-center gap-3 border-b border-border/50 pb-4">
                  <div :class="['p-2 rounded-lg bg-muted/50 border border-border/50', getCategoryColor(section.category)]">
                    <component :is="getCategoryIcon(section.category)" class="w-5 h-5" />
                  </div>
                  <h2 class="text-xl font-bold">{{ section.category }}</h2>
                </div>
                
                <div class="grid grid-cols-1 gap-6 pl-4">
                  <div v-for="item in section.items" :key="item.title" class="space-y-3">
                    <div>
                      <h3 class="font-bold text-foreground">{{ item.title }}</h3>
                      <p class="text-sm text-muted-foreground mt-1">{{ item.description }}</p>
                    </div>
                    <ul class="space-y-2">
                      <li v-for="(detail, i) in item.details" :key="i" class="text-xs text-muted-foreground flex items-start gap-3 group">
                        <div class="mt-1.5 w-1 h-1 rounded-full bg-violet-500/40 group-hover:bg-violet-500 transition-colors"></div>
                        <span class="flex-1 leading-relaxed">{{ detail }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </BlurReveal>
        </div>
      </main>
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import BlurReveal from '@/components/blur-reveal/BlurReveal.vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  FileText, 
  History, 
  Loader2,
  BookOpen,
  Sparkles,
  Plus,
  Wrench,
  Bug
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { api } from '@/lib/apiClient'
import { usePegasusTheme } from '@/composables/usePegasusTheme'

const route = useRoute()
const router = useRouter()
const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
const mode = usePegasusTheme()
const isDark = computed(() => mode.value === 'dark')


const formatTitle = (slug: string) => {
  const acronyms = ['aws', 'gcp', 'api', 'sql', 'db', 'ui', 'ux', 'ai', 'ml', 'cli', 'sdk', 'ci', 'cd']
  return slug.split('-').map(w => {
    if (acronyms.includes(w.toLowerCase())) return w.toUpperCase()
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

const getProviderLogo = (slug: string) => {
  if (slug.includes('azure')) return '/icons/microsoft/Azure/azure-2.svg'
  if (slug.includes('aws')) return isDark.value ? '/icons/aws/aws-colored-white-text.svg' : '/icons/aws/aws-colored-black-text.svg'
  if (slug.includes('gcp')) return '/icons/google/GCP/icons8-google-cloud.svg'
  return undefined
}

const guides = ref<string[]>([])
const changelogs = ref<string[]>([])
const isLoadingList = ref(true)
const isLoadingContent = ref(false)
const activeType = ref<'guide' | 'release'>('guide')
const activeSlug = ref('')
const content = ref('')
const contentType = ref<'markdown' | 'html'>('markdown')
const releaseData = ref<any>(null)

// Keyword mapping for more relevant Unsplash images
const getUnsplashKeywords = (type: 'guide' | 'release', slug: string): string => {
  const keywordMap: Record<string, string> = {
    // Guides
    'getting-started': 'workspace,desk,startup',
    'azure-credentials': 'cloud,server,technology',
    'aws-credentials': 'cloud,data-center,network',
    'gcp-credentials': 'cloud,computing,abstract',
    'keyboard-shortcuts': 'keyboard,productivity,minimal',
    'data-visualization': 'charts,analytics,dashboard',
    'collaboration': 'team,office,meeting',
    'spreadsheet': 'excel,data,table',
    // Releases default to abstract/tech
    'default-release': 'abstract,gradient,technology',
    'default-guide': 'documentation,minimalist,workspace'
  }
  
  const defaultKeywords = type === 'release' ? 'abstract,gradient,technology' : 'documentation,minimalist,workspace'
  const key = keywordMap[slug] || defaultKeywords
  return key
}

// Generate deterministic image URL (same doc = same image)
const unsplashUrl = computed(() => {
  if (!activeSlug.value) return ''
  // Use Picsum Photos with seed for deterministic images
  // The seed ensures the same doc always gets the same image
  return `https://picsum.photos/seed/${activeSlug.value}/1920/600?blur=1`
})

const fetchIndex = async () => {
  isLoadingList.value = true
  try {
    let data;
    try {
      // 1. Try static file first (Generated at build time)
      const res = await fetch('/_docs/index.json')
      if (res.ok) {
        data = await res.json()
        console.log('[Docs] Loaded from static index')
      } else {
        throw new Error('Static index not found')
      }
    } catch (e) {
      // 2. Fallback to live API
      console.log('[Docs] Falling back to live API index')
      data = await api.get<any>('/api/docs')
    }

    guides.value = data.guides || []
    
    // Sort changelogs by version (latest first)
    const sortedChangelogs = (data.changelogs || []).sort((a: string, b: string) => {
      const partsA = a.replace('v', '').split('.').map(Number)
      const partsB = b.replace('v', '').split('.').map(Number)
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const valA = partsA[i] || 0
        const valB = partsB[i] || 0
        if (valA !== valB) return valB - valA
      }
      return 0
    })
    changelogs.value = sortedChangelogs
    
    // Set initial selection if none provided in URL
    if (!route.query.type && !route.query.slug) {
      const latestRelease = changelogs.value[0]
      if (latestRelease) {
        selectItem('release', latestRelease)
      }
    }
  } catch (e) {
    console.error('Failed to fetch docs index', e)
  } finally {
    isLoadingList.value = false
  }
}

const fetchContent = async (type: 'guide' | 'release', slug: string) => {
  if (!slug) return
  isLoadingContent.value = true
  try {
    let data;
    const staticFolder = type === 'guide' ? 'guides' : 'releases'
    const staticPath = `/_docs/${staticFolder}/${slug}.json`
    
    try {
      // 1. Try static file first
      const res = await fetch(staticPath)
      if (res.ok) {
        data = await res.json()
        console.log(`[Docs] Loaded ${slug} from static storage`)
      } else {
        throw new Error('Static content not found')
      }
    } catch (e) {
      // 2. Fallback to live API
      console.log(`[Docs] Fetching ${slug} from live API`)
      const endpoint = type === 'guide' ? `/api/docs/guides/${slug}` : `/api/docs/releases/${slug}`
      data = await api.get<any>(endpoint)
    }
    
    if (type === 'guide') {
      contentType.value = data.content_type || 'markdown'
      if (contentType.value === 'html') {
        content.value = data.content || ''
      } else {
        content.value = md.render(data.content || '')
      }
      releaseData.value = null
    } else {
      // For releases, normalization
      const release = data.data || data
      releaseData.value = release
      contentType.value = 'markdown'
      content.value = ''
    }
  } catch (e) {
    console.error(`[Docs] Error loading ${slug}:`, e)
    content.value = '<div class="text-center py-20 text-destructive">Failed to load content.</div>'
  } finally {
    isLoadingContent.value = false
  }
}

const selectItem = (type: 'guide' | 'release', slug: string) => {
  activeType.value = type
  activeSlug.value = slug
  router.push({ path: '/docs', query: { type, slug } })
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, any> = {
    'New Features': Plus,
    'Improvements': Wrench,
    'Bug Fixes': Bug
  }
  return icons[category] || Plus
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'New Features': 'text-violet-400',
    'Improvements': 'text-blue-400',
    'Bug Fixes': 'text-emerald-400'
  }
  return colors[category] || 'text-violet-400'
}

onMounted(fetchIndex)

// Watch for route changes to sync state
watch(() => route.query, (query: any) => {
  if (query.type && query.slug) {
    activeType.value = query.type as any
    activeSlug.value = query.slug as string
    fetchContent(activeType.value, activeSlug.value)
  }
}, { immediate: true })

</script>

<style>
.markdown-body h1 { font-size: 2.25rem; font-weight: 900; margin-bottom: 2rem; color: var(--foreground); letter-spacing: -0.025em; }
.markdown-body h2 { font-size: 1.5rem; font-weight: 700; margin-top: 3rem; margin-bottom: 1.5rem; color: var(--foreground); border-bottom: 1px solid rgba(var(--border), 0.5); padding-bottom: 0.75rem; display: flex; align-items: center; gap: 0.75rem; }
.markdown-body h3 { font-size: 1.25rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; color: var(--foreground); }
.markdown-body p { color: var(--muted-foreground); line-height: 1.8; margin-bottom: 1.5rem; font-size: 0.9375rem; }
.markdown-body ul { list-style: none; padding-left: 0; margin-bottom: 2rem; gap: 0.75rem; display: flex; flex-direction: column; }
.markdown-body ul li { display: flex; align-items: flex-start; gap: 0.75rem; color: var(--muted-foreground); font-size: 0.9375rem; }
.markdown-body ul li::before { content: ""; margin-top: 0.5rem; width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: rgba(139, 92, 246, 0.5); flex-shrink: 0; }
.markdown-body ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: 2rem; gap: 0.75rem; display: flex; flex-direction: column; color: var(--muted-foreground); font-size: 0.9375rem; }
.markdown-body code { background: rgba(139, 92, 246, 0.1); padding: 0.125rem 0.5rem; border-radius: 0.375rem; font-family: monospace; font-size: 0.8125rem; color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.2); }
.markdown-body pre { background: #18181b; padding: 1.5rem; border-radius: 1rem; font-family: monospace; font-size: 0.75rem; overflow-x: auto; margin-bottom: 2rem; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
.markdown-body strong { font-weight: 700; color: var(--foreground); }
.markdown-body blockquote { border-left: 4px solid rgba(139, 92, 246, 0.5); padding-left: 1.5rem; font-style: italic; margin: 2.5rem 0; color: var(--muted-foreground); background: rgba(139, 92, 246, 0.05); padding-top: 1.5rem; padding-bottom: 1.5rem; border-top-right-radius: 1rem; border-bottom-right-radius: 1rem; }
.markdown-body hr { margin: 3rem 0; border: 0; border-top: 1px solid rgba(var(--border), 0.5); }
.markdown-body table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 2rem 0; border-radius: 0.5rem; overflow: hidden; border: 1px solid rgba(var(--border), 0.5); }
.markdown-body th { background: rgba(139, 92, 246, 0.1); color: var(--foreground); font-weight: 700; text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid rgba(var(--border), 0.5); font-size: 0.875rem; }
.markdown-body td { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(var(--border), 0.1); color: var(--muted-foreground); font-size: 0.875rem; }
.markdown-body tr:last-child td { border-bottom: none; }
.markdown-body tr:hover td { background: rgba(var(--muted), 0.3); }
</style>
