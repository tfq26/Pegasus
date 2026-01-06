import { type Ref } from 'vue'
import { toast } from '@/composables/useNotifications'
import { translateQuery, explainQuery } from '@/lib/api'

export function useChatToolbar(workspaceRef: Ref<any>, selectedConnection?: Ref<any>) {

    const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
        if (workspaceRef.value?.exportCurrentTable) {
            (workspaceRef.value as any).exportCurrentTable(format);
        } else {
            toast.error("Export not available");
        }
    }

    const handleVisualize = () => {
        toast.info("Visualization wizard would open here");
    }

    const handleSanitize = () => {
        toast.info("Data sanitization triggered");
    }

    const handleFormat = (type: string, value?: any) => {
        if (workspaceRef.value?.handleFormat) {
            (workspaceRef.value as any).handleFormat(type, value);
        }
    }

    const handleUndo = () => {
        if (workspaceRef.value?.handleUndo) {
            (workspaceRef.value as any).handleUndo();
        }
    }

    const handleRedo = () => {
        if (workspaceRef.value?.handleRedo) {
            (workspaceRef.value as any).handleRedo();
        }
    }

    const handleTranslate = async (query: string): Promise<string | null> => {
        if (!selectedConnection?.value) {
            toast.error("Select a connection first");
            return null;
        }
        if (!query.trim()) return null;

        try {
            const res = await translateQuery(query, selectedConnection.value.provider, selectedConnection.value.id);
            if (res && res.query) {
                toast.success("Query translated");
                return res.query;
            }
            return null;
        } catch (e: any) {
            toast.error("Translation failed", { description: e.message });
            return null;
        }
    }

    const handleExplain = async (query: string) => {
        if (!selectedConnection?.value) {
            toast.error("Select a connection first");
            return;
        }
        if (!query.trim()) return;

        try {
            toast.info("Analyzing query...");
            const explanation = await explainQuery(query, selectedConnection.value.id);
            if (explanation) {
                // Show in a toast for now, or we could return it for a dialog
                toast.success("Query Explained", {
                    description: explanation,
                    duration: 10000
                });
            }
        } catch (e: any) {
            toast.error("Explanation failed", { description: e.message });
        }
    }

    const handleFormatSql = (query: string): string => {
        try {
            const keywords = ["SELECT", "FROM", "WHERE", "AND", "OR", "GROUP BY", "ORDER BY", "LIMIT", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT JOIN", "INNER JOIN", "ON"];
            let formatted = query.replace(/\s+/g, ' ');
            keywords.forEach(kw => {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                formatted = formatted.replace(regex, (match) => `\n${match.toUpperCase()}`);
            });
            return formatted.trim();
        } catch (e) {
            return query;
        }
    }

    return {
        handleExport,
        handleVisualize,
        handleSanitize,
        handleFormat,
        handleUndo,
        handleRedo,
        handleFormatSql,
        handleTranslate,
        handleExplain
    }
}
