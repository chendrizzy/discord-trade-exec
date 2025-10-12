const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all dashboard routes
router.use(apiLimiter);

// Main dashboard
router.get('/', ensureAuthenticated, (req, res) => {
    res.sendFile('dashboard.html', { root: './public' });
});

// Risk management settings
router.get('/risk', ensureAuthenticated, (req, res) => {
    res.sendFile('risk.html', { root: './public' });
});

// Exchange management
router.get('/exchanges', ensureAuthenticated, (req, res) => {
    res.sendFile('exchanges.html', { root: './public' });
});

// Analytics
router.get('/analytics', ensureAuthenticated, (req, res) => {
    res.sendFile('analytics.html', { root: './public' });
});

// Signal providers
router.get('/providers', ensureAuthenticated, (req, res) => {
    res.sendFile('providers.html', { root: './public' });
});

module.exports = router;
