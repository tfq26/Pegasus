<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    


    <!-- Payment Verification Overlay -->
    <div v-if="isVerifyingPayment" class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div class="bg-card border border-border rounded-xl p-8 shadow-2xl max-w-sm w-full text-center">
            <div class="relative mx-auto mb-6 h-20 w-20">
                <div class="absolute inset-0 rounded-full border-4 border-primary/30 animate-ping"></div>
                <div class="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
            </div>
            <h3 class="text-xl font-bold mb-2">Verifying Purchase</h3>
            <p class="text-muted-foreground text-sm mb-6">Please wait while we confirm your transaction with the payment provider...</p>
            <div class="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div class="h-full bg-primary animate-progress-indeterminate"></div>
            </div>
        </div>
    </div>
    <!-- Not Logged In -->
    <div v-else-if="!typedUser" class="max-w-md mx-auto mt-10 w-full bg-card border border-border rounded-xl p-8 shadow-lg text-center">
      <div class="mb-6">
        <svg class="inline-block h-16 w-16 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-foreground mb-2">Not Logged In</h2>
      <p class="text-muted-foreground mb-6">Please log in to view your profile</p>
      <button
        @click="goToLogin"
        class="w-full px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all hover:scale-105 shadow-lg shadow-primary/20"
      >
        Go to Login
      </button>
    </div>

    <!-- Profile Content -->
    <div v-else class="w-full space-y-8">
      
      <!-- Header Section -->
      <div class="flex flex-col lg:flex-row items-center justify-between gap-8 pb-2 border-b border-border/50">
        
        <!-- Left: Identity -->
        <div class="flex flex-col sm:flex-row items-center sm:items-center gap-6 flex-1">
          <div class="relative group p-1">
            <GlowBorder 
              v-if="tierDisplay"
              :color="tierDisplay.glowColors" 
              :border-radius="9999" 
              :border-width="2"
              :duration="4"
              class="opacity-70 group-hover:opacity-100 transition-opacity"
            />
            <img
              :src="typedUser.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${typedUser.email}`"
              class="relative h-20 w-20 rounded-full border-2 border-background shadow-xl object-cover bg-card p-0.5"
              alt="User Avatar"
            />
          </div>
          <div class="text-center sm:text-left">
            <h1 class="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center sm:justify-start flex-wrap gap-3">
              {{ typedUser.firstName }} {{ typedUser.lastName }}
              <span v-if="tierDisplay" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm"
                    :class="tierDisplay.badgeClass || 'bg-muted'"
              >
                {{ tierDisplay.label || 'FREE' }}
              </span>
            </h1>
            <p class="text-sm text-muted-foreground font-medium">{{ typedUser.email }}</p>
            <div v-if="typedUser.organizationName" class="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-secondary/50 text-secondary-foreground border border-border/50">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5 mr-1.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
              {{ typedUser.organizationName }}
            </div>
          </div>
        </div>

        <!-- Right: Subscription & Actions -->
        <div class="flex flex-col sm:flex-row items-center gap-8 w-full lg:w-auto">
           <!-- Subscription Details -->
           <div v-if="subscriptionTier !== 'free' && subscriptionDetails" class="hidden sm:flex items-center gap-8 pr-8 border-r border-border/50">
              <div class="text-right">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Next Renewal</p>
                <p class="text-sm font-bold">{{ new Date(subscriptionDetails.renewalDate).toLocaleDateString() }}</p>
              </div>
              <div class="text-right">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Amount</p>
                <p class="text-sm font-bold">${{ (subscriptionDetails.amount / 100).toFixed(2) }} <span class="text-[10px] opacity-60">/ {{ subscriptionDetails.interval }}</span></p>
              </div>
           </div>

           <div class="flex items-center gap-3">
             <!-- Premium Upgrade Button (Free Tier Only) -->
             <div v-if="subscriptionTier === 'free'" class="relative group">
               <!-- Animated Glow Border -->
               <GlowBorder 
                 :color="['#a855f7', '#6366f1', '#8b5cf6', '#ec4899']" 
                 :border-radius="14" 
                 :border-width="2.5"
                 :duration="4"
                 class="opacity-90 group-hover:opacity-100 transition-opacity duration-300"
               />
               <!-- Upgrade Button -->
               <Button
                 @click="handleUpgrade"
                 size="default"
                 class="relative z-10 px-6 py-2.5 text-sm font-bold transition-all duration-300 hover:scale-105 shadow-xl shadow-primary/30 bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white border-0"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                   <path d="M5 3v4"/>
                   <path d="M19 17v4"/>
                   <path d="M3 5h4"/>
                   <path d="M17 19h4"/>
                 </svg>
                 Upgrade to Pro
               </Button>
             </div>

             <!-- Manage Plan Button (Paid Tiers) -->
             <Button
               v-else
               @click="handleManageSubscription"
               variant="outline"
               size="default"
               class="px-5 py-2.5 text-xs font-bold transition-all hover:scale-[1.02] hover:bg-secondary/80"
             >
               Manage Plan
             </Button>

             <!-- Sign Out Button -->
             <Button
               @click="logout"
               variant="outline"
               size="default"
               class="px-5 py-2.5 text-xs font-bold border-red-500/20 text-red-500 hover:bg-red-500/5 hover:border-red-500/40 transition-all"
             >
               Sign Out
             </Button>
           </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-2 items-start">
        
        <!-- Column 1: Resources (Usage + Purchase merged) -->
        <div class="space-y-4 order-2 lg:order-1 xl:col-span-1">
          <Card class="overflow-hidden">
            <Tabs default-value="tokens" class="w-full">
              <div class="border-b bg-muted/10 p-4 pb-0">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <CardTitle class="text-base font-semibold">Resources</CardTitle>
                    <CardDescription class="text-xs mt-0.5">Usage & Limits</CardDescription>
                  </div>
                  <TabsList class="grid w-[140px] grid-cols-2 h-8">
                    <TabsTrigger value="tokens" class="text-xs">Tokens</TabsTrigger>
                    <TabsTrigger value="storage" class="text-xs">Storage</TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <!-- TOKENS TAB -->
              <TabsContent value="tokens" class="mt-0">
                <!-- 1. Usage Section -->
                <div class="flex flex-col items-center py-6 px-4 bg-gradient-to-b from-background to-muted/10">
                  <div class="relative w-28 h-28 flex items-center justify-center mb-3">
                    <div class="absolute inset-2 bg-primary/5 blur-xl rounded-full"></div>
                    <svg class="w-full h-full transform -rotate-90">
                      <circle cx="56" cy="56" r="48" stroke="currentColor" stroke-width="8" fill="transparent" class="text-secondary/50" />
                      <circle cx="56" cy="56" r="48" stroke="currentColor" stroke-width="8" fill="transparent" stroke-linecap="round" 
                        :stroke-dasharray="2 * Math.PI * 48"
                        :stroke-dashoffset="2 * Math.PI * 48 * (1 - Math.min(usageStats.tokens / usageStats.limit, 1))"
                        class="text-primary transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-2xl font-bold">{{ typeof usageStats.limit === 'number' && usageStats.limit > 0 ? Math.round((usageStats.tokens / usageStats.limit) * 100) : 0 }}%</span>
                      <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Used</span>
                    </div>
                  </div>
                  <div class="text-center">
                    <h4 class="text-lg font-bold">{{ usageStats.tokens.toLocaleString() }} <span class="text-sm font-normal text-muted-foreground">tokens</span></h4>
                    <p class="text-xs text-muted-foreground font-medium">Limit: {{ (usageStats.limit / 1000).toFixed(0) }}k</p>
                  </div>
                </div>

                <div class="h-px bg-border w-full"></div>

                <!-- 2. Purchase/Action Section -->
                <div class="p-6 bg-muted/5">
                   <div v-if="subscriptionTier !== 'free'">
                       <div class="flex items-center justify-between mb-4">
                          <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Buy More Tokens</span>
                          <span v-if="tokenDiscount > 0" class="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 text-[9px] font-bold uppercase tracking-tight">
                            -{{ tokenDiscount }}% Off
                          </span>
                       </div>

                       <div class="mb-5">
                          <div class="flex justify-between items-baseline mb-2">
                             <span class="text-2xl font-bold">{{ tokenPurchaseAmount * 100 }}k</span>
                             <span class="text-lg font-bold text-primary">$<NumberTicker :value="calculatedTokenPriceNum" :decimal-places="2" /></span>
                          </div>
                          
                          <NumberField 
                              v-model="tokenPurchaseAmount" 
                              :min="1" :max="7" :step="1" 
                              class="mb-2"
                              label="Quantity (100k units)"
                          />
                          <div class="flex justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1">
                              <span>100k</span><span>700k</span>
                          </div>
                       </div>
                       
                       <div v-if="usageStats?.limit + (tokenPurchaseAmount * 100000) >= 1000000" class="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <div class="flex items-start gap-2">
                              <div class="mt-0.5 text-amber-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>
                              <p class="text-[10px] text-amber-700/80 leading-snug font-medium"><span class="font-bold">Heavy Usage Fee:</span> Applied over 1M total limit.</p>
                          </div>
                       </div>

                       <button @click="handleBuyTokens" :disabled="isBuyingTokens"
                           class="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                       >
                           <div v-if="isBuyingTokens" class="h-3 w-3 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                           {{ isBuyingTokens ? 'Processing...' : 'Purchase Tokens' }}
                       </button>
                   </div>
                   
                   <!-- Free Tier Teaser -->
                   <div v-else class="text-center py-2">
                     <p class="text-xs text-muted-foreground mb-4 font-medium">Token purchasing is available on Pro plans.</p>
                     <button @click="router.push('/pricing')" class="w-full py-2.5 rounded-lg border-2 border-primary/20 hover:border-primary/40 text-primary font-bold text-xs uppercase tracking-wide transition-all bg-primary/5 hover:bg-primary/10">
                       Upgrade to Buy Tokens
                     </button>
                   </div>
                </div>
              </TabsContent>

              <!-- STORAGE TAB -->
              <TabsContent value="storage" class="mt-0">
                <!-- 1. Usage Section -->
                <div class="flex flex-col items-center py-6 px-4 bg-gradient-to-b from-background to-muted/10">
                  <div class="relative w-28 h-28 flex items-center justify-center mb-3">
                    <div class="absolute inset-2 bg-blue-500/5 blur-xl rounded-full"></div>
                    <svg class="w-full h-full transform -rotate-90">
                      <circle cx="56" cy="56" r="48" stroke="currentColor" stroke-width="8" fill="transparent" class="text-secondary/50" />
                      <circle cx="56" cy="56" r="48" stroke="currentColor" stroke-width="8" fill="transparent" stroke-linecap="round" 
                        :stroke-dasharray="2 * Math.PI * 48"
                        :stroke-dashoffset="2 * Math.PI * 48 * (1 - Math.min(usageStats.storage / usageStats.storageLimit, 1))"
                        class="text-blue-500 transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-2xl font-bold">{{ typeof usageStats.storageLimit === 'number' && usageStats.storageLimit > 0 ? Math.round((usageStats.storage / usageStats.storageLimit) * 100) : 0 }}%</span>
                      <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Used</span>
                    </div>
                  </div>
                  <div class="text-center">
                    <h4 class="text-lg font-bold">{{ usageStats.storageFormatted }}</h4>
                    <p class="text-xs text-muted-foreground font-medium">Limit: {{ usageStats.storageLimitFormatted }}</p>
                  </div>
                </div>

                <div class="h-px bg-border w-full"></div>

                 <!-- 2. Purchase Section -->
                 <div class="p-6 bg-muted/5">
                     <div class="flex items-center justify-between mb-4">
                        <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add Capacity</span>
                        <div class="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded text-blue-600 text-[9px] font-bold uppercase tracking-tight">
                           <span>{{ storagePricePerGB }} / GB</span>
                        </div>
                     </div>

                     <div class="mb-5">
                        <div class="flex justify-between items-baseline mb-2">
                           <span class="text-2xl font-bold">{{ storagePurchaseAmount }}GB <span class="text-sm font-normal text-muted-foreground text-xs text-muted-foreground/70">+</span></span>
                           <span class="text-lg font-bold text-blue-600">$<NumberTicker :value="calculatedStoragePriceNum" :decimal-places="2" /></span>
                        </div>
                        
                        <NumberField 
                          v-model="storagePurchaseAmount" 
                          :min="1" :max="storageMaxGB"
                          class="mb-2"
                          label="Additional GB"
                        />
                        <div class="flex justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1">
                            <span>1GB</span><span>{{ storageMaxGB }}GB Max</span>
                        </div>
                     </div>

                     <button @click="handleBuyStorage" :disabled="isBuyingStorage"
                         class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                     >
                         <div v-if="isBuyingStorage" class="h-3 w-3 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                         {{ isBuyingStorage ? 'Processing...' : 'Expand Storage' }}
                     </button>
                    
                     <div v-if="subscriptionTier === 'free'" class="mt-4 pt-4 border-t border-border/50 text-center">
                        <p class="text-[10px] text-muted-foreground mb-2">Want 10GB base storage?</p>
                        <button @click="router.push('/pricing')" class="text-xs font-bold text-primary hover:underline">View Pro Plans</button>
                     </div>
                 </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <!-- Column 2: Transaction History (Expanded) -->
        <div class="space-y-4 order-3 xl:order-2 xl:col-span-2">
          <Card class="h-full flex flex-col min-h-[500px]">
            <CardHeader class="flex flex-row items-center justify-between pb-6 border-b">
               <div class="flex items-center gap-4">
                 <CardTitle class="text-lg font-semibold">Transaction History</CardTitle>
                 <div class="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-border/50">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Sync</span>
                 </div>
               </div>
               <button @click="fetchPayments" class="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                 Refresh Log
               </button>
            </CardHeader>

            <CardContent class="flex-1 p-0">
              <div v-if="isLoadingPayments" class="flex flex-col items-center justify-center py-24 gap-4">
                 <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
                 <p class="text-xs font-medium text-muted-foreground animate-pulse">Syncing transactions...</p>
              </div>
              
              <div v-else-if="payments.length === 0" class="flex flex-col items-center justify-center py-24 text-center">
                 <div class="mb-4 p-4 rounded-full bg-secondary/20">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                 </div>
                 <h3 class="text-sm font-bold text-foreground">No Transactions Yet</h3>
                 <p class="text-xs text-muted-foreground mt-1 max-w-[200px]">Purchases and renewals will appear here.</p>
              </div>
              
              <div v-else class="overflow-x-auto">
                 <table class="w-full min-w-[500px] text-sm text-left">
                    <thead class="text-muted-foreground bg-muted/5 border-b border-border/50">
                       <tr>
                          <th class="py-3 px-6 font-bold uppercase tracking-widest text-[10px] opacity-70">Date</th>
                          <th class="py-3 px-6 font-bold uppercase tracking-widest text-[10px] opacity-70 w-full">Description</th>
                          <th class="py-3 px-6 font-bold uppercase tracking-widest text-[10px] opacity-70 whitespace-nowrap">Amount</th>
                          <th class="py-3 px-6 text-right font-bold uppercase tracking-widest text-[10px] opacity-70">Status</th>
                       </tr>
                    </thead>
                    <tbody class="divide-y divide-border/30">
                        <tr v-for="payment in payments" :key="payment.id" class="group hover:bg-secondary/5 transition-colors">
                           <td class="py-4 px-6 text-muted-foreground whitespace-nowrap text-xs font-medium">
                              {{ payment.createdAt ? new Date(payment.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A' }}
                           </td>
                          <td class="py-4 px-6">
                             <div class="flex items-center gap-2">
                               <span class="font-semibold text-sm">{{ payment.description }}</span>
                               <span v-if="payment.tokens > 0" class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                                 +{{ (payment.tokens / 1000).toFixed(0) }}k
                               </span>
                             </div>
                          </td>
                          <td class="py-4 px-6 font-mono font-bold text-sm">
                             ${{ (payment.amount / 100).toFixed(2) }}
                          </td>
                          <td class="py-4 px-6 text-right">
                             <span :class="{
                               'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20': payment.status === 'completed',
                               'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': payment.status === 'pending',
                               'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20': payment.status === 'failed'
                             }" class="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider border uppercase shadow-sm">
                               {{ payment.status }}
                             </span>
                          </td>
                       </tr>
                    </tbody>
                 </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useEntitlements } from '@/composables/useEntitlements'
import { createCheckoutSession, createPortalSession, syncPayments, syncSubscription, createTokenCheckoutSession, createStorageCheckoutSession, getPayments, checkPaymentStatus } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import { NumberField } from '@/components/ui/number-field'
import { NumberTicker } from '@/components/ui/number-ticker'
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/components/ui/card'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import GlowBorder from '@/components/glow-border/glow-border.vue'

defineOptions({ name: 'ProfileTab' })

const router = useRouter()
const { user, fetchUser, logout, isLoading: isAuthLoading } = useAuth()
// Use global entitlements state
const { 
  subscriptionTier, 
  subscriptionStatus, 
  subscriptionDetails, 
  tierUsage, 
  fetchEntitlements, 
  isLoading: isEntitlementsLoading 
} = useEntitlements()

const props = defineProps<{ preloadedPayments?: any[] }>()
const typedUser = computed(() => user.value as any)

// Usage Stats (Computed from tierUsage or default)
const usageStats = computed(() => {
  if (tierUsage.value) {
    return {
      tokens: tierUsage.value.tokens?.current || 0,
      limit: tierUsage.value.tokens?.limit || 0,
      purchasedTokens: tierUsage.value.tokens?.purchased || 0,
      storage: tierUsage.value.storage?.current || 0,
      storageLimit: tierUsage.value.storage?.limit || 0,
      purchasedStorage: tierUsage.value.storage?.purchased || 0,
      storageFormatted: tierUsage.value.storage?.currentFormatted || '0 MB',
      storageLimitFormatted: tierUsage.value.storage?.limitFormatted || '0 MB'
    }
  }
  return { 
    tokens: 0, 
    limit: 0, 
    purchasedTokens: 0, 
    storage: 0, 
    storageLimit: 0,
    purchasedStorage: 0,
    storageFormatted: '0 MB',
    storageLimitFormatted: '0 MB'
  }
})

const tierDisplay = computed(() => {
  const tier = subscriptionTier.value
  const displayMap: Record<string, { label: string, badgeClass: string, glowColors: string[] }> = {
    free: { 
      label: 'FREE', 
      badgeClass: 'bg-muted text-muted-foreground',
      glowColors: ['#64748b', '#94a3b8'] 
    },
    pro: { 
      label: 'PRO', 
      badgeClass: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-500/20 shadow-lg',
      glowColors: ['#a855f7', '#6366f1']
    },
    pro_plus: { 
      label: 'PRO+', 
      badgeClass: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20 shadow-lg',
      glowColors: ['#2563eb', '#4f46e5']
    },
    teams: { 
      label: 'TEAMS', 
      badgeClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 shadow-lg',
      glowColors: ['#10b981', '#14b8a6']
    }
  }
  return displayMap[tier] || displayMap.free
})

const syncing = ref(false)
const payments = ref<any[]>([])
const isLoadingPayments = ref(false)
const isVerifyingPayment = ref(false)

// Token Purchase State
const tokenPurchaseAmount = ref(1) // 1 unit = 100k
const isBuyingTokens = ref(false)

const tokenPurchaseList = computed({
  get: () => [tokenPurchaseAmount.value],
  set: (val: number[]) => {
    if (val && val.length > 0) {
      tokenPurchaseAmount.value = val[0] ?? 1
    }
  }
})

// Storage Purchase State
const storagePurchaseAmount = ref(1) // 1 unit = 1GB
const isBuyingStorage = ref(false)

const STORAGE_CONFIGS: Record<string, { pricePerGB: number, maxGB: number }> = {
    free: { pricePerGB: 2.00, maxGB: 25 },
    pro: { pricePerGB: 1.25, maxGB: 50 },
    pro_plus: { pricePerGB: 1.25, maxGB: 200 },
    teams: { pricePerGB: 1.00, maxGB: 500 }
}

const storageConfig = computed(() => {
  const tier = subscriptionTier.value
  return (STORAGE_CONFIGS[tier] || STORAGE_CONFIGS.free) as { pricePerGB: number, maxGB: number }
})

const storageMaxGB = computed(() => storageConfig.value.maxGB)
const storagePricePerGB = computed(() => `$${storageConfig.value.pricePerGB.toFixed(2)}`)

const storageAtTierLimit = computed(() => {
  return storagePurchaseAmount.value >= storageMaxGB.value
})

const storageLimitMessage = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return `Free users can purchase up to ${storageMaxGB.value}GB`
  if (tier === 'pro') return `Pro users can purchase up to ${storageMaxGB.value}GB`
  return `Pro+ users can purchase up to ${storageMaxGB.value}GB`
})

