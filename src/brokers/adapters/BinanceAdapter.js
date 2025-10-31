'use strict';

/**
 * Binance Adapter (Placeholder - P3 Priority)
 *
 * Task: T052 [US10] - Create placeholder BinanceAdapter following adapter contract
 * Story: US-010 (Crypto Exchange Integration)
 *
 * Provides Binance cryptocurrency exchange integration via CCXT library.
 * This is a placeholder implementation for P3 priority feature.
 *
 * Constitutional Requirements:
 * - Principle III: Broker Abstraction (follows BrokerAdapter contract)
 * - Principle VII: Graceful Error Handling (standardized error messages)
 *
 * Supported Features (when fully implemented):
 * - Spot trading (buy/sell crypto)
 * - Limit and market orders
 * - Position tracking
 * - Balance queries
 * - Order status tracking
 * - Rate limiting (1200 req/min per Binance limits)
 *
 * @module brokers/adapters/BinanceAdapter
 */

const ccxt = require('ccxt');
const BrokerAdapter = require('../BrokerAdapter');
const logger = require('../../middleware/logger');
const { decrypt } = require('../../utils/encryption');

class BinanceAdapter extends BrokerAdapter {
  constructor() {
    super();
    this.brokerName = 'binance';
    this.exchange = null;
  }

  /**
   * Connect to Binance using API credentials
   *
   * @param {Object} credentials - Encrypted API credentials
   * @param {string} credentials.apiKey - Binance API key (encrypted)
   * @param {string} credentials.apiSecret - Binance API secret (encrypted)
   * @param {boolean} credentials.testnet - Use Binance testnet (optional)
   * @returns {Promise<Object>} Connection status
   *
   * @throws {Error} If credentials are invalid or connection fails
   */
  async connect(credentials) {
    try {
      logger.info('[BinanceAdapter] Connecting to Binance API');

      // Decrypt credentials
      const apiKey = decrypt(credentials.apiKey);
      const apiSecret = decrypt(credentials.apiSecret);

      // Initialize CCXT Binance exchange
      this.exchange = new ccxt.binance({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true, // Constitutional Principle III: Rate limiting
        options: {
          adjustForTimeDifference: true, // Handle server time sync
          recvWindow: 10000 // 10s receive window
        }
      });

      // Use testnet if specified
      if (credentials.testnet) {
        // Guard against sandbox mode in production
        if (process.env.NODE_ENV === 'production' && process.env.BROKER_ALLOW_SANDBOX !== 'true') {
          const error = new Error(
            'Binance: Sandbox/testnet mode is not allowed in production. ' +
            'Please use live credentials or set BROKER_ALLOW_SANDBOX=true explicitly for testing.'
          );
          logger.error('[BinanceAdapter] Production sandbox usage prevented', {
            brokerName: 'binance',
            nodeEnv: process.env.NODE_ENV,
            brokerAllowSandbox: process.env.BROKER_ALLOW_SANDBOX,
            errorMessage: error.message
          });
          throw error;
        }
        this.exchange.setSandboxMode(true);
        logger.info('[BinanceAdapter] Using Binance testnet');
      }

      // Test connection with account balance request
      const balance = await this.exchange.fetchBalance();

      logger.info('[BinanceAdapter] Successfully connected to Binance', {
        testnet: credentials.testnet || false
      });

      return {
        success: true,
        broker: 'binance',
        accountId: balance.info?.uid || 'N/A',
        testnet: credentials.testnet || false
      };
    } catch (error) {
      logger.error('[BinanceAdapter] Connection failed', {
        error: error.message,
        code: error.code
      });

      throw new Error('Failed to connect to Binance: ' + error.message);
    }
  }

