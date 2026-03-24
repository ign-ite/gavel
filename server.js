/**
 * Gavel Auction Platform — Full Server (Mongoose + Supabase)
 *
 * Owner: Varunkumar (Backend & API Features)
 * 
 * Routes Included:
 *   - /api/auth/*     (Local JWT & Login Hooks)
 *   - /api/user/*     (Sync endpoints)
 *   - /api/bids/*     (Bid placement, history, auto-bid, snipe logs, war detectors)
 *   - /api/auctions/* (Listing retrievals, velocity scores)
 *   - /api/admin/*    (Admin moderation & stats)
 *   - /api/chat/*     (Post-auction buyer/seller comms)
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
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gavel-super-secret-key-2024';

// Mongoose Models
const User = require('./models/User');
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const Message = require('./models/Message');
const AutoBid = require('./models/AutoBid');
const AuditLog = require('./models/AuditLog');
const SnipeLog = require('./models/SnipeLog');

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

// ─────────────────────────────────────────────
// 2.5 LOCAL AUTHENTICATION (Varunkumar)
// ─────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullname, email, password, college } = req.body;
        if (!fullname || !email || !password) return res.status(400).json({ error: 'Missing fields' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        // Campus domain verification — Enhanced for Indian Institutes per User Request
        const isEdu = email.endsWith('.edu');
        const isAcIn = email.endsWith('.ac.in');
        const indianInstitutes = ['.ernet.in', '.nit.ac.in', '.iit.ac.in', '.iiit.ac.in'];
        const isIndianInst = indianInstitutes.some(domain => email.endsWith(domain));
        
        const campusVerified = isEdu || isAcIn || isIndianInst;

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullname,
            email: email.toLowerCase(),
            passwordHash,
            college: college || null,
            campusVerified
        });

        const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.cookie('jwt_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, user: { email: newUser.email, name: newUser.fullname, campusVerified } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.cookie('jwt_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, user: { email: user.email, name: user.fullname, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.get('/api/auth/me', requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findOne({ email: req.user.email });
        res.json({
            id: dbUser._id,
            email: dbUser.email,
            name: dbUser.fullname,
            role: dbUser.role,
            college: dbUser.college,
            campusVerified: dbUser.campusVerified,
            walletBalance: dbUser.walletBalance
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Fetch Supabase configuration for the frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Authentication Middleware (Supports Supabase Auth & Local JWT)
async function requireLogin(req, res, next) {
    const token = req.cookies.sb_access_token || req.cookies.jwt_token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({ success: false, message: 'Login required.', redirect: '/login.html' });
    
    try {
        // 1. Try Local JWT verification first
        const decoded = jwt.verify(token, JWT_SECRET);
        const dbUser = await User.findById(decoded.id);
        if (!dbUser) throw new Error('User not found in DB');

        req.user = {
            id: dbUser._id.toString(),
            email: dbUser.email,
            name: dbUser.fullname,
            role: dbUser.role
        };
        return next();
    } catch (jwtError) {
        // 2. JWT failed, try Supabase verification as fallback
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, message: 'Invalid session.', redirect: '/login.html' });

        const dbUser = await User.findOne({ email: user.email.toLowerCase() });
        
        req.user = {
            id: dbUser ? dbUser._id.toString() : user.id,
            email: user.email,
            name: dbUser ? dbUser.fullname : (user.user_metadata?.fullname || 'User'),
            role: dbUser ? dbUser.role : (user.user_metadata?.role || 'bidder')
        };
        return next();
    }
}



// Map Mongoose docs to the legacy API format expected by frontend
async function mapAuction(doc) {
    const obj = doc.toObject();
    const bidCount = await Bid.countDocuments({ auctionId: doc._id });
    return {
        id: obj._id.toString(),
        title: obj.title,
        description: obj.description,
        currentBid: obj.currentBid,
        image: obj.image,
        verificationVideo: obj.video,
        videoUrl: obj.videoUrl || null,
        verified: obj.verified,
        sellerEmail: obj.sellerEmail,
        endTime: obj.endTime,
        status: obj.status || 'active',
        winnerEmail: obj.winnerEmail,
        winnerName: obj.winnerName,
        winningBid: obj.winningBid,
        category: obj.category,
        reserve_met: obj.currentBid >= (obj.reservePrice || 0),
        bidCount,
        velocityScore: obj.velocityScore || 0
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

// ── Bid War Detector — in-memory tracker (Varunkumar) ──
// Stores the last 5 bids per listing: Map<auctionId, Array<{email, timestamp}>>
const bidActivityTracker = new Map();

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
                if (auction.sellerEmail !== userEmail && auction.winnerEmail !== userEmail) return;

                // Persist to DB
                await Message.create({
                    auctionId: aid,
                    senderEmail: userEmail,
                    senderName: userName,
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

        const topBid = await Bid.findOne({ auctionId: auctionId }).sort({ amount: -1 });

        const reservePrice = item.reservePrice || 0;
        const winnerObj = topBid && topBid.amount >= reservePrice ? topBid : null;

        item.status = 'closed';
        item.winnerEmail = winnerObj ? winnerObj.bidderEmail : null;
        item.winnerName = winnerObj ? winnerObj.bidderName : null;
        item.winningBid = winnerObj ? winnerObj.amount : null;
        await item.save();

        if (winnerObj) {
            // Phase 9: Trust Score Mechanic - successful transaction boosts both parties
            const sellerUser = await User.findOne({ email: item.sellerEmail });
            if (sellerUser) {
                sellerUser.trustScore = (sellerUser.trustScore || 100) + 5;
                sellerUser.ratingsCount = (sellerUser.ratingsCount || 0) + 1;
                await sellerUser.save();
            }
            const buyerUser = await User.findOne({ email: winnerObj.bidderEmail });
            if (buyerUser) {
                buyerUser.trustScore = (buyerUser.trustScore || 100) + 5;
                buyerUser.ratingsCount = (buyerUser.ratingsCount || 0) + 1;
                await buyerUser.save();
            }
        }

        broadcastAuction(auctionId.toString(), {
            type:       'auction_closed',
            itemId:     auctionId.toString(),
            winnerName: winnerObj ? winnerObj.bidderName : null,
            winningBid: winnerObj ? winnerObj.amount      : null,
            noBids:     !topBid,
            reserveMet: !!winnerObj
        });

        console.log(`🔨 Auction #${auctionId} "${item.title}" closed. Winner: ${winnerObj ? winnerObj.bidderName + ' @ ₹' + winnerObj.amount : (topBid ? 'Reserve Not Met' : 'No bids')}`);
    } catch (e) {
        console.error("Error closing auction", e);
    }
}

// Since we use Supabase for Auth on the client, /api/me just parses the cookie
app.get('/api/me', async (req, res) => {
    try {
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
                walletBalance: dbUser ? dbUser.walletBalance : 0
            }
        });
    } catch (e) {
        res.json({ loggedIn: false });
    }
});

// Mock Deposit Flow
app.post('/api/deposit', requireLogin, async (req, res) => {
    try {
        const { amount } = req.body;
        const depositAmount = Number(amount);
        if(!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const dbUser = await User.findOne({ email: req.user.email });
        if(!dbUser) return res.status(404).json({ error: 'User not found' });

        dbUser.walletBalance += depositAmount;
        await dbUser.save();

        await AuditLog.create({
            action: 'FUNDS_DEPOSITED',
            userEmail: dbUser.email,
            details: `Deposited ₹${depositAmount.toLocaleString('en-IN')} (Mock Payment)`,
            ipAddress: req.ip
        });

        res.json({ success: true, newBalance: dbUser.walletBalance });
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
        await Auction.deleteMany({ sellerEmail: targetUser.email });
        await Bid.deleteMany({ bidderEmail: targetUser.email });
        await User.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            action: 'USER_DELETED',
            userEmail: req.adminUser.email,
            details: `Admin deleted user ${targetUser.email}`,
            ipAddress: req.ip
        });

        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: 'Server error deleting user' }); }
});

app.delete('/api/admin/auctions/:id', requireAdmin, async (req, res) => {
    try {
        const target = await Auction.findById(req.params.id);
        if (!target) return res.status(404).json({ error: 'Auction not found' });
        
        await Bid.deleteMany({ auctionId: req.params.id });
        await Auction.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            action: 'AUCTION_DELETED',
            userEmail: req.adminUser.email,
            details: `Admin deleted auction: ${target.title} (${req.params.id})`,
            ipAddress: req.ip
        });

        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: 'Server error deleting auction' }); }
});

// ─────────────────────────────────────────────
// 8. AUCTION ROUTES
// ─────────────────────────────────────────────
app.get('/api/auctions', async (req, res) => {
    try {
        const rows = await Auction.find({ status: 'active' }).sort({ endTime: 1 });
        const mapped = await Promise.all(rows.map(mapAuction));
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/analytics', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeAuctions = await Auction.countDocuments({ status: 'active' });
        const closedAuctions = await Auction.countDocuments({ status: 'closed' });
        
        // Sum of all winning bids (Total Volume)
        const closed = await Auction.find({ status: 'closed', winningBid: { $gt: 0 } });
        const totalVolume = closed.reduce((acc, curr) => acc + (curr.winningBid || 0), 0);
        
        const totalBids = await Bid.countDocuments();

        res.json({
            totalUsers, activeAuctions, closedAuctions, totalVolume, totalBids
        });
    } catch(e) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
});

app.get('/api/auctions/closed', async (req, res) => {
    try {
        const rows = await Auction.find({ status: 'closed' }).sort({ createdAt: -1 });
        const mapped = await Promise.all(rows.map(mapAuction));
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
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
        const { title, price, reservePrice, description, endTime, category } = req.body;
        const imageFile  = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : '/images/logo.png';
        const videoFile  = req.files && req.files['video'] ? `/uploads/${req.files['video'][0].filename}` : null;
        
        let endTimeObj = null;
        if (endTime) {
            endTimeObj = new Date(endTime);
            if (endTimeObj <= new Date()) return res.status(400).send('Auction end time must be in the future.');
        } else {
            // Default: 7 days from now
            endTimeObj = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        const newAuction = await Auction.create({
            title,
            description,
            currentBid: parseInt(price) || 0,
            reservePrice: parseInt(reservePrice) || 0,
            category,
            image: imageFile,
            video: videoFile,
            verified: false,
            sellerEmail: req.user.email,
            endTime: endTimeObj,
            status: 'active'
        });

        await AuditLog.create({
            action: 'AUCTION_CREATED',
            userEmail: req.user.email,
            details: `Created auction: ${title} (${newAuction._id})`,
            ipAddress: req.ip
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
        
        const topBid = await Bid.findOne({ auctionId: auctionId }).sort({ amount: -1 });
        if (!topBid) break;

        const opponentAutoBids = await AutoBid.find({
            auctionId: auctionId,
            active: true,
            bidderEmail: { $ne: topBid.bidderEmail },
            maxAmount: { $gt: auction.currentBid }
        }).sort({ maxAmount: -1 });

        if (opponentAutoBids.length > 0) {
            const opponent = opponentAutoBids[0];
            
            const leaderAutoBid = await AutoBid.findOne({
                auctionId: auctionId,
                active: true,
                bidderEmail: topBid.bidderEmail
            });

            const leaderMax = leaderAutoBid ? leaderAutoBid.maxAmount : topBid.amount;

            if (opponent.maxAmount > leaderMax) {
                const newBidAmount = Math.min(leaderMax + 1, opponent.maxAmount);
                if (newBidAmount <= auction.currentBid) break; // safety
                
                auction.currentBid = newBidAmount;
                await auction.save();

                await Bid.create({
                    auctionId: auctionId,
                    bidderEmail: opponent.bidderEmail,
                    bidderName: opponent.bidderName,
                    amount: newBidAmount
                });
                changesMade = true;
                keepResolving = true;
            } else if (opponent.maxAmount === leaderMax) {
                if (leaderMax > auction.currentBid) {
                    auction.currentBid = leaderMax;
                    await auction.save();
                    await Bid.create({
                        auctionId: auctionId,
                        bidderEmail: topBid.bidderEmail,
                        bidderName: topBid.bidderName,
                        amount: leaderMax
                    });
                    changesMade = true;
                }
                opponent.active = false;
                await opponent.save();
            } else { // opponent.maxAmount < leaderMax
                const newBidAmount = opponent.maxAmount + 1;
                auction.currentBid = newBidAmount;
                await auction.save();

                await Bid.create({
                    auctionId: auctionId,
                    bidderEmail: topBid.bidderEmail,
                    bidderName: topBid.bidderName,
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

app.post('/api/bids/auto-bid', requireLogin, async (req, res) => {
    const { listingId, maxAmount } = req.body;
    try {
        const item = await Auction.findById(listingId);
        if (!item || item.status === 'closed') return res.status(400).json({ success: false, message: 'Invalid or closed auction.' });

        await AutoBid.findOneAndUpdate(
            { auctionId: item._id, bidderEmail: req.user.email },
            { bidderName: req.user.name, maxAmount: Number(maxAmount), active: true },
            { upsert: true }
        );

        // Instantly trigger engine to act on this
        await resolveAutoBids(item._id);
        res.json({ success: true, message: 'Auto-bid ceiling set.' });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Error setting auto bid' });
    }
});

app.post('/api/bids/:listingId', requireLogin, async (req, res) => {
    const { bidAmount } = req.body;
    const id = req.params.listingId;
    const amount = Number(bidAmount);
    try {
        const item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.status === 'closed') return res.status(400).json({ success: false, message: 'This auction has closed.' });
        if (item.endTime && item.endTime <= new Date()) return res.status(400).json({ success: false, message: 'This auction has expired.' });
        if (item.sellerEmail === req.user.email) return res.status(403).json({ success: false, message: 'You cannot bid on your own listing.' });
        if (amount <= item.currentBid) return res.status(400).json({ success: false, message: `Bid must exceed ₹${item.currentBid.toLocaleString('en-IN')}.` });

        // Enforce Wallet Balance
        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser || dbUser.walletBalance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient funds.' });
        }

        item.currentBid = amount;
        await item.save();

        const newBid = await Bid.create({
            auctionId: item._id,
            bidderEmail: req.user.email,
            bidderName: req.user.name,
            amount: amount
        });

        // ── Anti-Snipe Engine (Varunkumar) ──
        // Evaluates if bid is within 3 minutes of end. If max extensions (5) are not reached, adds 3 minutes.
        let extensionTriggered = false;
        let maxSnipeReached = false;

        if (item.endTime) {
            const timeLeft = item.endTime.getTime() - Date.now();
            const THREE_MINUTES = 3 * 60 * 1000;
            const currentSnipeCount = item.snipeCount || 0;

            if (timeLeft > 0 && timeLeft <= THREE_MINUTES) {
                if (currentSnipeCount < 5) {
                    const newEndTime = new Date(Date.now() + THREE_MINUTES);
                    item.endTime = newEndTime;
                    item.snipeCount = currentSnipeCount + 1;
                    await item.save();

                    newBid.triggeredSnipe = true;
                    await newBid.save();

                    await SnipeLog.create({
                        listingId: item._id,
                        bidId: newBid._id,
                        extensionNum: item.snipeCount,
                        newEndTime: newEndTime,
                        triggeredAt: new Date()
                    });

                    broadcastAuction(id, {
                        type: 'snipe:extended',
                        listingId: id,
                        newEndTime: newEndTime.toISOString(),
                        extensionNum: item.snipeCount
                    });

                    extensionTriggered = true;
                } else {
                    maxSnipeReached = true;
                }
            }
        }

        // Cancel any old auto-bids for this user if they placed a manual bid
        await AutoBid.findOneAndUpdate(
            { auctionId: item._id, bidderEmail: req.user.email },
            { active: false }
        );

        // Trigger the Auto Bid Resolution Engine (this may add another bid)
        await resolveAutoBids(item._id);

        const finalItem = await Auction.findById(item._id);
        const bidCount = await Bid.countDocuments({ auctionId: item._id });
        
        broadcastAuction(id, { type: 'bid_update', itemId: id, newBid: finalItem.currentBid, bidCount });
        broadcastGlobalActivity({
            message: `${req.user.name} placed a trade of ₹${finalItem.currentBid.toLocaleString('en-IN')} on "${item.title}"`,
            itemId: id,
            timestamp: new Date().toISOString()
        });

        // ── Bid War Detector (Varunkumar) ──
        const auctionKey = id.toString();
        if (!bidActivityTracker.has(auctionKey)) bidActivityTracker.set(auctionKey, []);
        const tracker = bidActivityTracker.get(auctionKey);
        tracker.push({ email: req.user.email, timestamp: Date.now() });
        if (tracker.length > 5) tracker.splice(0, tracker.length - 5);

        const NINETY_SECONDS = 90 * 1000;
        const recentBids = tracker.filter(b => b.timestamp >= Date.now() - NINETY_SECONDS);
        const uniqueBidders = new Set(recentBids.map(b => b.email));

        if (uniqueBidders.size >= 2) {
            if (!finalItem.isWar) {
                finalItem.isWar = true;
                await finalItem.save();
            }
            broadcastGlobalActivity({
                type: 'war:declared',
                listingId: id,
                title: item.title,
                isWar: true
            });
            broadcastAuction(id, {
                type: 'war:declared',
                listingId: id,
                title: item.title,
                isWar: true
            });
        }

        // ── Bid Velocity Calculator (Varunkumar) ──
        const TEN_MINUTES = 10 * 60 * 1000;
        const recentBidCountCalc = await Bid.countDocuments({
            auctionId: item._id,
            placedAt: { $gte: new Date(Date.now() - TEN_MINUTES) }
        });
        const velocityScore = Math.min(100, Math.max(0, Math.round((recentBidCountCalc / 20) * 100)));
        finalItem.velocityScore = velocityScore;
        finalItem.velocityUpdatedAt = new Date();
        await finalItem.save();

        broadcastAuction(id, {
            type: 'velocity:updated',
            listingId: id,
            velocityScore
        });

        // ── Campus Rivalry Detection (Varunkumar) ──
        const topRows = await Bid.find({ auctionId: item._id }).sort({ amount: -1 }).limit(10);
        const enrichedBids = await Promise.all(topRows.map(async r => {
            const u = await User.findOne({ email: r.bidderEmail }).select('college campusVerified');
            return { email: r.bidderEmail, college: u?.college, campusVerified: u?.campusVerified };
        }));

        const distinctUsers = [];
        for (const b of enrichedBids) {
            if (!distinctUsers.find(db => db.email === b.email)) distinctUsers.push(b);
            if (distinctUsers.length >= 2) break;
        }

        if (distinctUsers.length >= 2) {
            const b1 = distinctUsers[0], b2 = distinctUsers[1];
            if (b1.campusVerified && b2.campusVerified && b1.college && b2.college && b1.college !== b2.college) {
                broadcastAuction(id, {
                    type: 'rivalry:updated',
                    listingId: id,
                    rivalryLabel: `Campus Rivalry: ${b1.college} vs ${b2.college}`
                });
            }
        }

        const messageObj = maxSnipeReached ? 
            'Bid placed successfully, but maximum time extensions (5) have been reached.' : 
            'Bid placed successfully!';

        res.json({ success: true, newBid: finalItem.currentBid, bidCount, message: messageObj, maxSnipeReached, extensionTriggered });
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
        if (item.sellerEmail !== req.user.email && req.user.role !== 'admin')
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
        if (item.sellerEmail !== req.user.email && req.user.role !== 'admin')
            return res.status(403).json({ success: false, message: 'You can only remove your own listings.' });
        
        const bidCount = await Bid.countDocuments({ auctionId: item._id });
        if (bidCount > 0 && req.user.role !== 'admin')
            return res.status(400).json({ success: false, message: 'Cannot withdraw a lot that already has bids. Use "End Auction" instead.' });
        
        await Auction.findByIdAndDelete(id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.get('/api/bids/:listingId', async (req, res) => {
    try {
        const rows = await Bid.find({ auctionId: req.params.listingId }).sort({ amount: -1 });

        // Fetch user data to populate college info for rivalry check
        const enrichedBids = await Promise.all(rows.map(async r => {
            const user = await User.findOne({ email: r.bidderEmail }).select('college campusVerified');
            return {
                bidderName: r.bidderName,
                bidderEmail: r.bidderEmail, // Keep internally for rivalry logic
                amount: r.amount,
                placedAt: r.placedAt,
                triggeredSnipe: r.triggeredSnipe || false,
                college: user?.college,
                campusVerified: user?.campusVerified
            };
        }));

        // ── Campus Rivalry Detection (Varunkumar) ──
        let isRivalry = false;
        let rivalryDetails = null;

        const distinctBidders = [];
        for (const b of enrichedBids) {
            if (!distinctBidders.find(db => db.bidderEmail === b.bidderEmail)) {
                distinctBidders.push(b);
            }
            if (distinctBidders.length >= 2) break;
        }

        if (distinctBidders.length >= 2) {
            const b1 = distinctBidders[0];
            const b2 = distinctBidders[1];
            if (b1.campusVerified && b2.campusVerified && b1.college && b2.college && b1.college !== b2.college) {
                isRivalry = true;
                rivalryDetails = {
                    college1: b1.college,
                    college2: b2.college,
                    message: `Campus Rivalry: ${b1.college} vs ${b2.college}`
                };
            }
        }

        const finalBids = enrichedBids.map(b => {
            const { bidderEmail, ...rest } = b;
            return rest;
        });

        res.json({ bids: finalBids, isRivalry, rivalryDetails });
    } catch(e) { res.json({ bids: [], isRivalry: false, rivalryDetails: null }); }
});

// ── Snipe Log API (Varunkumar) ──
app.get('/api/bids/:listingId/snipe-log', async (req, res) => {
    try {
        const logs = await SnipeLog.find({ listingId: req.params.listingId }).sort({ triggeredAt: 1 });
        res.json(logs.map(l => ({
            extensionNum: l.extensionNum,
            newEndTime: l.newEndTime,
            triggeredAt: l.triggeredAt,
            bidId: l.bidId
        })));
    } catch(e) { res.json([]); }
});

// ── Active Bid Wars API (Varunkumar) ──
app.get('/api/bids/wars/active', async (req, res) => {
    try {
        const wars = await Auction.find({ isWar: true, status: 'active' }).select('title currentBid endTime image');
        res.json(wars.map(w => ({
            id: w._id.toString(),
            title: w.title,
            currentBid: w.currentBid,
            endTime: w.endTime,
            image: w.image
        })));
    } catch(e) { res.json([]); }
});

app.get('/api/auction/:id/winner', requireLogin, async (req, res) => {
    try {
        const item = await Auction.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Not found.' });
        if (item.sellerEmail !== req.user.email && req.user.role !== 'admin')
            return res.status(403).json({ message: 'Only the seller can view winner details.' });
        if (item.status !== 'closed') return res.status(400).json({ message: 'Auction is still active.' });
        if (!item.winnerEmail) return res.json({ noBids: true });
        res.json({ noBids: false, name: item.winnerName, email: item.winnerEmail, winningBid: item.winningBid });
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
        if (auction.sellerEmail !== userEmail && auction.winnerEmail !== userEmail)
            return res.status(403).json({ message: 'Only the seller and winner can access this chat.' });

        const messages = await Message.find({ auctionId: auctionId }).sort({ sentAt: 1 });
        
        const otherEmail = userEmail === auction.sellerEmail ? auction.winnerEmail : auction.sellerEmail;
        const otherUser  = await User.findOne({ email: otherEmail });

        res.json({
            messages: messages.map(m => ({ senderEmail: m.senderEmail, senderName: m.senderName, message: m.message, sentAt: m.sentAt })),
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
        if (auction.sellerEmail !== userEmail && auction.winnerEmail !== userEmail)
            return res.status(403).json({ message: 'Only the seller and winner can chat here.' });

        const text = String(message || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: 'Message cannot be empty.' });

        await Message.create({
            auctionId: auctionId,
            senderEmail: userEmail,
            senderName: req.user.name,
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
            $or: [{ sellerEmail: email }, { winnerEmail: email }]
        }).sort({ createdAt: -1 });

        const result = [];
        for (const a of auctions) {
            if (!a.winnerEmail) continue;
            const last = await Message.findOne({ auctionId: a._id }).sort({ sentAt: -1 });
            
            const lastSent = await Message.findOne({ auctionId: a._id, senderEmail: email }).sort({ sentAt: -1 });
            let unread = 0;
            if (lastSent) {
                unread = await Message.countDocuments({ auctionId: a._id, senderEmail: { $ne: email }, sentAt: { $gt: lastSent.sentAt } });
            } else {
                unread = await Message.countDocuments({ auctionId: a._id, senderEmail: { $ne: email } });
            }

            const otherEmail = email === a.sellerEmail ? a.winnerEmail : a.sellerEmail;
            const otherUser  = await User.findOne({ email: otherEmail });
            const myRole     = email === a.sellerEmail ? 'seller' : 'winner';

            result.push({
                auctionId:    a._id.toString(),
                auctionTitle: a.title,
                auctionImage: a.image,
                winningBid:   a.winningBid,
                otherName:    otherUser ? otherUser.fullname : 'Other Party',
                otherEmail,
                myRole,
                lastMessage:  last ? { senderName: last.senderName, message: last.message, sentAt: last.sentAt } : null,
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
        const activeListings = await Auction.countDocuments({ sellerEmail: userEmail, status: 'active' });
        const closedListings = await Auction.countDocuments({ sellerEmail: userEmail, status: 'closed' });
        const totalBids = await Bid.countDocuments({ bidderEmail: userEmail });
        const auctionsWon = await Auction.countDocuments({ winnerEmail: userEmail });
        const dbUser = await User.findOne({ email: userEmail });
        const watchlistCount = dbUser && dbUser.watchlist ? dbUser.watchlist.length : 0;
        
        // Active bids calculation
        const activeBids = await Bid.distinct('auctionId', { bidderEmail: userEmail }).exec();
        const activeAuctions = await Auction.countDocuments({ _id: { $in: activeBids }, status: 'active' });

        res.json({
            id: req.user.id,
            fullname: req.user.name,
            email: userEmail,
            role: req.user.role,
            trustScore: dbUser.trustScore || 100,
            ratingsCount: dbUser.ratingsCount || 0,
            activeListings,
            closedListings,
            totalBids,
            walletBalance: dbUser.walletBalance || 0,
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

app.get('/api/bids/my-bids', requireLogin, async (req, res) => {
    try {
        const rows = await Bid.find({ bidderEmail: req.user.email }).sort({ placedAt: -1 }).limit(30).populate('auctionId');
        const resolved = rows.filter(r => r.auctionId).map(r => ({
            amount: r.amount,
            placedAt: r.placedAt,
            auctionTitle: r.auctionId.title,
            auctionStatus: r.auctionId.status,
            currentBid: r.auctionId.currentBid,
            winnerEmail: r.auctionId.winnerEmail,
            auctionId: r.auctionId._id.toString()
        }));
        res.json(resolved);
    } catch(e) { res.status(500).json([]); }
});

// ── Bid Velocity API (Varunkumar) ──
app.get('/api/listings/:id/velocity', async (req, res) => {
    try {
        const item = await Auction.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Not found' });

        const SIXTY_SECONDS = 60 * 1000;
        const now = Date.now();
        const lastUpdated = item.velocityUpdatedAt ? item.velocityUpdatedAt.getTime() : 0;

        if (now - lastUpdated > SIXTY_SECONDS) {
            const TEN_MINUTES = 10 * 60 * 1000;
            const recentBidCount = await Bid.countDocuments({
                auctionId: item._id,
                placedAt: { $gte: new Date(now - TEN_MINUTES) }
            });
            const velocityScore = Math.min(100, Math.max(0, Math.round((recentBidCount / 20) * 100)));
            
            item.velocityScore = velocityScore;
            item.velocityUpdatedAt = new Date();
            await item.save();
        }

        res.json({ velocityScore: item.velocityScore || 0 });
    } catch(e) { res.status(500).json({ error: 'Server error' }); }
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
    try {
        const pending = await Auction.find({ verified: false, status: 'active' }).sort({ createdAt: 1 });
        res.json(await Promise.all(pending.map(mapAuction)));
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/verify', requireAdmin, async (req, res) => {
    try {
        const { id, approve } = req.body;
        if (approve) {
            await Auction.findByIdAndUpdate(id, { verified: true });
        } else {
            await Auction.findByIdAndDelete(id);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        res.json(await User.find().sort({ createdAt: -1 }));
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/promote', requireAdmin, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.body.id, { role: 'admin' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/close-auction', requireAdmin, async (req, res) => {
    try {
        await closeAuction(req.body.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─────────────────────────────────────────────
// 12. BACKGROUND SCHEDULER
// ─────────────────────────────────────────────
// Runs every 1 minute to close expired auctions
setInterval(async () => {
    try {
        const expiredAuctions = await Auction.find({
            status: 'active',
            endTime: { $lte: new Date() }
        });
        
        for (const auction of expiredAuctions) {
            console.log(`⏰ Scheduler: Closing expired auction "${auction.title}"...`);
            await closeAuction(auction._id);
        }
    } catch (err) {
        console.error('Scheduler Error:', err);
    }
}, 60 * 1000);

// ─────────────────────────────────────────────
// 13. START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🔨 Gavel is open at http://localhost:${PORT}`);
    console.log(`   Database  : MongoDB Atlas`);
    console.log(`   Auth      : Supabase Client SDK + Cookies`);
    console.log(`\n`);
});