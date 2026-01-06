
import { Server } from "socket.io";
import { verify } from "hono/jwt";
import { db } from "../db/surreal.js";

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production";

export function initSocketServer(server, allowedOrigins) {
    const io = new Server(server || undefined, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    console.log("[Socket.io] Server initialized");

    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
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
            console.error("[Socket.io] Auth failed:", err.message);
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`[Socket.io] User connected: ${socket.user.email} (${socket.id})`);

        socket.on("join_dashboard", async (dashboardId) => {
            const room = `dashboard:${dashboardId}`;
            socket.join(room);
            console.log(`[Socket.io] User ${socket.user.email} joined ${room}`);

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
                // Normalize dashboard ID
                const dashId = dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`;

                // Fetch messages directly from dashboard document
                const [dashboards] = await db.query(`SELECT messages FROM ${dashId}`);

                if (dashboards && dashboards[0] && dashboards[0].messages) {
                    console.log('[Socket.io] Chat history found:', dashboards[0].messages.length, 'messages');
                    socket.emit("chat_history", dashboards[0].messages);
                } else {
                    console.log('[Socket.io] No chat history found for dashboard');
                    socket.emit("chat_history", []);
                }
            } catch (e) {
                console.error("[Socket.io] Failed to fetch chat history:", e);
                socket.emit("chat_history", []);
            }
        });

        socket.on("leave_dashboard", (dashboardId) => {
            const room = `dashboard:${dashboardId}`;
            socket.leave(room);
            console.log(`[Socket.io] User ${socket.user.email} left ${room}`);
            socket.to(room).emit("user_left", { socketId: socket.id });
        });

        socket.on("cursor_move", (data) => {
            // data: { dashboardId, x, y }
            const room = `dashboard:${data.dashboardId}`;
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
            const room = `dashboard:${data.dashboardId}`;

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
            io.to(room).emit("new_message", message);
        });

        socket.on("edit_message", async (data) => {
            // data: { dashboardId, messageId, content }
            const room = `dashboard:${data.dashboardId}`;
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
            const room = `dashboard:${data.dashboardId}`;
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
            const room = `dashboard:${data.dashboardId}`;

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

        socket.on("join_spreadsheet", async (spreadsheetId) => {
            const room = `spreadsheet:${spreadsheetId}`;
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
            const room = `spreadsheet:${spreadsheetId}`;
            socket.leave(room);
            console.log(`[Socket.io] User ${socket.user.email} left ${room}`);
            socket.to(room).emit("spreadsheet_user_left", { socketId: socket.id });
        });

        socket.on("cell_focus", (data) => {
            // data: { spreadsheetId, row, col }
            const room = `spreadsheet:${data.spreadsheetId}`;
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
            const room = `spreadsheet:${data.spreadsheetId}`;

            socket.to(room).emit("cell_edit_update", {
                socketId: socket.id,
                user: socket.user,
                row: data.row,
                col: data.col,
                value: data.value
            });
        });

        socket.on("kick_all_collaborators", (spreadsheetId) => {
            const room = `spreadsheet:${spreadsheetId}`;
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
