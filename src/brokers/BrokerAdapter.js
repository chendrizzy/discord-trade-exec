/**
 * Base Broker Adapter Interface
 * All broker adapters (stock and crypto) must implement this interface
 * to ensure consistent behavior across different brokers
 */

const logger = require('../utils/logger');
const User = require('../models/User');
const oauth2Service = require('../services/OAuth2Service');

class BrokerAdapter {
  constructor(credentials, options = {}) {
    this.credentials = credentials;
    this.options = options;
    this.isAuthenticated = false;
    this.brokerName = 'base';
    this.brokerType = 'unknown'; // 'stock' or 'crypto'
    // Accept both 'isTestnet' and 'testnet' in both credentials and options for backwards compatibility
    this.isTestnet = options.isTestnet || options.testnet || credentials?.testnet || credentials?.isTestnet || false;

    // Guard against sandbox mode in production
    this._validateNotProductionSandbox();
  }

  /**
   * Validate that sandbox/testnet mode is not used in production
   * @private
   * @throws {Error} If in production and sandbox mode is enabled without explicit override
   */
  _validateNotProductionSandbox() {
    if (process.env.NODE_ENV === 'production' && this.isTestnet && process.env.BROKER_ALLOW_SANDBOX !== 'true') {
      const error = new Error(
        `${this.brokerName || 'Broker'}: Sandbox/testnet mode is not allowed in production. ` +
        `Please use live credentials or set BROKER_ALLOW_SANDBOX=true explicitly for testing.`
      );
      logger.error('[BrokerAdapter] Production sandbox usage prevented', {
        brokerName: this.brokerName,
        brokerType: this.brokerType,
        nodeEnv: process.env.NODE_ENV,
        isTestnet: this.isTestnet,
        brokerAllowSandbox: process.env.BROKER_ALLOW_SANDBOX,
        errorMessage: error.message
      });
      throw error;
    }
  }