const storageUpgradeTier = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return 'Pro'
  if (tier === 'pro') return 'Pro+'
  return ''
})

const storageUpgradeLimit = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return 50
  if (tier === 'pro') return 200
  return 200
})

watch(storagePurchaseAmount, (val) => {
  const max = storageMaxGB.value
  if (val > max) storagePurchaseAmount.value = max
  if (val < 1 && val !== null) storagePurchaseAmount.value = 1
})

const storagePurchaseList = computed({
  get: () => [storagePurchaseAmount.value],
  set: (val: number[]) => {
    if (val && val.length > 0) {
      storagePurchaseAmount.value = val[0] ?? 1
    }
  }
})

const calculatedStoragePriceNum = computed(() => {
    const config = storageConfig.value
    return storagePurchaseAmount.value * config.pricePerGB
})

const calculatedTokenPriceNum = computed(() => {
    const units = tokenPurchaseAmount.value
    const tier = subscriptionTier.value
    
    const tierPricing: Record<string, number> = {
      free: 12,      // $12.00
      pro: 8,        // $8.00 (33% discount)
      pro_plus: 6,   // $6.00 (50% discount)
      teams: 5        // $5.00 (60% discount)
    }
    
    const pricePerUnit = tierPricing[tier] || tierPricing.free
    const finalPrice = units * (pricePerUnit || 12)
    
    return finalPrice
})

