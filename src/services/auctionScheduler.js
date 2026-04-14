const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Message = require('../models/Message');
const { broadcastAuction } = require('./websocket');
const { pushNotification, getConversationKey } = require('../utils/auctionHelpers');

async function closeAuction(auctionId) {
    try {
        const item = await Auction.findById(auctionId);
        if (!item || item.status !== 'active') return null;

        const highestBid = await Bid.findOne({ auctionId: auctionId }).sort({ amount: -1 });

        if (highestBid) {
            item.winnerEmail = highestBid.bidderEmail;
            item.winnerName = highestBid.bidderName;
            item.winningBid = highestBid.amount;
            item.settlement = item.settlement || {};
            item.settlement.securedAmount = Math.ceil(Number(highestBid.amount || 0) / 2);
            item.settlement.remainingAmount = Math.max(0, Number(highestBid.amount || 0) - Number(item.settlement.securedAmount || 0));
            item.settlement.deliveryCode = String(Math.floor(100000 + Math.random() * 900000));
            item.settlement.sellerWalletCredited = true;
            item.settlement.creditedAt = new Date();

            const winner = await User.findOne({ email: highestBid.bidderEmail });
            if (winner) {
                winner.trustScore = Math.min(500, Number(winner.trustScore || 0) + 5);
                await winner.save();
            }

            const seller = await User.findOne({ email: item.sellerEmail });
            if (seller) {
                seller.walletBalance = Number(seller.walletBalance || 0) + Number(item.settlement.securedAmount || 0);
                seller.trustScore = Math.min(500, Number(seller.trustScore || 0) + 5);
                await seller.save();
            }

            await pushNotification(highestBid.bidderEmail, {
                type: 'won',
                title: 'You won!',
                message: `You won "${item.title}" at ₹${highestBid.amount.toLocaleString('en-IN')}`,
                actionUrl: `/winner-confirmation.html?id=${item._id}`,
                metadata: { auctionId: item._id.toString() }
            });

            const conversationKey = getConversationKey(item._id.toString(), item.sellerEmail, highestBid.bidderEmail);
            await Message.create({
                auctionId: item._id,
                conversationKey,
                recipientEmail: highestBid.bidderEmail,
                senderEmail: item.sellerEmail,
                senderName: item.sellerName || 'Seller',
                message: `Congratulations, you have won the bid for "${item.title}" at ₹${highestBid.amount.toLocaleString('en-IN')}. ₹${Number(item.settlement.securedAmount || 0).toLocaleString('en-IN')} has already been transferred to my seller wallet from Gavel. Please pay the remaining ₹${Number(item.settlement.remainingAmount || 0).toLocaleString('en-IN')} after the product is received, as per the terms between buyer and seller. Gavel recommends settling the remaining half only after delivery confirmation. Delivery code: ${item.settlement.deliveryCode}.`
            });

            await pushNotification(item.sellerEmail, {
                type: 'auction_closed',
                title: 'Auction closed',
                message: `"${item.title}" sold for ₹${highestBid.amount.toLocaleString('en-IN')}`,
                actionUrl: `/item-detail.html?id=${item._id}`,
                metadata: { auctionId: item._id.toString() }
            });
        } else {
            await pushNotification(item.sellerEmail, {
                type: 'auction_closed',
                title: 'Auction closed',
                message: `"${item.title}" closed with no bids.`,
                actionUrl: `/my-products.html`,
                metadata: { auctionId: item._id.toString() }
            });
        }

        item.status = 'closed';
        await item.save();

        await AuditLog.create({
            action: 'AUCTION_CLOSED',
            userEmail: 'system',
            details: `Auction closed: ${item.title} (${item._id}) winner: ${item.winnerEmail || 'none'}`
        });

        broadcastAuction(auctionId, {
            type: 'auction_closed',
            itemId: String(auctionId),
            winnerEmail: item.winnerEmail,
            winnerName: item.winnerName,
            winningBid: item.winningBid
        });

        return item;
    } catch (e) {
        console.error('closeAuction error:', e);
        return null;
    }
}

async function processExpiredAuctions() {
    try {
        const expired = await Auction.find({ status: 'active', endTime: { $lte: new Date() } });
        for (const a of expired) await closeAuction(a._id);
        if (expired.length) console.log(`Closed ${expired.length} expired auction(s)`);
    } catch (e) {
        console.error('Scheduler error:', e);
    }
}

let schedulerInterval = null;

function startAuctionScheduler() {
    if (schedulerInterval) return;
    schedulerInterval = setInterval(processExpiredAuctions, 60000);
    console.log('   Scheduler  : Running (60s interval)');
}

module.exports = { closeAuction, startAuctionScheduler };
