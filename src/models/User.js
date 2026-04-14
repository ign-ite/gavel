const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    role:     { type: String, default: 'bidder', enum: ['bidder', 'seller', 'admin'] },
    isAdmin:  { type: Boolean, default: false },
    isSuperAdmin: { type: Boolean, default: false },
    balance:  { type: Number, default: 0 },
    avatar:   { type: String, default: '/images/default-avatar.png' },
    bio:      { type: String, default: '' },
    location: {
        city: { type: String, default: '' },
        country: { type: String, default: '' }
    },
    trustScore: { type: Number, default: 0 },
    ratings: [{
        raterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        score: { type: Number },
        comment: { type: String }
    }],
    walletBalance: { type: Number, default: 0 },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
    notifications: [{
        type: { type: String },
        title: { type: String },
        message: { type: String },
        actionUrl: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }],
    savedSearches: [{
        query: { type: String, default: '' },
        category: { type: String, default: '' },
        condition: { type: String, default: '' },
        maxPrice: { type: Number, default: 0 },
        notify: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now }
    }],
    alertPreferences: {
        priceDrops: { type: Boolean, default: true },
        savedSearches: { type: Boolean, default: true },
        outbidPush: { type: Boolean, default: true }
    },
    college: { type: String, default: null },
    campusVerified: { type: Boolean, default: false },
    hostelBlock: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    lastSeenAt: { type: Date, default: null },
    bidAgreements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
    blockedUsers: [{ type: String }],
    adminApplication: {
        status: { type: String, default: 'none', enum: ['none', 'pending', 'approved', 'rejected'] },
        qualificationChecklist: [{ type: String }],
        note: { type: String, default: '' },
        appliedAt: { type: Date },
        reviewedAt: { type: Date }
    },
    passwordHash: { type: String, required: false }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
