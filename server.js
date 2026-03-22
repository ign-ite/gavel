/**
 * Gavel Auction Platform — Full Server (Mongoose + Supabase)
 *
 * Features:
 *   - MongoDB Atlas persistence (via Mongoose)
 *   - Supabase Authentication (Access Token cookie verified securely)
 *   - WebSocket real-time bidding, auction-closed broadcasts, and private seller/winner chat
 *   - Bid history per auction
 *   - Auction end times (timer-based) + manual early-end by seller
 *   - Winner recorded on close; seller can see winner contact details
 *   - Closed auctions stored separately
 *   - Private chat between seller and winner per auction (persistent, real-time)
 *   - Admin panel routes
 *
 * Run:
 *   node server.js
 */

require('dotenv').config();
const express    = require('express');
const path       = require('path');
const multer     = require('multer');
const fs         = require('fs');
const cookieParser = require('cookie-parser');
const http       = require('http');
const { WebSocketServer } = require('ws');
const mongoose   = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

// Mongoose Models
const User = require('./models/User');
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const Message = require('./models/Message');
const AutoBid = require('./models/AutoBid');
const AuditLog = require('./models/AuditLog');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// ─────────────────────────────────────────────
// 1. SUPABASE ADMIN & DATABASE
// ─────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gavel')
    .then(() => console.log('   Database  : MongoDB Atlas'))
    .catch(err => {
        console.error('\n❌ MongoDB Connection Error!');
        console.error('It looks like your MONGODB_URI in the .env file is either missing or invalid (like standard "cluster0.xxxxx.mongodb.net").');
        console.error('Please update your .env file with a real connection string or install MongoDB locally.\n');
    });

// ─────────────────────────────────────────────
// 2. MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch Supabase configuration for the frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Authentication Middleware
async function requireLogin(req, res, next) {
    const token = req.cookies.sb_access_token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({ success: false, message: 'Login required.', redirect: '/login.html' });
    
    // Verify the JWT with Supabase Admin
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ success: false, message: 'Invalid session.', redirect: '/login.html' });

    // Fetch the Mongoose DB User record to get roles, etc.
    const dbUser = await User.findOne({ email: user.email.toLowerCase() });
    
    // Attach to request
    req.user = {
        id: dbUser ? dbUser._id.toString() : user.id,
        email: user.email,
        name: dbUser ? dbUser.fullname : user.user_metadata?.fullname || 'User',
        role: dbUser ? dbUser.role : (user.user_metadata?.role || 'bidder')
    };
    next();
}



// Map Mongoose docs to the legacy API format expected by frontend
async function mapAuction(doc) {
    const obj = doc.toObject();
    const bidCount = await Bid.countDocuments({ auction_id: doc._id });
    return {
        id: obj._id.toString(),
        title: obj.title,
        description: obj.description,
        currentBid: obj.current_bid,
        image: obj.image,
        verificationVideo: obj.video,
        videoUrl: obj.video_url || null,
        verified: obj.verified,
        sellerEmail: obj.seller_email,
        endTime: obj.end_time,
        status: obj.status || 'active',
        winnerEmail: obj.winner_email,
        winnerName: obj.winner_name,
        winningBid: obj.winning_bid,
        category: obj.category,
        reserve_met: obj.current_bid >= (obj.reserve_price || 0),
        bidCount
    };
}

// ─────────────────────────────────────────────
// 3. FILE UPLOADS
// ─────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
let storage;
if (process.env.CLOUDINARY_URL) {
    console.log("Cloudinary URL detected. (Integration pending module install - falling back to local for now)");
    // Phase 10: Cloudinary CDN will be implemented here when keys are provided.
    // e.g., const { CloudinaryStorage } = require('multer-storage-cloudinary');
    // storage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'gavel_assets' } });
    storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
    });
} else {
    storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
    });
}
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ─────────────────────────────────────────────
// 4. WEBSOCKETS
// ─────────────────────────────────────────────
const watchers  = new Map(); // itemId  → Set<ws>  (bid watchers)
const chatRooms = new Map(); // auctionId → Set<{ws, email, name}> (chat participants)
const globalWatchers = new Set(); // Set<ws> for homepage global feed

