const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
    auction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidder_email: { type: String, required: true },
    bidder_name: { type: String, required: true },
    amount: { type: Number, required: true },
    placed_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bid', BidSchema);
