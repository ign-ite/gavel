const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { bidLimiter } = require('../middleware/rateLimiter');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const AutoBid = require('../models/AutoBid');
const SnipeLog = require('../models/SnipeLog');
const AuditLog = require('../models/AuditLog');
const { pushNotification } = require('../utils/auctionHelpers');
const { broadcastAuction, broadcastGlobalActivity, trackBidActivity } = require('../services/websocket');

const auctionLocks = new Map();

function withAuctionLock(auctionId, task) {
    const key = String(auctionId);
    const active = auctionLocks.get(key) || Promise.resolve();
    const next = active
        .catch(() => {})
        .then(task)
        .finally(() => {
            if (auctionLocks.get(key) === next) auctionLocks.delete(key);
        });
    auctionLocks.set(key, next);
    return next;
}

async function applyBidToAuction(options) {
    const { auction, bidderEmail, bidderName, amount } = options;
    const numericAmount = Number(amount);
    const item = auction;

    const latestBid = await Bid.findOne({ auctionId: item._id }).sort({ placedAt: -1 });
    const previousLeaderEmail = latestBid ? latestBid.bidderEmail : null;
    const previousLeaderAmount = latestBid ? Number(latestBid.amount || 0) : 0;
    const sameLeader = previousLeaderEmail === bidderEmail;
    const holdRequired = sameLeader ? Math.max(0, numericAmount - previousLeaderAmount) : numericAmount;

    const dbUser = await User.findOne({ email: bidderEmail });
    if (!dbUser || Number(dbUser.walletBalance || 0) < holdRequired) return null;

    if (!sameLeader && previousLeaderEmail) {
        const prevUser = await User.findOne({ email: previousLeaderEmail });
        if (prevUser) {
            prevUser.walletBalance = Number(prevUser.walletBalance || 0) + previousLeaderAmount;
            await prevUser.save();
            await pushNotification(previousLeaderEmail, {
                type: 'outbid',
                title: 'You\'ve been outbid!',
                message: `Someone bid ₹${numericAmount.toLocaleString('en-IN')} on "${item.title}"`,
                actionUrl: `/item-detail.html?id=${item._id}`,
                metadata: { auctionId: item._id.toString() }
            });
        }
    }

    dbUser.walletBalance = Number(dbUser.walletBalance || 0) - holdRequired;
    await dbUser.save();

    const newBid = await Bid.create({
        auctionId: item._id,
        bidderEmail,
        bidderName,
        amount: numericAmount,
        triggeredSnipe: false
    });

    item.currentBid = numericAmount;
    item.bidCount = (item.bidCount || 0) + 1;
    await item.save();

    trackBidActivity(item._id, bidderEmail);

    await AuditLog.create({
        action: 'BID_PLACED',
        userEmail: bidderEmail,
        details: `Bid ₹${numericAmount} on ${item.title} (${item._id})`
    });

    broadcastAuction(item._id, {
        type: 'bid_update',
        itemId: String(item._id),
        newBid: numericAmount,
        bidCount: item.bidCount,
        reserve_met: numericAmount >= Number(item.reservePrice || 0)
    });

    return newBid;
}

async function resolveAutoBids(auctionId) {
    const item = await Auction.findById(auctionId);
    if (!item || item.status !== 'active') return;

    const activeAutoBids = await AutoBid.find({ auctionId, active: true }).sort({ maxAmount: -1, updatedAt: 1, createdAt: 1 });
    if (activeAutoBids.length === 0) return;

    const currentBid = Number(item.currentBid || 0);
    const increment = Number(item.increment || 500);
    const latestBid = await Bid.findOne({ auctionId: item._id }).sort({ placedAt: -1 });
    const currentLeaderEmail = latestBid?.bidderEmail || null;

    if (activeAutoBids.length === 1) {
        const ab = activeAutoBids[0];
        const nextBid = currentBid + increment;
        if (ab.bidderEmail !== currentLeaderEmail && Number(ab.maxAmount) >= nextBid) {
            const bidder = await User.findOne({ email: ab.bidderEmail });
            if (bidder && Number(bidder.walletBalance || 0) >= nextBid) {
                await applyBidToAuction({ auction: item, bidderEmail: ab.bidderEmail, bidderName: ab.bidderName, amount: nextBid });
            }
        }
        return;
    }

    const topAB = activeAutoBids[0];
    const runnerAB = activeAutoBids[1];
    const finalAmount = Math.min(Number(topAB.maxAmount), Number(runnerAB.maxAmount) + increment);
    const nextBid = Math.max(currentBid + increment, finalAmount);

    if (topAB.bidderEmail !== currentLeaderEmail && finalAmount >= currentBid + increment && Number(topAB.maxAmount) >= currentBid + increment) {
        const bidder = await User.findOne({ email: topAB.bidderEmail });
        if (bidder && Number(bidder.walletBalance || 0) >= nextBid) {
            await applyBidToAuction({ auction: item, bidderEmail: topAB.bidderEmail, bidderName: topAB.bidderName, amount: finalAmount });
        }
    }
}