wss.on('connection', (ws, req) => {
    let watchingId  = null;
    let chatId      = null;
    let userEmail   = null;
    let userName    = null;
    let isGlobal    = false;

    ws.on('message', async (raw) => {
        try {
            const msg = JSON.parse(raw);

            if (msg.type === 'watch_global') {
                isGlobal = true;
                globalWatchers.add(ws);
            }

            // ── Auction bid watcher ──
            if (msg.type === 'watch' && msg.itemId) {
                watchingId = String(msg.itemId);
                if (!watchers.has(watchingId)) watchers.set(watchingId, new Set());
                watchers.get(watchingId).add(ws);
                
                const count = watchers.get(watchingId).size;
                watchers.get(watchingId).forEach(client => {
                    if (client.readyState === 1) client.send(JSON.stringify({ type: 'spectator_count', count }));
                });
            }

            // ── Join a chat room ──
            if (msg.type === 'join_chat' && msg.auctionId && msg.email && msg.name) {
                chatId    = String(msg.auctionId);
                userEmail = msg.email;
                userName  = msg.name;

                if (!chatRooms.has(chatId)) chatRooms.set(chatId, new Set());
                chatRooms.get(chatId).add({ ws, email: userEmail, name: userName });
            }

            // ── Send a chat message ──
            if (msg.type === 'chat_msg' && msg.auctionId && msg.text && userEmail) {
                const aid = msg.auctionId;
                const text = String(msg.text).trim().slice(0, 2000); // 2000 char limit
                if (!text) return;

                // Verify the sender is the seller or winner of this auction
                const auction = await Auction.findById(aid);
                if (!auction) return;
                if (auction.seller_email !== userEmail && auction.winner_email !== userEmail) return;

                // Persist to DB
                await Message.create({
                    auction_id: aid,
                    sender_email: userEmail,
                    sender_name: userName,
                    message: text
                });

                // Broadcast to everyone in this chat room
                const payload = JSON.stringify({
                    type:        'chat_msg',
                    auctionId:   aid,
                    senderEmail: userEmail,
                    senderName:  userName,
                    message:     text,
                    sentAt:      new Date().toISOString()
                });

                const room = chatRooms.get(String(aid));
                if (room) {
                    room.forEach(participant => {
                        if (participant.ws.readyState === participant.ws.OPEN)
                            participant.ws.send(payload);
                    });
                }
            }
        } catch(e) {}
    });

    ws.on('close', () => {
        if (watchingId && watchers.has(watchingId)) {
            watchers.get(watchingId).delete(ws);
            
            const count = watchers.get(watchingId).size;
            watchers.get(watchingId).forEach(client => {
                if (client.readyState === 1) client.send(JSON.stringify({ type: 'spectator_count', count }));
            });
        }
        if (isGlobal) globalWatchers.delete(ws);
        if (chatId && chatRooms.has(chatId)) {
            const room = chatRooms.get(chatId);
            room.forEach(p => { if (p.ws === ws) room.delete(p); });
        }
    });
});

function broadcastAuction(itemId, payload) {
    const room = watchers.get(String(itemId));
    if (!room) return;
    const msg = JSON.stringify(payload);
    room.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(msg); });
}

function broadcastGlobalActivity(payload) {
    const msg = JSON.stringify({ type: 'global_activity', ...payload });
    globalWatchers.forEach(client => {
        if (client.readyState === 1) client.send(msg);
    });
}

