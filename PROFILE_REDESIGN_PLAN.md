# Profile Page Redesign - Compact Layout

## Objective
Make the profile page more compact and responsive by:
1. Combining Token and Storage cards into a single tabbed card
2. Reducing overall spacing and card sizes
3. Giving more space to the transaction history
4. Improving responsive behavior across screen sizes

## Changes Needed

### 1. Grid Layout (Line 152)
**Current:**
```vue
<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
```

**Change to:**
```vue
<div class="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
```

**Reason:** Simplify breakpoints and reduce gap from 8 to 6 for more compact layout.

---

### 2. Column 1 Spacing (Line 155)
**Current:**
```vue
<div class="space-y-6 order-2 lg:order-1">
```

**Change to:**
```vue
<div class="space-y-4 order-2 xl:order-1">
```

**Reason:** Reduce vertical spacing from 6 to 4.

---

### 3. Replace Two Separate Cards with Single Tabbed Card (Lines 157-224)

**Current Structure:**
- Two separate Card components (Tokens and Storage)
- Each with full circle visualization
- Takes up significant vertical space

**New Structure:**
```vue
<Card class="hover:border-primary/30 transition-colors">
  <Tabs default-value="tokens" class="w-full">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="text-base font-semibold">Usage</CardTitle>
        <TabsList class="grid w-[180px] grid-cols-2 h-8">
          <TabsTrigger value="tokens" class="text-xs">Tokens</TabsTrigger>
          <TabsTrigger value="storage" class="text-xs">Storage</TabsTrigger>
        </TabsList>
      </div>
    </CardHeader>

    <!-- Tokens Tab -->
    <TabsContent value="tokens" class="mt-0">
      <CardContent class="flex flex-col items-center py-4">
        <!-- Smaller circle: w-24 h-24 instead of w-32 h-32 -->
        <div class="relative w-24 h-24 flex items-center justify-center mb-3">
          <!-- Circle visualization (scaled down) -->
        </div>
        <div class="text-center">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">AI Tokens</p>
          <h4 class="text-base font-bold">{{ usageStats.tokens.toLocaleString() }}</h4>
          <p class="text-[9px] text-muted-foreground font-medium mt-0.5">Limit: {{ (usageStats.limit / 1000).toFixed(0) }}k</p>
        </div>
      </CardContent>
    </TabsContent>

    <!-- Storage Tab -->
    <TabsContent value="storage" class="mt-0">
      <CardContent class="flex flex-col items-center py-4">
        <!-- Same structure as Tokens tab but for storage -->
      </CardContent>
    </TabsContent>
  </Tabs>
</Card>
```

**Benefits:**
- Saves ~50% vertical space
- Matches the Purchase Resources card design pattern
- Cleaner, more modern interface
- Better mobile experience

---

### 4. Update Column 2 Spacing (Line 228)
**Current:**
```vue
<div class="space-y-6 order-1 lg:order-2">
```

**Change to:**
```vue
<div class="space-y-4 order-1 xl:order-2">
```

---

### 5. Update Column 3 (Transaction History) (Line 387)
**Current:**
```vue
<div class="space-y-6 order-3 lg:col-span-2 xl:col-span-1">
```

**Change to:**
```vue
<div class="space-y-4 order-3 xl:col-span-1">
```

**Reason:** Remove `lg:col-span-2` to prevent transaction history from spanning 2 columns on large screens, giving it consistent width.

---

### 6. Transaction History Card Height (Line 389)
**Current:**
```vue
<Card class="h-full flex flex-col min-h-[400px]">
```

**Change to:**
```vue
<Card class="h-full flex flex-col min-h-[500px]">
```

**Reason:** With more vertical space available from compact usage cards, increase transaction history height to show more records.

---

## Size Reductions Summary

| Element | Current | New | Savings |
|---------|---------|-----|---------|
| Grid gap | 8 (32px) | 6 (24px) | 8px |
| Column spacing | 6 (24px) | 4 (16px) | 8px |
| Circle size | 32 (128px) | 24 (96px) | 32px |
| Card padding | 6 (24px) | 4 (16px) | 8px |
| **Total vertical space saved** | | | **~100px** |

---

## Responsive Breakpoints

### Mobile (< 1280px)
- Single column layout
- Usage card first
- Purchase Resources second
- Transaction History third

### Desktop (≥ 1280px)
- 3-column grid
- Usage card: 1 column (left)
- Purchase Resources: 1 column (middle)
- Transaction History: 1 column (right)

---

## Implementation Steps

1. ✅ Backup current profile.vue
2. Update grid layout and spacing
3. Replace usage cards section with tabbed card
4. Update column spacing throughout
5. Adjust transaction history card
6. Test responsive behavior
7. Verify all data displays correctly

---

## Files to Modify

- `/apps/ui/src/views/profile.vue` - Main profile page component

## Components Already Available

- ✅ `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - Already imported
- ✅ `Card`, `CardHeader`, `CardTitle`, `CardContent` - Already imported
- ✅ `Button` - Already imported
- ✅ `GlowBorder` - Already imported

No new component imports needed!
