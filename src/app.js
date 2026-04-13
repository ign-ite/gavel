require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const User = require('./models/User');
const { JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, SUPER_ADMIN_EMAILS } = require('./config/env');
const { authLimiter } = require('./middleware/rateLimiter');
const AuditLog = require('./models/AuditLog');

const app = express();

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
const cookieOptsShort = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Production security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Static files with aggressive caching for production
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
    lastModified: true,
    immutable: process.env.NODE_ENV === 'production',
    setHeaders: (res, filePath) => {
        // Long cache for hashed/immutable assets
        if (filePath.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|otf)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // Short cache for HTML (always revalidate)
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    }
}));

const supabaseKey = SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_KEY.startsWith('sb_publishable_') ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && supabaseKey) ? createClient(SUPABASE_URL, supabaseKey) : null;

const redirectIfLoggedIn = (req, res, next) => {
    if (req.cookies?.sb_access_token || req.cookies?.jwt_token) return res.redirect('/');
    next();
};
app.get('/login.html', redirectIfLoggedIn, (req, res, next) => next());
app.get('/signup.html', redirectIfLoggedIn, (req, res, next) => next());

app.get('/api/config', (req, res) => {
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

app.get('/api/me', async (req, res) => {
    const token = req.cookies?.sb_access_token || req.cookies?.jwt_token ||
        (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return res.json({ loggedIn: false });

    try {
        if (JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const dbUser = await User.findById(decoded.id);
                if (dbUser) return res.json({ loggedIn: true, user: { id: dbUser._id, email: dbUser.email, name: dbUser.fullname, role: dbUser.role, isAdmin: dbUser.isAdmin || dbUser.isSuperAdmin, isSuperAdmin: dbUser.isSuperAdmin } });
            } catch (e) { /* fallthrough */ }
        }
        if (supabase) {
            const { data, error } = await supabase.auth.getUser(token);
            if (data?.user) {
                const dbUser = await User.findOne({ email: data.user.email });
                if (dbUser) return res.json({ loggedIn: true, user: { id: dbUser._id, email: dbUser.email, name: dbUser.fullname, role: dbUser.role, isAdmin: dbUser.isAdmin || dbUser.isSuperAdmin, isSuperAdmin: dbUser.isSuperAdmin } });
                return res.json({ loggedIn: true, user: { email: data.user.email, name: data.user.user_metadata?.full_name || data.user.email, role: 'bidder' } });
            }
        }
        res.json({ loggedIn: false });
    } catch (e) { res.json({ loggedIn: false }); }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('sb_access_token', { path: '/' });
    res.clearCookie('jwt_token', { path: '/' });
    res.json({ success: true });
});

app.post('/api/user/sync', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const bodyToken = req.body?.token;
        const token = (authHeader ? authHeader.split(' ')[1] : null) || bodyToken;
        if (!token) return res.status(401).json({ error: 'No token' });
        if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

        const email = data.user.email.toLowerCase();
        const fullname = data.user.user_metadata?.full_name || data.user.user_metadata?.name || email.split('@')[0];
        const existing = await User.findOne({ email });

         if (existing) {
            if (fullname && fullname !== existing.fullname) { existing.fullname = fullname; await existing.save(); }
            if (JWT_SECRET) {
                const jwtToken = jwt.sign({ id: existing._id, email: existing.email }, JWT_SECRET, { expiresIn: '7d' });
                res.cookie('jwt_token', jwtToken, cookieOpts);
            }
            res.cookie('sb_access_token', token, cookieOptsShort);
            return res.json({ success: true, user: { id: existing._id, email: existing.email, name: existing.fullname, isAdmin: existing.isAdmin || existing.isSuperAdmin, isSuperAdmin: existing.isSuperAdmin } });
        }

        const newUser = await User.create({
            email, fullname,
            isSuperAdmin: SUPER_ADMIN_EMAILS.includes(email),
            isAdmin: SUPER_ADMIN_EMAILS.includes(email)
        });
        if (JWT_SECRET) {
            const jwtToken = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
            res.cookie('jwt_token', jwtToken, cookieOpts);
        }
        res.cookie('sb_access_token', token, cookieOptsShort);
        res.json({ success: true, user: { id: newUser._id, email: newUser.email, name: newUser.fullname, isAdmin: newUser.isAdmin || newUser.isSuperAdmin, isSuperAdmin: newUser.isSuperAdmin } });
    } catch (e) { res.status(500).json({ error: 'Sync failed' }); }
});

const Media = require('./models/Media');
app.get('/api/media/:id', async (req, res) => {
    try {
        const doc = await Media.findById(req.params.id);
        if (!doc) return res.status(404).send('Not found');

        res.setHeader('Content-Type', doc.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Accept-Ranges', 'bytes');

        const data = doc.data;
        const range = req.headers.range;

        if (range && doc.kind === 'video') {
            const total = data.length;
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
            const chunk = data.slice(start, end + 1);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
            res.setHeader('Content-Length', chunk.length);
            res.status(206).send(chunk);
        } else {
            res.setHeader('Content-Length', data.length);
            res.send(data);
        }
    } catch (e) { res.status(404).send('Not found'); }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/auctions', require('./routes/auctions'));
app.use('/api/auction', require('./routes/auctions'));
app.use('/api/sell', require('./routes/auctions'));
app.use('/api/end-auction', require('./routes/auctions'));
app.use('/api/remove-item', require('./routes/auctions'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/place-bid', require('./routes/bids'));
app.use('/api/bid-history', require('./routes/bids'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api', require('./routes/users'));

app.get('/auth/callback', async (req, res) => {
    try {
        const { access_token, refresh_token } = req.query;
        if (!access_token || !supabase) return res.redirect('/login.html');

        const { data, error } = await supabase.auth.getUser(access_token);
        if (error || !data?.user) return res.redirect('/login.html');

        const email = data.user.email.toLowerCase();
        const fullname = data.user.user_metadata?.full_name || data.user.user_metadata?.name || email.split('@')[0];

        let dbUser = await User.findOne({ email });
        if (!dbUser) {
            const isEdu = email.endsWith('.edu');
            const isAcIn = email.endsWith('.ac.in');
            const isIndianInst = ['.ernet.in', '.nit.ac.in', '.iit.ac.in', '.iiit.ac.in'].some(d => email.endsWith(d));
            dbUser = await User.create({
                email, fullname,
                campusVerified: isEdu || isAcIn || isIndianInst,
                isSuperAdmin: SUPER_ADMIN_EMAILS.includes(email),
                isAdmin: SUPER_ADMIN_EMAILS.includes(email)
            });
        } else if (fullname && fullname !== dbUser.fullname) {
            dbUser.fullname = fullname;
            await dbUser.save();
        }

         if (JWT_SECRET) {
             const token = require('jsonwebtoken').sign({ id: dbUser._id, email: dbUser.email }, JWT_SECRET, { expiresIn: '7d' });
             res.cookie('jwt_token', token, cookieOpts);
         }
         res.cookie('sb_access_token', access_token, cookieOptsShort);

         res.redirect('/dashboard-home.html'); /* DASHBOARD-HOME ADDITION */
     } catch (e) {
         console.error('Auth callback error:', e);
         res.redirect('/login.html');
     }
 });

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

module.exports = app;