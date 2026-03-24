const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    role:     { type: String, default: 'bidder', enum: ['bidder', 'seller', 'admin'] },
    trustScore: { type: Number, default: 100 },
    ratingsCount: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
    // ── Campus Rivalry (Varunkumar) ──
    college: { type: String, default: null },
    campusVerified: { type: Boolean, default: false },
    // ── Local Auth (Varunkumar) ──
    passwordHash: { type: String, required: false }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
