const mongoose = require('mongoose');

const AutoBidSchema = new mongoose.Schema({
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidderEmail: { type: String, required: true },
    bidderName: { type: String, required: true },
    maxAmount: { type: Number, required: true },
    active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('AutoBid', AutoBidSchema);
