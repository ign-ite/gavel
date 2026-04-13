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
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Next.js integration (Load from frontend's node_modules to avoid duplicate React conflicts)
const nextPath = path.join(__dirname, 'frontend', 'node_modules', 'next');
const next = require(nextPath);
const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: path.join(__dirname, 'frontend') });
const handle = nextApp.getRequestHandler();

const JWT_SECRET = process.env.JWT_SECRET || '';
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

// Mongoose Models
const User = require('./models/User');

// Catch Next.js 14+ Development WebSocket errors that indiscriminately crash the Node process
process.on('uncaughtException', (err) => {
    if (err.message && err.message.includes('Invalid WebSocket frame')) {
        console.warn('Caught Next.js WebSocket bug, preventing server crash:', err.message);
        return;
    }
    console.error('Unhandled Exception:', err);
    process.exit(1);
});
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const Message = require('./models/Message');
const Media = require('./models/Media');
const AutoBid = require('./models/AutoBid');
const AuditLog = require('./models/AuditLog');
const SnipeLog = require('./models/SnipeLog');

const app = express();
const server = http.createServer(app);
// Scope WS server to /ws path only — prevents it from intercepting Next.js HMR WebSocket connections
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/ws')) {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    }
    // All other upgrades (Next.js HMR /_next/*) are left alone
});

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

// Middleware to redirect logged-in users away from login/signup
const redirectIfLoggedIn = (req, res, next) => {
    if (req.cookies.sb_access_token || req.cookies.jwt_token) {
        return res.redirect('/');
    }
    next();
};

function createRateLimiter(options) {
    const windowMs = Number(options.windowMs) || 60 * 1000;
    const max = Number(options.max) || 30;
    const message = options.message || 'Too many requests. Please try again later.';
    const buckets = new Map();

    return function rateLimitMiddleware(req, res, next) {
        const key = `${req.ip}::${req.user?.email || req.body?.email || 'guest'}::${req.path}`;
        const now = Date.now();
        const current = buckets.get(key);

        if (!current || current.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (current.count >= max) {
            res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
            return res.status(429).json({ success: false, message });
        }

        current.count += 1;
        next();
    };
}

const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts. Please wait before trying again.'
});

const bidLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many bid requests. Please slow down and try again shortly.'
});

app.get('/login.html', redirectIfLoggedIn, (req, res, next) => next());
app.get('/signup.html', redirectIfLoggedIn, (req, res, next) => next());

// ─────────────────────────────────────────────
// 2.5 LOCAL AUTHENTICATION (Varunkumar)
// ─────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        if (!JWT_SECRET) {
            return res.status(503).json({ error: 'Email authentication is disabled.' });
        }
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
            campusVerified,
            isSuperAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase()),
            isAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
        });

        const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('jwt_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, user: { email: newUser.email, name: newUser.fullname, campusVerified } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        if (!JWT_SECRET) {
            return res.status(503).json({ error: 'Email authentication is disabled.' });
        }
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
        if (JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const dbUser = await User.findById(decoded.id);
                if (!dbUser) throw new Error('User not found in DB');

                req.user = {
                    id: dbUser._id.toString(),
                    email: dbUser.email,
                    name: dbUser.fullname,
                    role: dbUser.role,
                    isAdmin: Boolean(dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin'),
                    isSuperAdmin: Boolean(dbUser.isSuperAdmin)
                };
                return next();
            } catch (jwtError) { }
        }

        // Supabase verification fallback / primary mode
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, message: 'Invalid session.', redirect: '/login.html' });

        const dbUser = await User.findOne({ email: user.email.toLowerCase() });

        req.user = {
            id: dbUser ? dbUser._id.toString() : user.id,
            email: user.email,
            name: dbUser ? dbUser.fullname : (user.user_metadata?.fullname || 'User'),
            role: dbUser ? dbUser.role : (user.user_metadata?.role || 'bidder'),
            isAdmin: Boolean(dbUser?.isAdmin || dbUser?.isSuperAdmin || dbUser?.role === 'admin'),
            isSuperAdmin: Boolean(dbUser?.isSuperAdmin)
        };
        return next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Invalid session.', redirect: '/login.html' });
    }
}

function getConversationKey(auctionId, a, b) {
    const pair = [a.toLowerCase(), b.toLowerCase()].sort().join('::');
    return `${String(auctionId)}::${pair}`;
}

async function pushNotification(email, notification) {
    await User.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
            $push: {
                notifications: {
                    type: notification.type || 'system',
                    title: notification.title || 'Update',
                    message: notification.message,
                    actionUrl: notification.actionUrl || '',
                    metadata: notification.metadata || {},
                    read: false,
                    createdAt: new Date()
                }
            }
        }
    );
}