// ─────────────────────────────────────────────
// 5. AUCTION CLOSE LOGIC
// ─────────────────────────────────────────────
async function closeAuction(auctionId) {
    try {
        const item = await Auction.findById(auctionId);
        if (!item || item.status === 'closed') return;

        const topBid = await Bid.findOne({ auction_id: auctionId }).sort({ amount: -1 });

        const reservePrice = item.reserve_price || 0;
        const winnerObj = topBid && topBid.amount >= reservePrice ? topBid : null;

        item.status = 'closed';
        item.winner_email = winnerObj ? winnerObj.bidder_email : null;
        item.winner_name = winnerObj ? winnerObj.bidder_name : null;
        item.winning_bid = winnerObj ? winnerObj.amount : null;
        await item.save();

        if (winnerObj) {
            // Phase 9: Trust Score Mechanic - successful transaction boosts both parties
            const sellerUser = await User.findOne({ email: item.seller_email });
            if (sellerUser) {
                sellerUser.trust_score = (sellerUser.trust_score || 100) + 5;
                sellerUser.ratings_count = (sellerUser.ratings_count || 0) + 1;
                await sellerUser.save();
            }
            const buyerUser = await User.findOne({ email: winnerObj.bidder_email });
            if (buyerUser) {
                buyerUser.trust_score = (buyerUser.trust_score || 100) + 5;
                buyerUser.ratings_count = (buyerUser.ratings_count || 0) + 1;
                await buyerUser.save();
            }
        }

        broadcastAuction(auctionId.toString(), {
            type:       'auction_closed',
            itemId:     auctionId.toString(),
            winnerName: winnerObj ? winnerObj.bidder_name : null,
            winningBid: winnerObj ? winnerObj.amount      : null,
            noBids:     !topBid,
            reserveMet: !!winnerObj
        });

        console.log(`🔨 Auction #${auctionId} "${item.title}" closed. Winner: ${winnerObj ? winnerObj.bidder_name + ' @ ₹' + winnerObj.amount : (topBid ? 'Reserve Not Met' : 'No bids')}`);
    } catch (e) {
        console.error("Error closing auction", e);
    }
}

// Auto-close check every 30 seconds
async function checkExpiredAuctions() {
    try {
        if(mongoose.connection.readyState !== 1) return;
        const expired = await Auction.find({
            status: 'active',
            end_time: { $exists: true, $ne: null, $lte: new Date() }
        });
        for (const row of expired) {
            await closeAuction(row._id);
        }
    } catch(e) {}
}
setInterval(checkExpiredAuctions, 30 * 1000);

// ─────────────────────────────────────────────
// 7. AUTH & USER SYNC ROUTES
// ─────────────────────────────────────────────

// Called by frontend to sync user data into our Mongoose DB after Supabase signup
app.post('/api/user/sync', requireLogin, async (req, res) => {
    const { email, fullname, role } = req.body;
    try {
        let user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            user = await User.create({
                fullname,
                email: email.toLowerCase().trim(),
                role: role || 'bidder'
            });
        }
        res.json({ success: true, user });
    } catch(e) {
        res.status(500).json({ error: 'Failed to sync user' });
    }
});

// Since we use Supabase for Auth on the client, /api/me just parses the cookie
app.get('/api/me', async (req, res) => {
    const token = req.cookies.sb_access_token;
    if (!token) return res.json({ loggedIn: false });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.json({ loggedIn: false });

    const dbUser = await User.findOne({ email: user.email.toLowerCase() });
    res.json({ 
        loggedIn: true, 
        user: {
            id: dbUser ? dbUser._id.toString() : user.id,
            email: user.email,
            name: dbUser ? dbUser.fullname : user.user_metadata?.fullname || 'User',
            role: dbUser ? dbUser.role : (user.user_metadata?.role || 'bidder'),
            walletBalance: dbUser ? dbUser.wallet_balance : 0
        }
    });
});

