
import { ref, onBeforeUnmount, watch, computed, type Ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { QUERY_API_URL } from '@/lib/api';

// Shared socket instance
const socket = ref<Socket | null>(null);
const isConnected = ref(false);

// Spreadsheet-specific state
const collaborators = ref<any[]>([]);
const activeCells = ref<Record<string, { row: number, col: number, user: any }>>({});
const currentSpreadsheetId = ref<string | null>(null);
const incomingCellEdit = ref<{ row: number, col: number, value: string, user: any } | null>(null);

export interface Collaborator {
    socketId: string;
    user: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        profilePictureUrl?: string;
    };
    activeCell?: { row: number, col: number } | null;
}

/**
 * useSpreadsheetCollaboration
 * 
 * Handles Socket.io connection for real-time collaboration on spreadsheets.
 * 
 * @param spreadsheetId - Reactive ref to the current spreadsheet/table name
 * @param isLive - Reactive ref to whether collaboration (Live Mode) is enabled
 */
export function useSpreadsheetCollaboration(
    spreadsheetId: Ref<string | null>,
    isLive: Ref<boolean>
) {
    const SERVER_URL = QUERY_API_URL;

    const connect = () => {
        if (socket.value?.connected) return;

        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('[SpreadsheetCollab] No auth token, cannot connect');
            return;
        }

        socket.value = io(SERVER_URL, {
            auth: { token },
            transports: ['websocket', 'polling']
        });

        socket.value.on('connect', () => {
            console.log('[SpreadsheetCollab] Socket connected');
            isConnected.value = true;

            // If we have an active ID and live is on, join immediately
            if (spreadsheetId.value && isLive.value) {
                joinSpreadsheet(spreadsheetId.value);
            }
        });

        socket.value.on('disconnect', () => {
            console.log('[SpreadsheetCollab] Socket disconnected');
            isConnected.value = false;
            collaborators.value = [];
            activeCells.value = {};
        });

        socket.value.on('connect_error', (err) => {
            console.error('[SpreadsheetCollab] Connection error:', err.message);
        });

        // Spreadsheet-specific event listeners
        socket.value.on('spreadsheet_user_joined', (data) => {
            if (!collaborators.value.find(c => c.socketId === data.socketId)) {
                collaborators.value.push(data);
            }
        });

        socket.value.on('spreadsheet_user_left', (data) => {
            collaborators.value = collaborators.value.filter(c => c.socketId !== data.socketId);
            if (activeCells.value[data.socketId]) {
                delete activeCells.value[data.socketId];
            }
        });

        socket.value.on('spreadsheet_current_users', (users) => {
            collaborators.value = users;
            // Populate active cells
            users.forEach((u: any) => {
                if (u.activeCell) {
                    activeCells.value[u.socketId] = {
                        row: u.activeCell.row,
                        col: u.activeCell.col,
                        user: u.user
                    };
                }
            });
        });

        socket.value.on('cell_focus_update', (data) => {
            activeCells.value[data.socketId] = {
                row: data.row,
                col: data.col,
                user: data.user
            };
        });

        socket.value.on('cell_edit_update', (data) => {
            incomingCellEdit.value = data;
            // Also dispatch global event
            window.dispatchEvent(new CustomEvent('spreadsheet:remote-edit', {
                detail: data
            }));

            // Clear after a tick so observers can react
            setTimeout(() => {
                if (incomingCellEdit.value === data) incomingCellEdit.value = null;
            }, 100);
        });

        socket.value.on('spreadsheet_kicked', (data) => {
            console.log('[SpreadsheetCollab] Kicked:', data.reason);
            collaborators.value = [];
            activeCells.value = {};
            currentSpreadsheetId.value = null;
            isLive.value = false;
            window.dispatchEvent(new CustomEvent('spreadsheet:kicked', { detail: data }));
        });
    };

    const disconnect = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
            isConnected.value = false;
        }
    };

    const joinSpreadsheet = (id: string) => {
        if (!socket.value) connect();
        currentSpreadsheetId.value = id;

        const emit = () => {
            console.log(`[SpreadsheetCollab] Joining room: ${id}`);
            socket.value?.emit('join_spreadsheet', id);
        };

        if (socket.value?.connected) {
            emit();
        } else {
            socket.value?.once('connect', emit);
        }
    };

    const leaveSpreadsheet = () => {
        if (!currentSpreadsheetId.value) return;
        if (socket.value?.connected) {
            socket.value.emit('leave_spreadsheet', currentSpreadsheetId.value);
        }
        currentSpreadsheetId.value = null;
        collaborators.value = [];
        activeCells.value = {};
    };

    const broadcastCellFocus = (row: number, col: number) => {
        if (!socket.value?.connected || !currentSpreadsheetId.value) return;
        socket.value.emit('cell_focus', {
            spreadsheetId: currentSpreadsheetId.value,
            row,
            col
        });
    };

    const broadcastCellEdit = (row: number, col: number, value: string) => {
        if (!socket.value?.connected || !currentSpreadsheetId.value) return;
        socket.value.emit('cell_edit', {
            spreadsheetId: currentSpreadsheetId.value,
            row,
            col,
            value
        });
    };

    const kickAllCollaborators = () => {
        if (!socket.value?.connected || !currentSpreadsheetId.value) return;
        socket.value.emit('kick_all_collaborators', currentSpreadsheetId.value);
    };

    // Auto-join/leave
    watch([spreadsheetId, isLive], ([newId, newLive], [oldId, oldLive]) => {
        if (newId && newLive) {
            joinSpreadsheet(newId);
        } else if (oldId && (newId !== oldId || !newLive)) {
            leaveSpreadsheet();
            if (newId && newLive) joinSpreadsheet(newId);
        }
    }, { immediate: true });

    const collaboratorCount = computed(() => collaborators.value.length);

    return {
        isConnected,
        collaborators,
        collaboratorCount,
        activeCells,
        incomingCellEdit,
        currentSpreadsheetId,
        connect,
        disconnect,
        joinSpreadsheet,
        leaveSpreadsheet,
        broadcastCellFocus,
        broadcastCellEdit,
        kickAllCollaborators
    };
}
