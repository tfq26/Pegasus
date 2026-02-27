import type { ConnectionEntry } from '@/lib/db-connections';
import { colIndexToLabel } from '@/components/TableView/Engine/FormulaParser';

export function useExplorerHelpers() {
    const getProviderIcon = (conn: ConnectionEntry): string => {
        const provider = conn.provider?.toLowerCase() || '';
        if (provider.includes('postgres')) return 'logos:postgresql';
        if (provider.includes('mysql')) return 'logos:mysql';
        if (provider.includes('sqlite')) return 'logos:sqlite';
        if (provider.includes('surreal')) return 'logos:surrealdb';
        if (provider.includes('mongodb')) return 'logos:mongodb-icon';
        if (provider.includes('azure') || provider.includes('cosmos')) return 'logos:azure-icon';
        if (provider.includes('bigquery')) return 'logos:google-cloud';
        if (provider.includes('snowflake')) return 'logos:snowflake-icon';
        if (provider.includes('file') || provider.includes('csv') || provider.includes('excel')) return 'lucide:file-spreadsheet';
        return 'lucide:database';
    };

    const getTableIcon = (conn: ConnectionEntry): string => {
        return 'lucide:table-2';
    };

    const getFileIcon = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext === 'csv') return 'lucide:file-spreadsheet';
        if (ext === 'xlsx' || ext === 'xls') return 'lucide:file-spreadsheet';
        if (ext === 'json') return 'lucide:file-json';
        if (ext === 'sql') return 'lucide:database';
        return 'lucide:file-text';
    };

    const getTableId = (connId: string, table: string) => `${connId}::${table}`;

    const formatRowCount = (count: number | undefined): string | undefined => {
        if (count === undefined) return undefined;
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    return {
        getProviderIcon,
        getTableIcon,
        getFileIcon,
        getTableId,
        formatRowCount
    };
}
