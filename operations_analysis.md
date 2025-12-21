# Operations/Progress System Analysis & Improvement Plan

## Current Implementation

### How It Works Now

The operations system is a **global progress tracking mechanism** that provides real-time feedback for long-running operations across the application.

#### Architecture
1. **State Management** (`progress.ts`)
   - Centralized reactive state using Vue's `ref`
   - Global operations array shared across all components
   - Composable pattern for easy integration

2. **UI Component** (`GlobalProgressBar.vue`)
   - Compact button in navbar showing active operation count
   - Expandable dropdown with detailed operation list
   - Auto-collapses on outside click
   - Shows aggregated progress bar

3. **Current Usage**
   - **Query Execution**: Tracks SQL query execution
   - **AI Generation**: Monitors AI query/chart generation
   - **Data Loading**: Shows table/schema loading progress
   - **Data Sanitization**: Tracks data cleaning operations
   - **Visualization Creation**: Monitors chart generation

#### Key Features
✅ **Auto-cleanup**: Completed operations removed after 3s, errors after 5s
✅ **Cancellable operations**: Support for user cancellation
✅ **Status tracking**: pending → running → completed/error
✅ **Progress updates**: 0-100% with optional details
✅ **Visual feedback**: Spinner for active, checkmark for idle

---

## Current Limitations & Pain Points

### 1. **No Persistence**
- Operations disappear on page refresh
- No history of past operations
- Can't review what happened during a session

### 2. **Limited Context**
- No timestamps (when did it start/end?)
- No duration tracking
- No operation grouping or categorization

### 3. **No Notifications**
- User must manually check the progress bar
- No alerts when operations complete/fail
- Easy to miss important updates

### 4. **Manual Integration**
- Developers must manually call `startOperation`, `updateOperation`, `finishOperation`
- Easy to forget cleanup on error paths
- Repetitive boilerplate code

### 5. **Limited Error Handling**
- Errors just show a message
- No retry mechanism
- No error categorization or recovery suggestions

### 6. **No Analytics**
- Can't track operation performance
- No insights into failure rates
- No optimization opportunities identified

### 7. **UI Constraints**
- Dropdown can only show ~5-6 operations before scrolling
- No filtering or search
- No operation prioritization

---

## Proposed Improvements

### **Phase 1: Enhanced Core Features** (High Priority)

#### 1.1 Add Timestamps & Duration
```typescript
export interface Operation {
    id: string
    label: string
    progress: number
    status: OperationStatus
    details?: string
    error?: string
    cancellable?: boolean
    onCancel?: () => void
    
    // NEW
    startedAt: number        // Unix timestamp
    completedAt?: number     // Unix timestamp
    duration?: number        // milliseconds
    category?: 'query' | 'ai' | 'data' | 'export' | 'import'
}
```

#### 1.2 Operation History
```typescript
const operationHistory = ref<Operation[]>([])  // Keep last 50
const maxHistorySize = 50

// On completion/error, move to history
const archiveOperation = (op: Operation) => {
    operationHistory.value.unshift(op)
    if (operationHistory.value.length > maxHistorySize) {
        operationHistory.value.pop()
    }
}
```

#### 1.3 Toast Notifications
```typescript
import { toast } from 'vue-sonner'

const finishOperation = (id: string) => {
    const op = operations.value.find(o => o.id === id)
    if (op) {
        op.progress = 100
        op.status = 'completed'
        op.completedAt = Date.now()
        op.duration = op.completedAt - op.startedAt
        
        // NEW: Toast notification
        toast.success(\`\${op.label} completed\`, {
            description: \`Finished in \${(op.duration / 1000).toFixed(1)}s\`
        })
        
        archiveOperation(op)
        // ... cleanup
    }
}
```

---

### **Phase 2: Developer Experience** (Medium Priority)

