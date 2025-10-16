// External dependencies
const express = require('express');

const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');
const ccxt = require('ccxt');
const Trade = require('../../models/Trade');

// Apply rate limiting
router.use(apiLimiter);

// In-memory cache for portfolio values (5 minute TTL)
const portfolioCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get current portfolio value and stats
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cacheKey = `portfolio_${userId}`;

    // Check cache first
    const cached = portfolioCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Fetch fresh data
    const [portfolioValue, tradeSummary, exchangeBalances] = await Promise.all([
      calculateTotalPortfolioValue(req.user),
      Trade.getUserSummary(req.user._id, '24h'),
      getExchangeBalances(req.user)
    ]);

    // Count active bots (signal providers with enabled: true)
    const signalProviders = req.user.tradingConfig.signalProviders || [];
    const activeBots = signalProviders.filter(p => p.enabled).length;
    const totalBots = signalProviders.length;

    // Calculate 24h change from trade summary
    const change24h = tradeSummary.totalProfitLoss;
    const change24hPercent = portfolioValue > 0 ? (change24h / portfolioValue) * 100 : 0;

    const responseData = {
      success: true,
      portfolio: {
        totalValue: portfolioValue,
        change24h: change24h,
        change24hPercent: change24hPercent,
        lastUpdated: new Date().toISOString()
      },
      bots: {
        active: activeBots,
        total: totalBots,
        status: activeBots > 0 ? 'running' : 'paused'
      },
      performance: {
        totalTrades: tradeSummary.totalTrades,
        winningTrades: tradeSummary.winningTrades,
        losingTrades: tradeSummary.losingTrades,
        winRate: tradeSummary.winRate,
        averagePnL: tradeSummary.averagePnL,
        totalPnL: tradeSummary.totalProfitLoss,
        totalFees: tradeSummary.totalFees
      },
      exchanges: exchangeBalances
    };

    // Cache the result
    portfolioCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });

    res.json(responseData);
  } catch (error) {
    console.error('Portfolio API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio data',
      message: error.message
    });
  }
});

// Helper: Calculate total portfolio value across all exchanges
async function calculateTotalPortfolioValue(user) {
  const exchanges = user.tradingConfig.exchanges || [];
  let totalValue = 0;

  for (const exchangeConfig of exchanges) {
    if (!exchangeConfig.isActive) continue;

    try {
      // Initialize CCXT exchange
      const ExchangeClass = ccxt[exchangeConfig.name];
      if (!ExchangeClass) {
        console.warn(`Exchange ${exchangeConfig.name} not supported by CCXT`);
        continue;
      }

      const exchange = new ExchangeClass({
        apiKey: exchangeConfig.apiKey,
        secret: exchangeConfig.apiSecret,
        enableRateLimit: true,
        timeout: 10000,
        ...(exchangeConfig.isTestnet && { sandbox: true })
      });

      // Fetch balance
      const balance = await exchange.fetchBalance();

      // Calculate USD value from total balance
      // CCXT provides balance.total which includes all currencies
      if (balance.total) {
        for (const [currency, amount] of Object.entries(balance.total)) {
          if (amount > 0) {
            // Try to fetch ticker to convert to USD
            try {
              const symbol = `${currency}/USDT`;
              if (exchange.markets && symbol in exchange.markets) {
                const ticker = await exchange.fetchTicker(symbol);
                totalValue += amount * ticker.last;
              } else if (currency === 'USD' || currency === 'USDT' || currency === 'USDC') {
                // Stablecoins count as 1:1 USD
                totalValue += amount;
              }
            } catch (tickerError) {
              // If ticker fails, skip this currency
              console.warn(`Could not fetch ticker for ${currency}:`, tickerError.message);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching balance from ${exchangeConfig.name}:`, error.message);
      // Continue with other exchanges even if one fails
    }
  }

  return totalValue;
}

// Helper: Get individual exchange balances
async function getExchangeBalances(user) {
  const exchanges = user.tradingConfig.exchanges || [];
  const balances = [];

  for (const exchangeConfig of exchanges) {
    if (!exchangeConfig.isActive) {
      balances.push({
        exchange: exchangeConfig.name,
        connected: false,
        value: 0,
        error: 'Inactive'
      });
      continue;
    }

    try {
      const ExchangeClass = ccxt[exchangeConfig.name];
      if (!ExchangeClass) {
        balances.push({
          exchange: exchangeConfig.name,
          connected: false,
          value: 0,
          error: 'Not supported'
        });
        continue;
      }

      const exchange = new ExchangeClass({
        apiKey: exchangeConfig.apiKey,
        secret: exchangeConfig.apiSecret,
        enableRateLimit: true,
        timeout: 10000,
        ...(exchangeConfig.isTestnet && { sandbox: true })
      });

      const balance = await exchange.fetchBalance();
      let usdValue = 0;

      // Calculate USD value
      if (balance.total) {
        for (const [currency, amount] of Object.entries(balance.total)) {
          if (amount > 0) {
            try {
              const symbol = `${currency}/USDT`;
              if (exchange.markets && symbol in exchange.markets) {
                const ticker = await exchange.fetchTicker(symbol);
                usdValue += amount * ticker.last;
              } else if (currency === 'USD' || currency === 'USDT' || currency === 'USDC') {
                usdValue += amount;
              }
            } catch {
              // Skip if ticker unavailable
            }
          }
        }
      }

      balances.push({
        exchange: exchangeConfig.name,
        connected: true,
        value: usdValue,
        isTestnet: exchangeConfig.isTestnet || false
      });
    } catch (error) {
      balances.push({
        exchange: exchangeConfig.name,
        connected: false,
        value: 0,
        error: error.message
      });
    }
  }

  return balances;
}

// Clear cache for a specific user (for manual refresh)
router.post('/refresh', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cacheKey = `portfolio_${userId}`;
    portfolioCache.delete(cacheKey);

    res.json({
      success: true,
      message: 'Portfolio cache cleared. Next request will fetch fresh data.'
    });
  } catch (error) {
    console.error('Portfolio refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh portfolio'
    });
  }
});

module.exports = router;
