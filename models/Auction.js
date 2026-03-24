const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    currentBid: { type: Number, required: true },
    image: { type: String },
    video: { type: String },
    videoUrl: { type: String },
    verified: { type: Boolean, default: false },
    sellerEmail: { type: String, required: true },
    endTime: { type: Date },
    status: { type: String, default: 'active', enum: ['active', 'closed'] },
    category: { type: String },
    reservePrice: { type: Number, default: 0 },
    winnerEmail: { type: String },
    winnerName: { type: String },
    winningBid: { type: Number },
    // v3 features — Varunkumar
    snipeCount: { type: Number, default: 0 },
    isWar: { type: Boolean, default: false },
    velocityScore: { type: Number, default: 0 },
    velocityUpdatedAt: { type: Date }
}, { timestamps: true });

// Check if auction is expired but status is active
AuctionSchema.virtual('isExpired').get(function() {
    return this.endTime && this.endTime <= new Date() && this.status === 'active';
});

module.exports = mongoose.model('Auction', AuctionSchema);
