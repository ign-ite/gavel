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

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many authentication attempts.' });
const bidLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Too many bid requests.' });

module.exports = { createRateLimiter, authLimiter, bidLimiter };