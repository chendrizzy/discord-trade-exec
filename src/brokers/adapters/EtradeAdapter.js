// External dependencies
const axios = require('axios');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const oauth2Service = require('../../services/OAuth2Service');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * E*TRADE Stock Broker Adapter
 * Supports OAuth 1.0a authentication and stock trading
 *
 * IMPORTANT: E*TRADE uses OAuth 1.0a (not OAuth 2.0)
 * - Access tokens expire in 2 hours
 * - Tokens can be renewed (not refreshed) using renewURL
 * - OAuth signatures required for all API requests
 *
 * TODO: Register E*TRADE OAuth app at https://developer.etrade.com
 * Required steps:
 * 1. Create developer account
 * 2. Register new app with redirect URI
 * 3. Set ETRADE_OAUTH_CLIENT_ID (Consumer Key) and ETRADE_OAUTH_CLIENT_SECRET (Consumer Secret) in .env
 * 4. Implement OAuth 1.0a flow:
 *    - Request temporary credentials (request token)
 *    - Redirect user to authorization URL
 *    - Exchange verifier code for access token
 * 5. Install OAuth 1.0a library (e.g., oauth-1.0a, simple-oauth2)
 *
 * OAuth 1.0a Flow:
 * 1. POST /oauth/request_token → Get oauth_token & oauth_token_secret
 * 2. Redirect to /e/t/etws/authorize?key={key}&token={oauth_token}
 * 3. User authorizes → Callback with oauth_verifier
 * 4. POST /oauth/access_token with verifier → Get access token & secret
 * 5. Renew token (before 2hr expiry): POST /oauth/renew_access_token
 *
 * Documentation: https://developer.etrade.com/home
 *
 * @extends BrokerAdapter
 */
class EtradeAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'etrade';
    this.brokerType = 'stock';

    // Guard against sandbox mode in production
    if (process.env.NODE_ENV === 'production' && options.sandbox && process.env.BROKER_ALLOW_SANDBOX !== 'true') {
      const error = new Error(
        'E*TRADE: Sandbox mode is not allowed in production. ' +
        'Please use live credentials or set BROKER_ALLOW_SANDBOX=true explicitly for testing.'
      );
      const logger = require('../../utils/logger');
      logger.error('[EtradeAdapter] Production sandbox usage prevented', {
        brokerName: 'etrade',
        nodeEnv: process.env.NODE_ENV,
        sandbox: options.sandbox,
        brokerAllowSandbox: process.env.BROKER_ALLOW_SANDBOX,
        errorMessage: error.message
      });
      throw error;
    }

    this.baseURL = options.sandbox ? 'https://etwssandbox.etrade.com' : 'https://api.etrade.com';

    // OAuth 1.0a credentials
    this.userId = credentials.userId || null;
    this.accessToken = null;
    this.accessTokenSecret = null; // OAuth 1.0a requires token secret
    this.accountId = null; // E*TRADE requires account key for most operations
    this.accountIdKey = null; // E*TRADE uses accountIdKey for API calls
  }

  /**
   * Test connection to E*TRADE API
   */
  async testConnection() {
    try {
      await this.authenticate();
      const accounts = await this.listAccounts();
      return !!accounts && accounts.length > 0;
    } catch (error) {
      logger.error('[EtradeAdapter] Connection test failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Authenticate with E*TRADE using OAuth 1.0a tokens
   * OAuth tokens are retrieved from User model if userId provided
   *
   * IMPORTANT: E*TRADE uses OAuth 1.0a with token renewal (not refresh)
   * Access tokens expire in 2 hours and must be renewed
   *
   * TODO: Implement OAuth 1.0a signature generation and request signing
   * Consider using oauth-1.0a npm package: https://www.npmjs.com/package/oauth-1.0a
   *
   * @returns {Promise<boolean>} Authentication status
   */
  async authenticate() {
    if (!this.userId) {
      throw new Error('User ID required for E*TRADE OAuth 1.0a authentication');
    }

    try {
      const user = await User.findById(this.userId);

      if (!user) {
        throw new Error(`User '${this.userId}' not found`);
      }

      if (!user.tradingConfig.oauthTokens.has('etrade')) {
        throw new Error('No OAuth tokens found for E*TRADE. Please complete OAuth 1.0a authorization flow.');
      }

      const encryptedTokens = user.tradingConfig.oauthTokens.get('etrade');

      // Check if tokens are marked invalid
      if (!encryptedTokens.isValid) {
        throw new Error('OAuth tokens marked invalid. Please re-authorize with E*TRADE.');
      }

      // Check if access token is expired (2-hour expiry)
      const now = new Date();
      if (now >= encryptedTokens.expiresAt) {
        logger.info('[EtradeAdapter] Access token expired, renewing...');

        // TODO: Implement token renewal via /oauth/renew_access_token
        // E*TRADE uses renewal instead of refresh - requires OAuth 1.0a signature
        // For now, throw error requiring re-authorization
        throw new Error('E*TRADE token expired. Token renewal not yet implemented. Please re-authorize.');

        // Future implementation:
        // const renewedTokens = await this.renewAccessToken(this.userId);
        // this.accessToken = renewedTokens.accessToken;
        // this.accessTokenSecret = renewedTokens.accessTokenSecret;
      } else {
        // Decrypt access token and secret
        this.accessToken = oauth2Service.decryptToken(encryptedTokens.accessToken);

        // OAuth 1.0a also stores token secret
        if (encryptedTokens.accessTokenSecret) {
          this.accessTokenSecret = oauth2Service.decryptToken(encryptedTokens.accessTokenSecret);
        }
      }

      // Get account list and select first account
      const accounts = await this.listAccounts();
      if (accounts && accounts.length > 0) {
        this.accountIdKey = accounts[0].accountIdKey;
        this.accountId = accounts[0].accountId;
        logger.info('[EtradeAdapter] Authenticated with account', {
          accountId: this.accountId,
          accountIdKey: this.accountIdKey
        });
      }

      this.isAuthenticated = true;
      logger.info('[EtradeAdapter] OAuth 1.0a authentication successful');
      return true;
    } catch (error) {
      logger.error('[EtradeAdapter] Authentication failed', {
        error: error.message,
        stack: error.stack,
        userId: this.userId
      });
      this.isAuthenticated = false;
      throw new Error(`E*TRADE authentication failed: ${error.message}`);
    }
  }

  /**
   * Make authenticated API request to E*TRADE
   *
   * TODO: Implement OAuth 1.0a request signing
   * All E*TRADE API requests require OAuth 1.0a signature in Authorization header
   *
   * OAuth 1.0a Authorization Header Format:
   * OAuth oauth_consumer_key="...",oauth_timestamp="...",oauth_nonce="...",
   *       oauth_signature_method="HMAC-SHA1",oauth_signature="...",oauth_token="..."
   *
   * Recommended library: oauth-1.0a
   * Example:
   * const OAuth = require('oauth-1.0a');
   * const crypto = require('crypto');
   * const oauth = OAuth({
   *   consumer: { key: consumerKey, secret: consumerSecret },
   *   signature_method: 'HMAC-SHA1',
   *   hash_function(base_string, key) {
   *     return crypto.createHmac('sha1', key).update(base_string).digest('base64');
   *   }
   * });
   * const authHeader = oauth.toHeader(oauth.authorize(request_data, token));
   *
   * @private
   */
  async makeRequest(method, endpoint, data = null, params = {}) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    // Check if token needs renewal before API call (2-hour expiry)
    const user = await User.findById(this.userId);
    if (user && user.tradingConfig.oauthTokens.has('etrade')) {
      const encryptedTokens = user.tradingConfig.oauthTokens.get('etrade');
      const now = new Date();

      if (now >= encryptedTokens.expiresAt) {
        logger.info('[EtradeAdapter] Token expired before API call, renewal required');
        throw new Error('E*TRADE token expired. Token renewal not yet implemented. Please re-authorize.');
      }
    }

    try {
      // TODO: Generate OAuth 1.0a signature
      // For now, using placeholder Bearer token (will fail with real E*TRADE API)
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          // TODO: Replace with proper OAuth 1.0a Authorization header
          'Authorization': `Bearer ${this.accessToken}`, // PLACEHOLDER - needs OAuth 1.0a signature
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
      logger.error('[EtradeAdapter] API request failed', {
        method,
        endpoint,
        error: error.message,
        responseData: error.response?.data,
        statusCode: error.response?.status,
        stack: error.stack
      });

      // If 401 Unauthorized, tokens may be invalid or expired
      if (error.response?.status === 401) {
        this.isAuthenticated = false;
        throw new Error('E*TRADE authentication expired or invalid. Please re-authorize.');
      }

      throw new Error(`E*TRADE API error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * List user accounts
   */
  async listAccounts() {
    try {
      const response = await this.makeRequest('GET', '/v1/accounts/list');

      if (response.AccountListResponse && response.AccountListResponse.Accounts) {
        return response.AccountListResponse.Accounts.Account.map(acc => ({
          accountId: acc.accountId,
          accountIdKey: acc.accountIdKey,
          accountMode: acc.accountMode,
          accountDesc: acc.accountDesc,
          accountName: acc.accountName,
          accountType: acc.accountType,
          institutionType: acc.institutionType,
          accountStatus: acc.accountStatus
        }));
      }

      return [];
    } catch (error) {
      logger.error('[EtradeAdapter] Error fetching accounts', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to list accounts: ${error.message}`);
    }
  }

  /**
   * Get account balance
   */
  async getBalance(currency = 'USD') {
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const response = await this.makeRequest('GET', `/v1/accounts/${this.accountIdKey}/balance`, null, {
        instType: 'BROKERAGE',
        realTimeNAV: true
      });

      const balance = response.BalanceResponse;
      const computed = balance.Computed;

      return {
        total: computed.RealTimeValues.totalAccountValue,
        available: computed.cashAvailableForWithdrawal,
        equity: computed.RealTimeValues.totalAccountValue,
        cash: computed.cashBalance,
        currency: 'USD',
        buyingPower: computed.buyingPower.stock,
        marginBuyingPower: computed.buyingPower.margin,
        profitLoss: computed.unrealizedGain,
        profitLossPercent: (computed.unrealizedGain / computed.RealTimeValues.totalAccountValue) * 100
      };
    } catch (error) {
      logger.error('[EtradeAdapter] Error fetching balance', {
        error: error.message,
        stack: error.stack,
        accountIdKey: this.accountIdKey
      });
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Create order
   */
  async createOrder(order) {
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const etradeOrder = {
        orderType: this.mapOrderType(order.type),
        session: 'REGULAR',
        duration: order.timeInForce || 'DAY',
        orderTerm: order.timeInForce || 'GOOD_FOR_DAY',
        priceType: this.mapOrderType(order.type),
        Instrument: [
          {
            Product: {
              securityType: 'EQ',
              symbol: this.normalizeSymbol(order.symbol)
            },
            orderAction: order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            quantityType: 'QUANTITY',
            quantity: order.quantity
          }
        ]
      };

      // Add price for limit orders
      if (order.type === 'LIMIT') {
        etradeOrder.limitPrice = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        etradeOrder.stopPrice = order.stopPrice;

        if (order.type === 'STOP_LIMIT') {
          etradeOrder.limitPrice = order.price;
        }
      }

      // Preview order first (E*TRADE requirement)
      const previewResponse = await this.makeRequest(
        'POST',
        `/v1/accounts/${this.accountIdKey}/orders/preview`,
        { PreviewOrderRequest: { ...etradeOrder, clientOrderId: Date.now().toString() } }
      );

      const previewId = previewResponse.PreviewOrderResponse.PreviewIds[0].previewId;

      // Place order using preview ID
      const placeResponse = await this.makeRequest(
        'POST',
        `/v1/accounts/${this.accountIdKey}/orders/place`,
        {
          PlaceOrderRequest: {
            ...etradeOrder,
            previewId,
            clientOrderId: Date.now().toString()
          }
        }
      );

      const placedOrder = placeResponse.PlaceOrderResponse.Order[0];

      return {
        orderId: placedOrder.orderId,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type,
        status: this.mapOrderStatus(placedOrder.orderStatus),
        quantity: order.quantity,
        filledQuantity: placedOrder.filledQuantity || 0,
        executedPrice: placedOrder.averageExecutionPrice || 0,
        limitPrice: order.price || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.timeInForce || 'DAY',
        createdAt: placedOrder.orderPlacedTime
      };
    } catch (error) {
      logger.error('[EtradeAdapter] Error creating order', {
        error: error.message,
        stack: error.stack,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        accountIdKey: this.accountIdKey
      });
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const response = await this.makeRequest(
        'PUT',
        `/v1/accounts/${this.accountIdKey}/orders/cancel`,
        { CancelOrderRequest: { orderId } }
      );

      return response.CancelOrderResponse.resultMessage === 'SUCCESS';
    } catch (error) {
      logger.error('[EtradeAdapter] Error cancelling order', {
        orderId,
        error: error.message,
        stack: error.stack,
        accountIdKey: this.accountIdKey
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
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const response = await this.makeRequest('GET', `/v1/accounts/${this.accountIdKey}/portfolio`);

      const positions = response.PortfolioResponse.AccountPortfolio[0].Position || [];

      return positions.map(pos => ({
        symbol: pos.Product.symbol,
        quantity: pos.quantity,
        side: pos.quantity > 0 ? 'LONG' : 'SHORT',
        entryPrice: pos.pricePaid,
        currentPrice: pos.Quick.lastTrade,
        marketValue: pos.marketValue,
        costBasis: pos.totalCost,
        unrealizedPnL: pos.totalGain,
        unrealizedPnLPercent: pos.totalGainPct,
        dayPnL: pos.daysGain,
        dayPnLPercent: pos.daysGainPct
      }));
    } catch (error) {
      logger.error('[EtradeAdapter] Error fetching positions', {
        error: error.message,
        stack: error.stack,
        accountIdKey: this.accountIdKey
      });
      throw new Error(`Failed to get positions: ${error.message}`);
    }
  }

  /**
   * Set stop-loss order
   */
  async setStopLoss(params) {
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const orderParams = {
        symbol: this.normalizeSymbol(params.symbol),
        quantity: params.quantity,
        side: params.side || 'sell',
        type: params.type === 'TRAILING_STOP' ? 'TRAILING_STOP_CNST' : 'STOP',
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
      logger.error('[EtradeAdapter] Error setting stop-loss', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        stopPrice: params.stopPrice,
        accountIdKey: this.accountIdKey
      });
      throw new Error(`Failed to set stop-loss: ${error.message}`);
    }
  }

  /**
   * Set take-profit order
   */
  async setTakeProfit(params) {
    if (!this.accountIdKey) {
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
      logger.error('[EtradeAdapter] Error setting take-profit', {
        error: error.message,
        stack: error.stack,
        symbol: params.symbol,
        limitPrice: params.limitPrice,
        accountIdKey: this.accountIdKey
      });
      throw new Error(`Failed to set take-profit: ${error.message}`);
    }
  }

  /**
   * Get order history
   */
  async getOrderHistory(filters = {}) {
    if (!this.accountIdKey) {
      await this.authenticate();
    }

    try {
      const params = {
        count: filters.limit || 100
      };

      if (filters.status) {
        params.status = filters.status.toUpperCase();
      }

      if (filters.symbol) {
        params.symbol = this.normalizeSymbol(filters.symbol);
      }

      const response = await this.makeRequest('GET', `/v1/accounts/${this.accountIdKey}/orders`, null, params);

      const orders = response.OrdersResponse.Order || [];

      return orders.map(order => ({
        orderId: order.orderId,
        symbol: order.Instrument[0]?.Product?.symbol,
        side: order.Instrument[0]?.orderAction,
        type: order.priceType,
        status: this.mapOrderStatus(order.orderStatus),
        quantity: order.Instrument[0]?.orderedQuantity,
        filledQuantity: order.Instrument[0]?.filledQuantity || 0,
        executedPrice: order.averageExecutionPrice || 0,
        limitPrice: order.limitPrice || 0,
        stopPrice: order.stopPrice || 0,
        timeInForce: order.orderTerm,
        createdAt: order.orderPlacedTime,
        updatedAt: order.orderPlacedTime
      }));
    } catch (error) {
      logger.error('[EtradeAdapter] Error fetching order history', {
        error: error.message,
        stack: error.stack,
        accountIdKey: this.accountIdKey,
        filters
      });
      throw new Error(`Failed to get order history: ${error.message}`);
    }
  }

  /**
   * Get current market price (quote)
   */
  async getMarketPrice(symbol) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.makeRequest('GET', `/v1/market/quote/${this.normalizeSymbol(symbol)}`);

      const quote = response.QuoteResponse.QuoteData[0];

      return {
        symbol: symbol,
        bid: quote.All.bid,
        ask: quote.All.ask,
        last: quote.All.lastTrade,
        bidSize: quote.All.bidSize,
        askSize: quote.All.askSize,
        volume: quote.All.totalVolume,
        timestamp: quote.dateTime
      };
    } catch (error) {
      logger.error('[EtradeAdapter] Error fetching market price', {
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
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await this.makeRequest('GET', `/v1/market/lookup/${this.normalizeSymbol(symbol)}`);
      return response && response.LookupResponse && response.LookupResponse.Data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get fee structure
   */
  async getFees(symbol) {
    // E*TRADE commission structure varies by account type and pricing plan
    return {
      maker: 0, // $0 for most accounts with Unlimited plan
      taker: 0, // $0 for most accounts with Unlimited plan
      withdrawal: 0, // No withdrawal fee
      notes: 'E*TRADE offers commission-free trading for stocks and ETFs with most accounts. Options trades may have fees ($0.50-$0.65 per contract). See https://us.etrade.com/what-we-offer/pricing-and-rates for details.'
    };
  }

  /**
   * Normalize symbol format for E*TRADE (uppercase)
   */
  normalizeSymbol(symbol) {
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Map order type to E*TRADE format
   */
  mapOrderType(type) {
    const typeMap = {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP_CNST'
    };

    return typeMap[type] || 'MARKET';
  }

  /**
   * Map E*TRADE order status to standard status
   */
  mapOrderStatus(status) {
    const statusMap = {
      OPEN: 'PENDING',
      EXECUTED: 'FILLED',
      CANCELLED: 'CANCELLED',
      INDIVIDUAL_FILLS: 'PARTIAL',
      CANCEL_REQUESTED: 'PENDING_CANCEL',
      EXPIRED: 'EXPIRED',
      REJECTED: 'REJECTED',
      PARTIAL: 'PARTIAL',
      DO_NOT_EXERCISE: 'DONE',
      DONE_TRADE_EXECUTED: 'FILLED'
    };

    return statusMap[status] || 'UNKNOWN';
  }

  /**
   * Renew OAuth 1.0a access token
   * E*TRADE tokens can be renewed before expiration
   *
   * TODO: Implement token renewal via /oauth/renew_access_token
   * Requires OAuth 1.0a signature with current access token
   *
   * @private
   */
  async renewAccessToken(userId) {
    throw new Error('E*TRADE token renewal not yet implemented. OAuth 1.0a signature generation required.');

    // Future implementation:
    // 1. Generate OAuth 1.0a signature using current access token
    // 2. POST to https://api.etrade.com/oauth/renew_access_token
    // 3. Parse renewed token and secret from response
    // 4. Encrypt and update in User model
    // 5. Return renewed tokens
  }
}

module.exports = EtradeAdapter;
