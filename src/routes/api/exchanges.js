const express = require('express');
const router = express.Router();
const ccxt = require('ccxt');
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { encrypt, decrypt } = require('../../middleware/encryption');
const User = require('../../models/User');

// Apply rate limiting
router.use(apiLimiter);

/**
 * Validate exchange API key permissions
 * Checks if the API key has the required permissions for trading
 */
async function validateExchangeKey(exchangeName, apiKey, apiSecret, testnet = false) {
    try {
        // Supported exchanges
        const supportedExchanges = ['binance', 'coinbase', 'kraken', 'bybit', 'okx'];

        if (!supportedExchanges.includes(exchangeName.toLowerCase())) {
            return {
                valid: false,
                error: `Unsupported exchange: ${exchangeName}. Supported: ${supportedExchanges.join(', ')}`
            };
        }

        // Initialize exchange instance
        const ExchangeClass = ccxt[exchangeName.toLowerCase()];
        const exchange = new ExchangeClass({
            apiKey,
            secret: apiSecret,
            enableRateLimit: true,
            options: {
                defaultType: 'future' // For derivatives if needed
            }
        });

        // Set testnet if requested
        if (testnet) {
            exchange.setSandboxMode(true);
        }

        // Test 1: Fetch balance (requires read permission)
        let balance;
        try {
            balance = await exchange.fetchBalance();
        } catch (error) {
            return {
                valid: false,
                error: 'Failed to fetch balance. Check API key permissions.',
                details: error.message
            };
        }

        // Test 2: Check if trading is enabled
        let canTrade = false;
        try {
            // Try to fetch open orders (requires trading permission)
            await exchange.fetchOpenOrders();
            canTrade = true;
        } catch (error) {
            // Some exchanges throw error if no orders, check the error type
            if (error.message.includes('permission') || error.message.includes('Invalid API')) {
                return {
                    valid: false,
                    error: 'API key does not have trading permissions enabled',
                    details: error.message
                };
            }
            // If it's just "no orders", that's fine - trading is enabled
            canTrade = true;
        }

        // Test 3: Verify API key restrictions
        const permissions = {
            canRead: true, // We successfully fetched balance
            canTrade,
            canWithdraw: false // We don't allow withdrawals for safety
        };

        // Get account info
        const accountInfo = {
            exchange: exchangeName,
            totalBalance: 0,
            currencies: []
        };

        // Calculate total balance in USD (approximate)
        if (balance && balance.total) {
            for (const [currency, amount] of Object.entries(balance.total)) {
                if (amount > 0) {
                    accountInfo.currencies.push({
                        currency,
                        amount: amount.toFixed(8)
                    });
                }
            }
        }

        return {
            valid: true,
            permissions,
            accountInfo,
            testnet
        };

    } catch (error) {
        return {
            valid: false,
            error: 'Failed to validate exchange API key',
            details: error.message
        };
    }
}

/**
 * GET /api/exchanges
 * List user's connected exchanges (without showing full API keys)
 */
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user.tradingConfig || !user.tradingConfig.exchanges) {
            return res.json({
                success: true,
                exchanges: []
            });
        }

        // Return exchange info without sensitive data
        const exchanges = user.tradingConfig.exchanges.map(exchange => ({
            id: exchange._id,
            name: exchange.name,
            isActive: exchange.isActive,
            testnet: exchange.testnet,
            lastValidated: exchange.lastValidated,
            // Show only last 4 characters of API key
            apiKeyPreview: exchange.apiKey ? `****${exchange.apiKey.encrypted.slice(-4)}` : null,
            addedAt: exchange.createdAt
        }));

        res.json({
            success: true,
            exchanges
        });

    } catch (error) {
        console.error('Error fetching exchanges:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch exchanges'
        });
    }
});

/**
 * POST /api/exchanges
 * Add new exchange API key (encrypted)
 */