async function getBidCountMap(auctionIds) {
    const ids = [...new Set((auctionIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return {};

    const objectIds = ids
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    if (!objectIds.length) return {};

    const bidCounts = await Bid.aggregate([
        { $match: { auctionId: { $in: objectIds } } },
        { $group: { _id: '$auctionId', count: { $sum: 1 } } }
    ]);

    return Object.fromEntries(bidCounts.map((row) => [row._id.toString(), row.count]));
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
    const imageFiles = [...((files && files.images) || []), ...((files && files.image) || [])];
    const mediaDocs = [];

    for (const file of imageFiles) {
        mediaDocs.push(await storeMediaDoc(file, auction._id, 'image'));
    }

    if (files && files.video && files.video[0]) {
        mediaDocs.push(await storeMediaDoc(files.video[0], auction._id, 'video'));
    }

    const imageDocs = mediaDocs.filter(item => item.kind === 'image');
    const videoDoc = mediaDocs.find(item => item.kind === 'video');

    auction.mediaIds = mediaDocs.map(item => item._id);
    auction.images = imageDocs.map(item => `/api/media/${item._id}`);
    auction.image = auction.images[0] || '/images/logo.png';
    auction.video = videoDoc ? `/api/media/${videoDoc._id}` : null;
    auction.videoUrl = auction.video;
    await auction.save();
}

function normalizeAuctionDescription(rawDescription) {
    const source = String(rawDescription || '').trim();
    if (!source) return '';

    return source
        .replace(/###\s*Specifications\s*/gi, '')
        .replace(/###\s*Description\s*/gi, '')
        .replace(/-\s*\*\*(.+?):\*\*\s*/g, '$1: ')
        .replace(/\*\*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getDisplayImages(obj) {
    const images = Array.isArray(obj.images) ? obj.images.filter(Boolean) : [];
    const fallback = obj.image ? [obj.image] : [];
    return [...new Set([...images, ...fallback])];
}

function getAuctionUrgency(obj) {
    const deadline = obj.earlySellDeadline ? new Date(obj.earlySellDeadline) : null;
    const activeEarlySell = Boolean(deadline && deadline.getTime() > Date.now() && obj.status === 'active');
    return {
        earlySellActive: activeEarlySell,
        earlySellDeadline: activeEarlySell ? deadline : null,
        hotLabel: activeEarlySell ? 'Hot selling' : ''
    };
}



// Map Mongoose docs to the legacy API format expected by frontend
async function mapAuction(doc, bidCountMap) {
    const obj = doc.toObject();
    const bidCount = bidCountMap && typeof bidCountMap[String(doc._id)] !== 'undefined'
        ? bidCountMap[String(doc._id)]
        : await Bid.countDocuments({ auctionId: doc._id });
    const displayImages = getDisplayImages(obj);
    const urgency = getAuctionUrgency(obj);
    return {
        id: obj._id.toString(),
        title: obj.title,
        description: normalizeAuctionDescription(obj.description),
        specifications: obj.specifications || {},
        currentBid: obj.currentBid,
        image: displayImages[0] || '/images/logo.png',
        images: displayImages,
        verificationVideo: obj.video,
        videoUrl: obj.videoUrl || null,
        verified: obj.verified,
        sellerEmail: obj.sellerEmail,
        sellerName: obj.sellerName || obj.sellerEmail,
        endTime: obj.endTime,
        status: obj.status || 'active',
        reviewNotes: obj.reviewNotes || '',
        rejectionReason: obj.rejectionReason || '',
        assignedAdminEmail: obj.assignedAdminEmail || '',
        winnerEmail: obj.winnerEmail,
        winnerName: obj.winnerName,
        winningBid: obj.winningBid,
        category: obj.category,
        increment: obj.increment || 1,
        reserve_met: obj.currentBid >= (obj.reservePrice || 0),
        bidCount,
        velocityScore: obj.velocityScore || 0,
        createdAt: obj.createdAt,
        earlySellActive: urgency.earlySellActive,
        earlySellDeadline: urgency.earlySellDeadline,
        hotLabel: urgency.hotLabel
    };
}

// ─────────────────────────────────────────────
// 3. FILE UPLOADS
// ─────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ─────────────────────────────────────────────
// 4. WEBSOCKETS
// ─────────────────────────────────────────────
const watchers = new Map(); // itemId  → Set<ws>  (bid watchers)
const chatRooms = new Map(); // conversationKey → Set<{ws, email, name}> (chat participants)
const globalWatchers = new Set(); // Set<ws> for homepage global feed

// ── Bid War Detector — in-memory tracker (Varunkumar) ──
// Stores the last 5 bids per listing: Map<auctionId, Array<{email, timestamp}>>
const bidActivityTracker = new Map();

wss.on('connection', (ws, req) => {
    let watchingId = null;
    let chatId = null;
    let userEmail = null;
    let userName = null;
    let isGlobal = false;

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
            if (msg.type === 'join_chat' && msg.conversationKey && msg.email && msg.name) {
                chatId = String(msg.conversationKey);
                userEmail = msg.email;
                userName = msg.name;

                if (!chatRooms.has(chatId)) chatRooms.set(chatId, new Set());
                chatRooms.get(chatId).add({ ws, email: userEmail, name: userName });
            }

            // ── Send a chat message ──
            if (msg.type === 'chat_msg' && msg.auctionId && msg.text && userEmail && msg.recipientEmail) {
                const aid = msg.auctionId;
                const text = String(msg.text).trim().slice(0, 2000); // 2000 char limit
                if (!text) return;

                const auction = await Auction.findById(aid);
                if (!auction) return;
                const conversationKey = getConversationKey(aid, userEmail, msg.recipientEmail);

                await Message.create({
                    auctionId: aid,
                    conversationKey,
                    recipientEmail: msg.recipientEmail,
                    senderEmail: userEmail,
                    senderName: userName,
                    message: text
                });

                const payload = JSON.stringify({
                    type: 'chat_msg',
                    auctionId: aid,
                    conversationKey,
                    senderEmail: userEmail,
                    senderName: userName,
                    message: text,
                    sentAt: new Date().toISOString()
                });

                const room = chatRooms.get(conversationKey);
                if (room) {
                    room.forEach(participant => {
                        if (participant.ws.readyState === participant.ws.OPEN)
                            participant.ws.send(payload);
                    });
                }
            }
        } catch (e) { }
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
        item.earlySellActivatedAt = null;
        item.earlySellDeadline = null;
        item.earlySellActivatedBy = '';
        await item.save();

        if (winnerObj) {
            // Phase 9: Trust Score Mechanic - successful transaction boosts both parties
            const sellerUser = await User.findOne({ email: item.sellerEmail });
            if (sellerUser) {
                sellerUser.trustScore = Math.min(500, (sellerUser.trustScore || 50) + 5);
                sellerUser.ratingsCount = (sellerUser.ratingsCount || 0) + 1;
                await sellerUser.save();
            }
            const buyerUser = await User.findOne({ email: winnerObj.bidderEmail });
            if (buyerUser) {
                buyerUser.trustScore = Math.min(500, (buyerUser.trustScore || 50) + 5);
                buyerUser.ratingsCount = (buyerUser.ratingsCount || 0) + 1;
                await buyerUser.save();
            }
        }

        broadcastAuction(auctionId.toString(), {
            type: 'auction_closed',
            itemId: auctionId.toString(),
            winnerName: winnerObj ? winnerObj.bidderName : null,
            winningBid: winnerObj ? winnerObj.amount : null,
            noBids: !topBid,
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
        const localToken = req.cookies.jwt_token;
        if (localToken && JWT_SECRET) {
            try {
                const decoded = jwt.verify(localToken, JWT_SECRET);
                const dbUser = await User.findById(decoded.id);
                if (dbUser) {
                    return res.json({
                        loggedIn: true,
                        user: {
                            id: dbUser._id.toString(),
                            email: dbUser.email,
                            name: dbUser.fullname,
                            role: dbUser.role,
                            isAdmin: Boolean(dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin'),
                            isSuperAdmin: Boolean(dbUser.isSuperAdmin),
                            walletBalance: dbUser.walletBalance || 0
                        }
                    });
                }
            } catch (error) {
                console.warn('Local auth cookie invalid:', error.message);
            }
        }

        const token = req.cookies.sb_access_token;
        if (!token) return res.json({ loggedIn: false });

        // Wrap Supabase call in a timeout/try-catch to prevent DNS-related socket hang-ups
        const { data: { user }, error } = await Promise.race([
            supabase.auth.getUser(token),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase Timeout')), 5000))
        ]).catch(err => {
            console.error("Supabase unreachable:", err.message);
            return { data: { user: null }, error: err };
        });

        if (error || !user) return res.json({ loggedIn: false });

        const dbUser = await User.findOne({ email: user.email.toLowerCase() });
        res.json({
            loggedIn: true,
            user: {
                id: dbUser ? dbUser._id.toString() : user.id,
                email: user.email,
                name: dbUser ? dbUser.fullname : user.user_metadata?.fullname || 'User',
                role: dbUser ? dbUser.role : (user.user_metadata?.role || 'bidder'),
                isAdmin: Boolean(dbUser?.isAdmin || dbUser?.isSuperAdmin || dbUser?.role === 'admin'),
                isSuperAdmin: Boolean(dbUser?.isSuperAdmin),
                walletBalance: dbUser ? dbUser.walletBalance : 0
            }
        });
    } catch (e) {
        res.json({ loggedIn: false });
    }
});

app.post('/api/deposit', requireLogin, async (req, res) => {
    try {
        const { amount } = req.body;
        const depositAmount = Number(amount);
        if (!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser) return res.status(404).json({ error: 'User not found' });

        dbUser.walletBalance += depositAmount;
        await dbUser.save();

        await AuditLog.create({
            action: 'FUNDS_DEPOSITED',
            userEmail: dbUser.email,
            details: `Deposited ₹${depositAmount.toLocaleString('en-IN')} (Mock Payment)`,
            ipAddress: req.ip
        });

        res.json({ success: true, newBalance: dbUser.walletBalance });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/payments/razorpay/config', (req, res) => {
    res.json({
        enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        keyId: process.env.RAZORPAY_KEY_ID || ''
    });
});

app.post('/api/payments/razorpay/order', requireLogin, async (req, res) => {
    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            return res.status(503).json({ success: false, message: 'Razorpay is not configured on the server.' });
        }

        const amount = Math.round(Number(req.body.amount));
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Enter a valid rupee amount.' });
        }

        const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount * 100,
                currency: 'INR',
                receipt: `gavel_${Date.now()}`,
                notes: {
                    userEmail: req.user.email,
                    userId: req.user.id,
                    purpose: 'wallet_top_up'
                }
            })
        });

        const orderData = await orderRes.json();
        if (!orderRes.ok) {
            return res.status(502).json({
                success: false,
                message: orderData?.error?.description || 'Failed to create Razorpay order.'
            });
        }

        res.json({ success: true, keyId, order: orderData });
    } catch (e) {
        console.error('Razorpay order error:', e);
        res.status(500).json({ success: false, message: 'Unable to start payment.' });
    }
});

app.post('/api/payments/razorpay/verify', requireLogin, async (req, res) => {
    try {
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keySecret) {
            return res.status(503).json({ success: false, message: 'Razorpay is not configured on the server.' });
        }

        const {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
            amount
        } = req.body;

        const rupeeAmount = Math.round(Number(amount));
        if (!orderId || !paymentId || !signature || !Number.isInteger(rupeeAmount) || rupeeAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment verification payload.' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        if (expectedSignature !== signature) {
            return res.status(400).json({ success: false, message: 'Payment signature mismatch.' });
        }

        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser) return res.status(404).json({ success: false, message: 'User not found.' });

        dbUser.walletBalance += rupeeAmount;
        await dbUser.save();

        await AuditLog.create({
            action: 'WALLET_TOP_UP',
            userEmail: dbUser.email,
            details: `Razorpay payment ${paymentId} credited ₹${rupeeAmount.toLocaleString('en-IN')}`,
            ipAddress: req.ip
        });

        res.json({ success: true, newBalance: dbUser.walletBalance });
    } catch (e) {
        console.error('Razorpay verify error:', e);
        res.status(500).json({ success: false, message: 'Unable to verify payment.' });
    }
});

