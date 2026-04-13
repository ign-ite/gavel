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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', async (req, res) => {
    try {
        const rows = await Auction.find({ status: 'active', endTime: { $gt: new Date() } }).sort({ endTime: 1 });
        const bidCountMap = await getBidCountMap(rows.map(r => r._id));
        res.json(await Promise.all(rows.map(r => mapAuction(r, bidCountMap))));
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

        let endTimeObj = endTime ? new Date(endTime) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (endTimeObj <= new Date()) return res.status(400).send('Auction end time must be in the future.');

        const newAuction = await Auction.create({
            title,
            description: normalizeAuctionDescription(description),
            currentBid: parseInt(price) || 0,
            startingPrice: parseInt(price) || 0,
            reservePrice: parseInt(reservePrice) || 0,
            increment: Math.max(1, parseInt(increment) || 500),
            category,
            verified: false,
            sellerEmail: req.user.email,
            sellerName: req.user.name,
            endTime: endTimeObj,
            status: 'pending_review',
            specifications,
            submissionChecklist: {
                authenticityStatement: Boolean(checklist.authenticityStatement),
                ownershipConfirmed: Boolean(checklist.ownershipConfirmed),
                mediaQualityConfirmed: Boolean(checklist.mediaQualityConfirmed),
                orientationConfirmed: Boolean(checklist.orientationConfirmed),
                termsAccepted: Boolean(checklist.termsAccepted)
            }
        });

        await attachAuctionMedia(newAuction, req.files || {});

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

        res.json({ success: true, auctionId: newAuction._id });
    } catch (err) {
        console.error('Sell error:', err);
        res.status(500).send('Error listing the item.');
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