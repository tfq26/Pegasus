<template>
  <div class="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-lg mx-auto px-6 animate-in fade-in duration-500">
    <div class="w-full bg-secondary/30 h-2.5 rounded-full overflow-hidden border border-border/50 relative shadow-inner">
      <!-- Pulsing background line -->
      <div class="absolute inset-0 bg-primary/5 animate-pulse"></div>
      <!-- Moving progress bar -->
      <div class="h-full bg-gradient-to-r from-primary/80 via-primary to-primary/80 rounded-full shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)] animate-progress-active border-r border-white/20"></div>
    </div>
    <div class="mt-10 text-center space-y-3">
      <h2 class="text-2xl font-black tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
        {{ title }}
      </h2>
      <p class="text-muted-foreground text-sm font-medium tracking-wide">
        {{ message }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: {
    type: String,
    default: 'Initializing Pegasus Vault'
  },
  message: {
    type: String,
    default: 'Securing your session and fetching encrypted data...'
  }
})
</script>

<style scoped>
@keyframes progress-active {
  0% { width: 0%; }
  30% { width: 40%; }
  60% { width: 75%; }
  100% { width: 100%; }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-progress-active {
  animation: progress-active 2.5s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  position: relative;
}

.animate-progress-active::after {
  content: '';
  position: absolute;
  top: 0; 
  left: 0; 
  right: 0; 
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: shimmer 1.5s infinite;
}
</style>