const tokenDiscount = computed(() => {
    const units = tokenPurchaseAmount.value
    if (units >= 7) return 15
    if (units >= 3) return 10
    return 0
})

const handleBuyTokens = async () => {
    try {
        isBuyingTokens.value = true
        const result = await createTokenCheckoutSession(tokenPurchaseAmount.value)
        if (result && (result as any).url) window.location.href = (result as any).url
    } catch (e: any) {
        toast.error(e.message || 'Failed to initiate purchase')
    } finally {
        isBuyingTokens.value = false
    }
}

const handleBuyStorage = async () => {
    try {
        isBuyingStorage.value = true
        const result = await createStorageCheckoutSession(storagePurchaseAmount.value)
        if (result && (result as any).url) window.location.href = (result as any).url
    } catch (e: any) {
        toast.error(e.message || 'Failed to initiate purchase')
    } finally {
        isBuyingStorage.value = false
    }
}

const fetchPayments = async () => {
  isLoadingPayments.value = true
  try {
    // 1. Sync from Stripe source of truth first (updates DB if needed)
    await syncPayments()
    
    // 2. Fetch payments from our local DB
    const res = await getPayments()
    if (res.success) {
      payments.value = res.payments
    }

    // 3. Re-fetch usage stats to reflect any newly purchased tokens
    await fetchEntitlements(true)
  } catch (err) {
    console.error('Failed to fetch payments or usage:', err)
  } finally {
    isLoadingPayments.value = false
  }
}


