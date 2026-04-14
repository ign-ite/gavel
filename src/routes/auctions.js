const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { getBidCountMap, mapAuction, normalizeAuctionDescription, pushNotification, attachAuctionMedia } = require('../utils/auctionHelpers');
const { closeAuction } = require('../services/auctionScheduler');
const { broadcastAuction, broadcastGlobalActivity } = require('../services/websocket');

async function notifySavedSearches(auction) {
    const users = await User.find({ 'alertPreferences.savedSearches': { $ne: false }, 'savedSearches.0': { $exists: true } });
    const title = String(auction.title || '').toLowerCase();
    const description = String(auction.description || '').toLowerCase();
    for (const user of users) {
        const match = (user.savedSearches || []).find((search) => {
            const query = String(search.query || '').trim().toLowerCase();
            const categoryMatch = !search.category || search.category === auction.category;
            const conditionMatch = !search.condition || search.condition === auction.condition;
            const priceMatch = !search.maxPrice || Number(auction.currentBid || 0) <= Number(search.maxPrice || 0);
            const queryMatch = !query || title.includes(query) || description.includes(query);
            return queryMatch && categoryMatch && conditionMatch && priceMatch;
        });
        if (!match) continue;
        await pushNotification(user.email, {
            type: 'saved_search_match',
            title: 'Saved search match',
            message: `"${auction.title}" matches one of your saved searches.`,
            actionUrl: `/item-detail.html?id=${auction._id}`,
            metadata: { auctionId: auction._id.toString() }
        });
    }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', async (req, res) => {
    try {
        const { status, campus, sellerEmail, q, limit, sort, lightweight } = req.query;
        const query = {};
        const requestedStatuses = status
            ? String(status).split(',').map((value) => value.trim()).filter(Boolean)
            : ['active'];

        if (requestedStatuses.length === 1 && requestedStatuses[0] === 'active') {
            query.status = 'active';
            query.endTime = { $gt: new Date() };
        } else if (requestedStatuses.includes('active')) {
            query.$or = [
                { status: 'active', endTime: { $gt: new Date() } },
                { status: { $in: requestedStatuses.filter((value) => value !== 'active') } }
            ];
        } else if (requestedStatuses.length === 1) {
            query.status = requestedStatuses[0];
        } else if (requestedStatuses.length > 1) {
            query.status = { $in: requestedStatuses };
        }

        if (sellerEmail) query.sellerEmail = sellerEmail;
        if (q) {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { title: { $regex: String(q), $options: 'i' } },
                    { description: { $regex: String(q), $options: 'i' } },
                    { category: { $regex: String(q), $options: 'i' } }
                ]
            });
        }

        const sortSpec = (() => {
            switch (sort) {
                case 'endingSoon':
                case 'ending_soon':
                    return { endTime: 1, createdAt: -1 };
                case 'newest':
                    return { createdAt: -1 };
                case 'priceAsc':
                    return { currentBid: 1, createdAt: -1 };
                case 'priceDesc':
                    return { currentBid: -1, createdAt: -1 };
                default:
                    return { endTime: 1, createdAt: -1 };
            }
        })();

        const rows = await Auction.find(query).sort(sortSpec).limit(Math.min(Number(limit) || 100, 100)).lean();
        const bidCountMap = await getBidCountMap(rows.map(r => r._id));
        let mapped = await Promise.all(rows.map(r => mapAuction(r, bidCountMap, { lightweight: lightweight === '1' || lightweight === 'true' })));
        if (campus) mapped = mapped.filter((row) => row.sellerCollege === campus);
        res.json(mapped);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/closed', async (req, res) => {
    try {
        const rows = await Auction.find({ status: 'closed' }).sort({ createdAt: -1 });
        res.json(await Promise.all(rows.map(mapAuction)));
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
    try {
        const row = await Auction.findById(req.params.id);
        if (!row) return res.status(404).json({ message: 'Not found' });
        row.viewCount = Number(row.viewCount || 0) + 1;
        await row.save();
        res.json(await mapAuction(row));
    } catch (e) { res.status(404).json({ message: 'Not found' }); }
});

