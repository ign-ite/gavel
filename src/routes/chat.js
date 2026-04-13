const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Auction = require('../models/Auction');
const Message = require('../models/Message');
const User = require('../models/User');
const { getConversationKey, pushNotification } = require('../utils/auctionHelpers');
const { broadcastChat } = require('../services/websocket');

router.get('/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        const userEmail = req.user.email;
        const otherEmail = userEmail === auction.sellerEmail ? (req.query.with || auction.winnerEmail) : auction.sellerEmail;
        if (!otherEmail) return res.status(400).json({ message: 'Counterparty not found.' });
        const conversationKey = getConversationKey(auctionId, userEmail, otherEmail);

        await Message.updateMany(
            { auctionId, conversationKey, recipientEmail: userEmail, senderEmail: { $ne: userEmail }, $or: [{ readAt: null }, { readAt: { $exists: false } }] },
            { $set: { readAt: new Date() } }
        );

        const messages = await Message.find({ auctionId, conversationKey }).sort({ sentAt: 1 });
        const otherUser = await User.findOne({ email: otherEmail });

        res.json({
            messages: messages.map(m => ({ senderEmail: m.senderEmail, senderName: m.senderName, message: m.message, sentAt: m.sentAt })),
            auctionTitle: auction.title, myEmail: userEmail,
            otherName: otherUser ? otherUser.fullname : 'Other Party', otherEmail, conversationKey
        });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.post('/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    const { message, recipientEmail } = req.body;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        const userEmail = req.user.email;
        const otherEmail = recipientEmail || (userEmail === auction.sellerEmail ? auction.winnerEmail : auction.sellerEmail);
        if (!otherEmail) return res.status(400).json({ message: 'Counterparty not found.' });
        const text = String(message || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: 'Message cannot be empty.' });
        const conversationKey = getConversationKey(auctionId, userEmail, otherEmail);

        await Message.create({ auctionId, conversationKey, recipientEmail: otherEmail, senderEmail: userEmail, senderName: req.user.name, message: text });

        const saved = { senderEmail: userEmail, senderName: req.user.name, message: text, sentAt: new Date().toISOString() };
        broadcastChat(conversationKey, { type: 'chat_msg', auctionId, conversationKey, ...saved });

        res.json({ success: true, message: saved });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.get('/my-chats/list', requireLogin, async (req, res) => {
    const email = req.user.email;
    try {
        const messages = await Message.find({ $or: [{ senderEmail: email }, { recipientEmail: email }] }).sort({ sentAt: -1 });
        const auctionIds = [...new Set(messages.map(m => m.auctionId.toString()))];
        const auctions = await Auction.find({ _id: { $in: auctionIds } }).select('title sellerEmail winnerEmail images image');
        const auctionMap = Object.fromEntries(auctions.map(a => [a._id.toString(), a]));

        const chats = [];
        const seen = new Set();
        for (const msg of messages) {
            const key = msg.conversationKey;
            if (!seen.has(key)) {
                seen.add(key);
                const auction = auctionMap[msg.auctionId.toString()];
                if (auction) {
                    const otherEmail = msg.senderEmail === email ? msg.recipientEmail : msg.senderEmail;
                    const otherUser = await User.findOne({ email: otherEmail }).select('fullname');
                    const unreadCount = await Message.countDocuments({ conversationKey: key, recipientEmail: email, $or: [{ readAt: null }, { readAt: { $exists: false } }] });
                    const images = auction.images && auction.images.length ? auction.images : (auction.image ? [auction.image] : []);
                    chats.push({
                        auctionId: msg.auctionId, auctionTitle: auction.title,
                        otherEmail, otherName: otherUser?.fullname || 'Unknown',
                        lastMessage: msg.message, lastMessageAt: msg.sentAt, unreadCount,
                        image: images[0] || null,
                        role: auction.sellerEmail === email ? 'seller' : 'buyer'
                    });
                }
            }
        }
        res.json(chats);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;