// Sync Supabase user to MongoDB
app.post('/api/user/sync', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid token' });

        const { email, fullname, role } = req.body;

        // Upsert the user in MongoDB
        let dbUser = await User.findOne({ email: email.toLowerCase() });
        if (!dbUser) {
            dbUser = await User.create({
                email: email.toLowerCase(),
                fullname: fullname || 'New User',
                role: role || 'bidder',
                trustScore: 50,
                walletBalance: 0,
                isSuperAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase()),
                isAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
            });
            console.log(`👤 New user synced: ${email}`);
        } else {
            // Update fields if they changed
            dbUser.fullname = fullname || dbUser.fullname;
            if (SUPER_ADMIN_EMAILS.includes(email.toLowerCase())) {
                dbUser.isSuperAdmin = true;
                dbUser.isAdmin = true;
            }
            await dbUser.save();
        }

        res.json({ success: true, userId: dbUser._id });
    } catch (e) {
        console.error("Sync error:", e.message);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// Logout — clear the auth cookie
app.post('/api/logout', (req, res) => {
    res.clearCookie('sb_access_token', { path: '/' });
    res.clearCookie('jwt_token', { path: '/' });
    res.json({ success: true });
});

// ─────────────────────────────────────────────
// 7.5 ADMIN ROUTES
// ─────────────────────────────────────────────

const requireAdmin = async (req, res, next) => {
    try {
        await new Promise((resolve, reject) => requireLogin(req, res, (err) => err ? reject(err) : resolve()));
        const dbUser = await User.findById(req.user.id);
        if (!dbUser || !(dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin')) {
            return res.status(403).json({ error: 'Forbidden. Admin access required.' });
        }
        req.adminUser = dbUser;
        next();
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};

const requireSuperAdmin = async (req, res, next) => {
    try {
        await new Promise((resolve, reject) => requireLogin(req, res, (err) => err ? reject(err) : resolve()));
        const dbUser = await User.findById(req.user.id);
        if (!dbUser || !dbUser.isSuperAdmin) {
            return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
        }
        req.superAdminUser = dbUser;
        next();
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};

app.get('/api/media/:id', async (req, res) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return res.status(404).send('Not found');
        res.setHeader('Content-Type', media.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(media.data);
    } catch (e) {
        res.status(404).send('Not found');
    }
});

app.get('/api/dashboard/summary', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const [myListingsDocs, watchlistDocs, recentBids, soldDocs, wonDocs, walletActivityDocs, totalUsers, activeAuctions, totalVolume] = await Promise.all([
            Auction.find({ sellerEmail: user.email }).sort({ createdAt: -1 }).limit(12),
            Auction.find({ _id: { $in: user.watchlist || [] } }).sort({ createdAt: -1 }).limit(8),
            Bid.find({ bidderEmail: user.email }).populate('auctionId').sort({ placedAt: -1 }).limit(10),
            Auction.find({ sellerEmail: user.email, status: 'closed' }).sort({ updatedAt: -1 }).limit(10),
            Auction.find({ winnerEmail: user.email, status: 'closed' }).sort({ updatedAt: -1 }).limit(10),
            AuditLog.find({
                userEmail: user.email,
                action: { $in: ['FUNDS_DEPOSITED', 'WALLET_TOP_UP', 'SELL_REQUEST_CREATED', 'BID_PLACED', 'AUTO_BID_PLACED'] }
            }).sort({ createdAt: -1 }).limit(12),
            User.countDocuments(),
            Auction.countDocuments({ status: 'active' }),
            Auction.aggregate([
                { $match: { status: 'closed', winningBid: { $gt: 0 } } },
                { $group: { _id: null, total: { $sum: '$winningBid' } } }
            ])
        ]);

        const [listingBidCounts, watchlistBidCounts, soldBidCounts, wonBidCounts] = await Promise.all([
            getBidCountMap(myListingsDocs.map((row) => row._id)),
            getBidCountMap(watchlistDocs.map((row) => row._id)),
            getBidCountMap(soldDocs.map((row) => row._id)),
            getBidCountMap(wonDocs.map((row) => row._id))
        ]);
        const myListings = await Promise.all(myListingsDocs.map((row) => mapAuction(row, listingBidCounts)));
        const watchlist = await Promise.all(watchlistDocs.map((row) => mapAuction(row, watchlistBidCounts)));
        const salesHistory = await Promise.all(soldDocs.map((row) => mapAuction(row, soldBidCounts)));
        const purchaseHistory = await Promise.all(wonDocs.map((row) => mapAuction(row, wonBidCounts)));
        const notifications = (user.notifications || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);

        const summary = {
            me: {
                id: user._id.toString(),
                fullname: user.fullname,
                email: user.email,
                role: user.role,
                isAdmin: Boolean(user.isAdmin || user.isSuperAdmin || user.role === 'admin'),
                isSuperAdmin: Boolean(user.isSuperAdmin),
                walletBalance: user.walletBalance || 0
            },
            stats: {
                activeListings: myListings.filter(item => item.status === 'active').length,
                pendingListings: myListings.filter(item => ['pending_review', 'under_review'].includes(item.status)).length,
                rejectedListings: myListings.filter(item => item.status === 'rejected').length,
                soldListings: salesHistory.length,
                activeBids: recentBids.filter(item => item.auctionId && item.auctionId.status === 'active').length,
                wonPurchases: purchaseHistory.length,
                watchlistCount: watchlist.length,
                unreadNotifications: notifications.filter(item => !item.read).length,
                platformUsers: totalUsers,
                activeAuctions,
                totalVolume: totalVolume[0]?.total || 0
            },
            listings: myListings,
            salesHistory,
            purchaseHistory,
            watchlist,
            bids: recentBids.filter(item => item.auctionId).map(item => ({
                id: item._id.toString(),
                amount: item.amount,
                placedAt: item.placedAt,
                auctionId: item.auctionId._id.toString(),
                auctionTitle: item.auctionId.title,
                auctionStatus: item.auctionId.status,
                currentBid: item.auctionId.currentBid,
                winnerEmail: item.auctionId.winnerEmail
            })),
            walletActivity: walletActivityDocs.map((entry) => ({
                id: entry._id.toString(),
                action: entry.action,
                details: entry.details,
                createdAt: entry.createdAt
            })),
            notifications
        };

        if (summary.me.isAdmin) {
            const assignedDocs = await Auction.find({
                assignedAdminEmail: user.email,
                status: { $in: ['pending_review', 'under_review'] }
            }).sort({ createdAt: 1 }).limit(20);
            summary.adminWorkspace = {
                assignedRequests: await Promise.all(assignedDocs.map((row) => mapAuction(row)))
            };
        }

        if (summary.me.isSuperAdmin) {
            const [reviewQueueDocs, adminUsers, nonAdminUsers, assignmentMetrics, rejectionDocs] = await Promise.all([
                Auction.find({ status: { $in: ['pending_review', 'under_review', 'rejected'] } }).sort({ createdAt: 1 }).limit(24),
                User.find({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] }).sort({ fullname: 1 }),
                User.find({ isAdmin: { $ne: true }, isSuperAdmin: { $ne: true }, role: { $ne: 'admin' } }).select('fullname email role').sort({ createdAt: -1 }).limit(12),
                Promise.all([
                    Auction.countDocuments({ status: 'pending_review', assignedAdminEmail: { $in: [null, ''] } }),
                    Auction.countDocuments({ status: 'under_review' }),
                    Auction.countDocuments({ status: 'rejected' })
                ]),
                Auction.find({ status: 'rejected', reviewedByEmail: { $exists: true, $ne: '' } }).sort({ reviewedAt: -1 }).limit(18)
            ]);

            const adminEmails = adminUsers.map((adminUser) => adminUser.email);
            const [assignedAgg, approvedAgg, rejectedAgg] = await Promise.all([
                Auction.aggregate([
                    { $match: { assignedAdminEmail: { $in: adminEmails }, status: { $in: ['pending_review', 'under_review'] } } },
                    { $group: { _id: '$assignedAdminEmail', count: { $sum: 1 } } }
                ]),
                Auction.aggregate([
                    { $match: { reviewedByEmail: { $in: adminEmails }, status: 'active' } },
                    { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
                ]),
                Auction.aggregate([
                    { $match: { reviewedByEmail: { $in: adminEmails }, status: 'rejected' } },
                    { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
                ])
            ]);
            const assignedMap = Object.fromEntries(assignedAgg.map((row) => [row._id, row.count]));
            const approvedMap = Object.fromEntries(approvedAgg.map((row) => [row._id, row.count]));
            const rejectedMap = Object.fromEntries(rejectedAgg.map((row) => [row._id, row.count]));
            const adminOverview = adminUsers.map((adminUser) => ({
                id: adminUser._id.toString(),
                fullname: adminUser.fullname,
                email: adminUser.email,
                isSuperAdmin: Boolean(adminUser.isSuperAdmin),
                assignedCount: assignedMap[adminUser.email] || 0,
                approvedCount: approvedMap[adminUser.email] || 0,
                rejectedCount: rejectedMap[adminUser.email] || 0,
                assignedItems: reviewQueueDocs
                    .filter((row) => row.assignedAdminEmail === adminUser.email)
                    .map((row) => ({ id: row._id.toString(), title: row.title, status: row.status }))
            }));

            summary.superAdminWorkspace = {
                reviewQueue: await Promise.all(reviewQueueDocs.map((row) => mapAuction(row))),
                admins: adminOverview,
                assignableReviewers: adminUsers.map((row) => ({
                    id: row._id.toString(),
                    fullname: row.fullname,
                    email: row.email,
                    isSuperAdmin: Boolean(row.isSuperAdmin)
                })),
                metrics: {
                    unassigned: assignmentMetrics[0],
                    underReview: assignmentMetrics[1],
                    rejected: assignmentMetrics[2]
                },
                rejectionLog: rejectionDocs.map((row) => ({
                    id: row._id.toString(),
                    title: row.title,
                    sellerEmail: row.sellerEmail,
                    reviewedByEmail: row.reviewedByEmail || '',
                    rejectionReason: row.rejectionReason || '',
                    reviewNotes: row.reviewNotes || '',
                    reviewedAt: row.reviewedAt || row.updatedAt
                })),
                candidates: nonAdminUsers.map((row) => ({
                    id: row._id.toString(),
                    fullname: row.fullname,
                    email: row.email,
                    role: row.role
                }))
            };
        }

        res.json(summary);
    } catch (e) {
        console.error('Dashboard summary error:', e);
        res.status(500).json({ error: 'Failed to load dashboard.' });
    }
});

app.get('/api/notifications', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('notifications');
        const notifications = (user?.notifications || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(notifications);
    } catch (e) {
        res.status(500).json([]);
    }
});

app.post('/api/notifications/read', requireLogin, async (req, res) => {
    try {
        const { id } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false });

        user.notifications = (user.notifications || []).map((notification) => {
            if (!id || notification._id.toString() === id) {
                notification.read = true;
            }
            return notification;
        });
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: 'Server error fetching users' }); }
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
        res.json(logs);
    } catch (e) { res.status(500).json({ error: 'Server error fetching logs' }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        const sellerAuctions = await Auction.find({ sellerEmail: targetUser.email }).select('_id');
        const auctionIds = sellerAuctions.map((auction) => auction._id);
        await Media.deleteMany({ ownerId: { $in: auctionIds } });
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
    } catch (e) { res.status(500).json({ error: 'Server error deleting user' }); }
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
    } catch (e) { res.status(500).json({ error: 'Server error deleting auction' }); }
});

