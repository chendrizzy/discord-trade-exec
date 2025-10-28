// External dependencies
const express = require('express');

const router = express.Router();
const ccxt = require('ccxt');
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter, exchangeApiLimiter, getExchangeRateLimitStatus } = require('../../middleware/rateLimiter');
const { encrypt, decrypt } = require('../../middleware/encryption');
const { validate } = require('../../middleware/validation');
const {
  createExchangeBody,
  deleteExchangeParams,
  validateExchangeParams,
  toggleExchangeParams,
  cacheInvalidateBody,
  compareFeesQuery
} = require('../../validators/exchanges.validators');
const User = require('../../models/User');
const { sendSuccess, sendError, sendValidationError, sendNotFound } = require('../../utils/api-response');
const cacheService = require('../../services/CacheService');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');

// Apply general API rate limiting
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

    logger.error('Error fetching exchanges:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * POST /api/exchanges
 * Add new exchange API key (encrypted)
 */
router.post('/', ensureAuthenticated, validate(createExchangeBody, 'body'), async (req, res) => {
  try {
    const { name, apiKey, apiSecret, testnet = false } = req.body;

    // Validation
    if (!name || !apiKey || !apiSecret) {
      return sendValidationError(res, 'Exchange name, API key, and API secret are required');
    }

    // Validate API key permissions
    logger.info('[Exchanges] Validating API key', { exchange: name, testnet });
    const validation = await validateExchangeKey(name, apiKey, apiSecret, testnet);

    if (!validation.valid) {
      return sendValidationError(res, validation.error, { details: validation.details });
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
      return sendError(res, `${name} ${testnet ? '(testnet)' : ''} already connected`, 409);
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

    logger.error('Error adding exchange:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * DELETE /api/exchanges/:id
 * Remove exchange API key
 */
router.delete('/:id', ensureAuthenticated, validate(deleteExchangeParams, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.user._id);

    const exchangeIndex = user.tradingConfig.exchanges.findIndex(ex => ex._id.toString() === id);

    if (exchangeIndex === -1) {
      return sendNotFound(res, 'Exchange');
    }

    const exchangeName = user.tradingConfig.exchanges[exchangeIndex].name;
    user.tradingConfig.exchanges.splice(exchangeIndex, 1);

    await user.save();

    res.json({
      success: true,
      message: `${exchangeName} removed successfully`
    });
  } catch (error) {

    logger.error('Error removing exchange:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * POST /api/exchanges/:id/validate
 * Re-validate exchange API key permissions
 */
router.post('/:id/validate', ensureAuthenticated, validate(validateExchangeParams, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.user._id);

    const exchange = user.tradingConfig.exchanges.find(ex => ex._id.toString() === id);

    if (!exchange) {
      return sendNotFound(res, 'Exchange');
    }

    // Decrypt API credentials
    const apiKey = decrypt(exchange.apiKey.encrypted, exchange.apiKey.iv, exchange.apiKey.authTag);

    const apiSecret = decrypt(exchange.apiSecret.encrypted, exchange.apiSecret.iv, exchange.apiSecret.authTag);

    // Validate
    const validation = await validateExchangeKey(exchange.name, apiKey, apiSecret, exchange.testnet);

    if (!validation.valid) {
      // Mark as inactive if validation fails
      exchange.isActive = false;
      await user.save();

      return sendValidationError(res, validation.error, { details: validation.details });
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

    logger.error('Error validating exchange:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * PATCH /api/exchanges/:id/toggle
 * Enable/disable exchange
 */
router.patch('/:id/toggle', ensureAuthenticated, validate(toggleExchangeParams, 'params'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.user._id);

    const exchange = user.tradingConfig.exchanges.find(ex => ex._id.toString() === id);

    if (!exchange) {
      return sendNotFound(res, 'Exchange');
    }

    exchange.isActive = !exchange.isActive;
    await user.save();

    res.json({
      success: true,
      message: `Exchange ${exchange.isActive ? 'enabled' : 'disabled'}`,
      isActive: exchange.isActive
    });
  } catch (error) {

    logger.error('Error toggling exchange:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/exchanges/rate-limit-status
 * Get current rate limit status for all exchanges (debugging/admin)
 */
router.get('/rate-limit-status', ensureAuthenticated, getExchangeRateLimitStatus);

/**
 * GET /api/exchanges/cache-stats
 * Get cache statistics (hits, misses, hit rate)
 */
router.get('/cache-stats', ensureAuthenticated, (req, res) => {
  const stats = cacheService.getStats();
  res.json({
    success: true,
    cache: stats,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/exchanges/cache-invalidate
 * Invalidate cache for specific exchange or symbol (admin only)
 */
router.post('/cache-invalidate', ensureAuthenticated, validate(cacheInvalidateBody, 'body'), async (req, res) => {
  // Only admins can invalidate cache
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  const { exchange, symbol } = req.body;

  try {
    let deletedCount = 0;

    if (exchange && symbol) {
      // Invalidate specific exchange + symbol
      const priceKey = cacheService.constructor.getPriceKey(exchange, symbol);
      const feeKey = cacheService.constructor.getFeeKey(exchange, symbol);

      await cacheService.del(priceKey);
      await cacheService.del(feeKey);
      deletedCount = 2;
    } else if (exchange) {
      // Invalidate all cache for specific exchange
      const pattern = `exchange:*:${exchange.toLowerCase()}:*`;
      deletedCount = await cacheService.delPattern(pattern);
    } else {
      // Invalidate all exchange cache
      const pattern = 'exchange:*';
      deletedCount = await cacheService.delPattern(pattern);
    }

    res.json({
      success: true,
      message: 'Cache invalidated successfully',
      deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {

    logger.error('Error invalidating cache:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/exchanges/compare-fees
 * Compare trading fees across user's connected crypto exchanges
 * Query params: symbol (required), quantity (required)
 * Rate limited: 10 requests per minute per user
 */
router.get('/compare-fees', ensureAuthenticated, exchangeApiLimiter, validate(compareFeesQuery, 'query'), async (req, res) => {
  try {
    const { symbol, quantity } = req.query;

    // Validation
    if (!symbol) {
      return sendValidationError(res, 'Symbol is required (e.g., BTC/USD, ETH/USD)');
    }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      return sendValidationError(res, 'Valid quantity is required (must be > 0)');
    }

    const qty = parseFloat(quantity);

    // Get user's connected crypto exchanges
    const user = await User.findById(req.user._id);

    if (!user.tradingConfig || !user.tradingConfig.exchanges || user.tradingConfig.exchanges.length === 0) {
      return sendError(res, 'No exchanges connected. Please connect at least one crypto exchange.', 400);
    }

    // Load BrokerFactory
    const BrokerFactory = require('../../brokers/BrokerFactory');

    // Get available crypto brokers
    const cryptoBrokers = BrokerFactory.getCryptoBrokers();
    const cryptoBrokerKeys = new Set(cryptoBrokers.map(b => b.key));

    // Filter user's exchanges to only crypto exchanges that are active
    const userCryptoExchanges = user.tradingConfig.exchanges.filter(
      ex => ex.isActive && cryptoBrokerKeys.has(ex.name.toLowerCase())
    );

    if (userCryptoExchanges.length === 0) {
      return sendError(
        res,
        'No active crypto exchanges found. Please connect and enable at least one crypto exchange (Coinbase Pro or Kraken).',
        400
      );
    }

    // Compare fees across exchanges
    const comparisons = [];
    const errors = [];

    for (const exchange of userCryptoExchanges) {
      try {
        const brokerKey = exchange.name.toLowerCase();

        // Decrypt credentials
        const apiKey = decrypt(exchange.apiKey.encrypted, exchange.apiKey.iv, exchange.apiKey.authTag);
        const apiSecret = decrypt(exchange.apiSecret.encrypted, exchange.apiSecret.iv, exchange.apiSecret.authTag);

        // Prepare credentials based on exchange type
        const credentials = {
          apiKey,
          apiSecret
        };

        // Coinbase Pro requires passphrase
        if (brokerKey === 'coinbasepro' && exchange.password) {
          const password = decrypt(exchange.password.encrypted, exchange.password.iv, exchange.password.authTag);
          credentials.password = password;
        }

        // Create broker adapter instance
        const adapter = BrokerFactory.createBroker(brokerKey, credentials, { isTestnet: exchange.testnet || false });

        // Try to get fees from cache first
        const feesCacheKey = cacheService.constructor.getFeeKey(brokerKey, symbol);
        let fees = await cacheService.get(feesCacheKey);

        if (!fees) {
          // Cache miss - fetch from exchange
          fees = await adapter.getFees(symbol);
          // Cache for 5 minutes (fee structures rarely change)
          await cacheService.set(feesCacheKey, fees, cacheService.DEFAULT_TTL.FEES);
        }

        // Try to get current market price from cache first
        const priceCacheKey = cacheService.constructor.getPriceKey(brokerKey, symbol);
        let priceData = await cacheService.get(priceCacheKey);
        let currentPrice = 0;

        if (!priceData) {
          // Cache miss - fetch from exchange
          try {
            priceData = await adapter.getMarketPrice(symbol);
            currentPrice = priceData.last || priceData.bid || 0;
            // Cache for 10 seconds (prices change frequently)
            await cacheService.set(priceCacheKey, priceData, cacheService.DEFAULT_TTL.PRICE);
          } catch (priceError) {
            // If symbol not supported, skip this exchange
            logger.warn('[Exchanges] Symbol not supported on exchange', {
              symbol,
              exchange: exchange.name,
              error: priceError.message
            });
            errors.push({
              exchange: exchange.name,
              error: `Symbol ${symbol} not supported`
            });
            continue;
          }
        } else {
          // Cache hit - use cached price
          currentPrice = priceData.last || priceData.bid || 0;
        }

        // Calculate trade value and estimated fee
        const tradeValue = qty * currentPrice;
        const estimatedFee = tradeValue * fees.taker; // Use taker fee for market orders
        const estimatedFeePercent = fees.taker * 100;

        // Get broker info for display
        const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

        comparisons.push({
          exchange: exchange.name,
          displayName: brokerInfo.name,
          symbol: symbol,
          quantity: qty,
          currentPrice: currentPrice,
          tradeValue: tradeValue,
          fees: {
            maker: fees.maker,
            taker: fees.taker,
            makerPercent: (fees.maker * 100).toFixed(3),
            takerPercent: (fees.taker * 100).toFixed(3)
          },
          estimatedFee: estimatedFee,
          estimatedFeePercent: estimatedFeePercent.toFixed(3),
          website: brokerInfo.websiteUrl
        });
      } catch (error) {
        logger.error('[Exchanges] Error comparing fees', {
          exchange: exchange.name,
          error: error.message,
        });
        errors.push({
          exchange: exchange.name,
          error: error.message
        });
      }
    }

    // Check if we have any successful comparisons
    if (comparisons.length === 0) {
      return sendError(
        res,
        'Unable to compare fees. No exchanges support this symbol or all comparisons failed.',
        400,
        { errors }
      );
    }

    // Sort by lowest estimated fee (ascending)
    comparisons.sort((a, b) => a.estimatedFee - b.estimatedFee);

    // Calculate savings vs most expensive
    const cheapest = comparisons[0];
    const mostExpensive = comparisons[comparisons.length - 1];
    const maxSavings = mostExpensive.estimatedFee - cheapest.estimatedFee;

    // Add savings to each comparison
    comparisons.forEach(comp => {
      comp.savingsVsMostExpensive = mostExpensive.estimatedFee - comp.estimatedFee;
      comp.isCheapest = comp.exchange === cheapest.exchange;
      comp.isMostExpensive = comp.exchange === mostExpensive.exchange;
    });

    // Generate recommendation
    const recommendation = {
      exchange: cheapest.displayName,
      reason: `Lowest fee at ${cheapest.estimatedFeePercent}% (${cheapest.fees.takerPercent}% taker fee)`,
      estimatedFee: cheapest.estimatedFee,
      savings: maxSavings,
      savingsPercent: comparisons.length > 1 ? ((maxSavings / mostExpensive.estimatedFee) * 100).toFixed(2) : 0
    };

    // Return comparison results
    res.json({
      success: true,
      data: {
        symbol,
        quantity: qty,
        comparisons,
        recommendation,
        summary: {
          totalExchangesCompared: comparisons.length,
          cheapestExchange: cheapest.displayName,
          cheapestFee: cheapest.estimatedFee,
          mostExpensiveExchange: mostExpensive.displayName,
          mostExpensiveFee: mostExpensive.estimatedFee,
          maxSavings: maxSavings
        }
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {

    logger.error('Error comparing exchange fees:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

module.exports = router;
