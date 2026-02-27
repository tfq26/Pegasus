/**
 * ResourceGuard
 * 
 * Utility to monitor and enforce resource limits during data processing.
 * Prevents OOM crashes and runaway queries by tracking memory, row counts, and duration.
 */
export class ResourceGuard {
    constructor(options = {}) {
        this.maxRows = options.maxRows || 10000;
        this.maxMemoryMB = options.maxMemoryMB || 256;
        this.maxDurationMs = options.maxDurationMs || 60000;
        this.startTime = Date.now();
        this.rowCount = 0;
    }

    /**
     * Checks current resource usage against limits.
     * Throws an error if any limit is exceeded.
     * 
     * @param {number} currentRowCount - Current number of rows processed
     */
    check(currentRowCount) {
        this.rowCount = currentRowCount;

        // 1. Check Row Limit
        if (this.rowCount > this.maxRows) {
            throw new Error(`Resource Limit Exceeded: Row count ${this.rowCount} exceeds limit of ${this.maxRows}.`);
        }

        // 2. Check Memory Limit
        const memMB = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memMB > this.maxMemoryMB) {
            throw new Error(`Resource Limit Exceeded: Memory usage ${Math.round(memMB)}MB exceeds limit of ${this.maxMemoryMB}MB.`);
        }

        // 3. Check Duration Limit
        const duration = Date.now() - this.startTime;
        if (duration > this.maxDurationMs) {
            throw new Error(`Resource Limit Exceeded: Execution time ${duration}ms exceeds limit of ${this.maxDurationMs}ms.`);
        }
    }

    /**
     * Returns a summary of current usage
     */
    getStats() {
        return {
            rows: this.rowCount,
            memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            durationMs: Date.now() - this.startTime
        };
    }
}
