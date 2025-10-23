// External dependencies
const ccxt = require('ccxt');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const { withTimeout } = require('../../utils/promise-timeout');
const logger = require('../../utils/logger');

/**
 * Coinbase Pro (Advanced Trade) Adapter using CCXT
 *
 * Implements BrokerAdapter interface for Coinbase Pro cryptocurrency exchange
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
class CoinbaseProAdapter extends BrokerAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);

    this.brokerName = 'coinbasepro';
    this.brokerType = 'crypto';

    // Initialize CCXT exchange instance
    // Note: CCXT uses 'coinbase' for Coinbase Advanced Trade API (formerly Pro)
    const exchangeOptions = {
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      password: credentials.password,
      enableRateLimit: true,
      timeout: options.timeout || 30000
    };

    // Note: Coinbase sandbox mode not supported in CCXT
    if (options.isTestnet) {
      logger.warn('⚠️  Coinbase does not support testnet/sandbox mode in CCXT');
    }

    this.exchange = new ccxt.coinbase(exchangeOptions);

    // Supported trading pairs
    this.supportedPairs = null; // Lazy loaded
  }

  /**
   * Authenticate with Coinbase Pro
   */
  async authenticate() {
    try {
      // Test authentication by fetching balance
      const balance = await withTimeout(this.exchange.fetchBalance(), 30000);

      this.isAuthenticated = true;
      console.log(`✅ Coinbase Pro authenticated: ${balance.info?.profile_id || 'profile'}`);
      return true;
    } catch (error) {
      console.error('❌ Coinbase Pro authentication failed:', error.message);
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Get account balance
   * @param {string} currency - Optional currency filter (e.g., 'USDT', 'BTC')
   */
  async getBalance(currency = null) {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), 30000);

      if (currency) {
        const currencyBalance = balance[currency] || { total: 0, free: 0, used: 0 };
        return {
          total: currencyBalance.total || 0,
          available: currencyBalance.free || 0,
          currency: currency
        };
      }

      // Return total portfolio value in USD
      const usdBalance = balance['USD'] || { total: 0, free: 0, used: 0 };
      return {
        total: usdBalance.total || 0,
        available: usdBalance.free || 0,
        equity: usdBalance.total || 0,
        currency: 'USD'
      };
    } catch (error) {
      console.error('Error fetching Coinbase Pro balance:', error.message);
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
      console.error('Error creating Coinbase Pro order:', error.message);
      throw error;
    }
  }

  /**
   * Cancel an existing order
   * @param {string} orderId - Order ID
   */
  async cancelOrder(orderId) {
    try {
      await withTimeout(this.exchange.cancelOrder(orderId), 30000);
      console.log(`✅ Coinbase Pro order ${orderId} cancelled`);
      return true;
    } catch (error) {
      console.error('Error cancelling Coinbase Pro order:', error.message);
      return false;
    }
  }

  /**
   * Get current open positions (for crypto, these are just balances with value)
   */
  async getPositions() {
    try {
      const balance = await withTimeout(this.exchange.fetchBalance(), 30000);
      const positions = [];

      // Get market prices for conversion
      for (const [currency, balanceInfo] of Object.entries(balance)) {
        if (currency === 'info' || currency === 'free' || currency === 'used' || currency === 'total') continue;

        const quantity = balanceInfo.total;
        if (quantity && quantity > 0.00000001) {
          // Skip dust amounts
          let currentPrice = 0;
          let symbol = `${currency}/USD`;

          try {
            // Try to get current price
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
      console.error('Error fetching Coinbase Pro positions:', error.message);
      return [];
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

      console.log(`✅ Coinbase Pro stop-loss set for ${params.symbol} at ${params.stopPrice}`);
      return {
        orderId: result.id,
        symbol: params.symbol,
        stopPrice: params.stopPrice
      };
    } catch (error) {
      console.error('Error setting Coinbase Pro stop-loss:', error.message);
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

      const result = await withTimeout(
        this.exchange.createOrder(symbol, 'limit', params.side.toLowerCase(), params.quantity, params.limitPrice),
        30000
      );

      console.log(`✅ Coinbase Pro take-profit set for ${params.symbol} at ${params.limitPrice}`);
      return {
        orderId: result.id,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      };
    } catch (error) {
      console.error('Error setting Coinbase Pro take-profit:', error.message);
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
      console.error('Error fetching Coinbase Pro order history:', error.message);
      return [];
    }
  }

  /**
   * Get current market price
   * @param {string} symbol - Trading symbol
   */
  async getMarketPrice(symbol) {
    try {
      const ticker = await withTimeout(this.exchange.fetchTicker(this.normalizeSymbol(symbol)), 30000);

      return {
        bid: ticker.bid || 0,
        ask: ticker.ask || 0,
        last: ticker.last || 0
      };
    } catch (error) {
      console.error('Error fetching Coinbase Pro market price:', error.message);
      throw error;
    }
  }

  /**
   * Validate if symbol is supported
   * @param {string} symbol - Trading symbol
   */
  async isSymbolSupported(symbol) {
    try {
      // Lazy load supported pairs
      if (!this.supportedPairs) {
        const markets = await withTimeout(this.exchange.fetchMarkets(), 30000);
        this.supportedPairs = new Set(markets.map(m => m.symbol));
      }

      const normalized = this.normalizeSymbol(symbol);
      return this.supportedPairs.has(normalized);
    } catch (error) {
      console.error('Error checking symbol support:', error.message);
      return false;
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
      console.error('Error fetching Coinbase Pro fees:', error.message);
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
    // Coinbase Pro uses BTC/USD format
    if (symbol.includes('/')) {
      // Replace USDT with USD for Coinbase Pro
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
   * Denormalize symbol from Coinbase Pro format to standard format
   * @param {string} symbol - Coinbase Pro symbol (e.g., 'BTC/USD')
   * @returns {string} - Standard format (e.g., 'BTC/USDT')
   */
  denormalizeSymbol(symbol) {
    // Keep the / format for crypto pairs
    return symbol;
  }

  /**
   * Map CCXT order status to standard status
   */
  mapOrderStatus(ccxtStatus) {
    const statusMap = {
      open: 'PENDING',
      closed: 'FILLED',
      canceled: 'CANCELLED',
      expired: 'CANCELLED',
      rejected: 'CANCELLED'
    };

    return statusMap[ccxtStatus] || 'PENDING';
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
