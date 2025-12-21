<script setup lang="ts">
import { computed } from 'vue';
import { 
  Database, 
  Cloud, 
  Leaf,
  Server,
  HardDrive
} from 'lucide-vue-next';

const props = defineProps<{
  provider: string;
}>();

interface ProviderConfig {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
}

const providerConfigs: Record<string, ProviderConfig> = {
  sqlite: {
    label: 'SQLite',
    icon: Database,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
  kusto: {
    label: 'Kusto',
    icon: Cloud,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30'
  },
  mysql: {
    label: 'MySQL',
    icon: Server,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30'
  },
  mongodb: {
    label: 'MongoDB',
    icon: Leaf,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30'
  },
  postgres: {
    label: 'PostgreSQL',
    icon: HardDrive,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30'
  }
};

const defaultConfig: ProviderConfig = {
  label: 'Database',
  icon: Database,
  color: 'text-gray-600 dark:text-gray-400',
  bgColor: 'bg-gray-100 dark:bg-gray-800'
};

const config = computed(() => {
  const key = props.provider?.toLowerCase();
  return providerConfigs[key] || defaultConfig;
});
</script>

<template>
  <div 
    class="provider-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium"
    :class="[config.color, config.bgColor]"
    :title="`Connected to ${config.label}`"
  >
    <component :is="config.icon" class="w-3.5 h-3.5" />
    <span>{{ config.label }}</span>
  </div>
</template>

<style scoped>
.provider-badge {
  transition: all 0.2s ease;
}

.provider-badge:hover {
  transform: scale(1.02);
}
</style>
