// External dependencies
const axios = require('axios');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const oauth2Service = require('../../services/OAuth2Service');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const OrderStatusMapper = require('../../utils/orderStatusMapper');

/**
 * TD Ameritrade Stock Broker Adapter
 * Supports OAuth2 authentication and stock trading
 *
 * CRITICAL: TD Ameritrade access tokens expire in 30 minutes
 * This adapter automatically refreshes tokens before each API call
 *
 * EXTERNAL SERVICE REQUIRED: TD Ameritrade OAuth2 App Registration
 * Status: TD Ameritrade merged into Schwab - new registrations disabled
 * See docs/deployment/EXTERNAL_DEPENDENCIES_GUIDE.md (P3 - Coming Soon)
 *
 * Legacy setup steps (for existing users):
 * 1. Create developer account at https://developer.tdameritrade.com
 * 2. Register new app with redirect URI
 * 3. Set TDAMERITRADE_OAUTH_CLIENT_ID and TDAMERITRADE_OAUTH_CLIENT_SECRET in .env
 * 4. Complete OAuth2 flow to obtain initial tokens
 *
 * Documentation: https://developer.tdameritrade.com/apis
 *
 * @extends BrokerAdapter
 */
class TDAmeritradeAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'tdameritrade';
    this.brokerType = 'stock';
    this.baseURL = 'https://api.tdameritrade.com/v1';

    // OAuth2 credentials
    this.userId = credentials.userId || null;
    this.accessToken = null;
    this.accountId = null; // TD Ameritrade requires account ID for most operations
  }

  /**
   * Test connection to TD Ameritrade API
   */
  async testConnection() {
    try {
      await this.authenticate();
      const accounts = await this.getAccounts();
      return !!accounts && accounts.length > 0;
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Connection test failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Authenticate with TD Ameritrade using OAuth2 tokens
   * OAuth2 tokens are retrieved from User model if userId provided
   *
   * IMPORTANT: TD Ameritrade tokens expire in 30 minutes
   * Auto-refreshes if expired before making API calls
   *
   * @returns {Promise<boolean>} Authentication status
   */
  async authenticate() {
    if (!this.userId) {
      throw new Error('User ID required for TD Ameritrade OAuth2 authentication');
    }

    try {
      const user = await User.findById(this.userId);

      if (!user) {
        throw new Error(`User '${this.userId}' not found`);
      }

      if (!user.tradingConfig.oauthTokens.has('tdameritrade')) {
        throw new Error('No OAuth2 tokens found for TD Ameritrade. Please complete OAuth2 authorization flow.');
      }

      const encryptedTokens = user.tradingConfig.oauthTokens.get('tdameritrade');

      // Check if tokens are marked invalid
      if (!encryptedTokens.isValid) {
        throw new Error('OAuth2 tokens marked invalid. Please re-authorize with TD Ameritrade.');
      }

      // Check if access token is expired (30-minute expiry)
      const now = new Date();
      if (now >= encryptedTokens.expiresAt) {
        logger.info('[TDAmeritradeAdapter] Access token expired, refreshing...');
        const refreshedTokens = await oauth2Service.refreshAccessToken('tdameritrade', this.userId);
        this.accessToken = refreshedTokens.accessToken;
      } else {
        // Decrypt access token
        this.accessToken = oauth2Service.decryptToken(encryptedTokens.accessToken);
      }

      // Get account ID for API calls
      const accounts = await this.getAccounts();
      if (accounts && accounts.length > 0) {
        this.accountId = accounts[0].accountId;
        logger.info('[TDAmeritradeAdapter] Authenticated with account', {
          accountId: this.accountId
        });
      }

      this.isAuthenticated = true;
      logger.info('[TDAmeritradeAdapter] OAuth2 authentication successful');
      return true;
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Authentication failed', {
        error: error.message,
        stack: error.stack,
        userId: this.userId
      });
      this.isAuthenticated = false;
      throw new Error(`TD Ameritrade authentication failed: ${error.message}`);
    }
  }

  /**
   * Make authenticated API request to TD Ameritrade
   * Auto-refreshes token if expired before making request
   *
   * @private
   */
  async makeRequest(method, endpoint, data = null, params = {}) {
    await this.ensureAuthenticated();

    // Check if token needs refresh before API call (30-minute expiry)
    const user = await User.findById(this.userId);
    if (user && user.tradingConfig.oauthTokens.has('tdameritrade')) {
      const encryptedTokens = user.tradingConfig.oauthTokens.get('tdameritrade');
      const now = new Date();

      if (now >= encryptedTokens.expiresAt) {
        logger.info('[TDAmeritradeAdapter] Token expired before API call, refreshing...');
        const refreshedTokens = await oauth2Service.refreshAccessToken('tdameritrade', this.userId);
        this.accessToken = refreshedTokens.accessToken;
      }
    }

    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] API request failed', {
        method,
        endpoint,
        error: error.message,
        responseData: error.response?.data,
        statusCode: error.response?.status,
        stack: error.stack
      });

      // If 401 Unauthorized, tokens may be invalid
      if (error.response?.status === 401) {
        this.isAuthenticated = false;
        throw new Error('TD Ameritrade authentication expired or invalid. Please re-authorize.');
      }

      throw new Error(`TD Ameritrade API error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get user accounts
   */
  async getAccounts() {
    try {
      const accounts = await this.makeRequest('GET', '/accounts', null, { fields: 'positions,orders' });

      return accounts.map(acc => ({
        accountId: acc.securitiesAccount.accountId,
        type: acc.securitiesAccount.type,
        roundTrips: acc.securitiesAccount.roundTrips,
        isDayTrader: acc.securitiesAccount.isDayTrader,
        isClosingOnlyRestricted: acc.securitiesAccount.isClosingOnlyRestricted
      }));
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error fetching accounts', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get accounts: ${error.message}`);
    }
  }

  /**
   * Get account balance
   */
  async getBalance(currency = 'USD') {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      const account = await this.makeRequest('GET', `/accounts/${this.accountId}`, null, { fields: 'positions' });
      const balances = account.securitiesAccount.currentBalances;

      return {
        total: balances.liquidationValue,
        available: balances.availableFunds,
        equity: balances.equity,
        cash: balances.cashBalance,
        currency: 'USD',
        buyingPower: balances.buyingPower,
        dayTradingBuyingPower: balances.dayTradingBuyingPower,
        profitLoss: balances.equity - balances.liquidationValue,
        profitLossPercent: ((balances.equity - balances.liquidationValue) / balances.liquidationValue) * 100
      };
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error fetching balance', {
        error: error.message,
        stack: error.stack,
        accountId: this.accountId
      });
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Create order
   */
  async createOrder(order) {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      const tdOrder = {
        orderType: this.mapOrderType(order.type),
        session: 'NORMAL',
        duration: order.timeInForce || 'DAY',
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
      if (order.type === 'LIMIT') {
        tdOrder.price = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        tdOrder.stopPrice = order.stopPrice;

        if (order.type === 'STOP_LIMIT') {
          tdOrder.price = order.price;
        }
      }

      const response = await this.makeRequest('POST', `/accounts/${this.accountId}/orders`, tdOrder);

      // TD Ameritrade returns order ID in Location header
      const orderId = response.headers?.location?.split('/').pop();

      return {
        orderId: orderId,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type,
        status: 'PENDING',
        quantity: order.quantity,
        filledQuantity: 0,
        executedPrice: 0,
        limitPrice: order.price || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.timeInForce || 'DAY',
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error creating order', {
        error: error.message,
        stack: error.stack,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        accountId: this.accountId
      });
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      await this.makeRequest('DELETE', `/accounts/${this.accountId}/orders/${orderId}`);
      return true;
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error cancelling order', {
        orderId,
        error: error.message,
        stack: error.stack,
        accountId: this.accountId
      });

      // If order already filled/cancelled, consider it success
      if (error.message.includes('already') || error.message.includes('not found')) {
        return true;
      }

      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Get open positions
   */
  async getPositions() {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      const account = await this.makeRequest('GET', `/accounts/${this.accountId}`, null, { fields: 'positions' });
      const positions = account.securitiesAccount.positions || [];

      return positions.map(pos => ({
        symbol: pos.instrument.symbol,
        quantity: pos.longQuantity - pos.shortQuantity,
        side: pos.longQuantity > 0 ? 'LONG' : 'SHORT',
        entryPrice: pos.averagePrice,
        currentPrice: pos.marketValue / (pos.longQuantity - pos.shortQuantity),
        marketValue: pos.marketValue,
        costBasis: (pos.longQuantity - pos.shortQuantity) * pos.averagePrice,
        unrealizedPnL: pos.marketValue - ((pos.longQuantity - pos.shortQuantity) * pos.averagePrice),
        unrealizedPnLPercent: ((pos.marketValue - ((pos.longQuantity - pos.shortQuantity) * pos.averagePrice)) / ((pos.longQuantity - pos.shortQuantity) * pos.averagePrice)) * 100,
        dayPnL: pos.currentDayProfitLoss,
        dayPnLPercent: pos.currentDayProfitLossPercentage
      }));
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error fetching positions', {
        error: error.message,
        stack: error.stack,
        accountId: this.accountId
      });
      throw new Error(`Failed to get positions: ${error.message}`);
    }
  }

  /**
   * Set stop-loss order
   */
  async setStopLoss(params) {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        symbol: this.normalizeSymbol(params.symbol),
        quantity: params.quantity,
        side: params.side || 'sell',
        type: params.type === 'TRAILING_STOP' ? 'TRAILING_STOP' : 'STOP',
        stopPrice: params.stopPrice,
        timeInForce: 'GTC'
      };

      if (params.type === 'TRAILING_STOP') {
        orderParams.trailPercent = params.trailPercent || 2.0;
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
      logger.error('[TDAmeritradeAdapter] Error setting stop-loss', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        stopPrice: params.stopPrice,
        accountId: this.accountId
      });
      throw new Error(`Failed to set stop-loss: ${error.message}`);
    }
  }

  /**
   * Set take-profit order
   */
  async setTakeProfit(params) {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        symbol: this.normalizeSymbol(params.symbol),
        quantity: params.quantity,
        side: params.side || 'sell',
        type: 'LIMIT',
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
      logger.error('[TDAmeritradeAdapter] Error setting take-profit', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        limitPrice: params.limitPrice,
        accountId: this.accountId
      });
      throw new Error(`Failed to set take-profit: ${error.message}`);
    }
  }

  /**
   * Get order history
   */
  async getOrderHistory(filters = {}) {
    if (!this.accountId) {
      await this.authenticate();
    }

    try {
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
        params.status = filters.status.toUpperCase();
      }

      const orders = await this.makeRequest('GET', `/accounts/${this.accountId}/orders`, null, params);

      return orders.map(order => ({
        orderId: order.orderId,
        symbol: order.orderLegCollection[0]?.instrument?.symbol,
        side: order.orderLegCollection[0]?.instruction,
        type: order.orderType,
        status: this.mapOrderStatus(order.status),
        quantity: order.quantity,
        filledQuantity: order.filledQuantity || 0,
        executedPrice: order.price || 0,
        limitPrice: order.price || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.duration,
        createdAt: order.enteredTime,
        updatedAt: order.closeTime || order.enteredTime
      }));
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error fetching order history', {
        error: error.message,
        stack: error.stack,
        accountId: this.accountId,
        filters
      });
      throw new Error(`Failed to get order history: ${error.message}`);
    }
  }

  /**
   * Get current market price (quote)
   */
  async getMarketPrice(symbol) {
    await this.ensureAuthenticated();

    try {
      const quote = await this.makeRequest('GET', `/marketdata/${this.normalizeSymbol(symbol)}/quotes`);
      const quoteData = quote[this.normalizeSymbol(symbol)];

      return {
        symbol: symbol,
        bid: quoteData.bidPrice,
        ask: quoteData.askPrice,
        last: quoteData.lastPrice,
        bidSize: quoteData.bidSize,
        askSize: quoteData.askSize,
        volume: quoteData.totalVolume,
        timestamp: new Date(quoteData.quoteTimeInLong).toISOString()
      };
    } catch (error) {
      logger.error('[TDAmeritradeAdapter] Error fetching market price', {
        symbol,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get market price: ${error.message}`);
    }
  }

  /**
   * Check if symbol is supported
   */
  async isSymbolSupported(symbol) {
    await this.ensureAuthenticated();

    try {
      const instrument = await this.makeRequest('GET', `/instruments`, null, {
        symbol: this.normalizeSymbol(symbol),
        projection: 'symbol-search'
      });

      return instrument && instrument.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get fee structure
   */
  async getFees(symbol) {
    // TD Ameritrade commission structure varies by account type
    // Online equity trades are typically $0 for most accounts
    return {
      maker: 0, // $0 commission
      taker: 0, // $0 commission
      withdrawal: 0, // No withdrawal fee
      notes: 'TD Ameritrade offers commission-free trading for online equity trades. Options trades may have fees ($0.65 per contract). See https://www.tdameritrade.com/pricing.html for details.'
    };
  }

  /**
   * Normalize symbol format for TD Ameritrade (uppercase)
   */
  normalizeSymbol(symbol) {
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Map order type to TD Ameritrade format
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
   * Map TD Ameritrade order status to standard status using centralized mapper
   */
  mapOrderStatus(status) {
    return OrderStatusMapper.mapStatus(status, 'tdameritrade');
  }
}

module.exports = TDAmeritradeAdapter;
