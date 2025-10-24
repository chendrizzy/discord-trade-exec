// External dependencies
const Alpaca = require('@alpacahq/alpaca-trade-api');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const oauth2Service = require('../../services/OAuth2Service');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * Alpaca Stock Broker Adapter
 * Supports OAuth 2.0 authentication and stock trading
 * Documentation: https://docs.alpaca.markets
 */
class AlpacaAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'alpaca';
    this.brokerType = 'stock';
    this.baseURL = this.isTestnet ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

    this.alpacaClient = null;
    this.userId = credentials.userId || null;
    this.apiKey = credentials.apiKey || null;
    this.apiSecret = credentials.apiSecret || null;
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} clientId - OAuth client ID
   * @param {string} redirectUri - Callback URL
   * @param {string} state - CSRF protection state parameter
   * @param {string} scope - OAuth scope (default: 'account:write trading')
   * @returns {string} Authorization URL
   */
  static getOAuthURL(clientId, redirectUri, state, scope = 'account:write trading') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope
    });
    return `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;
  }

  /**
   * Test connection to Alpaca API
   */
  async testConnection() {
    try {
      await this.authenticate();
      // Verify by fetching account info
      const balance = await this.getBalance();
      return !!balance;
    } catch (error) {
      logger.error('[AlpacaAdapter] Connection test failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Authenticate with Alpaca using OAuth2 tokens or API key
   * OAuth2 tokens are retrieved from User model if userId provided
   */
  async authenticate() {
    try {
      let accessToken = null;

      // Try OAuth2 authentication first if userId provided
      if (this.userId) {
        const user = await User.findById(this.userId);

        if (user && user.tradingConfig.oauthTokens.has('alpaca')) {
          const encryptedTokens = user.tradingConfig.oauthTokens.get('alpaca');

          // Check if tokens are valid
          if (encryptedTokens.isValid) {
            // Decrypt access token
            accessToken = oauth2Service.decryptToken(encryptedTokens.accessToken);

            logger.info('[AlpacaAdapter] Using OAuth2 access token from user profile');
          } else {
            logger.warn('[AlpacaAdapter] OAuth2 tokens marked invalid, falling back to API key if available');
          }
        }
      }

      // Initialize Alpaca client
      if (accessToken) {
        // OAuth2 authentication
        this.alpacaClient = new Alpaca({
          keyId: 'oauth',
          secretKey: accessToken,
          paper: this.isTestnet,
          oauth: accessToken
        });
      } else if (this.apiKey && this.apiSecret) {
        // API key authentication (fallback)
        this.alpacaClient = new Alpaca({
          keyId: this.apiKey,
          secretKey: this.apiSecret,
          paper: this.isTestnet
        });
      } else {
        throw new Error('No valid credentials provided for Alpaca (OAuth2 or API key)');
      }

      // Verify authentication by fetching account
      const account = await this.alpacaClient.getAccount();
      this.isAuthenticated = !!account;

      return this.isAuthenticated;
    } catch (error) {
      logger.error('[AlpacaAdapter] Authentication failed', {
        error: error.message,
        stack: error.stack,
        userId: this.userId,
        hasApiKey: !!this.apiKey
      });
      this.isAuthenticated = false;
      throw new Error(`Alpaca authentication failed: ${error.message}`);
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
      const account = await this.alpacaClient.getAccount();

      return {
        total: parseFloat(account.equity),
        available: parseFloat(account.buying_power),
        equity: parseFloat(account.equity),
        cash: parseFloat(account.cash),
        currency: 'USD',
        portfolioValue: parseFloat(account.portfolio_value),
        profitLoss: parseFloat(account.equity) - parseFloat(account.last_equity),
        profitLossPercent:
          ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity)) * 100
      };
    } catch (error) {
      logger.error('[AlpacaAdapter] Error fetching balance', {
        error: error.message,
        stack: error.stack
      });
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
      const alpacaOrder = {
        symbol: this.normalizeSymbol(order.symbol),
        qty: order.quantity,
        side: order.side.toLowerCase(), // 'buy' or 'sell'
        type: this.mapOrderType(order.type),
        time_in_force: order.timeInForce || 'gtc'
      };

      // Add price for limit orders
      if (order.type === 'LIMIT') {
        alpacaOrder.limit_price = order.price;
      }

      // Add stop price for stop orders
      if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
        alpacaOrder.stop_price = order.stopPrice;

        if (order.type === 'STOP_LIMIT') {
          alpacaOrder.limit_price = order.price;
        }
      }

      const response = await this.alpacaClient.createOrder(alpacaOrder);

      return {
        orderId: response.id,
        clientOrderId: response.client_order_id,
        symbol: response.symbol,
        side: response.side.toUpperCase(),
        type: response.type.toUpperCase(),
        status: this.mapOrderStatus(response.status),
        quantity: parseFloat(response.qty),
        filledQuantity: parseFloat(response.filled_qty || 0),
        executedPrice: parseFloat(response.filled_avg_price || 0),
        limitPrice: parseFloat(response.limit_price || 0),
        stopPrice: parseFloat(response.stop_price || 0),
        timeInForce: response.time_in_force.toUpperCase(),
        createdAt: response.created_at,
        updatedAt: response.updated_at
      };
    } catch (error) {
      logger.error('[AlpacaAdapter] Error creating order', {
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
      await this.alpacaClient.cancelOrder(orderId);
      return true;
    } catch (error) {
      logger.error('[AlpacaAdapter] Error cancelling order', {
        error: error.message,
        stack: error.stack,
        orderId
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
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const positions = await this.alpacaClient.getPositions();

      return positions.map(pos => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.qty),
        side: parseFloat(pos.qty) > 0 ? 'LONG' : 'SHORT',
        entryPrice: parseFloat(pos.avg_entry_price),
        currentPrice: parseFloat(pos.current_price),
        marketValue: parseFloat(pos.market_value),
        costBasis: parseFloat(pos.cost_basis),
        unrealizedPnL: parseFloat(pos.unrealized_pl),
        unrealizedPnLPercent: parseFloat(pos.unrealized_plpc) * 100,
        unrealizedIntraday: parseFloat(pos.unrealized_intraday_pl),
        changeToday: parseFloat(pos.change_today) * 100
      }));
    } catch (error) {
      logger.error('[AlpacaAdapter] Error fetching positions', {
        error: error.message,
        stack: error.stack
      });
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
        symbol: this.normalizeSymbol(params.symbol),
        qty: params.quantity,
        side: params.side || 'sell', // Usually selling to close position
        type: params.type === 'TRAILING_STOP' ? 'trailing_stop' : 'stop',
        time_in_force: 'gtc'
      };

      if (params.type === 'TRAILING_STOP') {
        // Trailing stop uses trail_percent
        orderParams.trail_percent = params.trailPercent || 2.0; // Default 2%
      } else {
        // Regular stop uses stop_price
        orderParams.stop_price = params.stopPrice;
      }

      const response = await this.alpacaClient.createOrder(orderParams);

      return {
        orderId: response.id,
        type: 'STOP_LOSS',
        status: this.mapOrderStatus(response.status),
        stopPrice: parseFloat(response.stop_price || 0),
        trailPercent: parseFloat(response.trail_percent || 0)
      };
    } catch (error) {
      logger.error('[AlpacaAdapter] Error setting stop-loss', {
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
        symbol: this.normalizeSymbol(params.symbol),
        qty: params.quantity,
        side: params.side || 'sell', // Usually selling to take profit
        type: 'limit',
        limit_price: params.limitPrice,
        time_in_force: 'gtc'
      };

      const response = await this.alpacaClient.createOrder(orderParams);

      return {
        orderId: response.id,
        type: 'TAKE_PROFIT',
        status: this.mapOrderStatus(response.status),
        limitPrice: parseFloat(response.limit_price)
      };
    } catch (error) {
      logger.error('[AlpacaAdapter] Error setting take-profit', {
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
        status: filters.status || 'all',
        limit: filters.limit || 100,
        direction: 'desc'
      };

      if (filters.startDate) {
        params.after = filters.startDate.toISOString();
      }

      if (filters.endDate) {
        params.until = filters.endDate.toISOString();
      }

      const orders = await this.alpacaClient.getOrders(params);

      let filteredOrders = orders;

      // Filter by symbol if provided
      if (filters.symbol) {
        filteredOrders = orders.filter(o => o.symbol === filters.symbol);
      }

      return filteredOrders.map(order => ({
        orderId: order.id,
        clientOrderId: order.client_order_id,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        status: this.mapOrderStatus(order.status),
        quantity: parseFloat(order.qty),
        filledQuantity: parseFloat(order.filled_qty || 0),
        executedPrice: parseFloat(order.filled_avg_price || 0),
        limitPrice: parseFloat(order.limit_price || 0),
        stopPrice: parseFloat(order.stop_price || 0),
        timeInForce: order.time_in_force.toUpperCase(),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        filledAt: order.filled_at
      }));
    } catch (error) {
      logger.error('[AlpacaAdapter] Error fetching order history', {
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
      const quote = await this.alpacaClient.getLatestQuote(this.normalizeSymbol(symbol));

      return {
        symbol: symbol,
        bid: parseFloat(quote.BidPrice),
        ask: parseFloat(quote.AskPrice),
        last: parseFloat(quote.AskPrice), // Use ask as last traded
        bidSize: parseFloat(quote.BidSize),
        askSize: parseFloat(quote.AskSize),
        timestamp: quote.Timestamp
      };
    } catch (error) {
      logger.error('[AlpacaAdapter] Error fetching market price', {
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
      const asset = await this.alpacaClient.getAsset(this.normalizeSymbol(symbol));
      return asset.tradable && asset.status === 'active';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get fee structure
   */
  async getFees(symbol) {
    // Alpaca has zero commission trading for stocks
    return {
      maker: 0, // 0% maker fee
      taker: 0, // 0% taker fee
      withdrawal: 0, // No withdrawal fee
      notes: 'Alpaca offers commission-free trading for stocks and ETFs'
    };
  }

  /**
   * Normalize symbol format for Alpaca (remove slashes, use uppercase)
   */
  normalizeSymbol(symbol) {
    // Alpaca uses simple symbols: AAPL, TSLA, etc.
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Map order type to Alpaca format
   */
  mapOrderType(type) {
    const typeMap = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP: 'stop',
      STOP_LIMIT: 'stop_limit',
      TRAILING_STOP: 'trailing_stop'
    };

    return typeMap[type] || 'market';
  }

  /**
   * Map Alpaca order status to standard status
   */
  mapOrderStatus(status) {
    const statusMap = {
      new: 'PENDING',
      partially_filled: 'PARTIAL',
      filled: 'FILLED',
      done_for_day: 'DONE',
      canceled: 'CANCELLED',
      expired: 'EXPIRED',
      replaced: 'REPLACED',
      pending_cancel: 'PENDING_CANCEL',
      pending_replace: 'PENDING_REPLACE',
      accepted: 'ACCEPTED',
      pending_new: 'PENDING',
      accepted_for_bidding: 'ACCEPTED',
      stopped: 'STOPPED',
      rejected: 'REJECTED',
      suspended: 'SUSPENDED',
      calculated: 'CALCULATED'
    };

    return statusMap[status] || 'UNKNOWN';
  }

}

module.exports = AlpacaAdapter;
