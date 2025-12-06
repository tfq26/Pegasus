---
description: How to implement progress tracking for long-running operations
---

# Progress Tracking Workflow

The application uses a global progress state managed by `useProgress` in `@/lib/progress.ts`. This allows any component to register a background operation that will be visualized in the `GlobalProgressBar` component located in the Navbar.

## Usage

1. **Import the hook**:
   ```typescript
   import { useProgress } from '@/lib/progress'
   ```

2. **Initialize usage**:
   ```typescript
   const { startOperation, updateOperation, finishOperation, failOperation } = useProgress()
   ```

3. **Wrap your async operation**:

   ```typescript
   const handleMyAction = async () => {
     // Generate a unique ID (timestamp or entity ID)
     const opId = `my-action-${Date.now()}`
     
     // Start tracking
     startOperation(opId, 'Doing something important...')
     
     try {
       // Perform async work
       await doWork()
       
       // Optional: Update progress for loops
       // updateOperation(opId, 50, 'Halfway there...')
       
       // Mark as complete (green checkmark, then disappears)
       finishOperation(opId)
       
     } catch (e) {
       // Mark as failed (red X, stays visible longer)
       failOperation(opId, e.message)
       // handle error...
     }
   }
   ```

## Best Practices

*   **Granularity**: Only track operations that take > 500ms or might block the user's perception of "is it working?".
*   **IDs**: Use `Date.now()` or unique entity IDs to allow multiple parallel operations of the same type (e.g., `upload-file-${file.id}`).
*   **Labels**: Keep labels short (max 2-3 words) as space is limited in the collapsed view. Details can be longer.
*   **Cleanup**: `finishOperation` and `failOperation` automatically handle cleanup of the operation list after a short delay (3s for success, 5s for error).
