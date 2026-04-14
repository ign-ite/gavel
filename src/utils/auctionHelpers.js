const Bid = require('../models/Bid');
const User = require('../models/User');
const Media = require('../models/Media');

async function getBidCountMap(auctionIds) {
    if (!auctionIds.length) return {};
    const counts = await Bid.aggregate([
        { $match: { auctionId: { $in: auctionIds } } },
        { $group: { _id: '$auctionId', count: { $sum: 1 } } }
    ]);
    return counts.reduce((acc, c) => { acc[c._id.toString()] = c.count; return acc; }, {});
}

function getConversationKey(auctionId, a, b) {
    const sorted = [a, b].sort();
    return `${auctionId}::${sorted[0]}::${sorted[1]}`;
}

async function pushNotification(userEmail, notification) {
    try {
        const user = await User.findOne({ email: userEmail });
        if (!user) return;
        if (!user.notifications) user.notifications = [];
        user.notifications.push({
            type: notification.type,
            title: notification.title,
            message: notification.message,
            actionUrl: notification.actionUrl || null,
            metadata: notification.metadata || {},
            read: false,
            createdAt: new Date()
        });
        await user.save();
    } catch (e) {
        console.error('Notification push error:', e);
    }
}

function normalizeAuctionDescription(raw) {
    if (!raw) return '';
    return raw
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getDisplayImages(obj) {
    const all = [...(obj.images || [])];
    if (obj.image && !all.includes(obj.image)) all.unshift(obj.image);
    return all;
}

function getAuctionUrgency(obj) {
    const now = Date.now();
    const earlySellActive = obj.earlySellActivatedAt && obj.earlySellDeadline && now < new Date(obj.earlySellDeadline).getTime();
    const earlySellDeadline = earlySellActive ? obj.earlySellDeadline : null;
    let hotLabel = null;
    if (earlySellActive) hotLabel = 'Early Sell';
    else if (obj.endTime) {
        const diff = new Date(obj.endTime).getTime() - now;
        if (diff <= 10 * 60 * 1000 && diff > 0) hotLabel = 'Ending Soon';
    }
    return { earlySellActive, earlySellDeadline, hotLabel };
}

async function mapAuction(doc, bidCountMap = null) {
    const bidCount = bidCountMap
        ? (bidCountMap[doc._id.toString()] || 0)
        : await Bid.countDocuments({ auctionId: doc._id });

    const seller = await User.findOne({ email: doc.sellerEmail }).select('fullname trustScore campusVerified college');
    const topBids = await Bid.find({ auctionId: doc._id }).sort({ amount: -1 }).limit(2).lean();

    let hasRivalry = false;
    if (topBids.length >= 2) {
        const b1 = await User.findOne({ email: topBids[0].bidderEmail }).select('college campusVerified');
        const b2 = await User.findOne({ email: topBids[1].bidderEmail }).select('college campusVerified');
        hasRivalry = b1?.college && b2?.college && b1.campusVerified && b2.campusVerified && b1.college !== b2.college;
    }

    const urgency = getAuctionUrgency(doc);
    const images = getDisplayImages(doc);
    const reserveMet = doc.currentBid >= Number(doc.reservePrice || 0);

    return {
        id: doc._id,
        title: doc.title,
        description: normalizeAuctionDescription(doc.description),
        currentBid: doc.currentBid,
        startingPrice: doc.startingPrice,
        reservePrice: doc.reservePrice,
        increment: doc.increment,
        bidCount,
        images,
        video: doc.video || doc.videoUrl || null,
        category: doc.category,
        sellerEmail: doc.sellerEmail,
        sellerName: doc.sellerName,
        sellerTrustScore: Number(seller?.trustScore || 0),
        sellerCampusVerified: seller?.campusVerified || false,
        sellerCollege: seller?.college || null,
        status: doc.status,
        verified: doc.verified,
        endTime: doc.endTime,
        startTime: doc.startTime,
        winnerEmail: doc.winnerEmail,
        winnerName: doc.winnerName,
        winningBid: doc.winningBid,
        snipeCount: doc.snipeCount || 0,
        isWar: doc.isWar || false,
        hasRivalry,
        reserveMet,
        velocityScore: doc.velocityScore || 0,
        viewCount: Number(doc.viewCount || 0),
        condition: doc.condition || doc.specifications?.Condition || '',
        specifications: doc.specifications || {},
        reviewNotes: doc.reviewNotes || '',
        rejectionReason: doc.rejectionReason || '',
        assignedAdminEmail: doc.assignedAdminEmail || null,
        urgency,
        createdAt: doc.createdAt
    };
}

async function storeMediaDoc(file, ownerId, kind) {
    return Media.create({
        ownerModel: 'Auction',
        ownerId,
        kind,
        fileName: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        data: file.buffer
    });
}

async function attachAuctionMedia(auction, files) {
    if (!files) return;
    const mediaIds = [];
    const imageUrls = [];
    let firstImage = null;
    let videoUrl = null;

    if (files.images) {
        for (const f of files.images) {
            const doc = await storeMediaDoc(f, auction._id, 'image');
            mediaIds.push(doc._id);
            imageUrls.push(`/api/media/${doc._id}`);
        }
    }
    if (files.image && files.image[0]) {
        const doc = await storeMediaDoc(files.image[0], auction._id, 'image');
        mediaIds.push(doc._id);
        firstImage = `/api/media/${doc._id}`;
        imageUrls.unshift(firstImage);
    }
    if (files.video && files.video[0]) {
        const doc = await storeMediaDoc(files.video[0], auction._id, 'video');
        mediaIds.push(doc._id);
        videoUrl = `/api/media/${doc._id}`;
    }

    auction.mediaIds = mediaIds;
    auction.images = imageUrls;
    auction.image = firstImage;
    auction.video = videoUrl;
    auction.videoUrl = videoUrl;
    await auction.save();
}

module.exports = {
    getBidCountMap, getConversationKey, pushNotification,
    normalizeAuctionDescription, getDisplayImages, getAuctionUrgency,
    mapAuction, storeMediaDoc, attachAuctionMedia
};
