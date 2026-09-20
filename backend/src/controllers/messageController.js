const Message = require("../models/Message");
const Conversation = require("../models/conversation");

const sendMessage = async (req, res) => {
    try {
        const { conversationId, content } = req.body;
        const senderId = req.user.userId;

        if (!conversationId || !content) {
            return res.status(400).json({
                message: "Conversation ID and message content are required"
            });
        }

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                message: "Conversation not found"
            });
        }

        const isParticipant = conversation.participants.some(
            (participant) => participant.toString() === senderId
        );

        if (!isParticipant) {
            return res.status(403).json({
                message: "You are not a participant in this conversation"
            });
        }

        const message = await Message.create({
            conversation: conversationId,
            sender: senderId,
            content
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        const populatedMessage = await message.populate(
            "sender",
            "username profilePicture"
        );

        res.status(201).json({
            message: populatedMessage
        });

    } catch (error) {
        console.error("Send message error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};

const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.userId;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                message: "Conversation not found"
            });
        }

        const isParticipant = conversation.participants.some(
            (participant) => participant.toString() === userId
        );

        if (!isParticipant) {
            return res.status(403).json({
                message: "You are not a participant in this conversation"
            });
        }

        const messages = await Message.find({
            conversation: conversationId
        })
            .populate("sender", "username profilePicture")
            .sort({ createdAt: 1 });

        res.status(200).json({
            messages
        });

    } catch (error) {
        console.error("Get messages error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    sendMessage,
    getMessages
};