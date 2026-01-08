import { Server } from "socket.io";
import { verify, decode } from "hono/jwt";
import { db } from "../db/surreal.js";
import { createHmac } from "crypto";

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production";

// Helper to normalize dashboard ID and room name
const getRoom = (id) => {
    if (!id) return null;
    // Always take the last part of a colon-separated ID (handles dashboard:UUID or just UUID)
    const cleanId = id.toString().split(':').pop();
    return `dashboard:${cleanId}`;
};

// Helper to normalize spreadsheet ID and room name
const getSpreadsheetRoom = (id) => {
    if (!id) return null;
    const cleanId = id.toString().split(':').pop();
    return `spreadsheet:${cleanId}`;
};

export function initSocketServer(server, allowedOrigins) {
    const io = new Server(server || undefined, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: true
        }
    });


    io.use(async (socket, next) => {
        let token = socket.handshake.auth.token || socket.handshake.query.token;

        // Fallback to cookie if token is missing (useful for browser clients)
        if (!token && socket.handshake.headers.cookie) {
            const cookies = socket.handshake.headers.cookie.split(';');
            const sessionCookie = cookies.find(c => c.trim().startsWith('session='));
            if (sessionCookie) {
                token = sessionCookie.split('=')[1].trim();
                // console.log('[Socket.io] Using token from session cookie');
            }
        }

        if (!token) {
            console.warn('[Socket.io] No auth token provided');
            return next(new Error("Authentication error"));
        }

        try {
            // First try standard verification
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
            // Handle expired tokens gracefully for WebSockets
            if (err.message.includes("expired") || err.name === "JwtTokenExpired") {
                try {
                    const { payload } = decode(token);

                    // CRITICAL: Manually verify signature before trusting the expired payload
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const hmac = createHmac('sha256', jwtSecret);
                        hmac.update(parts[0] + '.' + parts[1]);
                        const expectedSignature = hmac.digest('base64url');

                        if (expectedSignature === parts[2]) {
                            // Signature matches! Allow a 24-hour grace period for WebSockets
                            const now = Math.floor(Date.now() / 1000);
                            const gracePeriod = 24 * 60 * 60; // 24 hours

                            if (now < (payload.exp || 0) + gracePeriod) {
                                // console.log(`[Socket.io] Grace period allowed for: ${payload.email}`);
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
            // console.log(`[Socket.io] User ${socket.user.email} joined ${room}`);

            // Broadcast presence to others in the room
            socket.to(room).emit("user_joined", {
                user: socket.user,
                socketId: socket.id
            });

            // Send list of current users in room to the new user
            const sockets = await io.in(room).fetchSockets();
            const users = sockets.map(s => ({
                user: s.user,
                socketId: s.id
            }));
            socket.emit("current_users", users);

            // Fetch and emit chat history from dashboard.messages array
            try {
                // Normalize dashboard ID for DB query
                const dashId = dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`;

                // Fetch messages directly from dashboard document
                const [dashboards] = await db.query(`SELECT messages FROM ${dashId}`);

                if (dashboards && dashboards[0] && dashboards[0].messages) {
                    // console.log('[Socket.io] Chat history found:', dashboards[0].messages.length, 'messages');
                    socket.emit("chat_history", dashboards[0].messages);
                } else {
                    socket.emit("chat_history", []);
                }
            } catch (e) {
                console.error("[Socket.io] Failed to fetch chat history:", e);
                socket.emit("chat_history", []);
            }
        });

        socket.on("leave_dashboard", (dashboardId) => {
            const room = getRoom(dashboardId);
            if (!room) return;

            socket.leave(room);
            // console.log(`[Socket.io] User ${socket.user.email} left ${room}`);
            socket.to(room).emit("user_left", { socketId: socket.id });
        });

        socket.on("cursor_move", (data) => {
            // data: { dashboardId, x, y }
            const room = getRoom(data.dashboardId);
            if (!room) return;

            // Volatile means it can be dropped if network is busy (perfect for cursors)
            socket.to(room).volatile.emit("cursor_update", {
                socketId: socket.id,
                user: socket.user,
                x: data.x,
                y: data.y
            });
        });

        socket.on("chat_message", async (data) => {
            // data: { dashboardId, content, mentions?, images?, parentId? }
            const room = getRoom(data.dashboardId);
            if (!room) return;

            // console.log(`[Socket.io] Received chat_message from ${socket.user.email} in room ${room}`);

            // Create message object with all user data embedded
            const message = {
                id: crypto.randomUUID(),
                user: {
                    id: socket.user.id,
                    email: socket.user.email,
                    firstName: socket.user.firstName,
                    lastName: socket.user.lastName,
                    profilePictureUrl: socket.user.profilePictureUrl
                },
                content: data.content,
                mentions: data.mentions || [],
                images: data.images || [],
                timestamp: new Date().toISOString(),
                parentId: data.parentId || null,
            };

            // Save to dashboard.messages array
            try {
                const dashId = data.dashboardId.includes(':')
                    ? data.dashboardId
                    : `dashboard:${data.dashboardId}`;

                console.log('[Socket.io] Saving message to dashboard:', dashId);

                await db.query(`
                    UPDATE ${dashId} SET 
                        messages = array::append(messages ?? [], $message),
                        updated_at = time::now();
                `, { message });

                console.log('[Socket.io] Message saved successfully');
            } catch (e) {
                console.error("[Socket.io] Failed to save message:", e);
            }

            // Handle @user mentions - notify mentioned users
            if (data.mentions?.length) {
                for (const mention of data.mentions) {
                    if (mention.type === 'user' && mention.id) {
                        // Find the mentioned user's socket
                        const allSockets = await io.fetchSockets();
                        const targetSocket = allSockets.find(s =>
                            s.user?.id === mention.id || s.user?.email === mention.email
                        );

                        if (targetSocket) {
                            targetSocket.emit("user_mentioned", {
                                dashboardId: data.dashboardId,
                                senderName: socket.user.firstName || socket.user.email?.split('@')[0],
                                preview: data.content.substring(0, 100),
                                timestamp: message.timestamp
                            });
                        }
                    }
                }
            }

            // Broadcast to room
            console.log(`[Socket.io] Broadcasting message to room ${room}`);
            io.to(room).emit("new_message", message);
            console.log(`[Socket.io] Message broadcasted successfully`);
        });

        socket.on("edit_message", async (data) => {
            // data: { dashboardId, messageId, content }
            const room = getRoom(data.dashboardId);
            if (!room) return;
            const dashId = data.dashboardId.includes(':') ? data.dashboardId : `dashboard:${data.dashboardId}`;

            try {
                // Update message in dashboard.messages array
                await db.query(`
                    UPDATE ${dashId} SET 
                        messages = messages.map(|$m| 
                            if ($m.id == $messageId) {
                                $m.content = $content,
                                $m.updated_at = time::now(),
                                $m.isEdited = true
                            }
                            return $m
                        ),
                        updated_at = time::now();
                `, { messageId: data.messageId, content: data.content });

                // Broadcast update to room
                io.to(room).emit("message_updated", {
                    id: data.messageId,
                    content: data.content,
                    isEdited: true
                });
                console.log('[Socket.io] Message edited successfully');
            } catch (e) {
                console.error("[Socket.io] Failed to edit message:", e);
            }
        });

        socket.on("delete_message", async (data) => {
            // data: { dashboardId, messageId }
            const room = getRoom(data.dashboardId);
            if (!room) return;
            const dashId = data.dashboardId.includes(':') ? data.dashboardId : `dashboard:${data.dashboardId}`;

            try {
                // Remove message from dashboard.messages array
                await db.query(`
                    UPDATE ${dashId} SET 
                        messages = messages.filter(|$m| $m.id != $messageId),
                        updated_at = time::now();
                `, { messageId: data.messageId });

                // Broadcast deletion to room
                io.to(room).emit("message_deleted", { id: data.messageId });
                console.log('[Socket.io] Message deleted successfully');
            } catch (e) {
                console.error("[Socket.io] Failed to delete message:", e);
            }
        });

        // @Pegasus AI Query
        socket.on("pegasus_query", async (data) => {
            // data: { dashboardId, query, context? }
            const room = getRoom(data.dashboardId);
            if (!room) return;

            console.log('[Socket.io] Pegasus query:', data.query);

            try {
                // Notify room that AI is thinking
                io.to(room).emit("pegasus_thinking", { thinking: true });

                // Get dashboard context (elements, tables)
                const dashId = data.dashboardId.includes(':')
                    ? data.dashboardId
                    : `dashboard:${data.dashboardId}`;

                const [dashboards] = await db.query(`SELECT elements, title FROM ${dashId}`);
                const dashboard = dashboards?.[0];

                // Build context string from dashboard elements
                let contextStr = "";
                if (dashboard?.elements?.length) {
                    const tables = dashboard.elements.filter(e => e.type === 'table');
                    if (tables.length) {
                        contextStr = `Dashboard contains tables: ${tables.map(t => t.config?.tableName || 'Unknown').join(', ')}. `;
                    }
                }

                // Call AI (use existing chat service or similar)
                const response = await fetch(`http://localhost:${process.env.PORT || 3001}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': socket.handshake.auth.token ? `Bearer ${socket.handshake.auth.token}` : ''
                    },
                    body: JSON.stringify({
                        message: `${contextStr}User asks: ${data.query}`,
                        context: { dashboard: dashboard?.title }
                    })
                });

                let aiResponseText = "I couldn't process that request. Please try again.";
                if (response.ok) {
                    const result = await response.json();
                    aiResponseText = result.response || result.message || aiResponseText;
                }

                // Create AI response message
                const aiMessage = {
                    id: crypto.randomUUID(),
                    user: {
                        id: 'pegasus',
                        email: 'pegasus@ai',
                        firstName: 'Pegasus',
                        lastName: 'AI'
                    },
                    content: aiResponseText,
                    isAIResponse: true,
                    timestamp: new Date().toISOString(),
                    parentId: data.parentId || null,
                };

                // Save AI response to dashboard
                await db.query(`
                    UPDATE ${dashId} SET 
                        messages = array::append(messages ?? [], $message),
                        updated_at = time::now();
                `, { message: aiMessage });

                // Broadcast AI response
                io.to(room).emit("pegasus_thinking", { thinking: false });
                io.to(room).emit("new_message", aiMessage);

            } catch (e) {
                console.error("[Socket.io] Pegasus query failed:", e);
                io.to(room).emit("pegasus_thinking", { thinking: false });
                io.to(room).emit("pegasus_error", { error: "Failed to process AI query" });
            }
        });

        // Handle disconnect
        socket.on("disconnecting", () => {
            // socket.rooms is a Set containing the socket ID and the rooms
            for (const room of socket.rooms) {
                if (room.startsWith("dashboard:")) {
                    socket.to(room).emit("user_left", { socketId: socket.id });
                }
            }
        });

        socket.on("disconnect", () => {
            console.log(`[Socket.io] User disconnected: ${socket.user.email}`);
        });

        // ========================================
        // SPREADSHEET COLLABORATION EVENTS
        // ========================================

        // spreadsheet handlers helper
        // (already defined globally)

        socket.on("join_spreadsheet", async (spreadsheetId) => {
            const room = getSpreadsheetRoom(spreadsheetId);
            if (!room) return;
            socket.join(room);
            console.log(`[Socket.io] User ${socket.user.email} joined ${room}`);

            // Broadcast presence to others in the room
            socket.to(room).emit("spreadsheet_user_joined", {
                user: socket.user,
                socketId: socket.id
            });

            // Send list of current users in room to the new user
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
            if (!room) return;
            socket.leave(room);
            console.log(`[Socket.io] User ${socket.user.email} left ${room}`);
            socket.to(room).emit("spreadsheet_user_left", { socketId: socket.id });
        });

        socket.on("cell_focus", (data) => {
            // data: { spreadsheetId, row, col }
            const room = getSpreadsheetRoom(data.spreadsheetId);
            if (!room) return;
            socket.activeCell = { row: data.row, col: data.col };

            socket.to(room).emit("cell_focus_update", {
                socketId: socket.id,
                user: socket.user,
                row: data.row,
                col: data.col
            });
        });

        socket.on("cell_edit", (data) => {
            // data: { spreadsheetId, row, col, value }
            const room = getSpreadsheetRoom(data.spreadsheetId);
            if (!room) return;

            socket.to(room).emit("cell_edit_update", {
                socketId: socket.id,
                user: socket.user,
                row: data.row,
                col: data.col,
                value: data.value
            });
        });

        socket.on("kick_all_collaborators", (spreadsheetId) => {
            const room = getSpreadsheetRoom(spreadsheetId);
            if (!room) return;
            console.log(`[Socket.io] Kicking all collaborators from ${room} (Private Mode)`);

            // Emit kick event to all in room except sender
            socket.to(room).emit("spreadsheet_kicked", {
                reason: "Owner switched to Private Mode",
                by: socket.user
            });

            // Force all sockets in room to leave
            io.in(room).socketsLeave(room);
        });
    });

    return io;
}
