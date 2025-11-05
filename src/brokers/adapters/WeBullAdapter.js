/**
 * WeBull Stock Broker Adapter
 * Supports OAuth 2.0 authentication and commission-free stock trading
 * Documentation: https://docs.webull.com
 */

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const oauth2Service = require('../../services/OAuth2Service');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const axios = require('axios');
const OrderStatusMapper = require('../../utils/orderStatusMapper');

/**
 * WeBull adapter for commission-free stock trading
 */
class WeBullAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'webull';
    this.brokerType = 'stock';
    this.baseURL = options.baseURL || 'https://api.webull.com/api';

    // OAuth credentials
    this.userId = credentials.userId || null;
    this.apiKey = credentials.apiKey || null;
    this.apiSecret = credentials.apiSecret || null;
    this.accessToken = null;
    this.refreshToken = credentials.refreshToken || null;

    // Account info
    this.accountId = null;
    this.accountType = credentials.accountType || 'INDIVIDUAL';

    // HTTP client
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WeBullAdapter/1.0'
      }
    });
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} clientId - OAuth client ID
   * @param {string} redirectUri - Callback URL
   * @param {string} state - CSRF protection state parameter
   * @param {string} scope - OAuth scope (default: 'trade read')
   * @returns {string} Authorization URL
   */
  static getOAuthURL(clientId, redirectUri, state, scope = 'trade read') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope,
      access_type: 'offline'
    });
    return `https://app.webull.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Authenticate with WeBull using OAuth2 tokens or API key
   */
  async authenticate() {
    try {
      let accessToken = null;
      let needsRefresh = false;

      // Try OAuth2 authentication first if userId provided
      if (this.userId) {
        const user = await User.findById(this.userId);

        if (user && user.tradingConfig.oauthTokens.has('webull')) {
          const encryptedTokens = user.tradingConfig.oauthTokens.get('webull');

          if (encryptedTokens.isValid) {
            // Check token expiration
            const tokenExpiry = encryptedTokens.expiresAt;
            if (tokenExpiry && new Date(tokenExpiry) < new Date()) {
              needsRefresh = true;
              this.refreshToken = oauth2Service.decryptToken(encryptedTokens.refreshToken);
            } else {
              accessToken = oauth2Service.decryptToken(encryptedTokens.accessToken);
              logger.info('[WeBullAdapter] Using OAuth2 access token from user profile');
            }
          } else {
            logger.warn('[WeBullAdapter] OAuth2 tokens marked invalid');
          }
        }
      }

      // Refresh token if needed
      if (needsRefresh && this.refreshToken) {
        accessToken = await this.refreshAccessToken();
      }

      // Fall back to API key authentication
      if (!accessToken && this.apiKey && this.apiSecret) {
        accessToken = await this.authenticateWithApiKey();
      }

      if (!accessToken) {
        throw new Error('No valid credentials provided for WeBull');
      }

      this.accessToken = accessToken;

      // Set auth header for all requests
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      // Verify authentication by fetching account info
      const response = await this.httpClient.get('/accounts');
      if (response.data && response.data.accounts && response.data.accounts.length > 0) {
        this.accountId = response.data.accounts[0].accountId;
        this.isAuthenticated = true;
        logger.info('[WeBullAdapter] Authentication successful', { accountId: this.accountId });
      }

      return this.isAuthenticated;
    } catch (error) {
      logger.error('[WeBullAdapter] Authentication failed', {
        error: error.message,
        stack: error.stack,
        userId: this.userId,
        hasApiKey: !!this.apiKey
      });
      this.isAuthenticated = false;
      throw new Error(`WeBull authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth access token
   */
  async refreshAccessToken() {
    try {
      const response = await this.httpClient.post('/oauth/refresh', {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.apiKey,
        client_secret: this.apiSecret
      });

      if (response.data.access_token) {
        logger.info('[WeBullAdapter] Access token refreshed successfully');
        return response.data.access_token;
      }
      throw new Error('No access token in refresh response');
    } catch (error) {
      logger.error('[WeBullAdapter] Failed to refresh access token', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Authenticate with API key
   */
  async authenticateWithApiKey() {
    try {
      const response = await this.httpClient.post('/oauth/token', {
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.apiSecret
      });

      if (response.data.access_token) {
        logger.info('[WeBullAdapter] API key authentication successful');
        return response.data.access_token;
      }
      throw new Error('No access token in response');
    } catch (error) {
      logger.error('[WeBullAdapter] API key authentication failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(currency = 'USD') {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.httpClient.get(`/accounts/${this.accountId}/balance`);
      const balance = response.data;

      return {
        total: parseFloat(balance.totalValue || 0),
        available: parseFloat(balance.cashBalance || 0),
        equity: parseFloat(balance.netLiquidation || 0),
        cash: parseFloat(balance.cashBalance || 0),
        currency: 'USD',
        portfolioValue: parseFloat(balance.totalValue || 0),
        profitLoss: parseFloat(balance.unrealizedPnL || 0),
        profitLossPercent: parseFloat(balance.unrealizedPnLPercent || 0),
        dayTradesRemaining: balance.dayTradesRemaining || 3,
        marginBalance: parseFloat(balance.marginBalance || 0),
        buyingPower: parseFloat(balance.buyingPower || balance.cashBalance || 0)
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error fetching balance', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Get open positions
   */
  async getPositions() {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.httpClient.get(`/accounts/${this.accountId}/positions`);
      const positions = response.data.positions || [];

      return positions.map(pos => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.quantity),
        side: parseFloat(pos.quantity) > 0 ? 'LONG' : 'SHORT',
        entryPrice: parseFloat(pos.avgPrice || pos.costBasis / pos.quantity),
        currentPrice: parseFloat(pos.marketPrice || pos.lastPrice),
        marketValue: parseFloat(pos.marketValue),
        costBasis: parseFloat(pos.costBasis),
        unrealizedPnL: parseFloat(pos.unrealizedPnL || 0),
        unrealizedPnLPercent: parseFloat(pos.unrealizedPnLPercent || 0),
        unrealizedIntraday: parseFloat(pos.intradayPnL || 0),
        changeToday: parseFloat(pos.changeToday || 0),
        positionType: pos.positionType || 'STOCK'
      }));
    } catch (error) {
      logger.error('[WeBullAdapter] Error fetching positions', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get positions: ${error.message}`);
    }
  }

  /**
   * Create order
   */
  async createOrder(order) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const webullOrder = {
        accountId: this.accountId,
        symbol: this.normalizeSymbol(order.symbol),
        quantity: order.quantity,
        side: order.side.toUpperCase(),
        orderType: this.mapOrderType(order.type),
        timeInForce: order.timeInForce || 'DAY',
        extendedHours: order.extendedHours || false
      };

      // Add price for limit orders
      if (order.type === 'LIMIT' || order.type === 'STOP_LIMIT') {
        webullOrder.limitPrice = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        webullOrder.stopPrice = order.stopPrice;
      }

      const response = await this.httpClient.post('/orders', webullOrder);
      const createdOrder = response.data;

      return {
        orderId: createdOrder.orderId,
        clientOrderId: createdOrder.clientOrderId || createdOrder.orderId,
        symbol: createdOrder.symbol,
        side: createdOrder.side,
        type: this.reverseMapOrderType(createdOrder.orderType),
        status: this.mapOrderStatus(createdOrder.status),
        quantity: parseFloat(createdOrder.quantity),
        filledQuantity: parseFloat(createdOrder.filledQuantity || 0),
        executedPrice: parseFloat(createdOrder.avgFillPrice || 0),
        limitPrice: parseFloat(createdOrder.limitPrice || 0),
        stopPrice: parseFloat(createdOrder.stopPrice || 0),
        timeInForce: createdOrder.timeInForce,
        createdAt: createdOrder.createdTime,
        updatedAt: createdOrder.updatedTime,
        commission: 0 // WeBull is commission-free
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error creating order', {
        error: error.message,
        stack: error.stack,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity
      });
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.httpClient.delete(`/orders/${orderId}`);

      if (response.data.success || response.status === 200 || response.status === 204) {
        return true;
      }

      // Check if order was already cancelled or filled
      if (response.data.error &&
          (response.data.error.includes('already') ||
           response.data.error.includes('filled') ||
           response.data.error.includes('cancelled'))) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[WeBullAdapter] Error cancelling order', {
        error: error.message,
        stack: error.stack,
        orderId
      });

      // If order already filled/cancelled, consider it success
      if (error.message.includes('already') ||
          error.message.includes('not found') ||
          error.message.includes('filled')) {
        return true;
      }

      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.httpClient.get(`/orders/${orderId}`);
      const order = response.data;

      return {
        orderId: order.orderId,
        status: this.mapOrderStatus(order.status),
        filledQuantity: parseFloat(order.filledQuantity || 0),
        remainingQuantity: parseFloat(order.remainingQuantity || order.quantity - (order.filledQuantity || 0)),
        executedPrice: parseFloat(order.avgFillPrice || 0),
        updatedAt: order.updatedTime
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error fetching order status', {
        error: error.message,
        stack: error.stack,
        orderId
      });
      throw new Error(`Failed to get order status: ${error.message}`);
    }
  }

  /**
   * Set stop-loss order
   * Note: WeBull doesn't have native trailing stops, we simulate with regular stops
   */
  async setStopLoss(params) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        accountId: this.accountId,
        symbol: this.normalizeSymbol(params.symbol),
        quantity: params.quantity,
        side: params.side || 'SELL',
        orderType: 'STOP',
        stopPrice: params.stopPrice,
        timeInForce: 'GTC'
      };

      // WeBull doesn't support native trailing stops
      // We'll need to implement this with manual updates
      if (params.type === 'TRAILING_STOP') {
        logger.warn('[WeBullAdapter] WeBull does not support native trailing stops, using regular stop order');
        // Calculate stop price based on current market price and trail percent
        const marketPrice = await this.getMarketPrice(params.symbol);
        const trailAmount = marketPrice.last * (params.trailPercent / 100);
        orderParams.stopPrice = params.side === 'SELL'
          ? marketPrice.last - trailAmount
          : marketPrice.last + trailAmount;
      }

      const response = await this.httpClient.post('/orders', orderParams);
      const order = response.data;

      return {
        orderId: order.orderId,
        type: 'STOP_LOSS',
        status: this.mapOrderStatus(order.status),
        stopPrice: parseFloat(order.stopPrice),
        trailPercent: params.trailPercent || 0,
        symbol: order.symbol,
        quantity: parseFloat(order.quantity)
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error setting stop-loss', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        stopPrice: params.stopPrice,
        type: params.type
      });
      throw new Error(`Failed to set stop-loss: ${error.message}`);
    }
  }

  /**
   * Set take-profit order
   */
  async setTakeProfit(params) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        accountId: this.accountId,
        symbol: this.normalizeSymbol(params.symbol),
        quantity: params.quantity,
        side: params.side || 'SELL',
        orderType: 'LIMIT',
        limitPrice: params.limitPrice,
        timeInForce: 'GTC'
      };

      const response = await this.httpClient.post('/orders', orderParams);
      const order = response.data;

      return {
        orderId: order.orderId,
        type: 'TAKE_PROFIT',
        status: this.mapOrderStatus(order.status),
        limitPrice: parseFloat(order.limitPrice),
        symbol: order.symbol,
        quantity: parseFloat(order.quantity)
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error setting take-profit', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        limitPrice: params.limitPrice
      });
      throw new Error(`Failed to set take-profit: ${error.message}`);
    }
  }

  /**
   * Get order history
   */
  async getOrderHistory(filters = {}) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const params = {
        accountId: this.accountId,
        status: filters.status || 'all',
        limit: filters.limit || 100,
        startDate: filters.startDate ? filters.startDate.toISOString() : undefined,
        endDate: filters.endDate ? filters.endDate.toISOString() : undefined
      };

      const response = await this.httpClient.get('/orders/history', { params });
      let orders = response.data.orders || [];

      // Filter by symbol if provided
      if (filters.symbol) {
        orders = orders.filter(o => o.symbol === this.normalizeSymbol(filters.symbol));
      }

      return orders.map(order => ({
        orderId: order.orderId,
        clientOrderId: order.clientOrderId || order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: this.reverseMapOrderType(order.orderType),
        status: this.mapOrderStatus(order.status),
        quantity: parseFloat(order.quantity),
        filledQuantity: parseFloat(order.filledQuantity || 0),
        executedPrice: parseFloat(order.avgFillPrice || 0),
        limitPrice: parseFloat(order.limitPrice || 0),
        stopPrice: parseFloat(order.stopPrice || 0),
        timeInForce: order.timeInForce,
        createdAt: order.createdTime,
        updatedAt: order.updatedTime,
        filledAt: order.filledTime,
        commission: 0 // WeBull is commission-free
      }));
    } catch (error) {
      logger.error('[WeBullAdapter] Error fetching order history', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw new Error(`Failed to get order history: ${error.message}`);
    }
  }

  /**
   * Get current market price
   */
  async getMarketPrice(symbol) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.httpClient.get(`/quotes/${normalizedSymbol}`);
      const quote = response.data;

      return {
        symbol: symbol,
        bid: parseFloat(quote.bidPrice || quote.bid || 0),
        ask: parseFloat(quote.askPrice || quote.ask || 0),
        last: parseFloat(quote.lastPrice || quote.last || 0),
        bidSize: parseFloat(quote.bidSize || 0),
        askSize: parseFloat(quote.askSize || 0),
        volume: parseFloat(quote.volume || 0),
        high: parseFloat(quote.high || 0),
        low: parseFloat(quote.low || 0),
        open: parseFloat(quote.open || 0),
        close: parseFloat(quote.previousClose || 0),
        change: parseFloat(quote.change || 0),
        changePercent: parseFloat(quote.changePercent || 0),
        timestamp: quote.timestamp || new Date().toISOString()
      };
    } catch (error) {
      logger.error('[WeBullAdapter] Error fetching market price', {
        error: error.message,
        stack: error.stack,
        symbol
      });
      throw new Error(`Failed to get market price: ${error.message}`);
    }
  }

  /**
   * Check if symbol is supported
   */
  async isSymbolSupported(symbol) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const response = await this.httpClient.get(`/instruments/${normalizedSymbol}`);
      const instrument = response.data;

      return instrument &&
             instrument.tradable === true &&
             instrument.status === 'ACTIVE' &&
             (instrument.type === 'STOCK' || instrument.type === 'ETF');
    } catch (error) {
      // If we get a 404, symbol is not supported
      if (error.response && error.response.status === 404) {
        return false;
      }

      logger.error('[WeBullAdapter] Error checking symbol support', {
        error: error.message,
        symbol
      });
      return false;
    }
  }

  /**
   * Get fee structure (WeBull is commission-free)
   */
  async getFees(symbol) {
    // WeBull offers commission-free trading for stocks and ETFs
    return {
      maker: 0, // 0% maker fee
      taker: 0, // 0% taker fee
      commission: 0, // $0 commission per trade
      minimumCommission: 0,
      maximumCommission: 0,
      regulatoryFees: 0.00221, // Small regulatory fees may apply
      withdrawal: 0, // No withdrawal fee
      deposit: 0, // No deposit fee
      notes: 'WeBull offers commission-free trading for stocks and ETFs. Small regulatory fees may apply.',
      currency: 'USD'
    };
  }

  /**
   * Normalize symbol format for WeBull (uppercase, no special chars)
   */
  normalizeSymbol(symbol) {
    // WeBull uses simple symbols: AAPL, TSLA, etc.
    return symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  /**
   * Map order type to WeBull format
   */
  mapOrderType(type) {
    const typeMap = {
      'MARKET': 'MARKET',
      'LIMIT': 'LIMIT',
      'STOP': 'STOP',
      'STOP_LIMIT': 'STOP_LIMIT',
      'TRAILING_STOP': 'STOP' // WeBull doesn't have native trailing stops
    };

    return typeMap[type] || 'MARKET';
  }

  /**
   * Reverse map WeBull order type to standard format
   */
  reverseMapOrderType(type) {
    const typeMap = {
      'MARKET': 'MARKET',
      'LIMIT': 'LIMIT',
      'STOP': 'STOP',
      'STOP_LIMIT': 'STOP_LIMIT',
      'MKT': 'MARKET',
      'LMT': 'LIMIT',
      'STP': 'STOP',
      'STP_LMT': 'STOP_LIMIT'
    };

    return typeMap[type] || 'MARKET';
  }

  /**
   * Map WeBull order status to standard status using centralized mapper
   */
  mapOrderStatus(status) {
    return OrderStatusMapper.mapStatus(status.toLowerCase(), 'webull');
  }
}

module.exports = WeBullAdapter;