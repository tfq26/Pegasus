import { ref, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { toast } from '@/composables/useNotifications'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'

export function useDashboardAnalysis() {
    const store = useDashboardStore()

    // Use store state for persistence across components
    const isAnalyzing = computed(() => (store as any).isAnalyzing)
    const analysisResult = computed(() => (store as any).analysisResult)

    const generateDashboardSummary = async () => {
        const dashboard = (store as any).currentDashboard
        if (!dashboard) return

            ; (store as any).isAnalyzing = true
            ; (store as any).analysisResult = null

        try {
            // Collect data from all elements that have results
            const elements = ((store as any).currentDashboard?.data?.elements || []) as any[]
            const dataSnapshot = elements.map(el => {
                const results = el.lastResult || el.config?.data
                return {
                    id: el.id,
                    title: el.title,
                    type: el.type,
                    results: results
                }
            }).filter(el => el.results && (Array.isArray(el.results) ? el.results.length > 0 : true))

            if (dataSnapshot.length === 0) {
                toast.error('No dashboard data available for analysis. Please refresh elements first.')
                return
            }

            // Call the analysis API 
            const response = await fetch(`${QUERY_API_URL}/ai/analyze-dashboard`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    dashboardTitle: dashboard.title,
                    elements: dataSnapshot
                })
            })

            if (!response.ok) throw new Error('Failed to generate analysis')

            const data = await response.json()
                ; (store as any).analysisResult = data.analysis
            console.log('[DashboardAnalysis] Analysis generated successfully')

        } catch (e) {
            console.error('[DashboardAnalysis] Error:', e)
            toast.error('Failed to generate AI analysis')
        } finally {
            ; (store as any).isAnalyzing = false
        }
    }

    return {
        isAnalyzing,
        analysisResult,
        generateDashboardSummary
    }
}