async function handlePlaceBid(req, res) {
    const { bidAmount, isAuto } = req.body;
    const id = req.params.listingId;
    const amount = Number(bidAmount);
    try {
        const payload = await withAuctionLock(id, async () => {
            let item = await Auction.findById(id);
            if (!item) return { code: 404, body: { success: false, message: 'Item not found.' } };
            if (item.status !== 'active') return { code: 400, body: { success: false, message: 'This listing is not live for bidding.' } };
            if (item.endTime && item.endTime <= new Date()) return { code: 400, body: { success: false, message: 'This auction has expired.' } };
            if (item.sellerEmail === req.user.email) return { code: 403, body: { success: false, message: 'You cannot bid on your own listing.' } };
            if (!Number.isInteger(amount)) return { code: 400, body: { success: false, message: 'Bid amount must be in whole rupees only.' } };
            if (amount <= item.currentBid) return { code: 400, body: { success: false, message: `Bid must be higher than ₹${item.currentBid.toLocaleString('en-IN')}.` } };

            const latestBid = await Bid.findOne({ auctionId: item._id }).sort({ placedAt: -1 });
            const isCurrentLeader = latestBid && latestBid.bidderEmail === req.user.email;
            if (isCurrentLeader && !isAuto) return { code: 400, body: { success: false, message: 'You already hold the top bid.' } };

            if (isAuto) {
                await AutoBid.findOneAndUpdate(
                    { auctionId: item._id, bidderEmail: req.user.email },
                    { bidderName: req.user.name, maxAmount: amount, active: true },
                    { upsert: true }
                );
            } else {
                await AutoBid.findOneAndUpdate({ auctionId: item._id, bidderEmail: req.user.email }, { active: false });
            }

            const newBid = await applyBidToAuction({ auction: item, bidderEmail: req.user.email, bidderName: req.user.name, amount });
            if (!newBid) return { code: 400, body: { success: false, message: 'Insufficient funds. Please deposit to continue.' } };

            item = await Auction.findById(id);

            let extensionTriggered = false;
            let maxSnipeReached = false;
            if (item.endTime) {
                const timeLeft = item.endTime.getTime() - Date.now();
                const THREE_MIN = 3 * 60 * 1000;
                if (timeLeft > 0 && timeLeft <= THREE_MIN && (item.snipeCount || 0) < 5) {
                    const newEndTime = new Date(Date.now() + THREE_MIN);
                    item.endTime = newEndTime;
                    item.snipeCount = (item.snipeCount || 0) + 1;
                    await item.save();
                    await SnipeLog.create({ listingId: item._id, bidId: newBid._id, extensionNum: item.snipeCount, newEndTime });
                    extensionTriggered = true;
                    broadcastAuction(id, { type: 'snipe:extended', listingId: id, newEndTime: newEndTime.toISOString(), extensionNum: item.snipeCount });
                } else if (timeLeft <= THREE_MIN && (item.snipeCount || 0) >= 5) {
                    maxSnipeReached = true;
                }
            }

            await resolveAutoBids(item._id);
            const finalItem = await Auction.findById(item._id);
            const bidCount = await Bid.countDocuments({ auctionId: item._id });

            broadcastAuction(id, { type: 'bid_update', itemId: id, newBid: finalItem.currentBid, bidCount, reserve_met: finalItem.currentBid >= Number(finalItem.reservePrice || 0) });
            broadcastGlobalActivity({ message: `${req.user.name} placed ₹${finalItem.currentBid.toLocaleString('en-IN')} on "${item.title}"`, itemId: id, timestamp: new Date().toISOString() });

            return {
                code: 200,
                body: {
                    success: true,
                    newBid: finalItem.currentBid,
                    bidCount,
                    message: maxSnipeReached ? 'Bid placed, max extensions reached.' : 'Bid placed successfully!',
                    extensionTriggered
                }
            };
        });

        res.status(payload.code).json(payload.body);
    } catch (e) {
        console.error('Bid Error:', e);
        res.status(500).json({ success: false, message: 'Server error placing bid' });
    }
}

