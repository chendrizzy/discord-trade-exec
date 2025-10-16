// External dependencies
const ccxt = require('ccxt');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const { withTimeout } = require('../../utils/promise-timeout');

/**
 * Kraken Adapter using CCXT
 *
 * Implements BrokerAdapter interface for Kraken cryptocurrency exchange
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
class KrakenAdapter extends BrokerAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);

    this.brokerName = 'kraken';
    this.brokerType = 'crypto';

    // Initialize CCXT exchange instance
    this.exchange = new ccxt.kraken({
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      enableRateLimit: true,
      timeout: options.timeout || 30000
    });

    // Note: Kraken doesn't have a public testnet/sandbox
    if (options.isTestnet) {
      console.warn('⚠️  Kraken does not support testnet/sandbox mode');
    }

    // Supported trading pairs
    this.supportedPairs = null; // Lazy loaded
  }

  /**
   * Test connection to Kraken API
   */
  async testConnection() {
    try {
      await this.authenticate();
      // Verify by fetching balance
      const balance = await this.getBalance();
      return !!balance;
    } catch (error) {
      console.error('[KrakenAdapter] Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Authenticate with Kraken
   */
  async authenticate() {
    try {
      // Test authentication by fetching balance
      const balance = await withTimeout(this.exchange.fetchBalance(), 30000);

      this.isAuthenticated = true;
      console.log('✅ Kraken authenticated successfully');
      return true;
    } catch (error) {
      console.error('❌ Kraken authentication failed:', error.message);
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
      console.error('Error fetching Kraken balance:', error.message);
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
      console.error('Error creating Kraken order:', error.message);
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
      console.log(`✅ Kraken order ${orderId} cancelled`);
      return true;
    } catch (error) {
      console.error('Error cancelling Kraken order:', error.message);
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
            const normalizedSymbol = this.normalizeSymbol(symbol);
            const ticker = await this.exchange.fetchTicker(normalizedSymbol);
            currentPrice = ticker.last;
          } catch (e) {
            // If can't get price (e.g., for USD itself), use 1.0
            currentPrice = currency === 'USD' || currency === 'ZUSD' ? 1.0 : 0;
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
      console.error('Error fetching Kraken positions:', error.message);
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

      // Kraken supports stop-loss orders with stopLossPrice parameter
      const result = await withTimeout(
        this.exchange.createOrder(symbol, 'stop-loss', params.side.toLowerCase(), params.quantity, null, {
          stopLossPrice: params.stopPrice
        }),
        30000
      );

      console.log(`✅ Kraken stop-loss set for ${params.symbol} at ${params.stopPrice}`);
      return {
        orderId: result.id,
        symbol: params.symbol,
        stopPrice: params.stopPrice
      };
    } catch (error) {
      console.error('Error setting Kraken stop-loss:', error.message);
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
        30000
      );

      console.log(`✅ Kraken take-profit set for ${params.symbol} at ${params.limitPrice}`);
      return {
        orderId: result.id,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      };
    } catch (error) {
      console.error('Error setting Kraken take-profit:', error.message);
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
      console.error('Error fetching Kraken order history:', error.message);
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
      console.error('Error fetching Kraken market price:', error.message);
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
      console.error('Error fetching Kraken fees:', error.message);
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
