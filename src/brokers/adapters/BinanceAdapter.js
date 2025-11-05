'use strict';

/**
 * Binance Adapter using CCXT
 *
 * Extends CCXTBrokerAdapter for common CCXT patterns
 * Implements Binance-specific features and order types
 *
 * Provides Binance cryptocurrency exchange integration via CCXT library.
 *
 * Supported Features:
 * - Spot trading (buy/sell crypto)
 * - Limit and market orders
 * - Stop-loss (regular and trailing)
 * - Take-profit orders
 * - Position tracking
 * - Balance queries
 * - Order status tracking
 * - Rate limiting (1200 req/min per Binance limits)
 *
 * Required credentials:
 * - apiKey: Binance API key
 * - apiSecret: Binance API secret
 *
 * Options:
 * - isTestnet: Use Binance testnet (default: false)
 * - timeout: Request timeout in ms (default: 30000)
 *
 * @module brokers/adapters/BinanceAdapter
 */

const ccxt = require('ccxt');
const CCXTBrokerAdapter = require('../CCXTBrokerAdapter');
const { withTimeout } = require('../../utils/promise-timeout');
const logger = require('../../utils/logger');
const { handleBrokerError } = require('../utils/errorHandler');

class BinanceAdapter extends CCXTBrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'binance';

    // Initialize CCXT exchange instance only if credentials are provided
    if (credentials && credentials.apiKey && credentials.apiSecret) {
      this.exchange = new ccxt.binance({
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        enableRateLimit: true,
        timeout: this.defaultTimeout,
        options: {
          adjustForTimeDifference: true, // Handle server time sync
          recvWindow: 10000 // 10s receive window
        }
      });

      // Use testnet if specified
      if (this.isTestnet) {
        this.exchange.setSandboxMode(true);
        logger.info('[BinanceAdapter] Using Binance testnet');
      }
    } else {
      // No credentials provided - exchange will be null (for backward compatibility)
      this.exchange = null;
    }
  }

  // authenticate() inherited from CCXTBrokerAdapter
  // getBalance() inherited from CCXTBrokerAdapter (uses USDT as default)
  // cancelOrder() inherited from CCXTBrokerAdapter
  // getMarketPrice() inherited from CCXTBrokerAdapter
  // isSymbolSupported() inherited from CCXTBrokerAdapter
  // getPositions() inherited from CCXTBrokerAdapter
  // mapOrderStatus() inherited from CCXTBrokerAdapter

  /**
   * Connect to Binance using API credentials (backward compatibility wrapper)
   * @deprecated Use constructor with credentials + authenticate() instead
   */
  async connect(credentials) {
    // Validate production sandbox usage
    if (process.env.NODE_ENV === 'production' && credentials.testnet && process.env.BROKER_ALLOW_SANDBOX !== 'true') {
      throw new Error(
        'binance: Sandbox/testnet mode is not allowed in production. ' +
        'Please use live credentials or set BROKER_ALLOW_SANDBOX=true explicitly for testing.'
      );
    }

    // Reinitialize exchange with new credentials
    this.exchange = new ccxt.binance({
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      enableRateLimit: true,
      timeout: this.defaultTimeout,
      options: {
        adjustForTimeDifference: true,
        recvWindow: 10000
      }
    });

    if (credentials.testnet) {
      this.exchange.setSandboxMode(true);
    }

    // Test connection
    const balance = await this.exchange.fetchBalance();
    this.isAuthenticated = true;

    return {
      success: true,
      broker: 'binance',
      accountId: balance.info?.uid || 'N/A',
      testnet: credentials.testnet || false
    };
  }

  /**
   * Disconnect from Binance (backward compatibility wrapper)
   * @deprecated Exchange cleanup is automatic
   */
  async disconnect() {
    if (this.exchange) {
      this.exchange = null;
      logger.info('[BinanceAdapter] Disconnected from Binance');
    }
  }

  /**
   * Validate connection is active (backward compatibility)
   * @private
   */
  _ensureConnected() {
    if (!this.exchange) {
      throw new Error('Not connected to Binance. Call connect() first.');
    }
  }

  /**
   * Create order on Binance
   *
   * @param {Object} order - Order parameters
   * @param {string} order.symbol - Trading symbol (e.g., 'BTC/USDT')
   * @param {string} order.side - Order side ('BUY' or 'SELL')
   * @param {string} order.type - Order type ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')
   * @param {number} order.quantity - Order quantity
   * @param {number} order.price - Limit price (required for LIMIT orders)
   * @param {number} order.stopPrice - Stop price (required for STOP orders)
   * @param {string} order.timeInForce - Time in force ('GTC', 'IOC', 'FOK')
   * @returns {Promise<Object>} Created order details
   */
  async createOrder(order) {
    try {
      logger.info('[BinanceAdapter] Creating order', {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity
      });

      const ccxtOrder = {
        symbol: this.normalizeSymbol(order.symbol),
        type: this.mapOrderType(order.type),
        side: order.side.toLowerCase(),
        amount: order.quantity
      };

      // Add price for limit orders
      if (order.type === 'LIMIT' || order.type === 'STOP_LIMIT') {
        ccxtOrder.price = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        ccxtOrder.params = { stopPrice: order.stopPrice };
      }

      // Add time in force
      if (order.timeInForce) {
        ccxtOrder.params = ccxtOrder.params || {};
        ccxtOrder.params.timeInForce = order.timeInForce;
      }

      const result = await withTimeout(
        this.exchange.createOrder(
          ccxtOrder.symbol,
          ccxtOrder.type,
          ccxtOrder.side,
          ccxtOrder.amount,
          ccxtOrder.price,
          ccxtOrder.params
        ),
        this.defaultTimeout
      );

      logger.info('[BinanceAdapter] Order created successfully', {
        orderId: result.id,
        status: result.status
      });

      return {
        orderId: result.id,
        clientOrderId: result.clientOrderId,
        symbol: result.symbol,
        side: result.side.toUpperCase(),
        type: result.type.toUpperCase(),
        status: this.mapOrderStatus(result.status),
        quantity: parseFloat(result.amount),
        filledQuantity: parseFloat(result.filled || 0),
        executedPrice: parseFloat(result.average || result.price || 0),
        limitPrice: parseFloat(result.price || 0),
        stopPrice: parseFloat(result.stopPrice || 0),
        timeInForce: result.timeInForce || 'GTC',
        createdAt: result.timestamp,
        info: result.info
      };
    } catch (error) {
      handleBrokerError(this, 'create order', error, {
        symbol: order.symbol,
        side: order.side,
        type: order.type
      });
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
    try {
      logger.info('[BinanceAdapter] Fetching order status', { orderId, symbol });

      const order = await withTimeout(
        this.exchange.fetchOrder(orderId, symbol),
        this.defaultTimeout
      );

      return {
        orderId: order.id,
        status: this.mapOrderStatus(order.status),
        filled: order.filled || 0,
        remaining: order.remaining || 0,
        averagePrice: order.average,
        timestamp: order.timestamp,
        lastTradeTimestamp: order.lastTradeTimestamp
      };
    } catch (error) {
      handleBrokerError(this, 'fetch order status', error, { orderId, symbol });
    }
  }

  /**
   * Set stop-loss order for a position
   *
   * @param {Object} params - Stop-loss parameters
   * @param {string} params.symbol - Trading pair (e.g., 'BTC/USDT')
   * @param {number} params.quantity - Order quantity
   * @param {number} params.stopPrice - Stop price (required for regular STOP)
   * @param {string} params.type - Stop type: 'STOP' or 'TRAILING_STOP' (default: 'STOP')
   * @param {number} params.trailPercent - Trail percentage for trailing stops (default: 5)
   * @returns {Promise<Object>} Stop-loss order confirmation
   */
  async setStopLoss(params) {
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

        orderResult = await withTimeout(
          this.exchange.createOrder(
            this.normalizeSymbol(symbol),
            'TRAILING_STOP_MARKET',
            quantity > 0 ? 'sell' : 'buy',
            Math.abs(quantity),
            undefined,
            {
              callbackRate: trailPercentValue,
              timeInForce: 'GTC'
            }
          ),
          this.defaultTimeout
        );

        logger.info('[BinanceAdapter] Trailing stop-loss set', {
          orderId: orderResult.id,
          trailPercent: trailPercentValue
        });

        return {
          orderId: orderResult.id,
          type: 'STOP_LOSS',
          subType: 'TRAILING_STOP',
          status: this.mapOrderStatus(orderResult.status),
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

        orderResult = await withTimeout(
          this.exchange.createOrder(
            this.normalizeSymbol(symbol),
            'STOP_LOSS_LIMIT',
            quantity > 0 ? 'sell' : 'buy',
            Math.abs(quantity),
            stopPrice,
            {
              stopPrice: stopPrice,
              timeInForce: 'GTC'
            }
          ),
          this.defaultTimeout
        );

        logger.info('[BinanceAdapter] Stop-loss set', {
          orderId: orderResult.id,
          stopPrice
        });

        return {
          orderId: orderResult.id,
          type: 'STOP_LOSS',
          subType: 'STOP',
          status: this.mapOrderStatus(orderResult.status),
          stopPrice: parseFloat(stopPrice),
          symbol: orderResult.symbol,
          side: orderResult.side,
          quantity: orderResult.amount
        };
      }
    } catch (error) {
      handleBrokerError(this, 'set stop-loss', error, {
        symbol: params.symbol,
        type: params.type,
        stopPrice: params.stopPrice
      });
    }
  }

  /**
   * Set take-profit order for a position
   *
   * @param {Object} params - Take-profit parameters
   * @param {string} params.symbol - Trading pair (e.g., 'BTC/USDT')
   * @param {number} params.quantity - Order quantity
   * @param {number} params.limitPrice - Take-profit limit price
   * @returns {Promise<Object>} Take-profit order confirmation
   */
  async setTakeProfit(params) {
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

      const orderResult = await withTimeout(
        this.exchange.createOrder(
          this.normalizeSymbol(symbol),
          'limit',
          quantity > 0 ? 'sell' : 'buy',
          Math.abs(quantity),
          limitPrice,
          {
            timeInForce: 'GTC'
          }
        ),
        this.defaultTimeout
      );

      logger.info('[BinanceAdapter] Take-profit set', {
        orderId: orderResult.id,
        limitPrice
      });

      return {
        orderId: orderResult.id,
        type: 'TAKE_PROFIT',
        status: this.mapOrderStatus(orderResult.status),
        limitPrice: parseFloat(limitPrice),
        symbol: orderResult.symbol,
        side: orderResult.side,
        quantity: orderResult.amount
      };
    } catch (error) {
      handleBrokerError(this, 'set take-profit', error, {
        symbol: params.symbol,
        limitPrice: params.limitPrice
      });
    }
  }

  /**
   * Get order history with optional filters
   *
   * @param {Object} filters - Optional filters
   * @param {string} filters.symbol - Filter by trading pair
   * @param {Date} filters.startDate - Filter orders after this date
   * @param {Date} filters.endDate - Filter orders before this date
   * @param {number} filters.limit - Maximum number of orders (default: 100)
   * @returns {Promise<Array>} Array of historical orders
   */
  async getOrderHistory(filters = {}) {
    try {
      logger.info('[BinanceAdapter] Fetching order history', { filters });

      const params = {};

      if (filters.startDate) {
        params.since = filters.startDate.getTime();
      }

      params.limit = filters.limit || 100;

      let orders;

      if (filters.symbol) {
        orders = await withTimeout(
          this.exchange.fetchClosedOrders(filters.symbol, params.since, params.limit, params),
          this.defaultTimeout
        );
      } else {
        orders = await withTimeout(
          this.exchange.fetchClosedOrders(undefined, params.since, params.limit, params),
          this.defaultTimeout
        );
      }

      if (filters.endDate) {
        const endTime = filters.endDate.getTime();
        orders = orders.filter(order => order.timestamp <= endTime);
      }

      const formattedOrders = orders.map(order => ({
        orderId: order.id,
        clientOrderId: order.clientOrderId || '',
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        status: this.mapOrderStatus(order.status),
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
      handleBrokerError(this, 'fetch order history', error, { filters });
    }
  }

  /**
   * Get Binance fee structure
   *
   * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
   * @returns {Promise<Object>} Fee structure with maker/taker rates
   */
  async getFees(symbol) {
    try {
      logger.info('[BinanceAdapter] Fetching fee structure', { symbol });

      if (!this.exchange.markets || Object.keys(this.exchange.markets).length === 0) {
        await this.exchange.loadMarkets();
      }

      const market = this.exchange.market(symbol);

      // Binance standard fees (may vary based on VIP level and BNB usage)
      const fees = {
        maker: market?.maker !== undefined ? market.maker : 0.001, // 0.1%
        taker: market?.taker !== undefined ? market.taker : 0.001, // 0.1%
        withdrawal: 0,
        commission: 0.001,
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

      return {
        maker: 0.001,
        taker: 0.001,
        withdrawal: 0,
        commission: 0.001,
        currency: 'USDT',
        notes: 'Default Binance fees. Actual fees may vary.'
      };
    }
  }

  /**
   * Normalize symbol format for Binance
   * Binance uses format like 'BTC/USDT'
   */
  normalizeSymbol(symbol) {
    return symbol.toUpperCase();
  }

  /**
   * Map order type to Binance format
   */
  mapOrderType(type) {
    const typeMap = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP: 'stop_loss',
      STOP_LIMIT: 'stop_loss_limit',
      TRAILING_STOP: 'trailing_stop_market'
    };

    return typeMap[type] || 'market';
  }

  /**
   * Get broker information
   */
  getBrokerInfo() {
    return {
      name: this.brokerName,
      type: this.brokerType,
      isTestnet: this.isTestnet,
      isAuthenticated: this.isAuthenticated,
      supportsCrypto: true,
      supportsStocks: false,
      supportsOptions: false,
      supportsFutures: true,
      features: {
        spotTrading: true,
        marginTrading: true,
        futuresTrading: true,
        stopLoss: true,
        trailingStop: true,
        takeProfit: true
      }
    };
  }
}

module.exports = BinanceAdapter;
