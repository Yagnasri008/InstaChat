const express = require("express");

const {
    createConversation,
    getConversations
} = require("../controllers/conversationController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();



router.post("/", authMiddleware, createConversation);

router.get("/", authMiddleware, getConversations);

module.exports = router;