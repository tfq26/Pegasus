
import { ref, onBeforeUnmount, watch, computed, type Ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { QUERY_API_URL } from '@/lib/api';

// Shared socket instance
const socket = ref<Socket | null>(null);
const isConnected = ref(false);

// Data View-specific state
const collaborators = ref<any[]>([]);
const activeCells = ref<Record<string, { row: number, col: number, user: any }>>({});
const currentDataViewId = ref<string | null>(null);
const incomingCellEdit = ref<{ row: number, col: number, value: string, user: any } | null>(null);
const incomingBindingUpdate = ref<{ cellId: string, value: any, dataViewId: string, dataSourceId: string } | null>(null);

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
 * useDataViewCollaboration
 * 
 * Handles Socket.io connection for real-time collaboration on data views.
 * 
 * @param dataViewId - Reactive ref to the current data view/table name
 * @param isLive - Reactive ref to whether collaboration (Live Mode) is enabled
 */
export function useDataViewCollaboration(
    dataViewId: Ref<string | null>,
    isLive: Ref<boolean>
) {
    const SERVER_URL = QUERY_API_URL;

    const connect = () => {
        if (socket.value?.connected) return;

        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('[DataViewCollab] No auth token, cannot connect');
            return;
        }

        socket.value = io(SERVER_URL, {
            auth: { token },
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 5000,
            timeout: 10000
        });

        socket.value.on('connect', () => {
            console.log('[DataViewCollab] Socket connected');
            isConnected.value = true;

            // If we have an active ID and live is on, join immediately
            if (dataViewId.value && isLive.value) {
                joinDataView(dataViewId.value);
            }
        });

        socket.value.on('disconnect', () => {
            console.log('[DataViewCollab] Socket disconnected');
            isConnected.value = false;
            collaborators.value = [];
            activeCells.value = {};
        });

        socket.value.on('connect_error', (err) => {
            if (isConnected.value) {
                console.warn('[DataViewCollab] Socket connection lost:', err.message);
            }
            isConnected.value = false;
        });

        // Data View-specific event listeners
        socket.value.on('data_view_user_joined', (data) => {
            if (!collaborators.value.find(c => c.socketId === data.socketId)) {
                collaborators.value.push(data);
            }
        });

        socket.value.on('data_view_user_left', (data) => {
            collaborators.value = collaborators.value.filter(c => c.socketId !== data.socketId);
            if (activeCells.value[data.socketId]) {
                delete activeCells.value[data.socketId];
            }
        });

        socket.value.on('data_view_current_users', (users) => {
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
            window.dispatchEvent(new CustomEvent('dataview:remote-edit', {
                detail: data
            }));

            // Clear after a tick so observers can react
            setTimeout(() => {
                if (incomingCellEdit.value === data) incomingCellEdit.value = null;
            }, 100);
        });

        socket.value.on('cell_binding_updated', (data) => {
            incomingBindingUpdate.value = data;
            // Dispatch global event
            window.dispatchEvent(new CustomEvent('dataview:binding-update', {
                detail: data
            }));

            // Clear after a tick
            setTimeout(() => {
                if (incomingBindingUpdate.value === data) incomingBindingUpdate.value = null;
            }, 100);
        });

        socket.value.on('data_view_kicked', (data) => {
            console.log('[DataViewCollab] Kicked:', data.reason);
            collaborators.value = [];
            activeCells.value = {};
            currentDataViewId.value = null;
            isLive.value = false;
            window.dispatchEvent(new CustomEvent('dataview:kicked', { detail: data }));
        });
    };

    const disconnect = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
            isConnected.value = false;
        }
    };

    const joinDataView = (id: string) => {
        if (!socket.value) connect();
        currentDataViewId.value = id;

        const emit = () => {
            console.log(`[DataViewCollab] Joining room: ${id}`);
            socket.value?.emit('join_data_view', id);
        };

        if (socket.value?.connected) {
            emit();
        } else {
            socket.value?.once('connect', emit);
        }
    };

    const leaveDataView = () => {
        if (!currentDataViewId.value) return;
        if (socket.value?.connected) {
            socket.value.emit('leave_data_view', currentDataViewId.value);
        }
        currentDataViewId.value = null;
        collaborators.value = [];
        activeCells.value = {};
    };

    const broadcastCellFocus = (row: number, col: number) => {
        if (!socket.value?.connected || !currentDataViewId.value) return;
        socket.value.emit('cell_focus', {
            dataViewId: currentDataViewId.value,
            row,
            col
        });
    };

    const broadcastCellEdit = (row: number, col: number, value: string) => {
        if (!socket.value?.connected || !currentDataViewId.value) return;
        socket.value.emit('cell_edit', {
            dataViewId: currentDataViewId.value,
            row,
            col,
            value
        });
    };

    const kickAllCollaborators = () => {
        if (!socket.value?.connected || !currentDataViewId.value) return;
        socket.value.emit('kick_all_collaborators', currentDataViewId.value);
    };

    // Auto-join/leave
    watch([dataViewId, isLive], ([newId, newLive], [oldId, oldLive]) => {
        if (newId && newLive) {
            joinDataView(newId);
        } else if (oldId && (newId !== oldId || !newLive)) {
            leaveDataView();
            if (newId && newLive) joinDataView(newId);
        }
    }, { immediate: true });

    const collaboratorCount = computed(() => collaborators.value.length);

    return {
        isConnected,
        collaborators,
        collaboratorCount,
        activeCells,
        incomingCellEdit,
        incomingBindingUpdate,
        currentDataViewId,
        connect,
        disconnect,
        joinDataView,
        leaveDataView,
        broadcastCellFocus,
        broadcastCellEdit,
        kickAllCollaborators
    };
}
