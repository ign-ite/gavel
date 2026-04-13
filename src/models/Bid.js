const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidderEmail: { type: String, required: true },
    bidderName: { type: String, required: true },
    amount: { type: Number, required: true },
    placedAt: { type: Date, default: Date.now },
    triggeredSnipe: { type: Boolean, default: false }
});

module.exports = mongoose.model('Bid', BidSchema);