const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const User = require('../models/User');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const AuditLog = require('../models/AuditLog');
const { mapAuction, getBidCountMap, pushNotification } = require('../utils/auctionHelpers');
const { SUPABASE_URL, SUPABASE_ANON_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('../config/env');

router.get('/profile', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        const activeListings = await Auction.countDocuments({ sellerEmail: user.email, status: 'active' });
        const closedListings = await Auction.countDocuments({ sellerEmail: user.email, status: 'closed' });
        const pendingListings = await Auction.countDocuments({ sellerEmail: user.email, status: { $in: ['pending_review', 'under_review'] } });
        const rejectedListings = await Auction.countDocuments({ sellerEmail: user.email, status: 'rejected' });
        const totalBids = await Bid.countDocuments({ bidderEmail: user.email });
        const activeBids = await Bid.distinct('auctionId', { bidderEmail: user.email });
        const auctionsWon = await Auction.countDocuments({ winnerEmail: user.email, status: 'closed' });
        const watchlistCount = user.watchlist?.length || 0;

        res.json({
            id: user._id, email: user.email, name: user.fullname, role: user.role,
            college: user.college, campusVerified: user.campusVerified,
            trustScore: user.trustScore, walletBalance: user.walletBalance,
            avatar: user.avatar, bio: user.bio, location: user.location,
            stats: { activeListings, closedListings, pendingListings, rejectedListings, totalBids, activeBids: activeBids.length, auctionsWon, watchlistCount },
            createdAt: user.createdAt
        });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/my-listings', requireLogin, async (req, res) => {
    try {
        const listings = await Auction.find({ sellerEmail: req.user.email }).sort({ createdAt: -1 });
        res.json(await Promise.all(listings.map(mapAuction)));
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/watchlist', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const auctions = await Auction.find({ _id: { $in: user.watchlist || [] } });
        res.json(await Promise.all(auctions.map(mapAuction)));
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/watchlist/toggle', requireLogin, async (req, res) => {
    try {
        const { auctionId } = req.body;
        const user = await User.findById(req.user.id);
        const watchlist = user.watchlist || [];
        const idx = watchlist.indexOf(auctionId);
        let added;
        if (idx > -1) { watchlist.splice(idx, 1); added = false; }
        else { watchlist.push(auctionId); added = true; }
        user.watchlist = watchlist;
        await user.save();
        res.json({ success: true, added, watchlist });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/deposit', requireLogin, async (req, res) => {
    try {
        const { amount } = req.body;
        const num = Number(amount);
        if (!num || num <= 0) return res.status(400).json({ error: 'Invalid amount' });
        const user = await User.findById(req.user.id);
        user.walletBalance = Number(user.walletBalance || 0) + num;
        await user.save();
        await AuditLog.create({ action: 'FUNDS_DEPOSITED', userEmail: req.user.email, details: `Deposited ₹${num}`, ipAddress: req.ip });
        res.json({ success: true, newBalance: user.walletBalance });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/notifications', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json((user.notifications || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/notifications/read', requireLogin, async (req, res) => {
    try {
        const { id } = req.body;
        const user = await User.findById(req.user.id);
        if (id) {
            const n = user.notifications?.find(n => n._id.toString() === id);
            if (n) n.read = true;
        } else {
            user.notifications?.forEach(n => n.read = true);
        }
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/my-bids', requireLogin, async (req, res) => {
    try {
        const bids = await Bid.find({ bidderEmail: req.user.email }).sort({ placedAt: -1 }).limit(30).populate('auctionId');
        const enriched = bids.filter(b => b.auctionId).map(b => ({
            auctionId: b.auctionId._id, auctionTitle: b.auctionId.title,
            auctionStatus: b.auctionId.status, currentBid: b.auctionId.currentBid,
            sellerEmail: b.auctionId.sellerEmail, winnerEmail: b.auctionId.winnerEmail,
            amount: b.amount, placedAt: b.placedAt
        }));
        res.json(enriched);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/payments/razorpay/config', (req, res) => {
    res.json({ enabled: Boolean(RAZORPAY_KEY_ID), keyId: RAZORPAY_KEY_ID });
});

router.post('/payments/razorpay/order', requireLogin, async (req, res) => {
    try {
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return res.status(400).json({ error: 'Razorpay not configured' });
        const { amount } = req.body;
        const order = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64') },
            body: JSON.stringify({ amount: Number(amount) * 100, currency: 'INR', receipt: `gavel_${Date.now()}` })
        }).then(r => r.json());
        res.json({ keyId: RAZORPAY_KEY_ID, order });
    } catch (e) { res.status(500).json({ error: 'Order creation failed' }); }
});

router.post('/payments/razorpay/verify', requireLogin, async (req, res) => {
    try {
        const crypto = require('crypto');
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const expectedSig = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
        if (expectedSig !== razorpay_signature) return res.status(400).json({ error: 'Invalid signature' });
        const order = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
            headers: { Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64') }
        }).then(r => r.json());
        const amount = order.amount / 100;
        const user = await User.findById(req.user.id);
        user.walletBalance = Number(user.walletBalance || 0) + amount;
        await user.save();
        await AuditLog.create({ action: 'WALLET_TOP_UP', userEmail: req.user.email, details: `Razorpay top-up ₹${amount}` });
        res.json({ success: true, newBalance: user.walletBalance });
    } catch (e) { res.status(500).json({ error: 'Verification failed' }); }
});

router.get('/dashboard/summary', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        const email = user.email;
        const result = { user: { id: user._id, email: user.email, name: user.fullname, role: user.role, walletBalance: user.walletBalance, trustScore: user.trustScore, isAdmin: user.isAdmin || user.isSuperAdmin, isSuperAdmin: user.isSuperAdmin, campusVerified: user.campusVerified, college: user.college, avatar: user.avatar } };

        result.stats = {
            activeListings: await Auction.countDocuments({ sellerEmail: email, status: 'active' }),
            pendingListings: await Auction.countDocuments({ sellerEmail: email, status: { $in: ['pending_review', 'under_review'] } }),
            rejectedListings: await Auction.countDocuments({ sellerEmail: email, status: 'rejected' }),
            soldListings: await Auction.countDocuments({ sellerEmail: email, status: 'closed' }),
            activeBids: (await Bid.distinct('auctionId', { bidderEmail: email })).length,
            won: await Auction.countDocuments({ winnerEmail: email, status: 'closed' }),
            watchlistCount: user.watchlist?.length || 0,
            totalUsers: await User.countDocuments(),
            totalAuctions: await Auction.countDocuments(),
            totalBids: await Bid.countDocuments()
        };

        const myListings = await Auction.find({ sellerEmail: email }).sort({ createdAt: -1 }).limit(10);
        const bidCountMap = await getBidCountMap(myListings.map(a => a._id));
        result.listings = await Promise.all(myListings.map(a => mapAuction(a, bidCountMap)));

        const recentBids = await Bid.find({ bidderEmail: email }).sort({ placedAt: -1 }).limit(10).populate('auctionId');
        result.recentBids = recentBids.filter(b => b.auctionId).map(b => ({ auctionId: b.auctionId._id, title: b.auctionId.title, amount: b.amount, placedAt: b.placedAt, status: b.auctionId.status }));

        result.notifications = (user.notifications || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);

        if (user.isAdmin || user.isSuperAdmin) {
            result.adminWorkspace = {
                assignedReviews: await Auction.countDocuments({ assignedAdminEmail: email, status: { $in: ['pending_review', 'under_review'] } })
            };
        }
        if (user.isSuperAdmin) {
            const admins = await User.find({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] }).select('-passwordHash');
            const pendingReview = await Auction.find({ status: 'pending_review' });
            result.superAdminWorkspace = {
                reviewQueue: pendingReview.length,
                adminOverview: admins.map(a => ({ id: a._id, fullname: a.fullname, email: a.email, isSuperAdmin: a.isSuperAdmin }))
            };
        }

        res.json(result);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/analytics', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeAuctions = await Auction.countDocuments({ status: 'active' });
        const closedAuctions = await Auction.countDocuments({ status: 'closed' });
        const pendingRequests = await Auction.countDocuments({ status: { $in: ['pending_review', 'under_review', 'rejected'] } });
        const adminCount = await User.countDocuments({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] });
        const closed = await Auction.find({ status: 'closed', winningBid: { $gt: 0 } });
        const totalVolume = closed.reduce((acc, c) => acc + (c.winningBid || 0), 0);
        const totalBids = await Bid.countDocuments();
        res.json({ totalUsers, activeAuctions, closedAuctions, totalVolume, totalBids, pendingRequests, adminCount });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
});

router.get('/listings/:id/velocity', async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.id);
        if (!auction) return res.status(404).json({ error: 'Not found' });
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentBids = await Bid.countDocuments({ auctionId: auction._id, placedAt: { $gte: tenMinAgo } });
        const velocityScore = Math.min(100, recentBids * 20);
        if (!auction.velocityUpdatedAt || Date.now() - new Date(auction.velocityUpdatedAt).getTime() > 60000) {
            auction.velocityScore = velocityScore;
            auction.velocityUpdatedAt = new Date();
            await auction.save();
        }
        res.json({ velocityScore: auction.velocityScore || velocityScore });
    } catch (e) { res.json({ velocityScore: 0 }); }
});

module.exports = router;