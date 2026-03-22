const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    role:     { type: String, default: 'bidder', enum: ['bidder', 'seller', 'admin'] },
    trust_score: { type: Number, default: 100 },
    ratings_count: { type: Number, default: 0 },
    wallet_balance: { type: Number, default: 0 },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
