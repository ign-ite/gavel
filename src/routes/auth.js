const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { JWT_SECRET, SUPER_ADMIN_EMAILS } = require('../config/env');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };

router.post('/register', authLimiter, async (req, res) => {
    try {
        if (!JWT_SECRET) return res.status(503).json({ error: 'Email authentication is disabled.' });
        const { fullname, email, password, college, phoneNumber } = req.body;
        if (!fullname || !email || !password || !phoneNumber) return res.status(400).json({ error: 'Missing fields' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const isEdu = email.endsWith('.edu');
        const isAcIn = email.endsWith('.ac.in');
        const isIndianInst = ['.ernet.in', '.nit.ac.in', '.iit.ac.in', '.iiit.ac.in'].some(d => email.endsWith(d));
        const campusVerified = isEdu || isAcIn || isIndianInst;

        const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        const newUser = await User.create({
            fullname,
            email: email.toLowerCase(),
            passwordHash,
            college: college || null,
            phoneNumber: String(phoneNumber || '').trim(),
            campusVerified,
            isSuperAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase()),
            isAdmin: SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
        });

        const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
         res.cookie('jwt_token', token, cookieOpts);

         await AuditLog.create({ action: 'USER_REGISTERED', userEmail: newUser.email, details: `Registered: ${fullname}` });

        res.json({ success: true, user: { email: newUser.email, name: newUser.fullname, campusVerified, phoneNumber: newUser.phoneNumber } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

router.post('/login', authLimiter, async (req, res) => {
    try {
        if (!JWT_SECRET) return res.status(503).json({ error: 'Email authentication is disabled.' });
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
        if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
         res.cookie('jwt_token', token, cookieOpts);

         await AuditLog.create({ action: 'USER_LOGIN', userEmail: user.email, details: `Login: ${user.fullname}` });

        res.json({ success: true, user: { email: user.email, name: user.fullname, role: user.role, phoneNumber: user.phoneNumber || '' } });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

router.get('/me', require('../middleware/auth').requireLogin, async (req, res) => {
    try {
        const dbUser = await User.findById(req.user.id);
        if (!dbUser) return res.status(404).json({ error: 'User not found' });
        res.json({
            id: dbUser._id, email: dbUser.email, name: dbUser.fullname, role: dbUser.role,
            college: dbUser.college, campusVerified: dbUser.campusVerified, walletBalance: dbUser.walletBalance,
            isAdmin: dbUser.isAdmin || dbUser.isSuperAdmin, isSuperAdmin: dbUser.isSuperAdmin,
            trustScore: dbUser.trustScore, avatar: dbUser.avatar, phoneNumber: dbUser.phoneNumber || ''
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

module.exports = router;
