
class ActivityService {
    constructor() {
        this.lastActivityAt = Date.now();
        this.idleThreshold = 15 * 60 * 1000; // 15 minutes
        this.isDevMode = process.env.PEGASUS_DEV_MODE === 'true';
    }

    recordActivity() {
        const wasIdle = this.isIdle();
        this.lastActivityAt = Date.now();

        if (wasIdle && this.isDevMode) {
            console.log("🌙 [Activity] Pegasus has woken up from idle state.");
        }
    }

    isIdle() {
        const idle = (Date.now() - this.lastActivityAt) > this.idleThreshold;
        if (idle && this.isDevMode && Math.random() < 0.01) { // Log occasionally if idle
            console.log(`[Activity] App is currently idle (${Math.round((Date.now() - this.lastActivityAt) / 1000 / 60)}m)`);
        }
        return idle;
    }

    getRemainingIdleTime() {
        return Math.max(0, this.idleThreshold - (Date.now() - this.lastActivityAt));
    }
}

export const activityService = new ActivityService();
