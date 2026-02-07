import { Server } from "socket.io";
import { verify, decode } from "hono/jwt";
import { db } from "./db/index.js";
import { dashboards, notifications } from "./db/schema.js";
import { eq, sql, and } from "drizzle-orm";
import { createHmac } from "crypto";
import { orionMetricsSync } from "./services/orion-metrics-sync.js";

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production";

// Helper to normalize dashboard ID and room name
export const getRoom = (id) => {
    if (!id) return null;
    const cleanId = id.toString().split(':').pop();
    return `dashboard:${cleanId}`;
};

// Helper to normalize spreadsheet ID and room name
const getSpreadsheetRoom = (id) => {
    if (!id) return null;
    const cleanId = id.toString().split(':').pop();
    return `spreadsheet:${cleanId}`;
};

let ioInstance = null;

export const getIO = () => ioInstance;

export function initSocketServer(server, allowedOrigins) {
    const io = new Server(server || undefined, {
        cors: {
            origin: (origin, callback) => {
                const isAllowed = !origin ||
                    allowedOrigins.includes(origin) ||
                    (origin.endsWith('.vercel.app') && (origin.includes('pegasus') || origin.includes('tfq26')));

                if (isAllowed) {
                    callback(null, true);
                } else {
                    console.warn(`[Socket.io] CORS blocked origin: ${origin}`);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    ioInstance = io;

    // Start Orion Metrics Sync (Change Feed listener)
    orionMetricsSync.start().catch(err => console.error("[Socket.js] Failed to start Orion sync:", err));

    io.use(async (socket, next) => {
        let token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token && socket.handshake.headers.cookie) {
            const cookies = socket.handshake.headers.cookie.split(';');
            const sessionCookie = cookies.find(c => c.trim().startsWith('session='));
            if (sessionCookie) {
                token = sessionCookie.split('=')[1].trim();
            }
        }

        if (!token) {
            console.warn('[Socket.io] No auth token provided');
            return next(new Error("Authentication error"));
        }

        try {
            const payload = await verify(token, jwtSecret);
            socket.user = {
                id: payload.sub,
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                profilePictureUrl: payload.profilePictureUrl || payload.profile_picture_url
            };
            next();
        } catch (err) {
            if (err.message.includes("expired") || err.name === "JwtTokenExpired") {
                try {
                    const { payload } = decode(token);
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const hmac = createHmac('sha256', jwtSecret);
                        hmac.update(parts[0] + '.' + parts[1]);
                        const expectedSignature = hmac.digest('base64url');

                        if (expectedSignature === parts[2]) {
                            const now = Math.floor(Date.now() / 1000);
                            const gracePeriod = 24 * 60 * 60; // 24 hours

                            if (now < (payload.exp || 0) + gracePeriod) {
                                socket.user = {
                                    id: payload.sub,
                                    email: payload.email,
                                    firstName: payload.firstName,
                                    lastName: payload.lastName,
                                    profilePictureUrl: payload.profilePictureUrl || payload.profile_picture_url
                                };
                                return next();
                            }
                        }
                    }
                } catch (decodeErr) {
                    console.error("[Socket.io] Manual verification failed:", decodeErr.message);
                }
            }
            console.error("[Socket.io] Auth failed:", err.message);
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`[Socket.io] User connected: ${socket.user.email} (${socket.id})`);

        socket.on("join_dashboard", async (dashboardId) => {
            const room = getRoom(dashboardId);
            if (!room) return;

            socket.join(room);

            socket.to(room).emit("user_joined", {
                user: socket.user,
                socketId: socket.id
            });

            const sockets = await io.in(room).fetchSockets();
            const users = sockets.map(s => ({
                user: s.user,
                socketId: s.id
            }));
            socket.emit("current_users", users);

            try {
                const dashId = dashboardId.includes(':') ? dashboardId.split(':').pop() : dashboardId;
                const dash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { messages: true }
                });

                socket.emit("chat_history", dash?.messages || []);
            } catch (e) {
                console.error("[Socket.io] Failed to fetch chat history:", e);
                socket.emit("chat_history", []);
            }
        });

        socket.on("leave_dashboard", (dashboardId) => {
            const room = getRoom(dashboardId);
            if (!room) return;
            socket.leave(room);
            socket.to(room).emit("user_left", { socketId: socket.id });
        });

        socket.on("cursor_move", (data) => {
            const room = getRoom(data.dashboardId);
            if (!room) return;
            socket.to(room).volatile.emit("cursor_update", {
                socketId: socket.id,
                user: socket.user,
                x: data.x,
                y: data.y
            });
        });

        socket.on("chat_message", async (data) => {
            const room = getRoom(data.dashboardId);
            if (!room) return;

            const dashId = data.dashboardId.includes(':') ? data.dashboardId.split(':').pop() : data.dashboardId;

            const message = {
                id: crypto.randomUUID(),
                user: socket.user,
                content: data.content,
                mentions: data.mentions || [],
                images: data.images || [],
                timestamp: new Date().toISOString(),
                parentId: data.parentId || null,
            };

            try {
                // Update messages array in Postgres using JSONB concat or fetch-and-update
                // For simplicity and since these are often small, fetch and update is safer via Drizzle
                const dash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { messages: true, title: true }
                });

                if (dash) {
                    const updatedMessages = [...(dash.messages || []), message];
                    await db.update(dashboards)
                        .set({
                            messages: updatedMessages,
                            updatedAt: new Date()
                        })
                        .where(eq(dashboards.id, dashId));

                    // Handle mentions
                    if (data.mentions?.length) {
                        for (const mention of data.mentions) {
                            if (mention.type === 'user' && mention.id) {
                                await db.insert(notifications).values({
                                    userId: mention.id,
                                    type: 'mention',
                                    dashboardId: dashId,
                                    dashboardTitle: dash.title,
                                    message: data.content.substring(0, 100),
                                    sender: socket.user.firstName || 'Someone',
                                    isRead: false
                                });

                                // Real-time delivery
                                const allSockets = await io.fetchSockets();
                                const targetSocket = allSockets.find(s => s.user?.id === mention.id);
                                if (targetSocket) {
                                    targetSocket.emit("user_mentioned", {
                                        dashboardId: dashId,
                                        dashboardTitle: dash.title,
                                        senderName: socket.user.firstName,
                                        preview: data.content.substring(0, 100),
                                        timestamp: message.timestamp
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("[Socket.io] Failed to save message:", e);
            }

            io.to(room).emit("new_message", message);
        });

        socket.on("edit_message", async (data) => {
            const room = getRoom(data.dashboardId);
            if (!room) return;
            const dashId = data.dashboardId.includes(':') ? data.dashboardId.split(':').pop() : data.dashboardId;

            try {
                const dash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { messages: true }
                });

                if (dash && dash.messages) {
                    const updatedMessages = dash.messages.map(m =>
                        m.id === data.messageId
                            ? { ...m, content: data.content, updatedAt: new Date().toISOString(), isEdited: true }
                            : m
                    );

                    await db.update(dashboards)
                        .set({ messages: updatedMessages, updatedAt: new Date() })
                        .where(eq(dashboards.id, dashId));

                    io.to(room).emit("message_updated", {
                        id: data.messageId,
                        content: data.content,
                        isEdited: true
                    });
                }
            } catch (e) {
                console.error("[Socket.io] Failed to edit message:", e);
            }
        });

        socket.on("delete_message", async (data) => {
            const room = getRoom(data.dashboardId);
            if (!room) return;
            const dashId = data.dashboardId.includes(':') ? data.dashboardId.split(':').pop() : data.dashboardId;

            try {
                const dash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { messages: true }
                });

                if (dash && dash.messages) {
                    const updatedMessages = dash.messages.filter(m => m.id !== data.messageId);
                    await db.update(dashboards)
                        .set({ messages: updatedMessages, updatedAt: new Date() })
                        .where(eq(dashboards.id, dashId));

                    io.to(room).emit("message_deleted", { id: data.messageId });
                }
            } catch (e) {
                console.error("[Socket.io] Failed to delete message:", e);
            }
        });

        socket.on("typing_start", (dashboardId) => {
            const room = getRoom(dashboardId);
            if (room) socket.to(room).emit("user_typing_start", { socketId: socket.id, user: socket.user });
        });

        socket.on("typing_end", (dashboardId) => {
            const room = getRoom(dashboardId);
            if (room) socket.to(room).emit("user_typing_end", { socketId: socket.id });
        });

        socket.on("pegasus_query", async (data) => {
            const room = getRoom(data.dashboardId);
            if (!room) return;

            try {
                const dashId = data.dashboardId.includes(':') ? data.dashboardId.split(':').pop() : data.dashboardId;

                // 1. Immediate UI Feedback: Emit thinking
                io.to(room).emit("pegasus_thinking", { thinking: true });

                // 2. Fetch Dashboard
                let dash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { title: true, messages: true }
                });

                // 3. Construct & Save User Message (Fix for latency)
                const userMessage = {
                    id: crypto.randomUUID(),
                    user: socket.user,
                    content: data.query,
                    mentions: [], // Direct queries usually imply mentioning Pegasus
                    images: [],
                    timestamp: new Date().toISOString(),
                    parentId: data.parentId || null,
                };

                if (dash) {
                    const updatedMessages = [...(dash.messages || []), userMessage];
                    await db.update(dashboards)
                        .set({ messages: updatedMessages, updatedAt: new Date() })
                        .where(eq(dashboards.id, dashId));

                    // Emit immediately so user sees their message
                    io.to(room).emit("new_message", userMessage);
                }

                // 4. Perform AI Analysis (Slow Operation)
                const response = await fetch(`http://localhost:${process.env.PORT || 3000}/ai/dashboard-query`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${socket.handshake.auth.token || ''}`
                    },
                    body: JSON.stringify({
                        query: data.query,
                        dashboardTitle: dash?.title || 'Unknown',
                        elements: data.context || []
                    })
                });

                let aiResponseText = "I couldn't process that request.";
                if (response.ok) {
                    const result = await response.json();
                    aiResponseText = result.response || result.message || aiResponseText;
                }

                const aiMessage = {
                    id: crypto.randomUUID(),
                    user: { id: 'pegasus', email: 'pegasus@ai', firstName: 'Pegasus', lastName: 'AI' },
                    content: aiResponseText,
                    isAIResponse: true,
                    timestamp: new Date().toISOString(),
                    parentId: data.parentId || null,
                };

                // 5. Save AI Response (Refetch to ensure latest state)
                const freshDash = await db.query.dashboards.findFirst({
                    where: eq(dashboards.id, dashId),
                    columns: { messages: true }
                });

                if (freshDash) {
                    const updatedMessages = [...(freshDash.messages || []), aiMessage];
                    await db.update(dashboards)
                        .set({ messages: updatedMessages, updatedAt: new Date() })
                        .where(eq(dashboards.id, dashId));
                }

                io.to(room).emit("pegasus_thinking", { thinking: false });
                io.to(room).emit("new_message", aiMessage);

            } catch (e) {
                console.error("[Socket.io] Pegasus query failed:", e);
                io.to(room).emit("pegasus_thinking", { thinking: false });
            }
        });

        socket.on("dashboard_update", (data) => {
            const room = getRoom(data.dashboardId);
            if (room) socket.to(room).emit("dashboard_updated", data);
        });

        // Element-level events
        socket.on("element_update", (data) => {
            // data: { dashboardId, elementId, changes }
            const room = getRoom(data.dashboardId);
            if (room) socket.to(room).emit("element_updated", data);
        });

        socket.on("element_add", (data) => {
            // data: { dashboardId, pageId, element, layoutItem }
            const room = getRoom(data.dashboardId);
            if (room) socket.to(room).emit("element_added", data);
        });

        socket.on("element_remove", (data) => {
            // data: { dashboardId, elementId }
            const room = getRoom(data.dashboardId);
            if (room) socket.to(room).emit("element_removed", data);
        });

        socket.on("element_data_refresh", (data) => {
            // data: { dashboardId, elementId, newData }
            const room = getRoom(data.dashboardId);
            if (room) socket.to(room).emit("element_data_refreshed", data);
        });

        // Orion Live Metrics
        socket.on("join_orion", () => {
            socket.join("orion:live");
            console.log(`[Socket.io] User ${socket.user.email} joined Orion live room`);
        });

        socket.on("leave_orion", () => {
            socket.leave("orion:live");
            console.log(`[Socket.io] User ${socket.user.email} left Orion live room`);
        });

        socket.on("disconnecting", () => {
            for (const room of socket.rooms) {
                if (room.startsWith("dashboard:")) socket.to(room).emit("user_left", { socketId: socket.id });
                if (room.startsWith("spreadsheet:")) socket.to(room).emit("spreadsheet_user_left", { socketId: socket.id });
            }
        });

        socket.on("join_spreadsheet", async (spreadsheetId) => {
            const room = getSpreadsheetRoom(spreadsheetId);
            if (!room) return;
            socket.join(room);
            socket.to(room).emit("spreadsheet_user_joined", { user: socket.user, socketId: socket.id });

            const sockets = await io.in(room).fetchSockets();
            const users = sockets.map(s => ({
                user: s.user,
                socketId: s.id,
                activeCell: s.activeCell || null
            }));
            socket.emit("spreadsheet_current_users", users);
        });

        socket.on("leave_spreadsheet", (spreadsheetId) => {
            const room = getSpreadsheetRoom(spreadsheetId);
            if (room) {
                socket.leave(room);
                socket.to(room).emit("spreadsheet_user_left", { socketId: socket.id });
            }
        });

        socket.on("cell_focus", (data) => {
            const room = getSpreadsheetRoom(data.spreadsheetId);
            if (room) {
                socket.activeCell = { row: data.row, col: data.col };
                socket.to(room).emit("cell_focus_update", { socketId: socket.id, user: socket.user, row: data.row, col: data.col });
            }
        });

        socket.on("cell_edit", (data) => {
            const room = getSpreadsheetRoom(data.spreadsheetId);
            if (room) socket.to(room).emit("cell_edit_update", { socketId: socket.id, user: socket.user, row: data.row, col: data.col, value: data.value });
        });

        socket.on("kick_all_collaborators", (spreadsheetId) => {
            const room = getSpreadsheetRoom(spreadsheetId);
            if (room) {
                socket.to(room).emit("spreadsheet_kicked", { reason: "Owner switched to Private Mode", by: socket.user });
                io.in(room).socketsLeave(room);
            }
        });
    });

    return io;
}