  /**
   * Disconnect from Binance (cleanup resources)
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.exchange) {
      // CCXT doesn't require explicit disconnect, but we'll null the instance
      this.exchange = null;
      logger.info('[BinanceAdapter] Disconnected from Binance');
    }
  }

  /**
   * Place order on Binance
   *
   * @param {Object} order - Order details
   * @param {string} order.symbol - Trading pair (e.g., "BTC/USDT")
   * @param {string} order.side - Order side ("buy" or "sell")
   * @param {string} order.type - Order type ("market" or "limit")
   * @param {number} order.quantity - Order quantity
   * @param {number} [order.price] - Limit price (required for limit orders)
   * @returns {Promise<Object>} Order confirmation
   *
   * @throws {Error} If order placement fails
   */
  async placeOrder(order) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Placing order', {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity
      });

      // Place order via CCXT
      const result = await this.exchange.createOrder(
        order.symbol,
        order.type,
        order.side,
        order.quantity,
        order.price // undefined for market orders
      );

      logger.info('[BinanceAdapter] Order placed successfully', {
        orderId: result.id,
        status: result.status
      });

      return {
        orderId: result.id,
        status: result.status,
        symbol: result.symbol,
        side: result.side,
        type: result.type,
        quantity: result.amount,
        filled: result.filled || 0,
        remaining: result.remaining || order.quantity,
        price: result.price,
        average: result.average,
        timestamp: result.timestamp,
        info: result.info
      };
    } catch (error) {
      logger.error('[BinanceAdapter] Order placement failed', {
        error: error.message,
        symbol: order.symbol
      });

      throw new Error('Failed to place Binance order: ' + error.message);
    }
  }

  /**
   * Cancel order on Binance
   *
   * @param {string} orderId - Binance order ID
   * @param {string} symbol - Trading pair
   * @returns {Promise<Object>} Cancellation confirmation
   *
   * @throws {Error} If cancellation fails
   */
  async cancelOrder(orderId, symbol) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Cancelling order', { orderId, symbol });

      const result = await this.exchange.cancelOrder(orderId, symbol);

      logger.info('[BinanceAdapter] Order cancelled', { orderId });

      return {
        orderId: result.id,
        status: result.status,
        symbol: result.symbol
      };
    } catch (error) {
      logger.error('[BinanceAdapter] Order cancellation failed', {
        error: error.message,
        orderId
      });

      throw new Error('Failed to cancel Binance order: ' + error.message);
    }
  }

  /**
   * Get open positions (spot balances for Binance)
   *
   * @returns {Promise<Array>} List of positions (non-zero balances)
   */
  async getPositions() {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching positions');

      const balance = await this.exchange.fetchBalance();

      // Convert balances to position format (Constitutional Principle III)
      const positions = [];

      for (const [currency, amounts] of Object.entries(balance)) {
        if (typeof amounts === 'object' && amounts.total > 0) {
          positions.push({
            symbol: currency,
            quantity: amounts.total,
            available: amounts.free,
            locked: amounts.used,
            averagePrice: 0, // Binance doesn't provide this in balance endpoint
            currentPrice: 0, // Would need to fetch ticker
            unrealizedPnL: 0,
            side: 'LONG' // Spot trading is always long
          });
        }
      }

      logger.info('[BinanceAdapter] Fetched positions', { count: positions.length });

      return positions;
    } catch (error) {
      logger.error('[BinanceAdapter] Failed to fetch positions', {
        error: error.message
      });

      throw new Error('Failed to fetch Binance positions: ' + error.message);
    }
  }

  /**
   * Get account balance from Binance
   *
   * @returns {Promise<Object>} Account balance details
   */
  async getBalance() {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching balance');

      const balance = await this.exchange.fetchBalance();

      // Extract total equity in USDT (base currency for crypto)
      const usdtBalance = balance.USDT || { total: 0, free: 0, used: 0 };

      return {
        cash: usdtBalance.free,
        equity: usdtBalance.total,
        buyingPower: usdtBalance.free, // Simplified: available cash
        marginUsed: usdtBalance.used,
        currency: 'USDT'
      };
    } catch (error) {
      logger.error('[BinanceAdapter] Failed to fetch balance', {
        error: error.message
      });

      throw new Error('Failed to fetch Binance balance: ' + error.message);
    }
  }

  /**
   * Get order status from Binance
   *
   * @param {string} orderId - Binance order ID
   * @param {string} symbol - Trading pair
   * @returns {Promise<Object>} Order status details
   */
  async getOrderStatus(orderId, symbol) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching order status', { orderId, symbol });

      const order = await this.exchange.fetchOrder(orderId, symbol);

      return {
        orderId: order.id,
        status: order.status, // 'open', 'closed', 'canceled'
        filled: order.filled || 0,
        remaining: order.remaining || 0,
        averagePrice: order.average,
        timestamp: order.timestamp,
        lastTradeTimestamp: order.lastTradeTimestamp
      };
    } catch (error) {
      logger.error('[BinanceAdapter] Failed to fetch order status', {
        error: error.message,
        orderId
      });

      throw new Error('Failed to fetch Binance order status: ' + error.message);
    }
  }

  /**
   * Validate connection is active
   * @private
   * @throws {Error} If not connected
   */
  _ensureConnected() {
    if (!this.exchange) {
      throw new Error('Not connected to Binance. Call connect() first.');
    }
  }
}

module.exports = BinanceAdapter;
