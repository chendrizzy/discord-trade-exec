// External dependencies
const ccxt = require('ccxt');

// Internal utilities and services
const CCXTBrokerAdapter = require('../CCXTBrokerAdapter');
const { withTimeout } = require('../../utils/promise-timeout');
const logger = require('../../utils/logger');
const SymbolNormalizer = require('../../utils/symbolNormalizer');

/**
 * Coinbase Pro (Advanced Trade) Adapter using CCXT
 *
 * Extends CCXTBrokerAdapter for common CCXT patterns
 * Implements Coinbase-specific features and overrides
 *
 * Supports spot trading for major cryptocurrencies
 *
 * Required credentials:
 * - apiKey: Coinbase Pro API key
 * - apiSecret: Coinbase Pro API secret
 * - password: Coinbase Pro API passphrase
 *
 * Options:
 * - isTestnet: Use sandbox environment (default: false)
 * - timeout: Request timeout in ms (default: 30000)
 */
class CoinbaseProAdapter extends CCXTBrokerAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);

    this.brokerName = 'coinbasepro';

    // Initialize CCXT exchange instance
    // Note: CCXT uses 'coinbase' for Coinbase Advanced Trade API (formerly Pro)
    this.exchange = new ccxt.coinbase({
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      password: credentials.password,
      enableRateLimit: true,
      timeout: this.defaultTimeout
    });

    // Note: Coinbase sandbox mode not supported in CCXT
    if (options.isTestnet) {
      logger.warn('⚠️  Coinbase does not support testnet/sandbox mode in CCXT');
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

      // Add stop price if applicable
      if (orderType === 'stop' || orderType === 'stop_limit') {
        orderParams.stopPrice = order.stopPrice;
      }

      // Execute the order
      const result = await withTimeout(
        this.exchange.createOrder(symbol, orderParams.type, orderParams.side, order.quantity, orderParams.price, {
          stopPrice: orderParams.stopPrice
        }),
        30000
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
      this.handleError('create order', error, {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity
      });
    }
  }

  /**
   * Set stop-loss order
   * @param {Object} params - Stop-loss parameters
   */
  async setStopLoss(params) {
    try {
      const symbol = this.normalizeSymbol(params.symbol);

      const result = await withTimeout(
        this.exchange.createOrder(
          symbol,
          'stop',
          params.side.toLowerCase(),
          params.quantity,
          null, // No limit price for stop-market
          {
            stopPrice: params.stopPrice
          }
        ),
        30000
      );

      logger.info('[CoinbaseProAdapter] Stop-loss order set', {
        orderId: result.id,
        symbol: params.symbol,
        stopPrice: params.stopPrice
      });
      return {
        orderId: result.id,
        symbol: params.symbol,
        stopPrice: params.stopPrice
      };
    } catch (error) {
      this.handleError('set stop-loss', error, {
        symbol: params.symbol,
        stopPrice: params.stopPrice
      });
    }
  }

  /**
   * Set take-profit order
   * @param {Object} params - Take-profit parameters
   */
  async setTakeProfit(params) {
    try {
      const symbol = this.normalizeSymbol(params.symbol);

      const result = await withTimeout(
        this.exchange.createOrder(symbol, 'limit', params.side.toLowerCase(), params.quantity, params.limitPrice),
        30000
      );

      logger.info('[CoinbaseProAdapter] Take-profit order set', {
        orderId: result.id,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      });
      return {
        orderId: result.id,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      };
    } catch (error) {
      this.handleError('set take-profit', error, {
        symbol: params.symbol,
        limitPrice: params.limitPrice
      });
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
        orders = await withTimeout(this.exchange.fetchOrders(this.normalizeSymbol(filters.symbol)), 30000);
      } else {
        orders = await withTimeout(this.exchange.fetchOrders(), 30000);
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
      logger.error('[CoinbaseProAdapter] Error fetching order history', {
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
      const markets = await withTimeout(this.exchange.fetchMarkets(), 30000);
      const market = markets.find(m => m.symbol === this.normalizeSymbol(symbol));

      if (market) {
        return {
          maker: market.maker || 0.005, // 0.5% default
          taker: market.taker || 0.005, // 0.5% default
          withdrawal: 0 // Coinbase Pro doesn't charge withdrawal fees via API
        };
      }

      // Default fees
      return {
        maker: 0.005,
        taker: 0.005,
        withdrawal: 0
      };
    } catch (error) {
      logger.error('[CoinbaseProAdapter] Error fetching fees', {
        error: error.message,
        stack: error.stack,
        symbol
      });
      return {
        maker: 0.005,
        taker: 0.005,
        withdrawal: 0
      };
    }
  }

  /**
   * Normalize symbol format for Coinbase Pro
   * @param {string} symbol - Input symbol (e.g., 'BTC/USDT', 'BTCUSDT')
   * @returns {string} - Coinbase Pro format (e.g., 'BTC/USD')
   */
  normalizeSymbol(symbol) {
    return SymbolNormalizer.normalize(symbol, 'coinbasepro');
  }

  /**
   * Denormalize symbol from Coinbase Pro format to standard format
   * @param {string} symbol - Coinbase Pro symbol (e.g., 'BTC/USD')
   * @returns {string} - Standard format (e.g., 'BTC/USDT')
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
      name: 'Coinbase Pro',
      displayName: 'Coinbase Pro (Advanced Trade)',
      supportsCrypto: true,
      supportsStocks: false,
      supportsOptions: false,
      supportsFutures: false,
      minTradeAmount: 10, // $10 USD minimum
      website: 'https://pro.coinbase.com',
      documentationUrl: 'https://docs.cloud.coinbase.com/exchange'
    };
  }
}

module.exports = CoinbaseProAdapter;
