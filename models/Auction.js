const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    current_bid: { type: Number, required: true },
    image: { type: String },
    video: { type: String },
    video_url: { type: String },
    verified: { type: Boolean, default: false },
    seller_email: { type: String, required: true },
    end_time: { type: Date },
    status: { type: String, default: 'active', enum: ['active', 'closed'] },
    category: { type: String },
    reserve_price: { type: Number, default: 0 },
    winner_email: { type: String },
    winner_name: { type: String },
    winning_bid: { type: Number }
}, { timestamps: true });

// Check if auction is expired but status is active
AuctionSchema.virtual('isExpired').get(function() {
    return this.end_time && this.end_time <= new Date() && this.status === 'active';
});

module.exports = mongoose.model('Auction', AuctionSchema);