onMounted(async () => {
  // Use preloaded payments if available
  if (props.preloadedPayments) {
      payments.value = props.preloadedPayments
  } else {
      // Background fetch if missing
      fetchPayments()
  }

  try {
    // Check for Stripe Session ID to verify
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    
    if (sessionId) {
      isVerifyingPayment.value = true
      // Polling logic remains...
      let attempts = 0
      const maxAttempts = 20
      
      const poll = async () => {
        try {
          const res = await checkPaymentStatus(sessionId)
          if (res && res.status === 'completed') {
            isVerifyingPayment.value = false
            toast.success('Purchase confirmed & applied!')
            const newPath = window.location.pathname
            window.history.replaceState({}, '', newPath)
            
            await fetchPayments()
            await fetchEntitlements(true)
          } else {
            attempts++
            if (attempts < maxAttempts) {
              setTimeout(poll, 1000)
            } else {
              isVerifyingPayment.value = false
              toast.warning('Purchase verification timed out. It may appear shortly.')
              await fetchPayments()
              await fetchEntitlements(true)
            }
          }
        } catch (e) {
          console.error("Polling error", e)
          isVerifyingPayment.value = false
        }
      }
      poll()
    }
  } catch (err) {
    console.error('[Profile] Initialization error:', err)
  }
})

const handleManageSubscription = () => {
  router.push('/pricing')
}

const handleUpgrade = () => {
  router.push('/pricing')
}

const handleSyncSubscription = async () => {
  syncing.value = true
  try {
    // 1. Force backend to sync with Stripe
    await syncSubscription()
    // 2. Refresh local state
    await fetchEntitlements(true)
    toast.success(`Synced!`)
  } catch (e) {
    toast.error('Failed to sync subscription')
  } finally {
    syncing.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>