router.post('/auto-bid', requireLogin, bidLimiter, async (req, res) => {
    const { listingId, maxAmount } = req.body;
    try {
        const item = await Auction.findById(listingId);
        if (!item || item.status !== 'active') return res.status(400).json({ success: false, message: 'Only live listings can accept auto-bids.' });
        if (item.sellerEmail === req.user.email) return res.status(403).json({ success: false, message: 'Cannot auto-bid on your own listing.' });
        if (!Number.isInteger(Number(maxAmount)) || Number(maxAmount) <= Number(item.currentBid || 0))
            return res.status(400).json({ success: false, message: `Auto-bid max must be higher than ₹${Number(item.currentBid || 0).toLocaleString('en-IN')}.` });

        await AutoBid.findOneAndUpdate(
            { auctionId: item._id, bidderEmail: req.user.email },
            { bidderName: req.user.name, maxAmount: Number(maxAmount), active: true },
            { upsert: true }
        );
        await resolveAutoBids(item._id);
        res.json({ success: true, message: 'Auto-bid ceiling set.' });
    } catch (e) { res.status(500).json({ success: false, message: 'Error setting auto bid' }); }
});

router.post('/place-bid', requireLogin, bidLimiter, async (req, res) => {
    const { id, bidAmount, isAuto } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Missing auction ID.' });
    req.params.listingId = id;
    return handlePlaceBid(req, res);
});

router.post('/:listingId', requireLogin, bidLimiter, handlePlaceBid);

router.get('/:listingId', async (req, res) => {
    try {
        const rows = await Bid.find({ auctionId: req.params.listingId }).sort({ amount: -1 });
        const enrichedBids = await Promise.all(rows.map(async r => {
            const user = await User.findOne({ email: r.bidderEmail }).select('college campusVerified');
            return {
                bidderName: r.bidderName,
                bidderEmail: r.bidderEmail,
                amount: r.amount,
                placedAt: r.placedAt,
                triggeredSnipe: r.triggeredSnipe || false,
                college: user?.college,
                campusVerified: user?.campusVerified
            };
        }));

        let isRivalry = false;
        let rivalryDetails = null;
        const campusBidders = enrichedBids.filter(b => b.campusVerified && b.college);
        const uniqueCampus = [...new Set(campusBidders.map(b => b.college))];
        if (uniqueCampus.length >= 2) {
            isRivalry = true;
            rivalryDetails = { colleges: uniqueCampus };
        }

        const cleaned = enrichedBids.map(b => { const { bidderEmail, ...rest } = b; return rest; });
        res.json({ bids: cleaned, isRivalry, rivalryDetails });
    } catch (e) { res.json({ bids: [], isRivalry: false }); }
});

router.get('/:listingId/snipe-log', async (req, res) => {
    try {
        const logs = await SnipeLog.find({ listingId: req.params.listingId }).sort({ triggeredAt: -1 });
        res.json(logs);
    } catch (e) { res.json([]); }
});

router.get('/wars/active', async (req, res) => {
    try {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
        const hot = await Bid.aggregate([
            { $match: { placedAt: { $gte: thirtyMinsAgo } } },
            { $group: { _id: '$auctionId', recentBids: { $sum: 1 } } },
            { $sort: { recentBids: -1 } },
            { $limit: 20 }
        ]);
        const ids = hot.map((row) => row._id);
        const auctions = await Auction.find({ _id: { $in: ids }, status: 'active' });
        const auctionMap = Object.fromEntries(auctions.map((auction) => [String(auction._id), auction]));
        res.json(hot.map((row) => ({
            id: row._id,
            title: auctionMap[String(row._id)]?.title || 'Auction',
            currentBid: auctionMap[String(row._id)]?.currentBid || 0,
            bidCount: auctionMap[String(row._id)]?.bidCount || 0,
            endTime: auctionMap[String(row._id)]?.endTime || null,
            recentBids: row.recentBids
        })).filter((item) => item.title));
    } catch (e) { res.json([]); }
});

module.exports = router;
