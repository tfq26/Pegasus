import { computed } from 'vue';
import type { ConnectionEntry } from '@/lib/db-connections';

export function useExplorerFiltering(
    props: {
        connections: ConnectionEntry[];
        chats?: any[];
        queryHistory?: any[];
        files?: any[];
        notes?: any[];
        dataViews?: any[];
        searchFilter?: string;
    }
) {
    const normalizeSearch = (str: string) => str.toLowerCase().trim();

    const filteredConnections = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.connections;
        return props.connections.filter(conn => {
            const name = (conn.nickname || (conn as any).alias || '').toLowerCase();
            if (name.includes(q)) return true;
            // Also search tables? (Optional, original code had a partial implementation)
            return false;
        });
    });

    const filteredChats = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.chats || [];
        return (props.chats || []).filter(c =>
            (c.title || c.name || '').toLowerCase().includes(q)
        );
    });

    const filteredQueries = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.queryHistory || [];
        return (props.queryHistory || []).filter(qh =>
            (qh.query || '').toLowerCase().includes(q)
        );
    });

    const filteredFiles = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.files || [];
        return (props.files || []).filter(f =>
            (f.filename || f.name || '').toLowerCase().includes(q)
        );
    });

    const filteredNotes = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.notes || [];
        return (props.notes || []).filter(n =>
            (n.title || n.name || '').toLowerCase().includes(q)
        );
    });

    const filteredDataViews = computed(() => {
        const q = normalizeSearch(props.searchFilter || '');
        if (!q) return props.dataViews || [];
        return (props.dataViews || []).filter(s =>
            (s.name || '').toLowerCase().includes(q)
        );
    });

    return {
        filteredConnections,
        filteredChats,
        filteredQueries,
        filteredFiles,
        filteredNotes,
        filteredDataViews
    };
}