#### 2.1 Operation Wrapper/Helper
```typescript
// Automatic lifecycle management
export async function withProgress<T>(
    label: string,
    operation: (update: (progress: number, details?: string) => void) => Promise<T>,
    options?: { cancellable?: boolean }
): Promise<T> {
    const id = \`op-\${Date.now()}-\${Math.random()}\`
    const { startOperation, updateOperation, finishOperation, failOperation } = useProgress()
    
    startOperation(id, label, options)
    
    try {
        const result = await operation((progress, details) => {
            updateOperation(id, progress, details)
        })
        finishOperation(id)
        return result
    } catch (error) {
        failOperation(id, error instanceof Error ? error.message : 'Unknown error')
        throw error
    }
}

// Usage:
const result = await withProgress('Loading data', async (update) => {
    update(25, 'Fetching schema...')
    const schema = await fetchSchema()
    update(50, 'Loading rows...')
    const data = await fetchData()
    update(75, 'Processing...')
    return processData(data)
})
```

#### 2.2 Retry Mechanism
```typescript
export interface Operation {
    // ... existing fields
    retryable?: boolean
    retryCount?: number
    maxRetries?: number
    onRetry?: () => Promise<void>
}

const retryOperation = async (id: string) => {
    const op = operations.value.find(o => o.id === id)
    if (op?.onRetry && op.retryCount! < op.maxRetries!) {
        op.retryCount!++
        op.status = 'running'
        op.error = undefined
        try {
            await op.onRetry()
        } catch (e) {
            failOperation(id, e.message)
        }
    }
}
```

---

### **Phase 3: Advanced Features** (Lower Priority)

#### 3.1 Operation Grouping
```typescript
export interface OperationGroup {
    id: string
    label: string
    operations: Operation[]
    collapsed: boolean
}

// Example: Group all "Data Import" operations
const groups = computed(() => {
    const grouped = new Map<string, Operation[]>()
    operations.value.forEach(op => {
        const key = op.category || 'other'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(op)
    })
    return Array.from(grouped.entries())
})
```

#### 3.2 Performance Analytics
```typescript
const analytics = {
    averageDuration: (category?: string) => {
        const ops = category 
            ? operationHistory.value.filter(o => o.category === category)
            : operationHistory.value
        const total = ops.reduce((sum, o) => sum + (o.duration || 0), 0)
        return total / ops.length
    },
    
    failureRate: (category?: string) => {
        const ops = category 
            ? operationHistory.value.filter(o => o.category === category)
            : operationHistory.value
        const failures = ops.filter(o => o.status === 'error').length
        return (failures / ops.length) * 100
    }
}
```

#### 3.3 Enhanced UI
- **Tabs**: Active | History | Analytics
- **Filters**: By category, status, time range
- **Search**: Find operations by label
- **Export**: Download operation logs as JSON/CSV
- **Keyboard shortcuts**: Ctrl+Shift+P to toggle

---

## Recommended Implementation Order

### **Quick Wins** (Implemented)
1. ✅ Add timestamps and duration tracking
2. ✅ Add toast notifications for completion/errors
3. ✅ Add operation categories
4. ✅ Add cancel operation button in UI

### **High Value** (Implemented)
5. ✅ Create withProgress helper wrapper
6. ✅ Implement operation history (last 50)
7. ✅ Add retry mechanism (Integrated in withProgress)
8. ✅ Enhanced UI with Tab system (Active/History)
9. ✅ Performance basic analytics (Avg duration, Success rate)

### **Remaining Potential (Nice to Have)**
10. ✅ **Operation grouping**: Collapse related operations (e.g., multiple file uploads / AI with visualization).
11. ✅ **Enhanced Analytics UI**: Dedicated settings tab with trend charts.
12. ✅ **Log Export**: Export history as CSV for external analysis.
13. ✅ **Persistence (Neon)**: Persistent history synced across devices via database.

---

## Summary

The operations system has been **completely transformed** into a robust state-of-the-art management system:

1. **Context & History** ✅ - Full reviewable history of past events.
2. **Tabbed Navigation** ✅ - Clean separation between active work and past logs.
3. **Advanced Feedback** ✅ - Toasts, durations, and success metrics.
4. **Developer Power** ✅ - `withProgress` and auto-retries make the app more resilient.
