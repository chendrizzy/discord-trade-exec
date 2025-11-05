// External dependencies
const ccxt = require('ccxt');

// Internal utilities and services
const CCXTBrokerAdapter = require('../CCXTBrokerAdapter');
const { withTimeout } = require('../../utils/promise-timeout');
const logger = require('../../utils/logger');

/**
 * Kraken Adapter using CCXT
 *
 * Extends CCXTBrokerAdapter for common CCXT patterns
 * Implements Kraken-specific features and overrides
 *
 * Supports spot trading for major cryptocurrencies with advanced features
 *
 * Required credentials:
 * - apiKey: Kraken API key
 * - apiSecret: Kraken API private key
 *
 * Options:
 * - isTestnet: Use demo environment (default: false)
 * - timeout: Request timeout in ms (default: 30000)
 */
class KrakenAdapter extends CCXTBrokerAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);

    this.brokerName = 'kraken';

    // Initialize CCXT exchange instance
    this.exchange = new ccxt.kraken({
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      enableRateLimit: true,
      timeout: this.defaultTimeout
    });

    // Note: Kraken doesn't have a public testnet/sandbox
    if (options.isTestnet) {
      logger.warn('⚠️  Kraken does not support testnet/sandbox mode');
    }
  }

  /**
   * Get account balance (overrides base class to handle Kraken-specific currency codes)
   * Kraken uses X-prefixed symbols (XXBT for BTC, ZUSD for USD)
   *
   * @param {string} currency - Optional currency filter (e.g., 'USDT', 'BTC')
   */
  async getBalance(currency = null) {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), this.defaultTimeout);

      if (currency) {
        // Kraken uses X-prefixed symbols (XXBT for BTC, ZUSD for USD)
        const krakenCurrency = this.normalizeKrakenCurrency(currency);
        const currencyBalance = balance[currency] || balance[krakenCurrency] || { total: 0, free: 0, used: 0 };
        return {
          total: currencyBalance.total || 0,
          available: currencyBalance.free || 0,
          currency: currency
        };
      }

      // Return total portfolio value in USD
      const usdBalance = balance['USD'] || balance['ZUSD'] || { total: 0, free: 0, used: 0 };
      return {
        total: usdBalance.total || 0,
        available: usdBalance.free || 0,
        equity: usdBalance.total || 0,
        currency: 'USD'
      };
    } catch (error) {
      logger.error('[KrakenAdapter] Error fetching balance', {
        error: error.message,
        stack: error.stack,
        currency
      });
      throw error;
    }
  }

  /**
   * Create a new order
   * @param {Object} order - Order parameters
   */
  async createOrder(order) {
    try {
      const symbol = this.normalizeSymbol(order.symbol);

      // Map order type
      const orderType = order.type.toLowerCase();
      const side = order.side.toLowerCase();

      const orderParams = {
        type: orderType === 'market' ? 'market' : 'limit',
        side: side === 'buy' ? 'buy' : 'sell'
      };

      // Add limit price if applicable
      if (orderType === 'limit') {
        orderParams.price = order.price;
      }

      // Add stop price if applicable (Kraken uses stopLossPrice parameter)
      if (orderType === 'stop' || orderType === 'stop_limit') {
        orderParams.stopLossPrice = order.stopPrice;
      }

      // Execute the order
      const result = await withTimeout(
        this.exchange.createOrder(symbol, orderParams.type, orderParams.side, order.quantity, orderParams.price, {
          stopLossPrice: orderParams.stopLossPrice
        }),
        this.defaultTimeout
      );

      return {
        orderId: result.id,
        status: this.mapOrderStatus(result.status),
        executedQty: result.filled || 0,
        executedPrice: result.average || result.price || 0,
        symbol: order.symbol,
        side: order.side,
        type: order.type
      };
    } catch (error) {
      logger.error('[KrakenAdapter] Error creating order', {
        error: error.message,
        stack: error.stack,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity
      });
      throw error;
    }
  }

  /**
   * Set stop-loss order
   * @param {Object} params - Stop-loss parameters
   */
  async setStopLoss(params) {
    try {
      const symbol = this.normalizeSymbol(params.symbol);

      // Kraken supports stop-loss orders with stopLossPrice parameter
      const result = await withTimeout(
        this.exchange.createOrder(symbol, 'stop-loss', params.side.toLowerCase(), params.quantity, null, {
          stopLossPrice: params.stopPrice
        }),
        this.defaultTimeout
      );

      logger.info('[KrakenAdapter] Stop-loss order set', {
        symbol: params.symbol,
        stopPrice: params.stopPrice,
        orderId: result.id
      });
      return {
        orderId: result.id,
        symbol: params.symbol,
        stopPrice: params.stopPrice
      };
    } catch (error) {
      logger.error('[KrakenAdapter] Error setting stop-loss', {
        symbol: params.symbol,
        stopPrice: params.stopPrice,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Set take-profit order
   * @param {Object} params - Take-profit parameters
   */
  async setTakeProfit(params) {
    try {
      const symbol = this.normalizeSymbol(params.symbol);

      // Kraken supports take-profit orders
      const result = await withTimeout(
        this.exchange.createOrder(symbol, 'take-profit', params.side.toLowerCase(), params.quantity, null, {
          takeProfitPrice: params.limitPrice
        }),
        this.defaultTimeout
      );

      logger.info('[KrakenAdapter] Take-profit order set', {
        symbol: params.symbol,
        limitPrice: params.limitPrice,
        orderId: result.id
      });
      return {
        orderId: result.id,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      };
    } catch (error) {
      logger.error('[KrakenAdapter] Error setting take-profit', {
        symbol: params.symbol,
        limitPrice: params.limitPrice,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get order history
   * @param {Object} filters - Optional filters
   */
  async getOrderHistory(filters = {}) {
    try {
      let orders = [];

      if (filters.symbol) {
        orders = await withTimeout(this.exchange.fetchOrders(this.normalizeSymbol(filters.symbol)), this.defaultTimeout);
      } else {
        orders = await withTimeout(this.exchange.fetchOrders(), this.defaultTimeout);
      }

      // Apply filters
      if (filters.startDate) {
        const startTime = filters.startDate.getTime();
        orders = orders.filter(o => o.timestamp >= startTime);
      }

      if (filters.endDate) {
        const endTime = filters.endDate.getTime();
        orders = orders.filter(o => o.timestamp <= endTime);
      }

      if (filters.status) {
        const status = this.mapOrderStatus(filters.status);
        orders = orders.filter(o => this.mapOrderStatus(o.status) === status);
      }

      return orders.map(order => ({
        orderId: order.id,
        symbol: this.denormalizeSymbol(order.symbol),
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        quantity: order.amount,
        executedQty: order.filled,
        price: order.price,
        status: this.mapOrderStatus(order.status),
        timestamp: new Date(order.timestamp)
      }));
    } catch (error) {
      logger.error('[KrakenAdapter] Error fetching order history', {
        error: error.message,
        stack: error.stack,
        filters
      });
      return [];
    }
  }

  /**
   * Get fee structure
   * @param {string} symbol - Trading symbol
   */
  async getFees(symbol) {
    try {
      const markets = await withTimeout(this.exchange.fetchMarkets(), this.defaultTimeout);
      const market = markets.find(m => m.symbol === this.normalizeSymbol(symbol));

      if (market) {
        return {
          maker: market.maker || 0.0016, // 0.16% default maker fee
          taker: market.taker || 0.0026, // 0.26% default taker fee
          withdrawal: 0 // Varies by currency
        };
      }

      // Default fees (Kraken's standard fees)
      return {
        maker: 0.0016,
        taker: 0.0026,
        withdrawal: 0
      };
    } catch (error) {
      logger.error('[KrakenAdapter] Error fetching fees', {
        symbol,
        error: error.message,
        stack: error.stack
      });
      return {
        maker: 0.0016,
        taker: 0.0026,
        withdrawal: 0
      };
    }
  }

  /**
   * Normalize Kraken currency codes (they use X/Z prefixes)
   * @param {string} currency - Standard currency code
   * @returns {string} - Kraken currency code
   */
  normalizeKrakenCurrency(currency) {
    const currencyMap = {
      BTC: 'XXBT',
      USD: 'ZUSD',
      EUR: 'ZEUR',
      GBP: 'ZGBP',
      JPY: 'ZJPY',
      CAD: 'ZCAD'
    };

    return currencyMap[currency] || currency;
  }

  /**
   * Normalize symbol format for Kraken
   * @param {string} symbol - Input symbol (e.g., 'BTC/USDT', 'BTCUSDT')
   * @returns {string} - Kraken format (e.g., 'BTC/USD')
   */
  normalizeSymbol(symbol) {
    // Kraken uses BTC/USD format (no USDT pairs, use USD instead)
    if (symbol.includes('/')) {
      // Replace USDT with USD for Kraken
      return symbol.replace('/USDT', '/USD');
    }

    // Convert BTCUSDT -> BTC/USD
    const match = symbol.match(/^([A-Z]{3,5})(USDT?|USD)$/);
    if (match) {
      return `${match[1]}/USD`;
    }

    return symbol;
  }

  /**
   * Denormalize symbol from Kraken format to standard format
   * @param {string} symbol - Kraken symbol (e.g., 'BTC/USD')
   * @returns {string} - Standard format (e.g., 'BTC/USD')
   */
  denormalizeSymbol(symbol) {
    // Keep the / format for crypto pairs
    return symbol;
  }

  /**
   * Get broker information
   */
  getBrokerInfo() {
    return {
      ...super.getBrokerInfo(),
      name: 'Kraken',
      displayName: 'Kraken',
      supportsCrypto: true,
      supportsStocks: false,
      supportsOptions: false,
      supportsFutures: true, // Kraken supports futures trading
      minTradeAmount: 10, // $10 USD minimum
      website: 'https://www.kraken.com',
      documentationUrl: 'https://docs.kraken.com/rest/'
    };
  }
}

module.exports = KrakenAdapter;