  /**
   * Test connection to broker by authenticating and fetching balance
   * Default implementation can be overridden if broker requires different logic
   * @returns {Promise<boolean>} Connection success status
   */
  async testConnection() {
    try {
      await this.authenticate();
      const balance = await this.getBalance();
      return !!balance;
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Connection test failed`, {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Retrieve OAuth2 access token from user's encrypted token storage
   * Common pattern for OAuth2-enabled brokers (Alpaca, E*TRADE, IBKR, TDAmeritrade, WeBull)
   * @param {string} brokerName - The broker name to look up tokens for
   * @returns {Promise<string|null>} - Decrypted access token or null if unavailable
   * @private
   */
  async _getOAuth2Token(brokerName) {
    if (!this.userId) return null;

    try {
      const user = await User.findById(this.userId);
      if (!user || !user.tradingConfig.oauthTokens.has(brokerName)) return null;

      const encryptedTokens = user.tradingConfig.oauthTokens.get(brokerName);
      if (!encryptedTokens.isValid) {
        logger.warn(`[${this.brokerName}Adapter] OAuth2 tokens invalid`);
        return null;
      }

      return oauth2Service.decryptToken(encryptedTokens.accessToken);
    } catch (error) {
      logger.error(`[${this.brokerName}Adapter] Error retrieving OAuth2 token`, {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Authenticate with the broker using provided credentials
   * @returns {Promise<boolean>} - Authentication success status
   */
  async authenticate() {
    throw new Error('authenticate() must be implemented by broker adapter');
  }

  /**
   * Get account balance for specified currency
   * @param {string} currency - Optional currency filter (e.g., 'USD', 'BTC')
   * @returns {Promise<Object>} - Balance information
   * @returns {number} balance.total - Total account balance
   * @returns {number} balance.available - Available balance for trading
   * @returns {number} balance.equity - Current equity (for stocks)
   * @returns {string} balance.currency - Balance currency
   */
  async getBalance(_currency = null) {
    throw new Error('getBalance() must be implemented by broker adapter');
  }

  /**
   * Create a new order
   * @param {Object} order - Order parameters
   * @param {string} order.symbol - Trading symbol (e.g., 'AAPL', 'BTC/USDT')
   * @param {string} order.side - Order side ('BUY' or 'SELL')
   * @param {string} order.type - Order type ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')
   * @param {number} order.quantity - Order quantity
   * @param {number} order.price - Limit price (required for LIMIT orders)
   * @param {number} order.stopPrice - Stop price (required for STOP orders)
   * @param {string} order.timeInForce - Time in force ('GTC', 'IOC', 'FOK', 'DAY')
   * @returns {Promise<Object>} - Created order details
   * @returns {string} order.orderId - Broker's order ID
   * @returns {string} order.status - Order status ('FILLED', 'PARTIAL', 'PENDING', 'CANCELLED')
   * @returns {number} order.executedQty - Executed quantity
   * @returns {number} order.executedPrice - Average execution price
   */
  async createOrder(_order) {
    throw new Error('createOrder() must be implemented by broker adapter');
  }

  /**
   * Cancel an existing order
   * @param {string} orderId - Broker's order ID
   * @returns {Promise<boolean>} - Cancellation success status
   */
  async cancelOrder(_orderId) {
    throw new Error('cancelOrder() must be implemented by broker adapter');
  }

  /**
   * Get current open positions
   * @returns {Promise<Array>} - Array of open positions
   * @returns {string} position.symbol - Trading symbol
   * @returns {number} position.quantity - Position quantity
   * @returns {number} position.entryPrice - Average entry price
   * @returns {number} position.currentPrice - Current market price
   * @returns {number} position.unrealizedPnL - Unrealized profit/loss
   * @returns {number} position.unrealizedPnLPercent - Unrealized P&L percentage
   */
  async getPositions() {
    throw new Error('getPositions() must be implemented by broker adapter');
  }

  /**
   * Set stop-loss order for a position
   * @param {Object} params - Stop-loss parameters
   * @param {string} params.symbol - Trading symbol
   * @param {number} params.quantity - Quantity to close
   * @param {number} params.stopPrice - Stop-loss trigger price
   * @param {string} params.type - Stop type ('STOP' or 'TRAILING_STOP')
   * @param {number} params.trailPercent - Trail percentage (for trailing stops)
   * @returns {Promise<Object>} - Created stop-loss order
   */
  async setStopLoss(_params) {
    throw new Error('setStopLoss() must be implemented by broker adapter');
  }

  /**
   * Set take-profit order for a position
   * @param {Object} params - Take-profit parameters
   * @param {string} params.symbol - Trading symbol
   * @param {number} params.quantity - Quantity to close
   * @param {number} params.limitPrice - Take-profit limit price
   * @returns {Promise<Object>} - Created take-profit order
   */
  async setTakeProfit(_params) {
    throw new Error('setTakeProfit() must be implemented by broker adapter');
  }

  /**
   * Get order history
   * @param {Object} filters - Optional filters
   * @param {string} filters.symbol - Filter by symbol
   * @param {Date} filters.startDate - Start date
   * @param {Date} filters.endDate - End date
   * @param {string} filters.status - Filter by status
   * @returns {Promise<Array>} - Array of historical orders
   */
  async getOrderHistory(_filters = {}) {
    throw new Error('getOrderHistory() must be implemented by broker adapter');
  }

  /**
   * Get current market price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} - Price information
   * @returns {number} price.bid - Current bid price
   * @returns {number} price.ask - Current ask price
   * @returns {number} price.last - Last traded price
   */
  async getMarketPrice(_symbol) {
    throw new Error('getMarketPrice() must be implemented by broker adapter');
  }

  /**
   * Validate if a symbol is supported by this broker
   * @param {string} symbol - Trading symbol
   * @returns {Promise<boolean>} - True if symbol is supported
   */
  async isSymbolSupported(_symbol) {
    throw new Error('isSymbolSupported() must be implemented by broker adapter');
  }

  /**
   * Get broker-specific fees structure
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} - Fee structure
   * @returns {number} fees.maker - Maker fee percentage
   * @returns {number} fees.taker - Taker fee percentage
   * @returns {number} fees.withdrawal - Withdrawal fee (if applicable)
   */
  async getFees(_symbol) {
    throw new Error('getFees() must be implemented by broker adapter');
  }

  /**
   * Close all positions for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} - Closing order details
   */
  async closePosition(symbol) {
    const positions = await this.getPositions();
    const position = positions.find(p => p.symbol === symbol);

    if (!position) {
      throw new Error(`No open position found for ${symbol}`);
    }

    const closeSide = position.quantity > 0 ? 'SELL' : 'BUY';

    return await this.createOrder({
      symbol,
      side: closeSide,
      type: 'MARKET',
      quantity: Math.abs(position.quantity),
      timeInForce: 'GTC'
    });
  }

  /**
   * Normalize symbol format for the broker
   * @param {string} symbol - Input symbol (e.g., 'BTC/USDT', 'AAPL')
   * @returns {string} - Normalized symbol format
   */
  normalizeSymbol(symbol) {
    // Default: return as-is. Override in specific adapters
    return symbol;
  }

  /**
   * Denormalize symbol format from broker to standard format
   * @param {string} symbol - Broker's symbol format
   * @returns {string} - Standard symbol format
   */
  denormalizeSymbol(symbol) {
    // Default: return as-is. Override in specific adapters
    return symbol;
  }

  /**
   * Get broker information
   * @returns {Object} - Broker metadata
   */
  getBrokerInfo() {
    return {
      name: this.brokerName,
      type: this.brokerType,
      isTestnet: this.isTestnet,
      isAuthenticated: this.isAuthenticated,
      supportsStocks: this.brokerType === 'stock',
      supportsCrypto: this.brokerType === 'crypto',
      supportsOptions: false, // Can be overridden
      supportsFutures: false // Can be overridden
    };
  }
}

module.exports = BrokerAdapter;
