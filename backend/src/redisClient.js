const { createClient } = require("redis");

const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("error", (error) => {
    console.error("Redis Client Error:", error);
});

const connectRedis = async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        console.log("Redis connected successfully ✅");
    } catch (error) {
        console.error("Redis connection failed:", error.message);
    }
};

const setUserOnline = async (userId, socketId) => {
    await redisClient.set(`user:${userId}:online`, socketId);
};

const setUserOffline = async (userId) => {
    await redisClient.del(`user:${userId}:online`);
};

const isUserOnline = async (userId) => {
    const socketId = await redisClient.get(`user:${userId}:online`);
    return socketId !== null;
};

module.exports = {
    redisClient,
    connectRedis,
    setUserOnline,
    setUserOffline,
    isUserOnline
};