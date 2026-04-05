const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    currentBid: { type: Number, required: true },
    bidCount: { type: Number, default: 0 },
    increment: { type: Number, default: 500 }, // Minimum next bid increment
    images: [{ type: String }], // Multi-image support
    image: { type: String }, // Legacy support (first image)
    video: { type: String },
    videoUrl: { type: String },
    verified: { type: Boolean, default: false },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerEmail: { type: String, required: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    status: { type: String, default: 'active', enum: ['draft', 'active', 'closed', 'cancelled'] },
    category: { type: String },
    startingPrice: { type: Number, default: 0 },
    reservePrice: { type: Number, default: 0 },
    shippingDetails: {
        weight: { type: Number },
        dimensions: { type: String },
        cost: { type: Number, default: 0 }
    },
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
