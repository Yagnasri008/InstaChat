const express = require("express");
const cors = require("cors");
const http = require("http");
require("dotenv").config();

const { Server } = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const messageRoutes = require("./routes/messageRoutes");

const authMiddleware = require("./middleware/authMiddleware");

const {
    redisClient,
    connectRedis,
    setUserOnline,
    setUserOffline,
    isUserOnline
} = require("./redisClient");

const app = express();

const server = http.createServer(app);

// =========================
// CORS
// =========================

const allowedOrigins = [
    "http://localhost:5173",
    process.env.CLIENT_URL
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (Postman, server-to-server, etc.)
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(
            new Error("Not allowed by CORS")
        );
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
};

app.use(cors(corsOptions));

// =========================
// SOCKET.IO
// =========================

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// =========================
// DATABASE + REDIS
// =========================

connectDB();
connectRedis();

// =========================
// MIDDLEWARE
// =========================

app.use(express.json());

// =========================
// ROUTES
// =========================

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

// =========================
// HEALTH CHECK
// =========================

app.get("/api/health", (req, res) => {
    res.json({
        message: "InstaChat backend is running 🚀"
    });
});

// =========================
// CHECK ONLINE STATUS
// =========================

app.get(
    "/api/users/:userId/online",
    authMiddleware,
    async (req, res) => {
        try {
            const { userId } = req.params;

            const online = await isUserOnline(userId);

            res.status(200).json({
                online
            });
        } catch (error) {
            console.error(
                "Check online status error:",
                error.message
            );

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {
    console.log(
        `User connected: ${socket.id}`
    );

    // =========================
    // USER ONLINE
    // =========================

    socket.on(
        "userOnline",
        async (userId) => {
            try {
                await setUserOnline(
                    userId,
                    socket.id
                );

                socket.userId = userId;

                console.log(
                    `🟢 User ${userId} is online`
                );
            } catch (error) {
                console.error(
                    "Set online error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // JOIN CONVERSATION
    // =========================

    socket.on(
        "joinConversation",
        (conversationId) => {
            socket.join(conversationId);

            console.log(
                `🏠 Socket ${socket.id} joined conversation: ${conversationId}`
            );
        }
    );

    // =========================
    // TYPING
    // =========================

    socket.on(
        "typing",
        ({
            conversationId,
            userId
        }) => {
            socket
                .to(conversationId)
                .emit(
                    "userTyping",
                    {
                        userId,
                        conversationId
                    }
                );
        }
    );

    socket.on(
        "stopTyping",
        ({
            conversationId,
            userId
        }) => {
            socket
                .to(conversationId)
                .emit(
                    "userStoppedTyping",
                    {
                        userId,
                        conversationId
                    }
                );
        }
    );

    // =========================
    // SEND MESSAGE
    // =========================

    socket.on(
        "sendMessage",
        ({
            conversationId,
            message
        }) => {
            console.log(
                `📨 Message received for conversation: ${conversationId}`
            );

            socket
                .to(conversationId)
                .emit(
                    "newMessage",
                    message
                );

            console.log(
                "📡 Message broadcasted to room"
            );
        }
    );

    // =========================
    // START CALL
    // =========================

    socket.on(
        "callUser",
        async ({
            callerId,
            callerName,
            receiverId,
            conversationId,
            offer
        }) => {
            console.log(
                "📞 CALL USER:",
                {
                    callerId,
                    callerName,
                    receiverId,
                    conversationId
                }
            );

            try {
                const receiverSocketId =
                    await redisClient.get(
                        `user:${receiverId}:online`
                    );

                if (!receiverSocketId) {
                    console.log(
                        "❌ Receiver is offline"
                    );

                    socket.emit(
                        "callUserOffline"
                    );

                    return;
                }

                io.to(
                    receiverSocketId
                ).emit(
                    "incomingCall",
                    {
                        callerId,
                        callerName,
                        receiverId,
                        conversationId,
                        offer
                    }
                );

                console.log(
                    `📞 Incoming call sent to socket ${receiverSocketId}`
                );
            } catch (error) {
                console.error(
                    "Call user error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // ACCEPT CALL
    // =========================

    socket.on(
        "acceptCall",
        async ({
            callerId,
            receiverId,
            conversationId,
            answer
        }) => {
            console.log(
                "✅ ACCEPT CALL:",
                {
                    callerId,
                    receiverId,
                    conversationId
                }
            );

            try {
                const callerSocketId =
                    await redisClient.get(
                        `user:${callerId}:online`
                    );

                if (!callerSocketId) {
                    console.log(
                        "❌ Caller is offline"
                    );

                    return;
                }

                io.to(
                    callerSocketId
                ).emit(
                    "callAccepted",
                    {
                        receiverId,
                        conversationId,
                        answer
                    }
                );

                console.log(
                    `📞 Call answer sent to caller socket ${callerSocketId}`
                );
            } catch (error) {
                console.error(
                    "Accept call error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // REJECT CALL
    // =========================

    socket.on(
        "rejectCall",
        async ({
            callerId,
            receiverId,
            conversationId
        }) => {
            console.log(
                "❌ REJECT CALL:",
                {
                    callerId,
                    receiverId,
                    conversationId
                }
            );

            try {
                const callerSocketId =
                    await redisClient.get(
                        `user:${callerId}:online`
                    );

                if (!callerSocketId) {
                    console.log(
                        "❌ Caller is offline"
                    );

                    return;
                }

                io.to(
                    callerSocketId
                ).emit(
                    "callRejected",
                    {
                        receiverId,
                        conversationId
                    }
                );

                console.log(
                    `📞 Call rejection sent to caller socket ${callerSocketId}`
                );
            } catch (error) {
                console.error(
                    "Reject call error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // ICE CANDIDATE
    // =========================

    socket.on(
        "iceCandidate",
        async ({
            targetUserId,
            candidate
        }) => {
            try {
                const targetSocketId =
                    await redisClient.get(
                        `user:${targetUserId}:online`
                    );

                if (!targetSocketId) {
                    return;
                }

                io.to(
                    targetSocketId
                ).emit(
                    "iceCandidate",
                    {
                        candidate,
                        fromUserId:
                            socket.userId
                    }
                );

                console.log(
                    "🧊 ICE candidate forwarded"
                );
            } catch (error) {
                console.error(
                    "ICE candidate error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // END CALL
    // =========================

    socket.on(
        "endCall",
        async ({
            targetUserId
        }) => {
            try {
                const targetSocketId =
                    await redisClient.get(
                        `user:${targetUserId}:online`
                    );

                if (!targetSocketId) {
                    return;
                }

                io.to(
                    targetSocketId
                ).emit(
                    "callEnded"
                );

                console.log(
                    `📴 Call ended and sent to ${targetSocketId}`
                );
            } catch (error) {
                console.error(
                    "End call error:",
                    error.message
                );
            }
        }
    );

    // =========================
    // DISCONNECT
    // =========================

    socket.on(
        "disconnect",
        async () => {
            try {
                if (socket.userId) {
                    await setUserOffline(
                        socket.userId
                    );

                    console.log(
                        `🔴 User ${socket.userId} is offline`
                    );
                }
            } catch (error) {
                console.error(
                    "Set offline error:",
                    error.message
                );
            }

            console.log(
                `User disconnected: ${socket.id}`
            );
        }
    );
});

// =========================
// START SERVER
// =========================

const PORT =
    process.env.PORT || 5000;

server.listen(
    PORT,
    () => {
        console.log(
            `Server running on port ${PORT}`
        );
    }
);