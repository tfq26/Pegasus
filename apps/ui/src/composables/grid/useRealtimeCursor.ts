import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue';
import { toast } from '@/composables/useNotifications';
import { connectToSurreal } from '@/lib/surreal';
import { RealtimeSync } from '../../components/TableView/Engine/RealtimeSync';
import type { Engine } from '../../components/TableView/Engine/Engine';
import type { CellPosition } from '../../components/TableView/Engine/types';

export function useRealtimeCursor(
    engine: Engine,
    privateMode: Ref<boolean | undefined>,
    scrollToCell: (row: number, col: number) => void
) {
    const followedUserId = ref<string | null>(null);
    let realtimeSync: RealtimeSync | null = null;

    // Follow user
    const handleFollowUser = (userId: string) => {
        if (userId === followedUserId.value) return;

        const user = engine.presence.get(userId);
        if (user) {
            followedUserId.value = userId;
            const userName = user.userName || 'User';
            toast.info(`Following ${userName}`);
            // Immediate jump
            if (scrollToCell && user.cursor) {
                scrollToCell(user.cursor.row, user.cursor.col);
            }
        }
    };

    const stopFollowing = () => {
        followedUserId.value = null;
        toast.info('Stopped following');
    };

    const updateCursor = (pos: CellPosition) => {
        // [DEPRECATED] SurrealDB sync disabled
        // if (realtimeSync) realtimeSync.updateCursor(pos);
    }

    // Sync initialization
    const initRealtimeSync = async () => {
        // [DEPRECATED] SurrealDB sync disabled in favor of Socket.io collaboration
        return;

        /*
        // Cleanup existing
        if (realtimeSync) {
            realtimeSync.stop();
            realtimeSync = null;
        }

        // Don't sync in private mode
        if (privateMode.value) return;

        try {
            const connected = await connectToSurreal();
            if (connected) {
                // Stable user identity for this session
                let storedUser = localStorage.getItem('pegasus-temp-user');
                let user;
                if (storedUser) {
                    user = JSON.parse(storedUser);
                } else {
                    user = {
                        id: 'user_' + Math.random().toString(36).substr(2, 9),
                        name: 'User ' + Math.floor(Math.random() * 100),
                        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
                    };
                    localStorage.setItem('pegasus-temp-user', JSON.stringify(user));
                }

                realtimeSync = new RealtimeSync(engine, 'main-room', user);
            }
        } catch (error) {
            console.warn('[Realtime] Failed to initialize realtime sync:', error);
            // Don't block spreadsheet loading if realtime fails
        }
        */
    };

    onMounted(() => {
        // initRealtimeSync();

        // Watch for private mode or engine changes
        watch(() => [privateMode.value, engine], () => {
            // initRealtimeSync();
        });

        // Watch engine presence changes for "Follow Me"
        engine.onChange(() => {
            if (followedUserId.value) {
                const user = engine.presence.get(followedUserId.value);
                if (user && user.cursor) {
                    scrollToCell(user.cursor.row, user.cursor.col);
                } else {
                    // User left logic?
                }
            }
        });

    });

    onUnmounted(() => {
        // if (realtimeSync) realtimeSync.stop();
    });

    return {
        followedUserId,
        handleFollowUser,
        stopFollowing,
        updateCursor
    };
}
