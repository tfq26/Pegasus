
import { ref, onMounted } from 'vue';
import { Pisces } from '../../../../packages/pisces/src/index';

// Singleton instance
let pisces: Pisces | null = null;

const isReporting = ref(false);
const lastReport = ref<any>(null);
const autoReportError = ref<any>(null);

export function usePisces() {

    const isEnabled = import.meta.env.DEV;

    if (!pisces && isEnabled) {
        const backendUrl = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8090';
        pisces = new Pisces({
            maxLogs: 500,
            endpoint: `${backendUrl}/support/analyze`
        });
        console.info("[Pisces] System initialized and collecting logs.");
    }

    const reportBug = async (userNotes: string, error?: any) => {
        if (!isEnabled || !pisces) {
            console.warn("[Pisces] Reporting is disabled in this environment.");
            return { analysis: null };
        }
        if (isReporting.value) return;

        isReporting.value = true;
        try {
            const result = await pisces!.report({
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
            console.error("[Pisces] Failed to send report", e);
            throw e;
        } finally {
            isReporting.value = false;
        }
    };

    const triggerAutoReport = (error: any) => {
        autoReportError.value = error;
    };

    const initGlobalErrorHandler = (app: any) => {
        app.config.errorHandler = (err: any, instance: any, info: string) => {
            console.error('[Pisces] Global Vue Error:', err, info);
            // Ignore benign errors
            if (String(err).includes('ResizeObserver')) return;

            triggerAutoReport(err);
        };
    };

    return {
        reportBug,
        triggerAutoReport,
        initGlobalErrorHandler,
        isReporting,
        lastReport,
        autoReportError,
        collector: isEnabled && pisces ? pisces.getCollector() : null
    };
}
