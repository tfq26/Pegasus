
import { ref, onBeforeUnmount } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { QUERY_API_URL } from '@/lib/api';

const socket = ref<Socket | null>(null);
const isConnected = ref(false);
const collaborators = ref<any[]>([]);
const cursors = ref<Record<string, { x: number, y: number, user: any }>>({});
const chatMessages = ref<any[]>([]);

export function useCollaboration() {
    const { user } = useAuth();
    // Use the same URL as the API, but typically Socket.io handles the path/port automatically 
    // if served from the same origin, or we specify the full URL.
    // If QUERY_API_URL is "http://localhost:3000", that's our target.
    const SERVER_URL = QUERY_API_URL;

    const connect = () => {
        if (socket.value?.connected) return;

        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('[Collaboration] No auth token found, cannot connect to socket');
            return;
        }

        socket.value = io(SERVER_URL, {
            auth: { token },
            transports: ['websocket', 'polling']
        });

        socket.value.on('connect', () => {
            console.log('[Collaboration] Connected to socket');
            isConnected.value = true;
        });

        socket.value.on('disconnect', () => {
            console.log('[Collaboration] Disconnected from socket');
            isConnected.value = false;
            collaborators.value = [];
            cursors.value = {};
        });

        socket.value.on('connect_error', (err) => {
            console.error('[Collaboration] Connection error:', err.message);
        });

        // Event Listeners
        socket.value.on('user_joined', (data) => {
            // data: { user, socketId }
            if (!collaborators.value.find(c => c.socketId === data.socketId)) {
                collaborators.value.push(data);
            }
        });

        socket.value.on('user_left', (data) => {
            collaborators.value = collaborators.value.filter(c => c.socketId !== data.socketId);
            if (cursors.value[data.socketId]) {
                delete cursors.value[data.socketId];
            }
        });

        socket.value.on('current_users', (users) => {
            // users: Array of { user, socketId }
            // Filter out self? Usually UI likes to show "You + 2 others" or just list everyone.
            // Let's keep everyone including self, but maybe mark self.
            collaborators.value = users;
        });

        socket.value.on('cursor_update', (data) => {
            // data: { socketId, user, x, y }
            cursors.value[data.socketId] = {
                x: data.x,
                y: data.y,
                user: data.user
            };
        });

        socket.value.on('new_message', (message) => {
            chatMessages.value.push(message);
        });
    };

    const disconnect = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
            isConnected.value = false;
        }
    };

    const joinDashboard = (dashboardId: string) => {
        if (!socket.value) connect();
        // Wait for connection if not ready? logic can be improved but this triggers it.
        // If already connected, emit immediately:
        if (socket.value?.connected) {
            socket.value.emit('join_dashboard', dashboardId);
        } else {
            socket.value?.once('connect', () => {
                socket.value?.emit('join_dashboard', dashboardId);
            });
        }
        // Clear previous state on switch
        chatMessages.value = [];
    };

    const leaveDashboard = (dashboardId: string) => {
        if (socket.value?.connected) {
            socket.value.emit('leave_dashboard', dashboardId);
        }
        cursors.value = {};
        collaborators.value = [];
        chatMessages.value = [];
    };

    const emitCursorMove = (dashboardId: string, x: number, y: number) => {
        if (!socket.value?.connected) return;
        socket.value.emit('cursor_move', { dashboardId, x, y });
    };

    const sendChatMessage = (dashboardId: string, content: string) => {
        if (!socket.value?.connected) return;
        socket.value.emit('chat_message', { dashboardId, content });
    };

    return {
        isConnected,
        collaborators,
        cursors,
        chatMessages,
        connect,
        disconnect,
        joinDashboard,
        leaveDashboard,
        emitCursorMove,
        sendChatMessage
    };
}
