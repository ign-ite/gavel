const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    auction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    sender_email: { type: String, required: true },
    sender_name: { type: String, required: true },
    message: { type: String, required: true },
    sent_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
