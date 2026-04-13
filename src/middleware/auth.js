const jwt = require('jsonwebtoken');
const { JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } = require('../config/env');
const User = require('../models/User');
const { createClient } = require('@supabase/supabase-js');

const supabaseKey = SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_KEY.startsWith('sb_publishable_') ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && supabaseKey) ? createClient(SUPABASE_URL, supabaseKey) : null;

async function requireLogin(req, res, next) {
    const token = req.cookies?.sb_access_token || req.cookies?.jwt_token ||
        (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
        return res.status(401).json({ success: false, message: 'Login required.', redirect: '/login.html' });
    }

    try {
        if (JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const dbUser = await User.findById(decoded.id);
                if (dbUser) {
                    req.user = {
                        id: dbUser._id,
                        email: dbUser.email,
                        name: dbUser.fullname,
                        role: dbUser.role,
                        isAdmin: dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin',
                        isSuperAdmin: dbUser.isSuperAdmin
                    };
                    return next();
                }
            } catch (jwtErr) { /* fall through to Supabase */ }
        }

        if (supabase) {
            const { data, error } = await supabase.auth.getUser(token);
            if (data?.user) {
                const email = data.user.email;
                const dbUser = await User.findOne({ email });
                if (dbUser) {
                    req.user = {
                        id: dbUser._id,
                        email: dbUser.email,
                        name: dbUser.fullname,
                        role: dbUser.role,
                        isAdmin: dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin',
                        isSuperAdmin: dbUser.isSuperAdmin
                    };
                    return next();
                }
                req.user = {
                    id: data.user.id,
                    email,
                    name: data.user.user_metadata?.full_name || email,
                    role: 'bidder',
                    isAdmin: false,
                    isSuperAdmin: false
                };
                return next();
            }
        }

        return res.status(401).json({ success: false, message: 'Invalid or expired token.', redirect: '/login.html' });
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Authentication failed.', redirect: '/login.html' });
    }
}

async function requireAdmin(req, res, next) {
    try {
        await new Promise((resolve, reject) => {
            requireLogin(req, res, (err) => err ? reject(err) : resolve());
        });

        const dbUser = await User.findById(req.user.id);
        if (!dbUser || !(dbUser.isAdmin || dbUser.isSuperAdmin || dbUser.role === 'admin')) {
            return res.status(403).json({ error: 'Forbidden. Admin access required.' });
        }
        req.adminUser = dbUser;
        next();
    } catch (e) {
        if (res.headersSent) return;
        res.status(401).json({ error: 'Authentication required.' });
    }
}

async function requireSuperAdmin(req, res, next) {
    try {
        await new Promise((resolve, reject) => {
            requireLogin(req, res, (err) => err ? reject(err) : resolve());
        });

        const dbUser = await User.findById(req.user.id);
        if (!dbUser || !dbUser.isSuperAdmin) {
            return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
        }
        req.superAdminUser = dbUser;
        next();
    } catch (e) {
        if (res.headersSent) return;
        res.status(401).json({ error: 'Authentication required.' });
    }
}

module.exports = { requireLogin, requireAdmin, requireSuperAdmin };