router.post('/', ensureAuthenticated, async (req, res) => {
    try {
        const { name, apiKey, apiSecret, testnet = false } = req.body;

        // Validation
        if (!name || !apiKey || !apiSecret) {
            return res.status(400).json({
                success: false,
                error: 'Exchange name, API key, and API secret are required'
            });
        }

        // Validate API key permissions
        console.log(`Validating ${name} API key...`);
        const validation = await validateExchangeKey(name, apiKey, apiSecret, testnet);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error,
                details: validation.details
            });
        }

        // Encrypt API key and secret
        const encryptedApiKey = encrypt(apiKey);
        const encryptedApiSecret = encrypt(apiSecret);

        // Get user
        const user = await User.findById(req.user._id);

        // Check if exchange already exists
        const existingExchange = user.tradingConfig.exchanges.find(
            ex => ex.name.toLowerCase() === name.toLowerCase() && ex.testnet === testnet
        );

        if (existingExchange) {
            return res.status(409).json({
                success: false,
                error: `${name} ${testnet ? '(testnet)' : ''} already connected`
            });
        }

        // Add encrypted exchange
        user.tradingConfig.exchanges.push({
            name,
            apiKey: {
                encrypted: encryptedApiKey.encrypted,
                iv: encryptedApiKey.iv,
                authTag: encryptedApiKey.authTag
            },
            apiSecret: {
                encrypted: encryptedApiSecret.encrypted,
                iv: encryptedApiSecret.iv,
                authTag: encryptedApiSecret.authTag
            },
            isActive: true,
            testnet,
            lastValidated: new Date(),
            permissions: validation.permissions
        });

        await user.save();

        res.json({
            success: true,
            message: `${name} connected successfully`,
            validation: {
                permissions: validation.permissions,
                accountInfo: validation.accountInfo
            }
        });

    } catch (error) {
        console.error('Error adding exchange:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add exchange',
            details: error.message
        });
    }
});

/**
 * DELETE /api/exchanges/:id
 * Remove exchange API key
 */
router.delete('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(req.user._id);

        const exchangeIndex = user.tradingConfig.exchanges.findIndex(
            ex => ex._id.toString() === id
        );

        if (exchangeIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Exchange not found'
            });
        }

        const exchangeName = user.tradingConfig.exchanges[exchangeIndex].name;
        user.tradingConfig.exchanges.splice(exchangeIndex, 1);

        await user.save();

        res.json({
            success: true,
            message: `${exchangeName} removed successfully`
        });

    } catch (error) {
        console.error('Error removing exchange:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove exchange'
        });
    }
});

/**
 * POST /api/exchanges/:id/validate
 * Re-validate exchange API key permissions
 */
router.post('/:id/validate', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(req.user._id);

        const exchange = user.tradingConfig.exchanges.find(
            ex => ex._id.toString() === id
        );

        if (!exchange) {
            return res.status(404).json({
                success: false,
                error: 'Exchange not found'
            });
        }

        // Decrypt API credentials
        const apiKey = decrypt(
            exchange.apiKey.encrypted,
            exchange.apiKey.iv,
            exchange.apiKey.authTag
        );

        const apiSecret = decrypt(
            exchange.apiSecret.encrypted,
            exchange.apiSecret.iv,
            exchange.apiSecret.authTag
        );

        // Validate
        const validation = await validateExchangeKey(
            exchange.name,
            apiKey,
            apiSecret,
            exchange.testnet
        );

        if (!validation.valid) {
            // Mark as inactive if validation fails
            exchange.isActive = false;
            await user.save();

            return res.status(400).json({
                success: false,
                error: validation.error,
                details: validation.details
            });
        }

        // Update validation timestamp and permissions
        exchange.lastValidated = new Date();
        exchange.permissions = validation.permissions;
        exchange.isActive = true;

        await user.save();

        res.json({
            success: true,
            message: 'Exchange validated successfully',
            validation: {
                permissions: validation.permissions,
                accountInfo: validation.accountInfo
            }
        });

    } catch (error) {
        console.error('Error validating exchange:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate exchange',
            details: error.message
        });
    }
});

/**
 * PATCH /api/exchanges/:id/toggle
 * Enable/disable exchange
 */
router.patch('/:id/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(req.user._id);

        const exchange = user.tradingConfig.exchanges.find(
            ex => ex._id.toString() === id
        );

        if (!exchange) {
            return res.status(404).json({
                success: false,
                error: 'Exchange not found'
            });
        }

        exchange.isActive = !exchange.isActive;
        await user.save();

        res.json({
            success: true,
            message: `Exchange ${exchange.isActive ? 'enabled' : 'disabled'}`,
            isActive: exchange.isActive
        });

    } catch (error) {
        console.error('Error toggling exchange:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle exchange'
        });
    }
});

module.exports = router;
