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

router.post('/presence/ping', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.lastSeenAt = new Date();
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
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

router.get('/saved-searches', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('savedSearches');
        res.json(user.savedSearches || []);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/saved-searches', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.savedSearches = user.savedSearches || [];
        user.savedSearches.push({
            query: String(req.body.query || '').trim(),
            category: String(req.body.category || '').trim(),
            condition: String(req.body.condition || '').trim(),
            maxPrice: Number(req.body.maxPrice || 0),
            notify: req.body.notify !== false
        });
        await user.save();
        res.json({ success: true, savedSearches: user.savedSearches });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/saved-searches/:id', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.savedSearches = (user.savedSearches || []).filter((search) => String(search._id) !== String(req.params.id));
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/block-user', requireLogin, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const user = await User.findById(req.user.id);
        user.blockedUsers = user.blockedUsers || [];
        if (!user.blockedUsers.includes(email)) user.blockedUsers.push(email);
        await user.save();
        res.json({ success: true, blockedUsers: user.blockedUsers });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
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
        const me = { id: user._id, email: user.email, fullname: user.fullname, name: user.fullname, role: user.role, walletBalance: user.walletBalance, trustScore: user.trustScore, isAdmin: user.isAdmin || user.isSuperAdmin, isSuperAdmin: user.isSuperAdmin, campusVerified: user.campusVerified, college: user.college, avatar: user.avatar };
        const result = { user: me, me };
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const closedSales = await Auction.find({ sellerEmail: email, status: 'closed', updatedAt: { $gte: monthStart } });
        const closedWins = await Auction.find({ winnerEmail: email, status: 'closed', updatedAt: { $gte: monthStart } });
        const campusBuyers = await Auction.find({ winnerEmail: { $exists: true, $ne: null }, status: 'closed' }).select('winnerEmail winnerName updatedAt');
        const profileFields = [user.fullname, user.college, user.hostelBlock, user.bio, user.avatar].filter((value) => String(value || '').trim());
        const completeness = Math.round((profileFields.length / 5) * 100);
        const reviewsGiven = await Auction.countDocuments({ 'reviews.reviewerEmail': email });

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
            totalBids: await Bid.countDocuments(),
            monthlySpent: closedWins.reduce((sum, item) => sum + Number(item.winningBid || item.currentBid || 0), 0),
            monthlyEarned: closedSales.reduce((sum, item) => sum + Number(item.winningBid || item.currentBid || 0), 0),
            unreadNotifications: (user.notifications || []).filter((n) => !n.read).length,
            profileCompleteness: completeness,
            wonPurchases: await Auction.countDocuments({ winnerEmail: email, status: 'closed' }),
            platformUsers: await User.countDocuments()
        };

        const myListings = await Auction.find({ sellerEmail: email }).sort({ createdAt: -1 }).limit(10);
        const bidCountMap = await getBidCountMap(myListings.map(a => a._id));
        result.listings = await Promise.all(myListings.map(a => mapAuction(a, bidCountMap)));

        const recentBids = await Bid.find({ bidderEmail: email }).sort({ placedAt: -1 }).limit(10).populate('auctionId');
        result.recentBids = recentBids.filter(b => b.auctionId).map(b => ({ auctionId: b.auctionId._id, title: b.auctionId.title, amount: b.amount, placedAt: b.placedAt, status: b.auctionId.status }));

        result.notifications = (user.notifications || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
        result.savedSearches = user.savedSearches || [];
        result.gamification = {
            biddingStreak: closedWins.length,
            campusRank: Math.max(1, campusBuyers.filter((entry) => entry.winnerEmail === email).length),
            profileCompleteness: completeness,
            monthlySpent: result.stats.monthlySpent,
            monthlyEarned: result.stats.monthlyEarned,
            reviewsGiven
        };
        const watchlistItems = await Auction.find({ _id: { $in: user.watchlist || [] } }).sort({ endTime: 1 }).limit(10);
        result.watchlist = await Promise.all(watchlistItems.map(mapAuction));
        result.salesHistory = closedSales.slice(0, 10).map((item) => ({
            id: item._id,
            title: item.title,
            winningBid: item.winningBid,
            currentBid: item.currentBid,
            winnerEmail: item.winnerEmail
        }));
        result.purchaseHistory = closedWins.slice(0, 10).map((item) => ({
            id: item._id,
            title: item.title,
            winningBid: item.winningBid,
            currentBid: item.currentBid,
            sellerEmail: item.sellerEmail
        }));
        const walletLogs = await AuditLog.find({ userEmail: email, action: { $in: ['FUNDS_DEPOSITED', 'WALLET_TOP_UP', 'BID_PLACED'] } }).sort({ createdAt: -1 }).limit(10);
        result.walletActivity = walletLogs;

        if (user.isAdmin || user.isSuperAdmin) {
            const assignedRequests = await Auction.find({ assignedAdminEmail: email, status: { $in: ['pending_review', 'under_review'] } }).sort({ createdAt: 1 });
            result.adminWorkspace = {
                assignedReviews: assignedRequests.length,
                assignedRequests: await Promise.all(assignedRequests.map(mapAuction)),
                pendingTally: assignedRequests.length
            };
        }
        if (user.isSuperAdmin) {
            const admins = await User.find({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] }).select('-passwordHash');
            const pendingReview = await Auction.find({ status: 'pending_review' });
            const underReview = await Auction.find({ status: 'under_review' });
            const rejected = await Auction.find({ status: 'rejected' }).sort({ reviewedAt: -1 }).limit(20);
            const onlineWindow = new Date(Date.now() - 2 * 60 * 1000);
            const adminEmails = admins.map((a) => a.email);
            const assignedCountsAgg = await Auction.aggregate([
                { $match: { assignedAdminEmail: { $in: adminEmails }, status: { $in: ['pending_review', 'under_review'] } } },
                { $group: { _id: '$assignedAdminEmail', count: { $sum: 1 } } }
            ]);
            const approvedCountsAgg = await Auction.aggregate([
                { $match: { reviewedByEmail: { $in: adminEmails }, status: 'active' } },
                { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
            ]);
            const rejectedCountsAgg = await Auction.aggregate([
                { $match: { reviewedByEmail: { $in: adminEmails }, status: 'rejected' } },
                { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
            ]);
            const assignedMap = Object.fromEntries(assignedCountsAgg.map((row) => [row._id, row.count]));
            const approvedMap = Object.fromEntries(approvedCountsAgg.map((row) => [row._id, row.count]));
            const rejectedMap = Object.fromEntries(rejectedCountsAgg.map((row) => [row._id, row.count]));
            result.superAdminWorkspace = {
                reviewQueue: pendingReview,
                admins: admins.map(a => ({ id: a._id, fullname: a.fullname, email: a.email, isSuperAdmin: a.isSuperAdmin, online: Boolean(a.lastSeenAt && a.lastSeenAt >= onlineWindow), assignedCount: assignedMap[a.email] || 0, approvedCount: approvedMap[a.email] || 0, rejectedCount: rejectedMap[a.email] || 0 })),
                candidates: (await User.find({ isAdmin: false, isSuperAdmin: false }).limit(20).select('fullname email role')).map((candidate) => ({ id: candidate._id, fullname: candidate.fullname, email: candidate.email, role: candidate.role })),
                metrics: { reviewQueue: pendingReview.length, unassigned: pendingReview.length, underReview: underReview.length, rejected: rejected.length },
                assignableReviewers: admins.filter((a) => a.lastSeenAt && a.lastSeenAt >= onlineWindow).map(a => ({ id: a._id, fullname: a.fullname, email: a.email, online: true })),
                adminOverview: admins.map(a => ({ id: a._id, fullname: a.fullname, email: a.email, isSuperAdmin: a.isSuperAdmin })),
                rejectionLog: rejected.map((item) => ({ title: item.title, sellerEmail: item.sellerEmail, reviewedByEmail: item.reviewedByEmail, rejectionReason: item.rejectionReason, reviewNotes: item.reviewNotes, reviewedAt: item.reviewedAt }))
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

router.post('/admin-application', requireLogin, async (req, res) => {
    try {
        const { qualificationChecklist, note } = req.body;
        const user = await User.findById(req.user.id);
        user.adminApplication = {
            status: 'pending',
            qualificationChecklist: Array.isArray(qualificationChecklist) ? qualificationChecklist : [],
            note: String(note || '').trim(),
            appliedAt: new Date(),
            reviewedAt: null
        };
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save application' });
    }
});

router.get('/winner/:auctionId', requireLogin, async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.auctionId);
        if (!auction) return res.status(404).json({ error: 'Auction not found' });
        if (!auction.winnerEmail) return res.json({ noBids: true });
        res.json({ email: auction.winnerEmail, name: auction.winnerName, winningBid: auction.winningBid, sellerEmail: auction.sellerEmail });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/meetup/:auctionId', requireLogin, async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.auctionId);
        if (!auction) return res.status(404).json({ error: 'Auction not found' });
        if (![auction.sellerEmail, auction.winnerEmail].includes(req.user.email)) return res.status(403).json({ error: 'Unauthorized' });
        auction.meetupSchedule = {
            proposedByEmail: req.user.email,
            proposedSlot: String(req.body.slot || '').trim(),
            location: String(req.body.location || '').trim(),
            notes: String(req.body.notes || '').trim(),
            status: 'proposed'
        };
        await auction.save();
        const other = req.user.email === auction.sellerEmail ? auction.winnerEmail : auction.sellerEmail;
        if (other) {
            await pushNotification(other, {
                type: 'meetup_proposed',
                title: 'Meetup proposed',
                message: `${req.user.name} suggested ${auction.meetupSchedule.proposedSlot || 'a meetup time'} for "${auction.title}".`,
                actionUrl: `/chat.html?auction=${auction._id}&with=${encodeURIComponent(req.user.email)}`,
                metadata: { auctionId: auction._id.toString() }
            });
        }
        res.json({ success: true, meetupSchedule: auction.meetupSchedule });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/reviews/:auctionId', requireLogin, async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.auctionId);
        if (!auction) return res.status(404).json({ error: 'Auction not found' });
        if (![auction.sellerEmail, auction.winnerEmail].includes(req.user.email)) return res.status(403).json({ error: 'Unauthorized' });
        const reviewerRole = req.user.email === auction.sellerEmail ? 'seller' : 'buyer';
        auction.reviews = auction.reviews || [];
        auction.reviews.push({
            reviewerEmail: req.user.email,
            reviewerRole,
            score: Number(req.body.score || 0),
            comment: String(req.body.comment || '').trim()
        });
        await auction.save();
        const otherEmail = req.user.email === auction.sellerEmail ? auction.winnerEmail : auction.sellerEmail;
        const otherUser = otherEmail ? await User.findOne({ email: otherEmail }) : null;
        if (otherUser) {
            otherUser.ratings = otherUser.ratings || [];
            otherUser.ratings.push({ score: Number(req.body.score || 0), comment: String(req.body.comment || '').trim() });
            const trustDelta = Math.max(-2, Math.min(5, Number(req.body.score || 0) - 2));
            otherUser.trustScore = Math.max(0, Math.min(500, Number(otherUser.trustScore || 0) + trustDelta));
            await otherUser.save();
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/receipt/:auctionId', requireLogin, async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.auctionId);
        if (!auction) return res.status(404).json({ error: 'Auction not found' });
        if (![auction.sellerEmail, auction.winnerEmail].includes(req.user.email)) return res.status(403).json({ error: 'Unauthorized' });
        res.json({
            id: auction._id,
            title: auction.title,
            finalPrice: auction.winningBid || auction.currentBid,
            sellerEmail: auction.sellerEmail,
            winnerEmail: auction.winnerEmail,
            date: auction.updatedAt,
            meetupSchedule: auction.meetupSchedule || null
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
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