// ─────────────────────────────────────────────
// 8. AUCTION ROUTES
// ─────────────────────────────────────────────
app.get('/api/auctions', async (req, res) => {
    try {
        const rows = await Auction.find({ status: 'active', endTime: { $gt: new Date() } }).sort({ endTime: 1 });
        const bidCountMap = await getBidCountMap(rows.map((row) => row._id));
        const mapped = await Promise.all(rows.map((row) => mapAuction(row, bidCountMap)));
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
        const pendingRequests = await Auction.countDocuments({ status: { $in: ['pending_review', 'under_review', 'rejected'] } });
        const adminCount = await User.countDocuments({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] });

        // Sum of all winning bids (Total Volume)
        const closed = await Auction.find({ status: 'closed', winningBid: { $gt: 0 } });
        const totalVolume = closed.reduce((acc, curr) => acc + (curr.winningBid || 0), 0);

        const totalBids = await Bid.countDocuments();

        res.json({
            totalUsers, activeAuctions, closedAuctions, totalVolume, totalBids, pendingRequests, adminCount
        });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
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
    } catch (e) { res.status(404).json({ message: 'Not found' }); }
});

app.post('/api/sell', requireLogin, upload.fields([
    { name: 'images', maxCount: 6 }, { name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, price, reservePrice, description, endTime, category, increment } = req.body;
        const specifications = req.body.specifications ? JSON.parse(req.body.specifications) : {};
        const checklist = req.body.checklist ? JSON.parse(req.body.checklist) : {};
        const normalizedDescription = normalizeAuctionDescription(description);

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
            description: normalizedDescription,
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
            message: `"${title}" was submitted for review and is waiting for assignment.`,
            actionUrl: '/workspace/listings.html',
            metadata: { auctionId: newAuction._id.toString() }
        });

        await AuditLog.create({
            action: 'SELL_REQUEST_CREATED',
            userEmail: req.user.email,
            details: `Created sell request: ${title} (${newAuction._id})`,
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
async function applyBidToAuction(options) {
    const {
        auction,
        bidderEmail,
        bidderName,
        amount,
        isAutoBid,
        reqIp
    } = options;

    const numericAmount = Number(amount);
    const item = auction || await Auction.findById(options.auctionId);
    if (!item) return null;

    const latestBid = await Bid.findOne({ auctionId: item._id }).sort({ placedAt: -1 });
    const previousLeaderEmail = latestBid ? latestBid.bidderEmail : null;
    const previousLeaderAmount = latestBid ? Number(latestBid.amount || 0) : 0;
    const sameLeader = previousLeaderEmail === bidderEmail;
    const holdRequired = sameLeader ? Math.max(0, numericAmount - previousLeaderAmount) : numericAmount;

    const dbUser = await User.findOne({ email: bidderEmail });
    if (!dbUser || Number(dbUser.walletBalance || 0) < holdRequired) {
        return null;
    }

    let previousLeader = null;
    if (previousLeaderEmail && !sameLeader) {
        previousLeader = await User.findOne({ email: previousLeaderEmail });
    }

    dbUser.walletBalance -= holdRequired;
    if (previousLeader) {
        previousLeader.walletBalance += previousLeaderAmount;
    }

    await dbUser.save();
    if (previousLeader) {
        await previousLeader.save();
        await pushNotification(previousLeader.email, {
            type: 'outbid',
            title: 'You were outbid',
            message: `"${item.title}" now has a higher bid. ₹${previousLeaderAmount.toLocaleString('en-IN')} was released back to your wallet.`,
            actionUrl: `/item-detail.html?id=${item._id}`,
            metadata: { auctionId: item._id.toString(), refundedAmount: previousLeaderAmount }
        });
    }

    item.currentBid = numericAmount;
    item.bidCount = Number(item.bidCount || 0) + 1;
    await item.save();

    const newBid = await Bid.create({
        auctionId: item._id,
        bidderEmail,
        bidderName,
        amount: numericAmount
    });

    await AuditLog.create({
        action: isAutoBid ? 'AUTO_BID_PLACED' : 'BID_PLACED',
        userEmail: bidderEmail,
        details: `${bidderEmail} placed ${isAutoBid ? 'an auto-bid' : 'a bid'} of ₹${numericAmount.toLocaleString('en-IN')} on ${item.title} (${item._id})`,
        ipAddress: reqIp || 'system'
    });

    return newBid;
}

async function resolveAutoBids(auctionId) {
    let auction = await Auction.findById(auctionId);
    if (!auction || auction.status === 'closed') return false;

    const currentLeader = await Bid.findOne({ auctionId }).sort({ placedAt: -1 });
    const autoBids = await AutoBid.find({ auctionId, active: true }).sort({ maxAmount: -1, createdAt: 1 });
    const eligible = autoBids.filter((entry) => Number(entry.maxAmount) > Number(auction.currentBid || 0));
    if (!eligible.length) return false;

    const highest = eligible[0];
    const runnerUp = eligible.find((entry) => entry.bidderEmail !== highest.bidderEmail);
    const increment = Math.max(1, Number(auction.increment || 1));

    if (currentLeader && currentLeader.bidderEmail === highest.bidderEmail && !runnerUp) {
        return false;
    }

    const finalAmount = runnerUp
        ? (highest.maxAmount === runnerUp.maxAmount
            ? Number(highest.maxAmount)
            : Math.min(Number(highest.maxAmount), Number(runnerUp.maxAmount) + increment))
        : Number(highest.maxAmount);

    if (finalAmount <= Number(auction.currentBid || 0)) return false;

    const newBid = await applyBidToAuction({
        auction,
        bidderEmail: highest.bidderEmail,
        bidderName: highest.bidderName,
        amount: finalAmount,
        isAutoBid: true,
        reqIp: 'system'
    });
    if (!newBid) return false;

    broadcastAuction(auctionId, {
        type: 'bid_update',
        itemId: String(auctionId),
        newBid: finalAmount,
        bidCount: await Bid.countDocuments({ auctionId }),
        reserve_met: finalAmount >= Number(auction.reservePrice || 0)
    });
    return true;
}

app.post('/api/bids/auto-bid', requireLogin, bidLimiter, async (req, res) => {
    const { listingId, maxAmount } = req.body;
    try {
        const item = await Auction.findById(listingId);
        if (!item || item.status !== 'active') return res.status(400).json({ success: false, message: 'Only live approved listings can accept bids.' });
        if (item.sellerEmail === req.user.email) return res.status(403).json({ success: false, message: 'You cannot bid on your own listing.' });
        if (!Number.isInteger(Number(maxAmount)) || Number(maxAmount) <= Number(item.currentBid || 0)) {
            return res.status(400).json({ success: false, message: `Auto-bid max must be higher than ₹${Number(item.currentBid || 0).toLocaleString('en-IN')}.` });
        }

        await AutoBid.findOneAndUpdate(
            { auctionId: item._id, bidderEmail: req.user.email },
            { bidderName: req.user.name, maxAmount: Number(maxAmount), active: true },
            { upsert: true }
        );

        // Instantly trigger engine to act on this
        await resolveAutoBids(item._id);
        res.json({ success: true, message: 'Auto-bid ceiling set.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error setting auto bid' });
    }
});

// ── Alias: /api/place-bid ──
app.post('/api/place-bid', requireLogin, bidLimiter, async (req, res) => {
    // Standardize body: frontend sends { id: '...', bidAmount: 123 }
    const { id, bidAmount, isAuto } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Missing auction ID.' });

    // Redirect internal logic to the primary handler logic (which expects params.listingId)
    req.params.listingId = id;

    // Call the primary bidding logic handler (implemented as a reusable function)
    return handlePlaceBid(req, res);
});

// Primary Bidding Logic (Refactored for reuse)
async function handlePlaceBid(req, res) {
    const { bidAmount, isAuto } = req.body;
    const id = req.params.listingId;
    const amount = Number(bidAmount);
    try {
        let item = await Auction.findById(id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
        if (item.status !== 'active') return res.status(400).json({ success: false, message: 'This listing is not live for bidding yet.' });
        if (item.endTime && item.endTime <= new Date()) return res.status(400).json({ success: false, message: 'This auction has expired.' });
        if (item.sellerEmail === req.user.email) return res.status(403).json({ success: false, message: 'You cannot bid on your own listing.' });
        if (!Number.isInteger(amount)) {
            return res.status(400).json({ success: false, message: 'Bid amount must be in whole rupees only.' });
        }

        if (amount <= item.currentBid) {
            return res.status(400).json({
                success: false,
                message: `Bid must be higher than ₹${item.currentBid.toLocaleString('en-IN')}.`
            });
        }

        const latestBid = await Bid.findOne({ auctionId: item._id }).sort({ placedAt: -1 });
        const isCurrentLeader = latestBid && latestBid.bidderEmail === req.user.email && latestBid.amount === item.currentBid;
        if (isCurrentLeader && !isAuto) {
            return res.status(400).json({ success: false, message: 'You already hold the top bid on this item.' });
        }

        const newBid = await applyBidToAuction({
            auction: item,
            bidderEmail: req.user.email,
            bidderName: req.user.name,
            amount,
            isAutoBid: Boolean(isAuto),
            reqIp: req.ip
        });
        if (!newBid) {
            return res.status(400).json({ success: false, message: 'Insufficient funds. Please deposit to continue.' });
        }

        item = await Auction.findById(id);

        // Anti-Snipe Engine
        let extensionTriggered = false;
        let maxSnipeReached = false;
        if (item.endTime) {
            const timeLeft = item.endTime.getTime() - Date.now();
            const THREE_MINUTES = 3 * 60 * 1000;
            if (timeLeft > 0 && timeLeft <= THREE_MINUTES && (item.snipeCount || 0) < 5) {
                const newEndTime = new Date(Date.now() + THREE_MINUTES);
                item.endTime = newEndTime;
                item.snipeCount = (item.snipeCount || 0) + 1;
                await item.save();
                await SnipeLog.create({
                    listingId: item._id,
                    bidId: newBid._id,
                    extensionNum: item.snipeCount,
                    newEndTime
                });
                extensionTriggered = true;
                broadcastAuction(id, { type: 'snipe:extended', listingId: id, newEndTime: newEndTime.toISOString(), extensionNum: item.snipeCount });
            } else if (timeLeft <= THREE_MINUTES && (item.snipeCount || 0) >= 5) {
                maxSnipeReached = true;
            }
        }

        if (isAuto) {
            await AutoBid.findOneAndUpdate(
                { auctionId: item._id, bidderEmail: req.user.email },
                { bidderName: req.user.name, maxAmount: Number(amount), active: true },
                { upsert: true }
            );
        } else {
            await AutoBid.findOneAndUpdate({ auctionId: item._id, bidderEmail: req.user.email }, { active: false });
        }

        await resolveAutoBids(item._id);
        const finalItem = await Auction.findById(item._id);
        const bidCount = await Bid.countDocuments({ auctionId: item._id });

        broadcastAuction(id, {
            type: 'bid_update',
            itemId: id,
            newBid: finalItem.currentBid,
            bidCount,
            reserve_met: finalItem.currentBid >= Number(finalItem.reservePrice || 0)
        });
        broadcastGlobalActivity({
            message: `${req.user.name} placed a trade of ₹${finalItem.currentBid.toLocaleString('en-IN')} on "${item.title}"`,
            itemId: id, timestamp: new Date().toISOString()
        });

        res.json({ success: true, newBid: finalItem.currentBid, bidCount, message: maxSnipeReached ? 'Bid placed, but max extensions reached.' : 'Bid placed successfully!', extensionTriggered });
    } catch (e) {
        console.error('Bid Error:', e);
        res.status(500).json({ success: false, message: 'Server error placing bid' });
    }
}

app.post('/api/bids/:listingId', requireLogin, bidLimiter, handlePlaceBid);

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
    } catch (e) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.post('/api/admin/early-sell', requireAdmin, async (req, res) => {
    try {
        const listing = await Auction.findById(req.body.id);
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });
        if (listing.status !== 'active') return res.status(400).json({ error: 'Only active listings can enter early sell.' });

        const deadline = new Date(Date.now() + 5 * 60 * 1000);
        listing.endTime = deadline;
        listing.earlySellActivatedAt = new Date();
        listing.earlySellDeadline = deadline;
        listing.earlySellActivatedBy = req.adminUser.email;
        await listing.save();

        await pushNotification(listing.sellerEmail, {
            type: 'early_sell_activated',
            title: 'Early sell activated',
            message: `"${listing.title}" is now in a 5 minute closing window.`,
            actionUrl: `/item-detail.html?id=${listing._id}`,
            metadata: { auctionId: listing._id.toString(), deadline: deadline.toISOString() }
        });

        await AuditLog.create({
            action: 'EARLY_SELL_ACTIVATED',
            userEmail: req.adminUser.email,
            details: `${req.adminUser.email} activated early sell for ${listing.title} (${listing._id}) until ${deadline.toISOString()}`,
            ipAddress: req.ip
        });

        res.json({ success: true, deadline: deadline.toISOString() });
    } catch (e) {
        console.error('Early sell error:', e);
        res.status(500).json({ error: 'Server error activating early sell.' });
    }
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
    } catch (e) { res.status(500).json({ success: false, message: 'Error' }); }
});

