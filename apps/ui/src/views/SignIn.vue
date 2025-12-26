<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-950 text-stone-100">
    <div class="bg-stone-900 p-8 rounded-lg shadow-lg w-full max-w-md">
      <h2 class="text-2xl font-bold mb-6 text-violet-400">Sign In</h2>
      <button
        class="w-full py-3 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition"
        @click="signInWithWorkOS"
      >
        Sign in with SSO
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'vue-sonner';

const router = useRouter();
let unlisten: (() => void) | null = null;

onMounted(async () => {
  // Listen for deep link events (e.g., pegasus://auth-callback?code=...)
  unlisten = await listen<string>('deep-link://new-url', (event) => {
    const url = new URL(event.payload);
    if (url.protocol === 'pegasus:' && url.host === 'auth-callback') {
      const code = url.searchParams.get('code');
      if (code) {
        handleAuthCode(code);
      }
    }
  });
});

onUnmounted(() => {
  if (unlisten) unlisten();
});

const handleAuthCode = async (code: string) => {
  toast.info('Authenticating with WorkOS...');
  // Here you would exchange the code for a token/profile via your backend
  // and then call link_to_cloud or similar tauri command
  console.log('Received auth code:', code);
  
  // Simulation:
  setTimeout(() => {
    toast.success('Successfully signed in!');
    router.push('/dashboard');
  }, 1000);
}

const signInWithWorkOS = async () => {
  // Replace YOUR_CONNECTION_ID and YOUR_CLIENT_ID with actual values
  // The redirect_uri should be a URL on your marketing site that redirects to pegasus://auth-callback
  const authUrl = 'https://auth.workos.com/sso/start?connection=conn_test_123&client_id=client_test_456&redirect_uri=https://pegasus.app/auth/callback';
  
  try {
    await openUrl(authUrl);
  } catch (error) {
    console.error('Failed to open auth URL:', error);
    toast.error('Could not open browser for sign in');
  }
}
</script>
