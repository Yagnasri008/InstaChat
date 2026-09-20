const Conversation = require("../models/conversation");

const createConversation = async (req, res) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user.userId;

        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        if (userId === currentUserId) {
            return res.status(400).json({
                message: "You cannot chat with yourself"
            });
        }

        let conversation = await Conversation.findOne({
            participants: {
                $all: [currentUserId, userId]
            }
        }).populate(
            "participants",
            "username email profilePicture"
        );

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [currentUserId, userId]
            });

            conversation = await conversation.populate(
                "participants",
                "username email profilePicture"
            );
        }

        res.status(200).json({
            conversation
        });

    } catch (error) {
        console.error(
            "Create conversation error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};

const getConversations = async (req, res) => {
    try {
        const userId = req.user.userId;

        const conversations = await Conversation.find({
            participants: userId
        })
            .populate(
                "participants",
                "username email profilePicture"
            )
            .sort({ updatedAt: -1 });

        res.status(200).json({
            conversations
        });

    } catch (error) {
        console.error(
            "Get conversations error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    createConversation,
    getConversations
};