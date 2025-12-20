
import { Server } from "socket.io";
import { verify } from "hono/jwt";
import { db } from "../db/surreal.js";

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production";

export function initSocketServer(server, allowedOrigins) {
    const io = new Server(server, {
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
            // data: { dashboardId, content }
            const room = `dashboard:${data.dashboardId}`;
            const message = {
                id: crypto.randomUUID(),
                user: socket.user,
                content: data.content,
                timestamp: new Date().toISOString()
            };

            // 1. Save to DB
            try {
                await db.query(`
                    CREATE dashboard_message CONTENT {
                        dashboard: type::thing('dashboard', $dashboardId),
                        user: type::thing('user', $userId),
                        content: $content,
                        created_at: time::now()
                    };
                `, {
                    dashboardId: data.dashboardId,
                    userId: socket.user.id,
                    content: data.content
                });
            } catch (e) {
                console.error("[Socket.io] Failed to save message:", e);
                // We might still broadcast it, or alert the user
            }

            // 2. Broadcast to room
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
    });

    return io;
}