// Mock Deposit Flow
app.post('/api/deposit', requireLogin, async (req, res) => {
    try {
        const { amount } = req.body;
        const depositAmount = Number(amount);
        if(!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const dbUser = await User.findOne({ email: req.user.email });
        if(!dbUser) return res.status(404).json({ error: 'User not found' });

        dbUser.wallet_balance += depositAmount;
        await dbUser.save();

        await AuditLog.create({
            action: 'FUNDS_DEPOSITED',
            user_email: dbUser.email,
            details: `Deposited ₹${depositAmount.toLocaleString('en-IN')} (Mock Payment)`,
            ip_address: req.ip
        });

        res.json({ success: true, newBalance: dbUser.wallet_balance });
    } catch(e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout — clear the auth cookie
app.post('/api/logout', (req, res) => {
    res.clearCookie('sb_access_token', { path: '/' });
    res.json({ success: true });
});

// ─────────────────────────────────────────────
// 7.5 ADMIN ROUTES
// ─────────────────────────────────────────────

// Simple middleware to check if user has admin role from DB
const requireAdmin = async (req, res, next) => {
    const token = req.cookies.sb_access_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

        const dbUser = await User.findOne({ email: user.email.toLowerCase() });
        if (!dbUser || dbUser.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden. Admin access required.' });
        }
        req.adminUser = dbUser;
        next();
    } catch(e) {
        res.status(500).json({ error: 'Server error' });
    }
};

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch(e) { res.status(500).json({ error: 'Server error fetching users' }); }
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
        res.json(logs);
    } catch(e) { res.status(500).json({ error: 'Server error fetching logs' }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        
        // Delete all their auctions and bids
        await Auction.deleteMany({ seller_email: targetUser.email });
        await Bid.deleteMany({ bidder_email: targetUser.email });
        await User.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            action: 'USER_DELETED',
            user_email: req.adminUser.email,
            details: `Admin deleted user ${targetUser.email}`,
            ip_address: req.ip
        });

        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: 'Server error deleting user' }); }
});

app.delete('/api/admin/auctions/:id', requireAdmin, async (req, res) => {
    try {
        const target = await Auction.findById(req.params.id);
        if (!target) return res.status(404).json({ error: 'Auction not found' });
        
        await Bid.deleteMany({ auction_id: req.params.id });
        await Auction.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            action: 'AUCTION_DELETED',
            user_email: req.adminUser.email,
            details: `Admin deleted auction: ${target.title} (${req.params.id})`,
            ip_address: req.ip
        });

        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: 'Server error deleting auction' }); }
});

// ─────────────────────────────────────────────
// 8. AUCTION ROUTES
// ─────────────────────────────────────────────
app.get('/api/auctions', async (req, res) => {
    const rows = await Auction.find({ status: 'active' }).sort({ end_time: 1 });
    const mapped = await Promise.all(rows.map(mapAuction));
    res.json(mapped);
});

app.get('/api/analytics', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeAuctions = await Auction.countDocuments({ status: 'active' });
        const closedAuctions = await Auction.countDocuments({ status: 'closed' });
        
        // Sum of all winning bids (Total Volume)
        const closed = await Auction.find({ status: 'closed', winning_bid: { $gt: 0 } });
        const totalVolume = closed.reduce((acc, curr) => acc + (curr.winning_bid || 0), 0);
        
        const totalBids = await Bid.countDocuments();

        res.json({
            totalUsers, activeAuctions, closedAuctions, totalVolume, totalBids
        });
    } catch(e) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
});

app.get('/api/auctions/closed', async (req, res) => {
    const rows = await Auction.find({ status: 'closed' }).sort({ createdAt: -1 });
    const mapped = await Promise.all(rows.map(mapAuction));
    res.json(mapped);
});

app.get('/api/auction/:id', async (req, res) => {
    try {
        const row = await Auction.findById(req.params.id);
        if (!row) return res.status(404).json({ message: 'Not found' });
        res.json(await mapAuction(row));
    } catch(e) { res.status(404).json({ message: 'Not found' }); }
});

