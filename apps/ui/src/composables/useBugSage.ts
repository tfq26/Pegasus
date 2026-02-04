
import { ref, onMounted } from 'vue';
import { BugSage } from '../../../../packages/bug-sage/src/index';

// Singleton instance
let bugSage: BugSage | null = null;

const isReporting = ref(false);
const lastReport = ref<any>(null);
const autoReportError = ref<any>(null);

export function useBugSage() {

    const isEnabled = import.meta.env.DEV;

    if (!bugSage && isEnabled) {
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        bugSage = new BugSage({
            maxLogs: 500,
            endpoint: `${backendUrl}/support/analyze`
        });
        console.info("[BugSage] System initialized and collecting logs.");
    }

    const reportBug = async (userNotes: string, error?: any) => {
        if (!isEnabled || !bugSage) {
            console.warn("[BugSage] Reporting is disabled in this environment.");
            return { analysis: null };
        }
        if (isReporting.value) return;

        isReporting.value = true;
        try {
            const result = await bugSage!.report({
                userNotes,
                error: error || autoReportError.value,
                metadata: {
                    timestamp: new Date().toISOString(),
                    isAutoReport: !!autoReportError.value
                }
            });
            lastReport.value = result;
            autoReportError.value = null; // Clear after report
            return result;
        } catch (e) {
            console.error("[BugSage] Failed to send report", e);
            throw e;
        } finally {
            isReporting.value = false;
        }
    };

    const triggerAutoReport = (error: any) => {
        autoReportError.value = error;
    };

    return {
        reportBug,
        triggerAutoReport,
        isReporting,
        lastReport,
        autoReportError,
        collector: isEnabled && bugSage ? bugSage.getCollector() : null
    };
}
