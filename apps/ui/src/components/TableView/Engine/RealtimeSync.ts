
import { surreal } from '@/lib/surreal';
import type { Engine } from './Engine';
import type { UserPresence, CellPosition } from './types';

export class RealtimeSync {
    private engine: Engine;
    private roomId: string;
    private userId: string;
    private liveQueryUuid: string | null = null;
    private updateInterval: any = null;
    private lastSentCursor: CellPosition | null = null;
    private pendingCursor: CellPosition | null = null;
    private userInfo: { name: string, color: string };

    constructor(engine: Engine, roomId: string, user: { id: string, name: string, color: string }) {
        this.engine = engine;
        this.roomId = roomId;
        this.userId = user.id;
        this.userInfo = user;

        // Initialize self presence locally
        this.engine.updatePresence({
            userId: user.id,
            userName: user.name,
            color: user.color,
            cursor: { row: 0, col: 0 },
            lastActive: Date.now()
        });

        this.startSync();
    }

    private async startSync() {
        try {
            // 1. Initial Fetch
            // Select all users in this room (filtering not implemented in this POC select, fetching all)
            try {
                const activeUsers = await surreal.select('presence');
                if (Array.isArray(activeUsers)) {
                    activeUsers.forEach((u: any) => {
                        if (u.user_id !== this.userId && u.room_id === this.roomId) {
                            this.engine.updatePresence(this.mapToPresence(u));
                        }
                    });
                }
            } catch (e) {
                console.warn('[Realtime] Initial fetch failed', e);
            }

            // 2. Live Query
            // Note: surrealdb.js types might vary. Assuming .live() returns a UUID or object.
            try {
                const result = await surreal.live('presence', (action, result) => {
                    // Check room match
                    if (result.room_id !== this.roomId) return;

                    if (result.user_id === this.userId) return; // Ignore self updates

                    if (action === 'CREATE' || action === 'UPDATE') {
                        this.engine.updatePresence(this.mapToPresence(result));
                    } else if (action === 'DELETE') {
                        this.engine.removePresence(result.user_id as string);
                    }
                });

                if (typeof result === 'string') {
                    this.liveQueryUuid = result;
                }
            } catch (e) {
                console.warn('[Realtime] Live query failed', e);
            }

            // 3. Heartbeat / Push loop
            this.updateInterval = setInterval(() => {
                this.pushUpdate();
            }, 500); // 500ms throttle

        } catch (e) {
            console.error("[Realtime] Sync init failed", e);
        }
    }

    public updateCursor(pos: CellPosition) {
        this.pendingCursor = pos;

        // Update local self immediately for responsiveness
        const me = this.engine.presence.get(this.userId);
        if (me) {
            me.cursor = pos;
            me.lastActive = Date.now();
            // We don't necessarily need to notifyChange for our own cursor if we are just moving selection
            // But if we want the "me" cursor to be visible in the API, we can.
            // Usually local selection is handled by Grid state, so we might not need to update 'presence' map for self.
            // But for consistency:
            // this.engine.notifyChange(); 
        }
    }

    private async pushUpdate() {
        if (!this.pendingCursor) return;

        // Debounce: only send if changed
        if (this.lastSentCursor &&
            this.lastSentCursor.row === this.pendingCursor.row &&
            this.lastSentCursor.col === this.pendingCursor.col) {
            return;
        }

        const cursorToSend = { ...this.pendingCursor };
        this.lastSentCursor = cursorToSend;

        try {
            const id = `presence:${this.userId}`;
            const data = {
                user_id: this.userId,
                user_name: this.userInfo.name,
                color: this.userInfo.color,
                room_id: this.roomId,
                cursor_row: cursorToSend.row,
                cursor_col: cursorToSend.col,
                last_active: new Date()
            };

            // Use explicit ID creation or update
            try {
                // Check if exists first or just try Create with ID
                // surreal.create(id, data) creates with that ID.
                // If it exists, it might throw.
                // let's try direct merge first? No, merge fails if not found in some versions.
                // Safest: select 1
                const exists = await surreal.select(id);
                if (exists) {
                    await surreal.merge(id, data);
                } else {
                    await surreal.create(id, data);
                }
            } catch (e) {
                // Fallback or race condition handling
                await surreal.merge(id, data).catch(() => { });
            }
        } catch (e) {
            // specific error handling if needed
            console.warn("[Realtime] Push failed", e);
        }
    }

    private mapToPresence(record: any): UserPresence {
        return {
            userId: record.user_id,
            userName: record.user_name,
            color: record.color,
            cursor: { row: record.cursor_row, col: record.cursor_col },
            lastActive: new Date(record.last_active).getTime()
        };
    }

    public stop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        // if (this.liveQueryUuid) surreal.kill(this.liveQueryUuid);
    }
}
