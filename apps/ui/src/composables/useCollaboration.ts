
import { ref, onBeforeUnmount } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { QUERY_API_URL } from '@/lib/api';

const socket = ref<Socket | null>(null);
const isConnected = ref(false);
const collaborators = ref<any[]>([]);
const cursors = ref<Record<string, { x: number, y: number, user: any, lastUpdated: number }>>({});
const chatMessages = ref<any[]>([]);
const isAIThinking = ref(false);

export function useCollaboration() {
    const { user } = useAuth();
    // Use the same URL as the API, but typically Socket.io handles the path/port automatically 
    // if served from the same origin, or we specify the full URL.
    // If QUERY_API_URL is "http://localhost:3000", that's our target.
    const SERVER_URL = QUERY_API_URL;

    const connect = () => {
        if (socket.value?.connected) return;

        const token = localStorage.getItem('auth_token');
        // Even if no token in localStorage, try to connect as the server now supports cookie fallback

        socket.value = io(SERVER_URL, {
            auth: token ? { token } : {},
            transports: ['polling', 'websocket'], // Try polling first for better compatibility
            reconnectionAttempts: 5,
            reconnectionDelay: 5000,
            timeout: 10000
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
            if (isConnected.value) {
                console.warn('[Collaboration] Socket connection lost:', err.message);
            }
            isConnected.value = false;
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
                user: data.user,
                lastUpdated: Date.now()
            };
        });

        socket.value.on('new_message', (message) => {
            console.log('[Collaboration] New message received:', message);
            chatMessages.value.push(message);
        });

        socket.value.on('chat_history', (history) => {
            console.log('[Collaboration] Chat history received:', history);
            chatMessages.value = history || [];
        });

        socket.value.on('message_updated', (data) => {
            // data: { id, content, isEdited }
            const idx = chatMessages.value.findIndex(m => m.id === data.id);
            if (idx !== -1) {
                chatMessages.value[idx] = {
                    ...chatMessages.value[idx],
                    content: data.content,
                    isEdited: data.isEdited
                };
            }
        });

        socket.value.on('message_deleted', (data) => {
            // data: { id }
            chatMessages.value = chatMessages.value.filter(m => m.id !== data.id);
        });

        socket.value.on('pegasus_thinking', (data) => {
            isAIThinking.value = data.thinking;
        });

        socket.value.on('dashboard_deleted', (data) => {
            console.log('[Collaboration] Dashboard has been deleted:', data.dashboardId);
            // Clean up collaboration state
            cursors.value = {};
            collaborators.value = [];
            chatMessages.value = [];
            // Optional: trigger redirect if we're on that dashboard
            if (window.location.pathname.includes(data.dashboardId.split(':').pop())) {
                window.location.href = '/';
            }
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

    const sendChatMessage = (dashboardId: string, messageData: { content: string, mentions?: any[], images?: any[] } | string) => {
        if (!socket.value?.connected) return;

        // Handle legacy string calls if any
        const payload = typeof messageData === 'string'
            ? { dashboardId, content: messageData }
            : { dashboardId, ...messageData };

        socket.value.emit('chat_message', payload);
    };

    const emitPegasusQuery = (dashboardId: string, query: string, parentId?: string) => {
        if (!socket.value?.connected) return;
        socket.value.emit('pegasus_query', { dashboardId, query, parentId });
    };

    const editChatMessage = (dashboardId: string, messageId: string, content: string) => {
        if (!socket.value?.connected) return;
        socket.value.emit('edit_message', { dashboardId, messageId, content });
    };

    const deleteChatMessage = (dashboardId: string, messageId: string) => {
        if (!socket.value?.connected) return;
        socket.value.emit('delete_message', { dashboardId, messageId });
    };

    return {
        isConnected,
        isAIThinking,
        collaborators,
        cursors,
        chatMessages,
        connect,
        disconnect,
        joinDashboard,
        leaveDashboard,
        emitCursorMove,
        sendChatMessage,
        emitPegasusQuery,
        editChatMessage,
        deleteChatMessage,
        socket
    };
}