app.post('/api/sell', requireLogin, upload.fields([
    { name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, price, reserve_price, description, end_time, category } = req.body;
        const imageFile  = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : '/images/logo.png';
        const videoFile  = req.files && req.files['video'] ? `/uploads/${req.files['video'][0].filename}` : null;
        
        let endTimeObj = null;
        if (end_time) {
            endTimeObj = new Date(end_time);
            if (endTimeObj <= new Date()) return res.status(400).send('Auction end time must be in the future.');
        } else {
            // Default: 7 days from now
            endTimeObj = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        const newAuction = await Auction.create({
            title,
            description,
            current_bid: parseInt(price) || 0,
            reserve_price: parseInt(reserve_price) || 0,
            category,
            image: imageFile,
            video: videoFile,
            verified: false,
            seller_email: req.user.email,
            end_time: endTimeObj,
            status: 'active'
        });

        await AuditLog.create({
            action: 'AUCTION_CREATED',
            user_email: req.user.email,
            details: `Created auction: ${title} (${newAuction._id})`,
            ip_address: req.ip
        });

        res.redirect('/my-products.html');
    } catch (err) {
        console.error('Sell error:', err);
        res.status(500).send('Error listing the item.');
    }
});

// ─────────────────────────────────────────────
// AUTO BID SYSTEM
// ─────────────────────────────────────────────
async function resolveAutoBids(auctionId) {
    let auction = await Auction.findById(auctionId);
    if (!auction || auction.status === 'closed') return false;

    let changesMade = false;
    let keepResolving = true;

    while (keepResolving) {
        keepResolving = false;
        
        const topBid = await Bid.findOne({ auction_id: auctionId }).sort({ amount: -1 });
        if (!topBid) break;

        const opponentAutoBids = await AutoBid.find({
            auction_id: auctionId,
            active: true,
            bidder_email: { $ne: topBid.bidder_email },
            max_amount: { $gt: auction.current_bid }
        }).sort({ max_amount: -1 });

        if (opponentAutoBids.length > 0) {
            const opponent = opponentAutoBids[0];
            
            const leaderAutoBid = await AutoBid.findOne({
                auction_id: auctionId,
                active: true,
                bidder_email: topBid.bidder_email
            });

            const leaderMax = leaderAutoBid ? leaderAutoBid.max_amount : topBid.amount;

            if (opponent.max_amount > leaderMax) {
                const newBidAmount = Math.min(leaderMax + 1, opponent.max_amount);
                if (newBidAmount <= auction.current_bid) break; // safety
                
                auction.current_bid = newBidAmount;
                await auction.save();

                await Bid.create({
                    auction_id: auctionId,
                    bidder_email: opponent.bidder_email,
                    bidder_name: opponent.bidder_name,
                    amount: newBidAmount
                });
                changesMade = true;
                keepResolving = true;
            } else if (opponent.max_amount === leaderMax) {
                if (leaderMax > auction.current_bid) {
                    auction.current_bid = leaderMax;
                    await auction.save();
                    await Bid.create({
                        auction_id: auctionId,
                        bidder_email: topBid.bidder_email,
                        bidder_name: topBid.bidder_name,
                        amount: leaderMax
                    });
                    changesMade = true;
                }
                opponent.active = false;
                await opponent.save();
            } else { // opponent.max_amount < leaderMax
                const newBidAmount = opponent.max_amount + 1;
                auction.current_bid = newBidAmount;
                await auction.save();

                await Bid.create({
                    auction_id: auctionId,
                    bidder_email: topBid.bidder_email,
                    bidder_name: topBid.bidder_name,
                    amount: newBidAmount
                });
                
                opponent.active = false;
                await opponent.save();
                
                changesMade = true;
                keepResolving = true;
            }
        }
    }
    return changesMade;
}

app.post('/api/place-bid', requireLogin, async (req, res) => {
    const { id, bidAmount, isAuto } = req.body;
    const amount = Number(bidAmount);
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.status === 'closed') return res.status(400).json({ success: false, message: 'This auction has closed.' });
        if (item.end_time && item.end_time <= new Date()) return res.status(400).json({ success: false, message: 'This auction has expired.' });
        if (item.seller_email === req.user.email) return res.status(403).json({ success: false, message: 'You cannot bid on your own listing.' });
        if (amount <= item.current_bid) return res.status(400).json({ success: false, message: `Bid must exceed ₹${item.current_bid.toLocaleString('en-IN')}.` });

        // Enforce Wallet Balance (Mock Payment System)
        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser) return res.status(404).json({ success: false, message: 'User record not found.' });
        
        if (dbUser.wallet_balance < amount) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient funds. Your wallet balance is ₹${dbUser.wallet_balance.toLocaleString('en-IN')}. Please deposit more funds first.` 
            });
        }

        // If it's an auto-bid, the amount is their MAX proxy bid, and their immediate bid is current_bid + 1 (unless 0 then amount).
        let immediateBidAmount = amount;
        if (isAuto && item.current_bid > 0) {
            immediateBidAmount = item.current_bid + 1;
        }

        item.current_bid = immediateBidAmount;
        await item.save();

        await Bid.create({
            auction_id: item._id,
            bidder_email: req.user.email,
            bidder_name: req.user.name,
            amount: immediateBidAmount
        });

        // Register the auto-bid if requested
        if (isAuto) {
            await AutoBid.findOneAndUpdate(
                { auction_id: item._id, bidder_email: req.user.email },
                { bidder_name: req.user.name, max_amount: amount, active: true },
                { upsert: true }
            );
        } else {
            // Cancel any old auto-bids for this user if they placed a manual bid
            await AutoBid.findOneAndUpdate(
                { auction_id: item._id, bidder_email: req.user.email },
                { active: false }
            );
        }

        // Trigger the Auto Bid Resolution Engine
        await resolveAutoBids(item._id);

        // Fetch the fresh state after all auto-bids
        const finalItem = await Auction.findById(item._id);
        const bidCount = await Bid.countDocuments({ auction_id: item._id });
        
        broadcastAuction(id, { type: 'bid_update', itemId: id, newBid: finalItem.current_bid, bidCount });
        
        broadcastGlobalActivity({
            message: `${req.user.name} placed a trade of ₹${finalItem.current_bid.toLocaleString('en-IN')} on "${item.title}"`,
            itemId: id,
            timestamp: new Date().toISOString()
        });

        await AuditLog.create({
            action: 'BID_PLACED',
            user_email: req.user.email,
            details: `Placed ${isAuto ? 'maximum proxy ' : ''}bid of ₹${amount} on auction ${item._id}`,
            ip_address: req.ip
        });

        res.json({ success: true, newBid: finalItem.current_bid, bidCount });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Error placing bid' });
    }
});

app.post('/api/end-auction', requireLogin, async (req, res) => {
    const { id } = req.body;
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.status === 'closed') return res.status(400).json({ success: false, message: 'Already closed.' });
        if (item.seller_email !== req.user.email && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'Only the seller can end this auction.' });
        await closeAuction(id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.post('/api/remove-item', requireLogin, async (req, res) => {
    const { id } = req.body;
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.seller_email !== req.user.email && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'You can only remove your own listings.' });
        
        const bidCount = await Bid.countDocuments({ auction_id: item._id });
        if (bidCount > 0 && req.user.role !== 'admin')
            return res.status(400).json({ success: false, message: 'Cannot withdraw a lot that already has bids. Use "End Auction" instead.' });
        
        await Auction.findByIdAndDelete(id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.get('/api/bid-history/:id', async (req, res) => {
    try {
        const rows = await Bid.find({ auction_id: req.params.id }).sort({ amount: -1 }).select('bidder_name amount placed_at');
        res.json(rows.map(r => ({
            bidderName: r.bidder_name,
            amount: r.amount,
            placed_at: r.placed_at
        })));
    } catch(e) { res.json([]); }
});

app.get('/api/auction/:id/winner', requireLogin, async (req, res) => {
    try {
        const item = await Auction.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Not found.' });
        if (item.seller_email !== req.user.email && req.user.role !== 'admin')
            return res.status(403).json({ message: 'Only the seller can view winner details.' });
        if (item.status !== 'closed') return res.status(400).json({ message: 'Auction is still active.' });
        if (!item.winner_email) return res.json({ noBids: true });
        res.json({ noBids: false, name: item.winner_name, email: item.winner_email, winningBid: item.winning_bid });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// ─────────────────────────────────────────────
// 9. CHAT ROUTES
// ─────────────────────────────────────────────

app.get('/api/chat/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        if (auction.status !== 'closed') return res.status(400).json({ message: 'Chat is only available after the auction closes.' });

        const userEmail = req.user.email;
        if (auction.seller_email !== userEmail && auction.winner_email !== userEmail)
            return res.status(403).json({ message: 'Only the seller and winner can access this chat.' });

        const messages = await Message.find({ auction_id: auctionId }).sort({ sent_at: 1 });
        
        const otherEmail = userEmail === auction.seller_email ? auction.winner_email : auction.seller_email;
        const otherUser  = await User.findOne({ email: otherEmail });

        res.json({
            messages: messages.map(m => ({ senderEmail: m.sender_email, senderName: m.sender_name, message: m.message, sentAt: m.sent_at })),
            auctionTitle: auction.title,
            myEmail:      userEmail,
            otherName:    otherUser ? otherUser.fullname : 'Other Party',
            otherEmail
        });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/chat/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    const { message } = req.body;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        if (auction.status !== 'closed') return res.status(400).json({ message: 'Chat unavailable — auction still active.' });

        const userEmail = req.user.email;
        if (auction.seller_email !== userEmail && auction.winner_email !== userEmail)
            return res.status(403).json({ message: 'Only the seller and winner can chat here.' });

        const text = String(message || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: 'Message cannot be empty.' });

        await Message.create({
            auction_id: auctionId,
            sender_email: userEmail,
            sender_name: req.user.name,
            message: text
        });

        const saved = {
            senderEmail: userEmail,
            senderName:  req.user.name,
            message:     text,
            sentAt:      new Date().toISOString()
        };

        const wsPayload = JSON.stringify({ type: 'chat_msg', auctionId, ...saved });
        const room = chatRooms.get(String(auctionId));
        if (room) room.forEach(p => { if (p.ws.readyState === p.ws.OPEN) p.ws.send(wsPayload); });

        res.json({ success: true, message: saved });
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/my-chats', requireLogin, async (req, res) => {
    const email = req.user.email;
    try {
        const auctions = await Auction.find({
            status: 'closed',
            $or: [{ seller_email: email }, { winner_email: email }]
        }).sort({ createdAt: -1 });

        const result = [];
        for (const a of auctions) {
            if (!a.winner_email) continue;
            const last = await Message.findOne({ auction_id: a._id }).sort({ sent_at: -1 });
            
            const lastSent = await Message.findOne({ auction_id: a._id, sender_email: email }).sort({ sent_at: -1 });
            let unread = 0;
            if (lastSent) {
                unread = await Message.countDocuments({ auction_id: a._id, sender_email: { $ne: email }, sent_at: { $gt: lastSent.sent_at } });
            } else {
                unread = await Message.countDocuments({ auction_id: a._id, sender_email: { $ne: email } });
            }

            const otherEmail = email === a.seller_email ? a.winner_email : a.seller_email;
            const otherUser  = await User.findOne({ email: otherEmail });
            const myRole     = email === a.seller_email ? 'seller' : 'winner';

            result.push({
                auctionId:    a._id.toString(),
                auctionTitle: a.title,
                auctionImage: a.image,
                winningBid:   a.winning_bid,
                otherName:    otherUser ? otherUser.fullname : 'Other Party',
                otherEmail,
                myRole,
                lastMessage:  last ? { senderName: last.sender_name, message: last.message, sentAt: last.sent_at } : null,
                unread,
                hasBuyer:     true
            });
        }
        res.json(result);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// ─────────────────────────────────────────────
// 10. PROFILE ROUTES
// ─────────────────────────────────────────────
app.get('/api/profile', requireLogin, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const activeListings = await Auction.countDocuments({ seller_email: userEmail, status: 'active' });
        const closedListings = await Auction.countDocuments({ seller_email: userEmail, status: 'closed' });
        const totalBids = await Bid.countDocuments({ bidder_email: userEmail });
        const auctionsWon = await Auction.countDocuments({ winner_email: userEmail });
        const dbUser = await User.findOne({ email: userEmail });
        const watchlistCount = dbUser && dbUser.watchlist ? dbUser.watchlist.length : 0;
        
        // Active bids calculation
        const activeBids = await Bid.distinct('auction_id', { bidder_email: userEmail }).exec();
        const activeAuctions = await Auction.countDocuments({ _id: { $in: activeBids }, status: 'active' });

        res.json({
            id: req.user.id,
            fullname: req.user.name,
            email: userEmail,
            role: req.user.role,
            trust_score: dbUser.trust_score || 100,
            ratings_count: dbUser.ratings_count || 0,
            activeListings,
            closedListings,
            totalBids,
            walletBalance: dbUser.wallet_balance || 0,
            activeBids: activeAuctions,
            auctionsWon,
            watchlistCount
        });
    } catch(e) { res.status(500).json({}); }
});

app.get('/api/watchlist', requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findOne({ email: req.user.email }).populate('watchlist');
        if (!dbUser || !dbUser.watchlist) return res.json([]);
        
        const mapped = await Promise.all(dbUser.watchlist.map(mapAuction));
        res.json(mapped);
    } catch(e) { res.status(500).json([]); }
});

app.post('/api/watchlist/toggle', requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser) return res.status(404).json({ success: false, message: 'User not found' });
        
        const auctionId = req.body.id;
        if (!mongoose.Types.ObjectId.isValid(auctionId)) return res.status(400).json({ success: false, message: 'Invalid ID' });
        
        const index = dbUser.watchlist.indexOf(auctionId);
        let added = false;
        
        if (index === -1) {
            dbUser.watchlist.push(auctionId);
            added = true;
        } else {
            dbUser.watchlist.splice(index, 1);
        }
        
        await dbUser.save();
        res.json({ success: true, added, watchlist: dbUser.watchlist });
    } catch(e) { res.status(500).json({ success: false, message: 'Server Error' }); }
});

app.get('/api/my-bids', requireLogin, async (req, res) => {
    try {
        const rows = await Bid.find({ bidder_email: req.user.email }).sort({ placed_at: -1 }).limit(30).populate('auction_id');
        const resolved = rows.filter(r => r.auction_id).map(r => ({
            amount: r.amount,
            placed_at: r.placed_at,
            auctionTitle: r.auction_id.title,
            auctionStatus: r.auction_id.status,
            currentBid: r.auction_id.current_bid,
            winner_email: r.auction_id.winner_email,
            auctionId: r.auction_id._id.toString()
        }));
        res.json(resolved);
    } catch(e) { res.status(500).json([]); }
});

// ─────────────────────────────────────────────
// 11. ADMIN ROUTES
// ─────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    res.json({
        totalUsers:    await User.countDocuments(),
        totalAuctions: await Auction.countDocuments(),
        pendingCount:  await Auction.countDocuments({ verified: false, status: 'active' }),
        totalBids:     await Bid.countDocuments(),
        closedCount:   await Auction.countDocuments({ status: 'closed' })
    });
});
app.get('/api/admin/pending', requireAdmin, async (req, res) => {
    const pending = await Auction.find({ verified: false, status: 'active' }).sort({ createdAt: 1 });
    res.json(await Promise.all(pending.map(mapAuction)));
});
app.post('/api/admin/verify', requireAdmin, async (req, res) => {
    const { id, approve } = req.body;
    if (approve) {
        await Auction.findByIdAndUpdate(id, { verified: true });
    } else {
        await Auction.findByIdAndDelete(id);
    }
    res.json({ success: true });
});
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    res.json(await User.find().sort({ createdAt: -1 }));
});
app.post('/api/admin/promote', requireAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.body.id, { role: 'admin' });
    res.json({ success: true });
});
app.post('/api/admin/close-auction', requireAdmin, async (req, res) => {
    await closeAuction(req.body.id);
    res.json({ success: true });
});

// ─────────────────────────────────────────────
// 12. START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🔨 Gavel is open at http://localhost:${PORT}`);
    console.log(`   Database  : MongoDB Atlas`);
    console.log(`   Auth      : Supabase Client SDK + Cookies`);
    console.log(`\n`);
});