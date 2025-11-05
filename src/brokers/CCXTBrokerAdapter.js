const BrokerAdapter = require('./BrokerAdapter');
const { withTimeout } = require('../utils/promise-timeout');
const logger = require('../utils/logger');
const OrderStatusMapper = require('../utils/orderStatusMapper');

/**
 * Base class for CCXT-based cryptocurrency exchange adapters
 *
 * Provides common implementations for exchanges using the CCXT library,
 * reducing code duplication across Binance, Kraken, CoinbasePro, and future exchanges.
 *
 * Architecture:
 *   BrokerAdapter (base contract)
 *       ↓
 *   CCXTBrokerAdapter (CCXT-specific patterns)
 *       ↓
 *   BinanceAdapter / KrakenAdapter / CoinbaseProAdapter (exchange-specific)
 *
 * Common Patterns Abstracted (315+ lines saved):
 * - authenticate() via fetchBalance
 * - getBalance() with currency filtering
 * - cancelOrder() wrapper
 * - getMarketPrice() via fetchTicker
 * - isSymbolSupported() with lazy market loading
 * - mapOrderStatus() standardization
 * - getPositions() balance-to-positions conversion
 *
 * Exchange-Specific (remains in subclasses):
 * - CCXT exchange initialization
 * - Symbol normalization/denormalization
 * - Order parameter customization
 * - Fee structure defaults
 * - getBrokerInfo() metadata
 */
class CCXTBrokerAdapter extends BrokerAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);

    this.brokerType = 'crypto';
    this.exchange = null; // CCXT exchange instance (initialized by subclass)
    this.supportedPairs = null; // Lazy-loaded trading pairs cache
    this.defaultTimeout = options.timeout || 30000;
  }

  /**
   * Authenticate with exchange using CCXT fetchBalance
   * Standard pattern: test credentials by fetching account balance
   *
   * Override this method if exchange requires different authentication
   */
  async authenticate() {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), this.defaultTimeout);
      this.isAuthenticated = true;
      logger.info(`[${this.brokerName}Adapter] Authenticated successfully`);
      return true;
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Authentication failed`, {
        error: error.message,
        stack: error.stack
      });
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Get account balance for specified currency or default USD
   *
   * @param {string} currency - Optional currency filter (e.g., 'USDT', 'BTC')
   * @returns {Promise<Object>} Balance details (total, available, equity, currency)
   */
  async getBalance(currency = null) {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), this.defaultTimeout);

      if (currency) {
        const currencyBalance = balance[currency] || { total: 0, free: 0, used: 0 };
        return {
          total: currencyBalance.total || 0,
          available: currencyBalance.free || 0,
          currency: currency
        };
      }

      // Default to USD balance for portfolio valuation
      const usdBalance = balance['USD'] || { total: 0, free: 0, used: 0 };
      return {
        total: usdBalance.total || 0,
        available: usdBalance.free || 0,
        equity: usdBalance.total || 0,
        currency: 'USD'
      };
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error fetching balance`, {
        error: error.message,
        stack: error.stack,
        currency
      });
      throw error;
    }
  }

  /**
   * Cancel an existing order
   *
   * @param {string} orderId - Exchange order ID
   * @returns {Promise<boolean>} Cancellation success status
   */
  async cancelOrder(orderId) {
    try {
      await withTimeout(this.exchange.cancelOrder(orderId), this.defaultTimeout);
      logger.info(`[${this.brokerName}Adapter] Order cancelled`, { orderId });
      return true;
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error cancelling order`, {
        orderId,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Get current market price for a symbol
   *
   * @param {string} symbol - Trading symbol (e.g., 'BTC/USDT')
   * @returns {Promise<Object>} Price data (bid, ask, last)
   */
  async getMarketPrice(symbol) {
    try {
      const ticker = await withTimeout(
        this.exchange.fetchTicker(this.normalizeSymbol(symbol)),
        this.defaultTimeout
      );

      return {
        bid: ticker.bid || 0,
        ask: ticker.ask || 0,
        last: ticker.last || 0
      };
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error fetching market price`, {
        symbol,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate if a symbol is supported by this exchange
   * Uses lazy-loaded market cache for performance
   *
   * @param {string} symbol - Trading symbol
   * @returns {Promise<boolean>} True if symbol is supported
   */
  async isSymbolSupported(symbol) {
    try {
      // Lazy load supported pairs on first call
      if (!this.supportedPairs) {
        const markets = await withTimeout(this.exchange.fetchMarkets(), this.defaultTimeout);
        this.supportedPairs = new Set(markets.map(m => m.symbol));
      }

      const normalized = this.normalizeSymbol(symbol);
      return this.supportedPairs.has(normalized);
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error checking symbol support`, {
        symbol,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Get current open positions (crypto balances as positions)
   * Converts account balances to position format with market prices
   *
   * Override this method if exchange has native position tracking
   *
   * @returns {Promise<Array>} List of positions with quantity, price, and value
   */
  async getPositions() {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), this.defaultTimeout);
      const positions = [];

      for (const [currency, balanceInfo] of Object.entries(balance)) {
        // Skip metadata fields
        if (currency === 'info' || currency === 'free' || currency === 'used' || currency === 'total') continue;

        const quantity = balanceInfo.total;
        if (quantity && quantity > 0.00000001) {
          // Skip dust amounts
          let currentPrice = 0;
          const symbol = `${currency}/USD`;

          try {
            const ticker = await this.exchange.fetchTicker(symbol);
            currentPrice = ticker.last;
          } catch (e) {
            // If can't get price (e.g., for USD itself), use 1.0
            currentPrice = currency === 'USD' ? 1.0 : 0;
          }

          const positionValue = quantity * currentPrice;

          if (positionValue > 0.01) {
            // Only include positions worth more than $0.01
            positions.push({
              symbol: symbol,
              quantity: quantity,
              entryPrice: 0, // Crypto exchanges don't track entry price
              currentPrice: currentPrice,
              unrealizedPnL: 0, // Can't calculate without entry price
              unrealizedPnLPercent: 0,
              value: positionValue
            });
          }
        }
      }

      return positions;
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error fetching positions`, {
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Map CCXT order status to standardized status using centralized mapper
   *
   * CCXT statuses: 'open', 'closed', 'canceled', 'expired', 'rejected'
   * Standard statuses: 'PENDING', 'FILLED', 'CANCELLED'
   *
   * @param {string} ccxtStatus - CCXT order status
   * @returns {string} Standardized status
   */
  mapOrderStatus(ccxtStatus) {
    return OrderStatusMapper.mapStatus(ccxtStatus, 'ccxt');
  }

  /**
   * Validate that CCXT exchange instance is initialized
   * @private
   * @throws {Error} If exchange not initialized
   */
  _ensureExchangeInitialized() {
    if (!this.exchange) {
      throw new Error(`${this.brokerName}: CCXT exchange not initialized`);
    }
  }
}

module.exports = CCXTBrokerAdapter;