// ── Alias: /api/bid-history/:id ──
app.get('/api/bid-history/:listingId', async (req, res) => {
    try {
        const rows = await Bid.find({ auctionId: req.params.listingId }).sort({ amount: -1 });
        res.json(rows.map(r => ({
            bidderName: r.bidderName,
            amount: r.amount,
            placedAt: r.placedAt
        })));
    } catch (e) { res.json([]); }
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
    } catch (e) { res.json({ bids: [], isRivalry: false, rivalryDetails: null }); }
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
    } catch (e) { res.json([]); }
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
    } catch (e) { res.json([]); }
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
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// ─────────────────────────────────────────────
// 9. CHAT ROUTES
// ─────────────────────────────────────────────

app.get('/api/chat/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        const userEmail = req.user.email;
        const otherEmail = userEmail === auction.sellerEmail ? (req.query.with || auction.winnerEmail) : auction.sellerEmail;
        if (!otherEmail) return res.status(400).json({ message: 'Counterparty not found.' });
        const conversationKey = getConversationKey(auctionId, userEmail, otherEmail);
        await Message.updateMany(
            {
                auctionId: auctionId,
                conversationKey,
                recipientEmail: userEmail,
                senderEmail: { $ne: userEmail },
                $or: [{ readAt: null }, { readAt: { $exists: false } }]
            },
            { $set: { readAt: new Date() } }
        );
        const messages = await Message.find({ auctionId: auctionId, conversationKey }).sort({ sentAt: 1 });
        const otherUser = await User.findOne({ email: otherEmail });

        res.json({
            messages: messages.map(m => ({ senderEmail: m.senderEmail, senderName: m.senderName, message: m.message, sentAt: m.sentAt })),
            auctionTitle: auction.title,
            myEmail: userEmail,
            otherName: otherUser ? otherUser.fullname : 'Other Party',
            otherEmail,
            conversationKey
        });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/chat/:auctionId', requireLogin, async (req, res) => {
    const auctionId = req.params.auctionId;
    const { message, recipientEmail } = req.body;
    try {
        const auction = await Auction.findById(auctionId);
        if (!auction) return res.status(404).json({ message: 'Auction not found.' });
        const userEmail = req.user.email;
        const otherEmail = recipientEmail || (userEmail === auction.sellerEmail ? auction.winnerEmail : auction.sellerEmail);
        if (!otherEmail) return res.status(400).json({ message: 'Counterparty not found.' });

        const text = String(message || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: 'Message cannot be empty.' });
        const conversationKey = getConversationKey(auctionId, userEmail, otherEmail);

        await Message.create({
            auctionId: auctionId,
            conversationKey,
            recipientEmail: otherEmail,
            senderEmail: userEmail,
            senderName: req.user.name,
            message: text
        });

        const saved = {
            senderEmail: userEmail,
            senderName: req.user.name,
            message: text,
            sentAt: new Date().toISOString()
        };

        const wsPayload = JSON.stringify({ type: 'chat_msg', auctionId, conversationKey, ...saved });
        const room = chatRooms.get(conversationKey);
        if (room) room.forEach(p => { if (p.ws.readyState === p.ws.OPEN) p.ws.send(wsPayload); });

        res.json({ success: true, message: saved });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/my-chats', requireLogin, async (req, res) => {
    const email = req.user.email;
    try {
        const messages = await Message.find({
            $or: [{ senderEmail: email }, { recipientEmail: email }]
        }).sort({ sentAt: -1 });
        const seen = new Set();
        const result = [];

        for (const message of messages) {
            const key = message.conversationKey || getConversationKey(message.auctionId, message.senderEmail, message.recipientEmail || email);
            if (seen.has(key)) continue;
            seen.add(key);

            const auction = await Auction.findById(message.auctionId);
            if (!auction) continue;

            const otherEmail = message.senderEmail === email ? message.recipientEmail : message.senderEmail;
            const otherUser = otherEmail ? await User.findOne({ email: otherEmail }) : null;
            const unread = await Message.countDocuments({
                conversationKey: key,
                recipientEmail: email,
                senderEmail: { $ne: email },
                $or: [{ readAt: null }, { readAt: { $exists: false } }]
            });

            result.push({
                auctionId: auction._id.toString(),
                auctionTitle: auction.title,
                auctionImage: auction.image,
                winningBid: auction.winningBid,
                otherName: otherUser ? otherUser.fullname : 'Other Party',
                otherEmail,
                myRole: auction.sellerEmail === email ? 'seller' : 'buyer',
                lastMessage: { senderName: message.senderName, message: message.message, sentAt: message.sentAt },
                unread,
                conversationKey: key
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
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
            trustScore: dbUser.trustScore || 50,
            ratingsCount: dbUser.ratingsCount || 0,
            activeListings,
            closedListings,
            totalBids,
            walletBalance: dbUser.walletBalance || 0,
            activeBids: activeAuctions,
            auctionsWon,
            watchlistCount
        });
    } catch (e) { res.status(500).json({}); }
});

