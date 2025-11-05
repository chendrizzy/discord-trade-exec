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
const { handleBrokerError } = require('../utils/errorHandler');

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
      handleBrokerError(this, 'connect', error, { code: error.code });
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
      handleBrokerError(this, 'place {broker} order', error, { symbol: order.symbol, side: order.side, type: order.type });
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
      handleBrokerError(this, 'cancel {broker} order', error, { orderId, symbol });
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
      handleBrokerError(this, 'fetch {broker} positions', error);
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
      handleBrokerError(this, 'fetch {broker} balance', error);
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
      handleBrokerError(this, 'fetch {broker} order status', error, { orderId, symbol });
    }
  }

  /**
   * Set stop-loss order for a position
   *
   * @param {Object} params - Stop-loss parameters
   * @param {string} params.symbol - Trading pair (e.g., "BTC/USDT")
   * @param {number} params.quantity - Order quantity (positive for SELL, negative for BUY)
   * @param {number} [params.stopPrice] - Stop price (required for regular STOP)
   * @param {string} [params.type] - Stop type: 'STOP' or 'TRAILING_STOP' (default: 'STOP')
   * @param {number} [params.trailPercent] - Trail percentage for trailing stops (default: 5)
   * @returns {Promise<Object>} Stop-loss order confirmation
   *
   * @throws {Error} If order creation fails
   */
  async setStopLoss(params) {
    this._ensureConnected();

    try {
      const { symbol, quantity, stopPrice, type, trailPercent } = params;

      logger.info('[BinanceAdapter] Setting stop-loss', {
        symbol,
        quantity,
        type: type || 'STOP',
        stopPrice,
        trailPercent
      });

      let orderResult;

      if (type === 'TRAILING_STOP') {
        // Binance trailing stop-loss order
        const trailPercentValue = trailPercent || 5;

        orderResult = await this.exchange.createOrder(
          symbol,
          'TRAILING_STOP_MARKET',
          quantity > 0 ? 'sell' : 'buy',
          Math.abs(quantity),
          undefined, // No price for market orders
          {
            callbackRate: trailPercentValue, // Binance uses callbackRate for trailing percent
            timeInForce: 'GTC'
          }
        );

        logger.info('[BinanceAdapter] Trailing stop-loss set', {
          orderId: orderResult.id,
          trailPercent: trailPercentValue
        });

        return {
          orderId: orderResult.id,
          type: 'STOP_LOSS',
          subType: 'TRAILING_STOP',
          status: orderResult.status,
          trailPercent: trailPercentValue,
          symbol: orderResult.symbol,
          side: orderResult.side,
          quantity: orderResult.amount
        };
      } else {
        // Regular stop-loss order
        if (!stopPrice) {
          throw new Error('stopPrice is required for regular STOP orders');
        }

        orderResult = await this.exchange.createOrder(
          symbol,
          'STOP_LOSS_LIMIT',
          quantity > 0 ? 'sell' : 'buy',
          Math.abs(quantity),
          stopPrice, // Limit price (same as stop for simplicity)
          {
            stopPrice: stopPrice,
            timeInForce: 'GTC'
          }
        );

        logger.info('[BinanceAdapter] Stop-loss set', {
          orderId: orderResult.id,
          stopPrice
        });

        return {
          orderId: orderResult.id,
          type: 'STOP_LOSS',
          subType: 'STOP',
          status: orderResult.status,
          stopPrice: parseFloat(stopPrice),
          symbol: orderResult.symbol,
          side: orderResult.side,
          quantity: orderResult.amount
        };
      }
    } catch (error) {
      handleBrokerError(this, 'set {broker} stop-loss', error, { symbol: params.symbol, type: params.type, stopPrice: params.stopPrice });
    }
  }

  /**
   * Set take-profit order for a position
   *
   * @param {Object} params - Take-profit parameters
   * @param {string} params.symbol - Trading pair (e.g., "BTC/USDT")
   * @param {number} params.quantity - Order quantity (positive for SELL, negative for BUY)
   * @param {number} params.limitPrice - Take-profit limit price
   * @returns {Promise<Object>} Take-profit order confirmation
   *
   * @throws {Error} If order creation fails
   */
  async setTakeProfit(params) {
    this._ensureConnected();

    try {
      const { symbol, quantity, limitPrice } = params;

      if (!limitPrice) {
        throw new Error('limitPrice is required for take-profit orders');
      }

      logger.info('[BinanceAdapter] Setting take-profit', {
        symbol,
        quantity,
        limitPrice
      });

      // Create a limit order at the take-profit price
      const orderResult = await this.exchange.createOrder(
        symbol,
        'limit',
        quantity > 0 ? 'sell' : 'buy',
        Math.abs(quantity),
        limitPrice,
        {
          timeInForce: 'GTC'
        }
      );

      logger.info('[BinanceAdapter] Take-profit set', {
        orderId: orderResult.id,
        limitPrice
      });

      return {
        orderId: orderResult.id,
        type: 'TAKE_PROFIT',
        status: orderResult.status,
        limitPrice: parseFloat(limitPrice),
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: orderResult.amount
      };
    } catch (error) {
      handleBrokerError(this, 'set {broker} take-profit', error, { symbol: params.symbol, limitPrice: params.limitPrice });
    }
  }

  /**
   * Get order history with optional filters
   *
   * @param {Object} [filters={}] - Optional filters
   * @param {string} [filters.symbol] - Filter by trading pair
   * @param {Date} [filters.startDate] - Filter orders after this date
   * @param {Date} [filters.endDate] - Filter orders before this date
   * @param {number} [filters.limit=100] - Maximum number of orders to retrieve
   * @param {string} [filters.status='closed'] - Order status filter ('closed', 'all')
   * @returns {Promise<Array>} Array of historical orders
   *
   * @throws {Error} If retrieval fails
   */
  async getOrderHistory(filters = {}) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching order history', { filters });

      const params = {};

      // Add date filters if provided
      if (filters.startDate) {
        params.since = filters.startDate.getTime();
      }

      // Add limit (default 100)
      params.limit = filters.limit || 100;

      let orders;

      if (filters.symbol) {
        // Fetch orders for specific symbol
        orders = await this.exchange.fetchClosedOrders(filters.symbol, params.since, params.limit, params);
      } else {
        // Fetch orders for all symbols (may not be supported by all exchanges)
        orders = await this.exchange.fetchClosedOrders(undefined, params.since, params.limit, params);
      }

      // Filter by end date if provided
      if (filters.endDate) {
        const endTime = filters.endDate.getTime();
        orders = orders.filter(order => order.timestamp <= endTime);
      }

      // Transform to standardized format
      const formattedOrders = orders.map(order => ({
        orderId: order.id,
        clientOrderId: order.clientOrderId || '',
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        status: order.status.toUpperCase(),
        quantity: parseFloat(order.amount),
        filledQuantity: parseFloat(order.filled || 0),
        remainingQuantity: parseFloat(order.remaining || 0),
        executedPrice: parseFloat(order.average || 0),
        limitPrice: parseFloat(order.price || 0),
        stopPrice: parseFloat(order.stopPrice || 0),
        timeInForce: order.timeInForce || 'GTC',
        createdAt: new Date(order.timestamp).toISOString(),
        updatedAt: order.lastTradeTimestamp ? new Date(order.lastTradeTimestamp).toISOString() : null,
        fee: order.fee ? {
          cost: parseFloat(order.fee.cost),
          currency: order.fee.currency
        } : null
      }));

      logger.info('[BinanceAdapter] Order history retrieved', {
        count: formattedOrders.length
      });

      return formattedOrders;
    } catch (error) {
      handleBrokerError(this, 'fetch {broker} order history', error, { filters });
    }
  }

  /**
   * Get current market price for a symbol
   *
   * @param {string} symbol - Trading pair (e.g., "BTC/USDT")
   * @returns {Promise<Object>} Price information (bid, ask, last)
   *
   * @throws {Error} If price retrieval fails
   */
  async getMarketPrice(symbol) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching market price', { symbol });

      // Fetch current ticker data
      const ticker = await this.exchange.fetchTicker(symbol);

      const priceData = {
        symbol: symbol,
        bid: parseFloat(ticker.bid),
        ask: parseFloat(ticker.ask),
        last: parseFloat(ticker.last),
        bidSize: parseFloat(ticker.bidVolume || 0),
        askSize: parseFloat(ticker.askVolume || 0),
        timestamp: ticker.timestamp,
        datetime: ticker.datetime
      };

      logger.info('[BinanceAdapter] Market price retrieved', {
        symbol,
        bid: priceData.bid,
        ask: priceData.ask,
        last: priceData.last
      });

      return priceData;
    } catch (error) {
      handleBrokerError(this, 'fetch {broker} market price', error, { symbol });
    }
  }

  /**
   * Validate if a symbol is supported and tradeable on Binance
   *
   * @param {string} symbol - Trading pair to validate (e.g., "BTC/USDT")
   * @returns {Promise<boolean>} True if symbol is supported and tradeable
   */
  async isSymbolSupported(symbol) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Checking symbol support', { symbol });

      // Load markets if not already loaded
      if (!this.exchange.markets || Object.keys(this.exchange.markets).length === 0) {
        await this.exchange.loadMarkets();
      }

      // Check if symbol exists in markets
      const market = this.exchange.market(symbol);

      // Verify symbol is active and spot trading is enabled
      const isSupported = market && market.active && market.spot;

      logger.info('[BinanceAdapter] Symbol support check', {
        symbol,
        supported: isSupported
      });

      return isSupported;
    } catch (error) {
      logger.warn('[BinanceAdapter] Symbol not supported', {
        symbol,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Get Binance fee structure
   *
   * @param {string} symbol - Trading pair (e.g., "BTC/USDT")
   * @returns {Promise<Object>} Fee structure with maker/taker rates
   */
  async getFees(symbol) {
    this._ensureConnected();

    try {
      logger.info('[BinanceAdapter] Fetching fee structure', { symbol });

      // Load markets to get trading fees
      if (!this.exchange.markets || Object.keys(this.exchange.markets).length === 0) {
        await this.exchange.loadMarkets();
      }

      const market = this.exchange.market(symbol);

      // Binance standard fees (may vary based on VIP level and BNB usage)
      // These are the base fees without any discounts
      const fees = {
        maker: market?.maker !== undefined ? market.maker : 0.001, // 0.1%
        taker: market?.taker !== undefined ? market.taker : 0.001, // 0.1%
        withdrawal: 0, // Varies by currency, would need specific query
        commission: 0.001, // Standard rate
        currency: 'USDT',
        notes: 'Binance base fees. Actual fees may be lower with BNB payment (25% discount) or higher VIP levels.'
      };

      logger.info('[BinanceAdapter] Fee structure retrieved', {
        symbol,
        maker: fees.maker,
        taker: fees.taker
      });

      return fees;
    } catch (error) {
      logger.error('[BinanceAdapter] Failed to fetch fees', {
        error: error.message,
        symbol
      });

      // Return default Binance fees if query fails
      return {
        maker: 0.001, // 0.1%
        taker: 0.001, // 0.1%
        withdrawal: 0,
        commission: 0.001,
        currency: 'USDT',
        notes: 'Default Binance fees. Actual fees may vary.'
      };
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
