const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    conversationKey: { type: String, index: true },
    recipientEmail: { type: String },
    senderEmail: { type: String, required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true },
    sentAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