app.get('/api/my-listings', requireLogin, async (req, res) => {
    try {
        const listings = await Auction.find({ sellerEmail: req.user.email }).sort({ createdAt: -1 });
        res.json(await Promise.all(listings.map(mapAuction)));
    } catch (e) {
        res.status(500).json([]);
    }
});

app.get('/api/watchlist', requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findOne({ email: req.user.email }).populate('watchlist');
        if (!dbUser || !dbUser.watchlist) return res.json([]);

        const mapped = await Promise.all(dbUser.watchlist.map(mapAuction));
        res.json(mapped);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/watchlist/toggle', requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findOne({ email: req.user.email });
        if (!dbUser) return res.status(404).json({ success: false, message: 'User not found' });

        const auctionId = req.body.id;
        if (!mongoose.Types.ObjectId.isValid(auctionId)) return res.status(400).json({ success: false, message: 'Invalid ID' });

        const index = dbUser.watchlist.findIndex((id) => id.toString() === auctionId);
        let added = false;

        if (index === -1) {
            dbUser.watchlist.push(auctionId);
            added = true;
        } else {
            dbUser.watchlist.splice(index, 1);
        }

        await dbUser.save();
        res.json({ success: true, added, watchlist: dbUser.watchlist });
    } catch (e) { res.status(500).json({ success: false, message: 'Server Error' }); }
});

