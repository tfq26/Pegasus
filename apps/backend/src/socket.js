
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
            // data: { dashboardId, content, parentId? (for threads) }
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
                timestamp: new Date().toISOString(),
                parentId: data.parentId || null, // For threaded messages
                replies: [] // Will hold reply IDs for thread organization
            };

            // Save to dashboard.messages array
            try {
                // Normalize dashboard ID
                const dashId = data.dashboardId.includes(':')
                    ? data.dashboardId
                    : `dashboard:${data.dashboardId}`;

                console.log('[Socket.io] Saving message to dashboard:', dashId);

                // Use array_append to add to messages array (create if doesn't exist)
                await db.query(`
                    UPDATE ${dashId} SET 
                        messages = array::append(messages ?? [], $message),
                        updated_at = time::now();
                `, { message });

                console.log('[Socket.io] Message saved successfully to dashboard');
            } catch (e) {
                console.error("[Socket.io] Failed to save message:", e);
            }

            // Broadcast to room
            io.to(room).emit("new_message", message);
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
