import { ref, computed, type Ref } from 'vue';
import type { ConnectionEntry } from '@/lib/db-connections';

export interface SelectionItem {
    type: 'file' | 'note' | 'chat' | 'query' | 'table' | 'connection' | 'sheet';
    id: string;
    connectionId?: string;
    tableName?: string;
}

export function useExplorerTreeSelection(
    props: {
        connections: ConnectionEntry[];
        files?: any[];
        notes?: any[];
        sheets?: any[];
        dataViews?: any[];
        chats?: any[];
        queryHistory?: any[];
        favoriteItems: any[];
        isDeleteMode?: boolean;
        selectedTable?: { connectionId: string; tableName: string } | null;
    },
    emit: (event: any, ...args: any[]) => void
) {
    const selectedIds = ref<string[]>([]);
    const lastSelectedId = ref<string | null>(null);
    const focusedIndex = ref(0);

    // Flatten all IDs for range selection and keyboard navigation
    const allSelectableIds = computed(() => {
        const ids: string[] = [];
        if (props.favoriteItems.length > 0) ids.push('root:favorites');
        props.favoriteItems.forEach(item => ids.push(item.id));

        ids.push('root:db');
        props.connections.forEach(conn => {
            ids.push(conn.id);
            // Note: In a real scenario, we might want to include tables if they are expanded.
            // However, the original code seems to only include connections and root nodes.
            // Let's stick to the flattening logic found in the original component.
        });

        ids.push('root:files');
        props.files?.forEach(f => ids.push(`file:${f.id}`));

        ids.push('root:notes');
        props.notes?.forEach(n => ids.push(`note:${n.id}`));

        ids.push('root:sheets');
        const views = props.dataViews || props.sheets || [];
        views.forEach((s: any) => ids.push(`view:${s.id}`));

        ids.push('root:chats');
        props.chats?.forEach(c => ids.push(`chat:${c.id}`));

        ids.push('root:queries');
        props.queryHistory?.forEach(q => ids.push(`query:${q.id}`));

        return ids;
    });

    function handleSelect(id: string, event?: MouseEvent) {
        if (id.startsWith('session:')) {
            // Session logic handled in Queries branch? 
            // The original had: const session = props.querySessions?.find(s => s.id === sessionId)
            // We might need to pass querySessions to props if we want this here.
        }

        if (event?.shiftKey && lastSelectedId.value && !props.isDeleteMode) {
            const all = allSelectableIds.value;
            const start = all.indexOf(lastSelectedId.value);
            const end = all.indexOf(id);
            if (start !== -1 && end !== -1) {
                const range = all.slice(Math.min(start, end), Math.max(start, end) + 1);
                selectedIds.value = Array.from(new Set([...selectedIds.value, ...range]));
            }
        } else if (event?.ctrlKey || event?.metaKey || props.isDeleteMode) {
            if (selectedIds.value.includes(id)) {
                selectedIds.value = selectedIds.value.filter(i => i !== id);
            } else {
                selectedIds.value.push(id);
            }
        } else {
            selectedIds.value = [id];
        }

        lastSelectedId.value = id;

        // Map logic for selection-change emit
        const selectedItems = selectedIds.value.map(sid => {
            if (sid.startsWith('file:')) return { type: 'file', id: sid.replace('file:', '') };
            if (sid.startsWith('note:')) return { type: 'note', id: sid.replace('note:', '') };
            if (sid.startsWith('chat:')) return { type: 'chat', id: sid.replace('chat:', '') };
            if (sid.startsWith('query:')) return { type: 'query', id: sid.replace('query:', '') };
            if (sid.startsWith('sheet:') || sid.startsWith('view:')) {
                return { type: 'sheet', id: sid.replace(/^(sheet|view):/, '') };
            }

            if (sid.includes('::')) {
                const [connId, ...tableParts] = sid.split('::');
                return { type: 'table', id: sid, connectionId: connId, tableName: tableParts.join('::') };
            }
            if (props.connections.some(c => c.id === sid)) return { type: 'connection', id: sid };
            return null;
        }).filter(Boolean) as SelectionItem[];

        emit('selection-change', selectedItems);

        // Determine context
        let context = 'db';
        if (id.startsWith('root:files') || id.startsWith('file:')) context = 'files';
        else if (id.startsWith('root:notes') || id.startsWith('note:')) context = 'notes';
        else if (id.startsWith('root:sheets') || id.startsWith('sheet:') || id.startsWith('view:')) context = 'sheets';
        else if (id.startsWith('root:chats') || id.startsWith('chat:')) context = 'chats';
        else if (id.startsWith('root:queries') || id.startsWith('query:')) context = 'queries';

        emit('update:context', context);

        if (props.isDeleteMode) return;

        // Navigation logic (opening items)
        if (id.startsWith('file:')) {
            const fileId = id.replace('file:', '');
            const file = props.files?.find(f => f.id === fileId);
            if (file) emit('select-file', file);
        } else if (id.startsWith('note:')) {
            const noteId = id.replace('note:', '');
            const note = props.notes?.find(n => n.id === noteId);
            if (note) emit('select-note', note);
        } else if (id.includes('::')) {
            const [connId, ...tableParts] = id.split('::');
            const tableName = tableParts.join('::');
            const conn = props.connections.find(c => c.id === connId);
            if (conn) emit('select-table', conn, tableName);
        } else if (id.startsWith('sheet:') || id.startsWith('view:')) {
            const sheetId = id.replace(/^(sheet|view):/, '');
            const views = props.dataViews || props.sheets || [];
            const view = views.find((s: any) => s.id === sheetId);
            if (view) emit('select-data-view', view);
        } else if (id.startsWith('chat:')) {
            const chatId = id.replace('chat:', '');
            emit('select-chat', chatId);
        } else if (id.startsWith('query:')) {
            const qId = id.replace('query:', '');
            const q = props.queryHistory?.find(q => q.id === qId);
            if (q) emit('load-query', q.query);
        }
    }

    function handleKeyDown(event: KeyboardEvent) {
        const ids = allSelectableIds.value;
        if (ids.length === 0) return;

        switch (event.key) {
            case 'ArrowDown': {
                event.preventDefault();
                focusedIndex.value = Math.min(focusedIndex.value + 1, ids.length - 1);
                const nextId = ids[focusedIndex.value];
                if (nextId) handleSelect(nextId);
                break;
            }
            case 'ArrowUp': {
                event.preventDefault();
                focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
                const prevId = ids[focusedIndex.value];
                if (prevId) handleSelect(prevId);
                break;
            }
            case 'Enter': {
                event.preventDefault();
                const currentId = ids[focusedIndex.value];
                if (currentId) handleSelect(currentId);
                break;
            }
            case 'n':
                if (!event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    emit('add-note');
                }
                break;
            case 'c':
                if (!event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    emit('create-chat');
                }
                break;
        }
    }

    return {
        selectedIds,
        lastSelectedId,
        focusedIndex,
        allSelectableIds,
        handleSelect,
        handleKeyDown
    };
}