// ── Alias: /api/my-bids ──
app.get('/api/my-bids', requireLogin, async (req, res) => {
    try {
        const bids = await Bid.find({ bidderEmail: req.user.email }).populate('auctionId').sort({ placedAt: -1 });
        res.json(bids);
    } catch (e) { res.status(500).json([]); }
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
            sellerEmail: r.auctionId.sellerEmail,
            winnerEmail: r.auctionId.winnerEmail,
            auctionId: r.auctionId._id.toString()
        }));
        res.json(resolved);
    } catch (e) { res.status(500).json([]); }
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
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ─────────────────────────────────────────────
// 11. ADMIN ROUTES
// ─────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeAuctions = await Auction.countDocuments({ status: 'active' });
        const pendingCount = await Auction.countDocuments({ status: { $in: ['pending_review', 'under_review'] } });
        const totalBidsToday = await Bid.countDocuments({
            placedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        const totalVolume = await Auction.aggregate([
            { $match: { status: 'closed', winnerEmail: { $exists: true } } },
            { $group: { _id: null, total: { $sum: '$currentBid' } } }
        ]);

        res.json({
            totalUsers,
            activeAuctions,
            totalBidsToday,
            totalVolume: totalVolume[0]?.total || 0,
            pendingCount,
            adminCount: await User.countDocuments({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] })
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error fetching stats' });
    }
});

