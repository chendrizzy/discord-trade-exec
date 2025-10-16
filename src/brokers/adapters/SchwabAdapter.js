// External dependencies
const axios = require('axios');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');

/**
 * Charles Schwab Stock Broker Adapter
 * Implements Schwab Trader API (successor to TD Ameritrade API)
 * Supports OAuth 2.0 authentication and stock/options trading
 *
 * Documentation: https://developer.schwab.com/
 *
 * Note: Requires Schwab brokerage account and developer application
 * Refresh tokens expire after 7 days, requiring re-authentication
 */
class SchwabAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'schwab';
    this.brokerType = 'stock';

    // Schwab uses different base URLs for paper vs live trading
    this.baseURL = this.isTestnet
      ? 'https://api.schwabapi.com/trader/v1' // Paper trading
      : 'https://api.schwabapi.com/trader/v1'; // Live trading

    this.marketDataURL = 'https://api.schwabapi.com/marketdata/v1';

    // OAuth credentials
    this.clientId = credentials.appKey || credentials.clientId || null;
    this.clientSecret = credentials.appSecret || credentials.clientSecret || null;
    this.accessToken = credentials.accessToken || null;
    this.refreshToken = credentials.refreshToken || null;

    // Token expiry tracking
    this.tokenExpiresAt = null;
    this.refreshTokenExpiresAt = null;

    // Account number (set after authentication)
    this.accountId = null;
  }

  /**
   * Authenticate with Schwab using OAuth 2.0 refresh token
   * Access tokens expire after 30 minutes
   * Refresh tokens expire after 7 days
   */
  async authenticate() {
    try {
      // If we have a valid access token, verify it
      if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
        this.isAuthenticated = true;
        return true;
      }

      // If access token expired but refresh token valid, refresh
      if (this.refreshToken && (!this.refreshTokenExpiresAt || Date.now() < this.refreshTokenExpiresAt)) {
        await this.refreshAccessToken();
        this.isAuthenticated = true;
        return true;
      }

      throw new Error('No valid tokens available. Please complete OAuth flow to get refresh token.');
    } catch (error) {
      console.error('[SchwabAdapter] Authentication failed:', error.message);
      this.isAuthenticated = false;
      throw new Error(`Schwab authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    try {
      const authString = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(
        'https://api.schwabapi.com/v1/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        }),
        {
          headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token || this.refreshToken;

      // Access token expires in 30 minutes
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

      // Refresh token expires in 7 days
      if (response.data.refresh_token_expires_in) {
        this.refreshTokenExpiresAt = Date.now() + response.data.refresh_token_expires_in * 1000;
      }

      return true;
    } catch (error) {
      console.error('[SchwabAdapter] Token refresh failed:', error.message);
      throw new Error(`Failed to refresh token: ${error.message}`);
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
      // Get account ID if not set
      if (!this.accountId) {
        await this.setAccountId();
      }

      const response = await this.makeRequest('GET', `${this.baseURL}/accounts/${this.accountId}`);

      const account = response.securitiesAccount;
      const balances = account.currentBalances;

      return {
        total: balances.liquidationValue || 0,
        available: balances.availableFunds || 0,
        equity: balances.equity || 0,
        cash: balances.cashBalance || 0,
        currency: 'USD',
        portfolioValue: balances.accountValue || 0,
        buyingPower: balances.buyingPower || 0,
        profitLoss: (balances.equity || 0) - (balances.longMarketValue || 0) - (balances.cashBalance || 0),
        profitLossPercent: 0 // Schwab doesn't provide this directly
      };
    } catch (error) {
      console.error('[SchwabAdapter] getBalance error:', error.message);
      throw new Error(`Failed to get balance: ${error.message}`);
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
      if (!this.accountId) {
        await this.setAccountId();
      }

      // Build Schwab order object
      const schwabOrder = {
        orderType: this.mapOrderType(order.type),
        session: 'NORMAL',
        duration: this.mapTimeInForce(order.timeInForce || 'DAY'),
        orderStrategyType: 'SINGLE',
        orderLegCollection: [
          {
            instruction: order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            quantity: order.quantity,
            instrument: {
              symbol: this.normalizeSymbol(order.symbol),
              assetType: 'EQUITY'
            }
          }
        ]
      };

      // Add price for limit orders
      if (order.type === 'LIMIT' || order.type === 'STOP_LIMIT') {
        schwabOrder.price = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        schwabOrder.stopPrice = order.stopPrice;
      }

      const response = await this.makeRequest('POST', `${this.baseURL}/accounts/${this.accountId}/orders`, schwabOrder);

      // Schwab returns order ID in Location header
      const orderId = this.extractOrderIdFromLocation(response);

      // Fetch full order details
      const orderDetails = await this.getOrderDetails(orderId);

      return {
        orderId: orderDetails.orderId,
        clientOrderId: orderDetails.orderId,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type,
        status: this.mapOrderStatus(orderDetails.status),
        quantity: order.quantity,
        filledQuantity: orderDetails.filledQuantity || 0,
        executedPrice: orderDetails.price || 0,
        limitPrice: order.price || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.timeInForce || 'DAY',
        createdAt: orderDetails.enteredTime,
        updatedAt: orderDetails.enteredTime
      };
    } catch (error) {
      console.error('[SchwabAdapter] createOrder error:', error.message);
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
      if (!this.accountId) {
        await this.setAccountId();
      }

      await this.makeRequest('DELETE', `${this.baseURL}/accounts/${this.accountId}/orders/${orderId}`);

      return true;
    } catch (error) {
      console.error('[SchwabAdapter] cancelOrder error:', error.message);

      // If order already filled/cancelled, consider it success
      if (error.message.includes('cannot be canceled') || error.message.includes('not found')) {
        return true;
      }

      throw new Error(`Failed to cancel order: ${error.message}`);
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
      if (!this.accountId) {
        await this.setAccountId();
      }

      const response = await this.makeRequest('GET', `${this.baseURL}/accounts/${this.accountId}?fields=positions`);

      const positions = response.securitiesAccount.positions || [];

      return positions
        .filter(pos => pos.instrument.assetType === 'EQUITY')
        .map(pos => ({
          symbol: pos.instrument.symbol,
          quantity: pos.longQuantity - pos.shortQuantity,
          side: pos.longQuantity > 0 ? 'LONG' : 'SHORT',
          entryPrice: pos.averagePrice || 0,
          currentPrice: pos.marketValue / (pos.longQuantity || 1),
          marketValue: pos.marketValue || 0,
          costBasis: pos.averagePrice * pos.longQuantity,
          unrealizedPnL: pos.currentDayProfitLoss || 0,
          unrealizedPnLPercent: pos.currentDayProfitLossPercentage || 0,
          unrealizedIntraday: pos.currentDayProfitLoss || 0,
          changeToday: pos.currentDayProfitLossPercentage || 0
        }));
    } catch (error) {
      console.error('[SchwabAdapter] getPositions error:', error.message);
      throw new Error(`Failed to get positions: ${error.message}`);
    }
  }

  /**
   * Set stop-loss order
   */
  async setStopLoss(params) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        symbol: params.symbol,
        side: params.side || 'SELL',
        type: params.type === 'TRAILING_STOP' ? 'TRAILING_STOP' : 'STOP',
        quantity: params.quantity,
        timeInForce: 'GTC'
      };

      if (params.type === 'TRAILING_STOP') {
        orderParams.trailPercent = params.trailPercent || 2.0;
      } else {
        orderParams.stopPrice = params.stopPrice;
      }

      const response = await this.createOrder(orderParams);

      return {
        orderId: response.orderId,
        type: 'STOP_LOSS',
        status: response.status,
        stopPrice: params.stopPrice || 0,
        trailPercent: params.trailPercent || 0
      };
    } catch (error) {
      console.error('[SchwabAdapter] setStopLoss error:', error.message);
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
        symbol: params.symbol,
        side: params.side || 'SELL',
        type: 'LIMIT',
        quantity: params.quantity,
        price: params.limitPrice,
        timeInForce: 'GTC'
      };

      const response = await this.createOrder(orderParams);

      return {
        orderId: response.orderId,
        type: 'TAKE_PROFIT',
        status: response.status,
        limitPrice: params.limitPrice
      };
    } catch (error) {
      console.error('[SchwabAdapter] setTakeProfit error:', error.message);
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
      if (!this.accountId) {
        await this.setAccountId();
      }

      // Build query parameters
      const params = {
        maxResults: filters.limit || 100
      };

      if (filters.startDate) {
        params.fromEnteredTime = filters.startDate.toISOString();
      }

      if (filters.endDate) {
        params.toEnteredTime = filters.endDate.toISOString();
      }

      if (filters.status) {
        params.status = filters.status;
      }

      const response = await this.makeRequest('GET', `${this.baseURL}/accounts/${this.accountId}/orders`, null, params);

      let orders = response || [];

      // Filter by symbol if provided
      if (filters.symbol) {
        orders = orders.filter(
          o => o.orderLegCollection && o.orderLegCollection.some(leg => leg.instrument.symbol === filters.symbol)
        );
      }

      return orders.map(order => ({
        orderId: order.orderId,
        clientOrderId: order.orderId,
        symbol: order.orderLegCollection[0].instrument.symbol,
        side: order.orderLegCollection[0].instruction,
        type: this.mapOrderTypeFromSchwab(order.orderType),
        status: this.mapOrderStatus(order.status),
        quantity: order.orderLegCollection[0].quantity,
        filledQuantity: order.filledQuantity || 0,
        executedPrice: order.price || 0,
        limitPrice: order.price || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.duration,
        createdAt: order.enteredTime,
        updatedAt: order.enteredTime,
        filledAt: order.closeTime
      }));
    } catch (error) {
      console.error('[SchwabAdapter] getOrderHistory error:', error.message);
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
      const response = await this.makeRequest('GET', `${this.marketDataURL}/quotes/${this.normalizeSymbol(symbol)}`);

      const quote = response[symbol] || response;

      return {
        symbol: symbol,
        bid: quote.bidPrice || 0,
        ask: quote.askPrice || 0,
        last: quote.lastPrice || quote.mark || 0,
        bidSize: quote.bidSize || 0,
        askSize: quote.askSize || 0,
        timestamp: new Date(quote.quoteTimeInLong || Date.now()).toISOString()
      };
    } catch (error) {
      console.error('[SchwabAdapter] getMarketPrice error:', error.message);
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
      const response = await this.makeRequest('GET', `${this.marketDataURL}/instruments`, null, {
        symbol: this.normalizeSymbol(symbol),
        projection: 'symbol-search'
      });

      return response && response.instruments && response.instruments.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get fee structure
   */
  async getFees(symbol) {
    // Schwab's fee structure:
    // - $0 commission for online equity trades
    // - Options: $0 base + $0.65 per contract
    return {
      maker: 0, // $0 commission
      taker: 0, // $0 commission
      withdrawal: 0, // No withdrawal fee
      notes: 'Schwab offers $0 commission for online equity trades. Options: $0.65 per contract.'
    };
  }

  /**
   * Disconnect (cleanup)
   */
  async disconnect() {
    this.isAuthenticated = false;
    this.accessToken = null;
    this.accountId = null;
    return true;
  }

  /**
   * Get broker information
   */
  getBrokerInfo() {
    return {
      name: 'schwab',
      displayName: 'Charles Schwab',
      type: 'stock',
      isTestnet: this.isTestnet,
      isAuthenticated: this.isAuthenticated,
      supportsStocks: true,
      supportsCrypto: false,
      supportsOptions: true,
      supportsFutures: true,
      commissionFree: true,
      requiresOAuth: true,
      refreshTokenExpiry: '7 days',
      accessTokenExpiry: '30 minutes'
    };
  }

  /**
   * Helper: Set account ID from available accounts
   */
  async setAccountId() {
    const response = await this.makeRequest('GET', `${this.baseURL}/accounts`);

    if (!response || response.length === 0) {
      throw new Error('No accounts found');
    }

    // Use first account (most users have one)
    this.accountId = response[0].securitiesAccount.accountId;
  }

  /**
   * Helper: Get order details by ID
   */
  async getOrderDetails(orderId) {
    if (!this.accountId) {
      await this.setAccountId();
    }

    const response = await this.makeRequest('GET', `${this.baseURL}/accounts/${this.accountId}/orders/${orderId}`);

    return response;
  }

  /**
   * Helper: Extract order ID from Location header
   */
  extractOrderIdFromLocation(response) {
    // Schwab returns order ID in response headers
    if (response.headers && response.headers.location) {
      const matches = response.headers.location.match(/orders\/(\d+)/);
      if (matches) {
        return matches[1];
      }
    }
    // Fallback: look in response body
    if (response.data && response.data.orderId) {
      return response.data.orderId;
    }
    throw new Error('Could not extract order ID from response');
  }

  /**
   * Helper: Make authenticated API request
   */
  async makeRequest(method, url, data = null, params = null) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const config = {
        method,
        url,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      if (params) {
        config.params = params;
      }

      const response = await axios(config);
      return response.data || response;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Normalize symbol format for Schwab (uppercase)
   */
  normalizeSymbol(symbol) {
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Map order type to Schwab format
   */
  mapOrderType(type) {
    const typeMap = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP'
    };

    return typeMap[type] || 'MARKET';
  }

  /**
   * Map Schwab order type to standard format
   */
  mapOrderTypeFromSchwab(type) {
    const typeMap = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP'
    };

    return typeMap[type] || type;
  }

  /**
   * Map time in force to Schwab format
   */
  mapTimeInForce(tif) {
    const tifMap = {
      GTC: 'GOOD_TILL_CANCEL',
      DAY: 'DAY',
      IOC: 'IMMEDIATE_OR_CANCEL',
      FOK: 'FILL_OR_KILL'
    };

    return tifMap[tif] || 'DAY';
  }

  /**
   * Map Schwab order status to standard status
   */
  mapOrderStatus(status) {
    const statusMap = {
      AWAITING_PARENT_ORDER: 'PENDING',
      AWAITING_CONDITION: 'PENDING',
      AWAITING_MANUAL_REVIEW: 'PENDING',
      ACCEPTED: 'ACCEPTED',
      AWAITING_UR_OUT: 'PENDING',
      PENDING_ACTIVATION: 'PENDING',
      QUEUED: 'PENDING',
      WORKING: 'WORKING',
      REJECTED: 'REJECTED',
      PENDING_CANCEL: 'PENDING_CANCEL',
      CANCELED: 'CANCELLED',
      PENDING_REPLACE: 'PENDING_REPLACE',
      REPLACED: 'REPLACED',
      FILLED: 'FILLED',
      EXPIRED: 'EXPIRED'
    };

    return statusMap[status] || 'UNKNOWN';
  }

  /**
   * Get OAuth authorization URL
   * @static
   */
  static getOAuthURL(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state
    });

    return `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   * @static
   */
  static async exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
    try {
      const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post(
        'https://api.schwabapi.com/v1/oauth/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        }),
        {
          headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('[SchwabAdapter] Token exchange error:', error.message);
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }
}

module.exports = SchwabAdapter;
