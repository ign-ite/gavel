const mongoose = require('mongoose');

const SnipeLogSchema = new mongoose.Schema({
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', required: true },
    extensionNum: { type: Number, required: true },
    newEndTime: { type: Date, required: true },
    triggeredAt: { type: Date, default: Date.now }
});

SnipeLogSchema.index({ listingId: 1 });

module.exports = mongoose.model('SnipeLog', SnipeLogSchema);