app.get('/api/admin/pending', requireAdmin, async (req, res) => {
    try {
        const query = req.adminUser.isSuperAdmin
            ? { status: { $in: ['pending_review', 'under_review', 'rejected'] } }
            : { assignedAdminEmail: req.adminUser.email, status: { $in: ['pending_review', 'under_review'] } };
        const pending = await Auction.find(query).sort({ createdAt: 1 });
        res.json(await Promise.all(pending.map(mapAuction)));
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/team-overview', requireSuperAdmin, async (req, res) => {
    try {
        const admins = await User.find({ $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }] }).select('-passwordHash').sort({ fullname: 1 });
        const adminEmails = admins.map((adminUser) => adminUser.email);
        const [assignedAgg, approvedAgg, rejectedAgg] = await Promise.all([
            Auction.aggregate([
                { $match: { assignedAdminEmail: { $in: adminEmails }, status: { $in: ['pending_review', 'under_review'] } } },
                { $group: { _id: '$assignedAdminEmail', count: { $sum: 1 } } }
            ]),
            Auction.aggregate([
                { $match: { reviewedByEmail: { $in: adminEmails }, status: 'active' } },
                { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
            ]),
            Auction.aggregate([
                { $match: { reviewedByEmail: { $in: adminEmails }, status: 'rejected' } },
                { $group: { _id: '$reviewedByEmail', count: { $sum: 1 } } }
            ])
        ]);
        const assignedMap = Object.fromEntries(assignedAgg.map((row) => [row._id, row.count]));
        const approvedMap = Object.fromEntries(approvedAgg.map((row) => [row._id, row.count]));
        const rejectedMap = Object.fromEntries(rejectedAgg.map((row) => [row._id, row.count]));
        const team = admins.map((adminUser) => ({
            id: adminUser._id.toString(),
            fullname: adminUser.fullname,
            email: adminUser.email,
            isSuperAdmin: Boolean(adminUser.isSuperAdmin),
            isAdmin: Boolean(adminUser.isAdmin || adminUser.isSuperAdmin || adminUser.role === 'admin'),
            assignedProducts: assignedMap[adminUser.email] || 0,
            approvedProducts: approvedMap[adminUser.email] || 0,
            rejectedProducts: rejectedMap[adminUser.email] || 0
        }));
        res.json(team);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/set-admin', requireSuperAdmin, async (req, res) => {
    try {
        const target = await User.findById(req.body.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.isSuperAdmin) return res.status(400).json({ error: 'Super admin status is managed separately.' });

        const wasAdmin = Boolean(target.isAdmin);
        target.isAdmin = Boolean(req.body.isAdmin);
        await target.save();

        if (!wasAdmin && target.isAdmin) {
            await pushNotification(target.email, {
                type: 'admin_access_granted',
                title: 'Admin access granted',
                message: 'Review the admin handbook before validating or approving listings.',
                actionUrl: '/admin-handbook.html',
                metadata: { handbook: true }
            });
        }

        await AuditLog.create({
            action: target.isAdmin ? 'ADMIN_GRANTED' : 'ADMIN_REVOKED',
            userEmail: req.superAdminUser.email,
            details: `${req.superAdminUser.email} ${target.isAdmin ? 'granted' : 'revoked'} admin access for ${target.email}`,
            ipAddress: req.ip
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/assign-sell-requests', requireSuperAdmin, async (req, res) => {
    try {
        const admins = await User.find({
            isSuperAdmin: false,
            $or: [{ isAdmin: true }, { role: 'admin' }]
        }).sort({ fullname: 1 });
        if (!admins.length) return res.status(400).json({ error: 'No admins available for assignment.' });

        const queue = await Auction.find({ status: 'pending_review', assignedAdminEmail: { $in: [null, ''] } }).sort({ createdAt: 1 });
        let pointer = 0;
        for (const request of queue) {
            const adminUser = admins[pointer % admins.length];
            request.assignedAdminId = adminUser._id;
            request.assignedAdminEmail = adminUser.email;
            request.assignedAt = new Date();
            request.status = 'under_review';
            await request.save();

            await pushNotification(adminUser.email, {
                type: 'sell_request_assigned',
                title: 'New sell request assigned',
                message: `"${request.title}" was assigned to you for review.`,
                actionUrl: '/workspace/review.html',
                metadata: { auctionId: request._id.toString() }
            });
            pointer += 1;
        }

        res.json({ success: true, assignedCount: queue.length });
    } catch (e) {
        console.error('Assignment error:', e);
        res.status(500).json({ error: 'Server error assigning requests' });
    }
});

app.post('/api/admin/assign-reviewer', requireSuperAdmin, async (req, res) => {
    try {
        const { listingId, reviewerEmail } = req.body;
        const listing = await Auction.findById(listingId);
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });
        if (!['pending_review', 'under_review', 'rejected'].includes(listing.status)) {
            return res.status(400).json({ error: 'Only review-queue listings can be assigned.' });
        }

        if (!reviewerEmail) {
            listing.assignedAdminId = undefined;
            listing.assignedAdminEmail = '';
            listing.assignedAt = null;
            if (listing.status !== 'rejected') listing.status = 'pending_review';
            await listing.save();
            return res.json({ success: true, assigned: false });
        }

        const reviewer = await User.findOne({
            email: String(reviewerEmail).toLowerCase(),
            $or: [{ isAdmin: true }, { isSuperAdmin: true }, { role: 'admin' }]
        });
        if (!reviewer) return res.status(404).json({ error: 'Reviewer not found.' });

        listing.assignedAdminId = reviewer._id;
        listing.assignedAdminEmail = reviewer.email;
        listing.assignedAt = new Date();
        if (listing.status !== 'rejected') listing.status = 'under_review';
        await listing.save();

        await pushNotification(reviewer.email, {
            type: 'sell_request_assigned',
            title: 'Review assignment updated',
            message: `"${listing.title}" is now assigned to you for review.`,
            actionUrl: reviewer.isSuperAdmin ? '/workspace/governance.html' : '/workspace/review.html',
            metadata: { auctionId: listing._id.toString() }
        });

        res.json({ success: true, assigned: true, reviewerEmail: reviewer.email });
    } catch (e) {
        console.error('Manual assignment error:', e);
        res.status(500).json({ error: 'Server error updating assignment.' });
    }
});

app.post('/api/admin/review-request', requireAdmin, async (req, res) => {
    try {
        const { id, decision, notes, rejectionReason, moderationChecklist } = req.body;
        const listing = await Auction.findById(id);
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });

        const canReview = req.adminUser.isSuperAdmin || listing.assignedAdminEmail === req.adminUser.email;
        if (!canReview) return res.status(403).json({ error: 'This request is not assigned to you.' });

        listing.reviewNotes = notes || '';
        listing.reviewedAt = new Date();
        listing.reviewedByEmail = req.adminUser.email;
        listing.verified = decision === 'approve';
        listing.moderationChecklist = {
            clearMediaOnly: Boolean(moderationChecklist && moderationChecklist.clearMediaOnly),
            noFacesVisible: Boolean(moderationChecklist && moderationChecklist.noFacesVisible),
            noSexualContent: Boolean(moderationChecklist && moderationChecklist.noSexualContent),
            noViolenceOrHarm: Boolean(moderationChecklist && moderationChecklist.noViolenceOrHarm),
            categoryAndClaimsVerified: Boolean(moderationChecklist && moderationChecklist.categoryAndClaimsVerified)
        };

        if (decision === 'approve') {
            const allChecksPassed = Object.values(listing.moderationChecklist || {}).every(Boolean);
            if (!allChecksPassed) {
                return res.status(400).json({ error: 'Complete every review checklist point before allowing the product on the market.' });
            }
            listing.status = 'active';
            listing.rejectionReason = '';
            listing.earlySellActivatedAt = null;
            listing.earlySellDeadline = null;
            listing.earlySellActivatedBy = '';
            await pushNotification(listing.sellerEmail, {
                type: 'sell_request_approved',
                title: 'Listing approved',
                message: `"${listing.title}" is now live on Gavel.`,
                actionUrl: `/item-detail.html?id=${listing._id}`,
                metadata: { auctionId: listing._id.toString() }
            });
        } else {
            listing.status = 'rejected';
            listing.rejectionReason = rejectionReason || 'Listing information needs correction.';
            listing.earlySellActivatedAt = null;
            listing.earlySellDeadline = null;
            listing.earlySellActivatedBy = '';
            await pushNotification(listing.sellerEmail, {
                type: 'sell_request_rejected',
                title: 'Listing requires updates',
                message: `"${listing.title}" was rejected: ${listing.rejectionReason}`,
                actionUrl: '/workspace/listings.html',
                metadata: { auctionId: listing._id.toString() }
            });
        }

        await listing.save();

        await AuditLog.create({
            action: decision === 'approve' ? 'SELL_REQUEST_APPROVED' : 'SELL_REQUEST_REJECTED',
            userEmail: req.adminUser.email,
            details: `${req.adminUser.email} ${decision}d ${listing.title} (${listing._id})`,
            ipAddress: req.ip
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Review error:', e);
        res.status(500).json({ error: 'Server error processing review.' });
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

// Catch-all for unknown /api routes to prevent infinite loop with Next.js handler
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

// Let Next.js handle all other requests (static public/ files are handled above)
app.use((req, res) => {
    return handle(req, res);
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
const PORT = process.env.PORT || 3001;

// Prepare Next.js and then start server
nextApp.prepare().then(() => {
    console.log('   Next.js  : Ready');

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`\n🔨 Gavel is open at http://0.0.0.0:${PORT}`);
        console.log(`   Access on network: http://172.16.100.91:${PORT}`);
        console.log(`   Database  : MongoDB Atlas`);
        console.log(`   Frontend  : Next.js\n`);
    });

}).catch(err => {
    console.error('Next.js error:', err);
    process.exit(1);
});