router.post('/sell', requireLogin, upload.fields([
    { name: 'images', maxCount: 6 }, { name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, price, reservePrice, description, endTime, category, increment } = req.body;
        const specifications = req.body.specifications ? JSON.parse(req.body.specifications) : {};
        const checklist = req.body.checklist ? JSON.parse(req.body.checklist) : {};
        const imageCount = (req.files?.images || []).length + (req.files?.image || []).length;
        const videoCount = (req.files?.video || []).length;
        const normalizedTitle = String(title || '').trim();
        const normalizedDescription = normalizeAuctionDescription(description);
        const normalizedPrice = Number(price);

        let endTimeObj = endTime ? new Date(endTime) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (endTimeObj <= new Date()) return res.status(400).send('Auction end time must be in the future.');
        if (!normalizedTitle) return res.status(400).json({ success: false, message: 'Title is required.' });
        if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) return res.status(400).json({ success: false, message: 'Starting price must be greater than zero.' });
        if (!category) return res.status(400).json({ success: false, message: 'Category is required.' });
        if (!normalizedDescription) return res.status(400).json({ success: false, message: 'Description is required.' });
        if (!imageCount) return res.status(400).json({ success: false, message: 'At least one product image is required.' });
        if (!videoCount) return res.status(400).json({ success: false, message: 'A verification video is required.' });

        const newAuction = await Auction.create({
            title: normalizedTitle,
            description: normalizedDescription,
            currentBid: parseInt(price) || 0,
            startingPrice: parseInt(price) || 0,
            reservePrice: parseInt(reservePrice) || 0,
            increment: Math.max(1, parseInt(increment) || 500),
            category,
            condition: specifications.Condition || specifications.condition || '',
            verified: false,
            sellerEmail: req.user.email,
            sellerName: req.user.name,
            endTime: endTimeObj,
            status: 'pending_review',
            specifications,
            priceHistory: [{ amount: parseInt(price) || 0, changedByEmail: req.user.email }],
            submissionChecklist: {
                authenticityStatement: Boolean(checklist.authenticityStatement),
                ownershipConfirmed: Boolean(checklist.ownershipConfirmed),
                mediaQualityConfirmed: Boolean(checklist.mediaQualityConfirmed),
                orientationConfirmed: Boolean(checklist.orientationConfirmed),
                termsAccepted: Boolean(checklist.termsAccepted)
            }
        });

        await attachAuctionMedia(newAuction, req.files || {});
        await notifySavedSearches(newAuction);

        await pushNotification(req.user.email, {
            type: 'sell_request_submitted',
            title: 'Listing submitted',
            message: `"${title}" was submitted for review.`,
            actionUrl: '/my-products.html',
            metadata: { auctionId: newAuction._id.toString() }
        });

        await AuditLog.create({
            action: 'SELL_REQUEST_CREATED', userEmail: req.user.email,
            details: `Created sell request: ${title} (${newAuction._id})`, ipAddress: req.ip
        });

        res.json({ success: true, auctionId: newAuction._id, redirectUrl: '/my-products.html' });
    } catch (err) {
        console.error('Sell error:', err);
        res.status(500).json({ success: false, message: 'Error listing the item.' });
    }
});

router.post('/end-auction', requireLogin, async (req, res) => {
    const { id } = req.body;
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.status === 'closed') return res.status(400).json({ success: false, message: 'Already closed.' });
        if (item.sellerEmail !== req.user.email && !req.user.isAdmin)
            return res.status(403).json({ success: false, message: 'Only the seller can end this auction.' });
        await closeAuction(id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: 'Error' }); }
});

router.post('/relist', requireLogin, async (req, res) => {
    try {
        const item = await Auction.findById(req.body.id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.sellerEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can only relist your own item.' });
        if (!['closed', 'rejected'].includes(item.status)) return res.status(400).json({ success: false, message: 'Only closed or rejected items can be relisted.' });
        item.status = 'pending_review';
        item.verified = false;
        item.winnerEmail = null;
        item.winnerName = null;
        item.winningBid = null;
        item.bidCount = 0;
        item.currentBid = item.startingPrice || item.currentBid;
        item.endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        item.rejectionReason = '';
        item.reviewNotes = 'Relisted by seller';
        await item.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to relist.' });
    }
});

router.post('/update-price', requireLogin, async (req, res) => {
    try {
        const { id, newPrice } = req.body;
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.sellerEmail !== req.user.email) return res.status(403).json({ success: false, message: 'Only the seller can update the price.' });
        const nextPrice = Number(newPrice);
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) return res.status(400).json({ success: false, message: 'Invalid price.' });
        const previous = Number(item.currentBid || item.startingPrice || 0);
        item.currentBid = nextPrice;
        item.startingPrice = nextPrice;
        item.priceHistory = item.priceHistory || [];
        item.priceHistory.push({ amount: nextPrice, changedByEmail: req.user.email });
        await item.save();

        if (nextPrice < previous) {
            const watchers = await User.find({ watchlist: item._id, 'alertPreferences.priceDrops': { $ne: false } });
            for (const watcher of watchers) {
                await pushNotification(watcher.email, {
                    type: 'price_drop',
                    title: 'Price drop alert',
                    message: `"${item.title}" dropped from ₹${previous.toLocaleString('en-IN')} to ₹${nextPrice.toLocaleString('en-IN')}.`,
                    actionUrl: `/item-detail.html?id=${item._id}`,
                    metadata: { auctionId: item._id.toString(), previousPrice: previous, newPrice: nextPrice }
                });
            }
        }

        res.json({ success: true, currentBid: item.currentBid });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to update price.' });
    }
});

router.post('/report', requireLogin, async (req, res) => {
    try {
        const item = await Auction.findById(req.body.auctionId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        item.reports = item.reports || [];
        item.reports.push({
            reporterEmail: req.user.email,
            category: String(req.body.category || '').trim(),
            note: String(req.body.note || '').trim()
        });
        await item.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to report.' });
    }
});

router.post('/remove-item', requireLogin, async (req, res) => {
    const { id } = req.body;
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.sellerEmail !== req.user.email && !req.user.isAdmin)
            return res.status(403).json({ success: false, message: 'You can only remove your own listings.' });
        const bidCount = await Bid.countDocuments({ auctionId: item._id });
        if (bidCount > 0 && !req.user.isAdmin)
            return res.status(400).json({ success: false, message: 'Cannot withdraw a lot that already has bids.' });
        await Auction.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: 'Error' }); }
});

module.exports = router;
