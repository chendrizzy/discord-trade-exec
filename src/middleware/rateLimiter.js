const rateLimit = require('express-rate-limit');

// Webhook endpoints rate limiter
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,           // 1 minute window
    max: 100,                       // 100 requests per minute
    message: { error: 'Too many webhook requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// Dashboard API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 minutes
    max: 100,                       // 100 requests per 15 minutes
    message: { error: 'Too many API requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 minutes
    max: 5,                         // 5 login attempts per 15 minutes
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Login rate limiter (per IP)
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,      // 1 hour
    max: 10,                        // 10 attempts per hour
    skipSuccessfulRequests: true,   // Don't count successful logins
    message: { error: 'Too many login attempts, please try again later' }
});

module.exports = {
    webhookLimiter,
    apiLimiter,
    authLimiter,
    loginLimiter
};
