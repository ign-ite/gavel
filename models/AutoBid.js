const mongoose = require('mongoose');

const AutoBidSchema = new mongoose.Schema({
    auction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidder_email: { type: String, required: true },
    bidder_name: { type: String, required: true },
    max_amount: { type: Number, required: true },
    active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('AutoBid', AutoBidSchema);
