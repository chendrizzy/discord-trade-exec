// External dependencies
const { IBApi, Contract, Order } = require('@stoqey/ib');

// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const oauth2Service = require('../../services/OAuth2Service');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const OrderStatusMapper = require('../../utils/orderStatusMapper');

/**
 * Interactive Brokers (IBKR) API Adapter
 * Supports both OAuth2 and TWS/IB Gateway authentication
 *
 * OAuth2 Authentication (recommended):
 * - userId: User ID for OAuth2 token retrieval
 * - Tokens stored in user.oauthTokens.get('ibkr')
 *
 * TWS/IB Gateway Authentication (legacy):
 * - clientId: Unique client identifier (default: 1)
 * - host: TWS/IB Gateway host (default: 127.0.0.1)
 * - port: API port (4001 for paper, 7496 for live)
 * - Requires TWS/IB Gateway running with API access enabled
 *
 * @extends BrokerAdapter
 */
class IBKRAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'ibkr';
    this.brokerType = 'stock';

    // OAuth2 credentials
    this.userId = credentials.userId || null;
    this.accessToken = null;

    // TWS/IB Gateway connection configuration (legacy)
    this.clientId = credentials.clientId || parseInt(process.env.IBKR_CLIENT_ID) || 1;
    this.host = credentials.host || process.env.IBKR_HOST || '127.0.0.1';
    this.port = credentials.port || (this.isTestnet ? 4001 : parseInt(process.env.IBKR_PORT) || 7496);

    // IB API client
    this.ib = null;
    this.nextValidOrderId = null;
    this.connectionReady = false;

    // Event handlers storage
    this.orderStatusHandlers = new Map();
    this.accountSummaryHandlers = [];
    this.positionHandlers = [];

    logger.info('[IBKRAdapter] Initialized with config', {
      userId: this.userId,
      clientId: this.clientId,
      host: this.host,
      port: this.port,
      isTestnet: this.isTestnet
    });
  }

  /**
   * Authenticate with IBKR using OAuth2 tokens or TWS/IB Gateway
   * OAuth2 tokens are retrieved from User model if userId provided
   * Falls back to TWS/IB Gateway if OAuth2 not available
   *
   * @returns {Promise<boolean>} Authentication status
   */
  async authenticate() {
    if (this.isAuthenticated && this.connectionReady) {
      return true;
    }

    try {
      let useOAuth2 = false;

      // Try OAuth2 authentication first if userId provided
      if (this.userId) {
        const user = await User.findById(this.userId);

        if (user && user.tradingConfig.oauthTokens.has('ibkr')) {
          const encryptedTokens = user.tradingConfig.oauthTokens.get('ibkr');

          // Check if tokens are valid
          if (encryptedTokens.isValid) {
            // Check if access token is expired
            const now = new Date();
            if (now >= encryptedTokens.expiresAt) {
              logger.info('[IBKRAdapter] Access token expired, refreshing...');
              const refreshedTokens = await oauth2Service.refreshAccessToken('ibkr', this.userId);
              this.accessToken = refreshedTokens.accessToken;
            } else {
              // Decrypt access token
              this.accessToken = oauth2Service.decryptToken(encryptedTokens.accessToken);
            }

            useOAuth2 = true;
            logger.info('[IBKRAdapter] Using OAuth2 access token from user profile');
          } else {
            logger.warn('[IBKRAdapter] OAuth2 tokens marked invalid, falling back to TWS/IB Gateway if available');
          }
        }
      }

      if (useOAuth2) {
        // EXTERNAL SERVICE REQUIRED: IBKR OAuth2 App Registration
        // Status: OAuth2 available for institutional accounts only - See config/brokers.js
        // Individual accounts must use TWS/IB Gateway (single-user deployment mode)
        // See docs/deployment/EXTERNAL_DEPENDENCIES_GUIDE.md (P3 - Coming Soon)
        //
        // Institutional account setup:
        // 1. Contact IBKR for institutional API access
        // 2. Register OAuth2 application
        // 3. Implement OAuth2 token exchange and API authentication
        //
        // For now, mark as authenticated with access token cached (stub implementation)
        // Actual API calls will use this.accessToken in Authorization header
        this.isAuthenticated = true;
        logger.info('[IBKRAdapter] OAuth2 authentication successful (stub - requires institutional account)');
        return true;
      } else {
        // Fall back to TWS/IB Gateway authentication (legacy)
        logger.info('[IBKRAdapter] Connecting to TWS/IB Gateway', {
          host: this.host,
          port: this.port
        });

        // Create IB client instance
        this.ib = new IBApi({
          clientId: this.clientId,
          host: this.host,
          port: this.port
        });

        // Wait for connection to establish
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout after 10 seconds'));
          }, 10000);

          this.ib.on('connected', () => {
            clearTimeout(timeout);
            logger.info('[IBKRAdapter] Connected to TWS/IB Gateway');
          });

          this.ib.on('nextValidId', orderId => {
            clearTimeout(timeout);
            this.nextValidOrderId = orderId;
            this.connectionReady = true;
            logger.info('[IBKRAdapter] Connection ready', {
              nextValidOrderId: orderId
            });
            resolve();
          });

          this.ib.on('error', (err, data) => {
            if (err.code === -1 || err.code === 502) {
              // Connection errors
              clearTimeout(timeout);
              reject(new Error(`TWS connection failed: ${err.message}`));
            } else {
              logger.error('[IBKRAdapter] IB API error', {
                error: err.message || err,
                code: err.code,
                data,
                stack: err.stack
              });
            }
          });

          this.ib.on('disconnected', () => {
            logger.info('[IBKRAdapter] Disconnected from TWS/IB Gateway');
            this.connectionReady = false;
            this.isAuthenticated = false;
          });

          // Initiate connection
          this.ib.connect();
        });

        this.isAuthenticated = true;
        return true;
      }
    } catch (error) {
      this.isAuthenticated = false;
      this.connectionReady = false;
      this.handleError('authenticate', error, {
        userId: this.userId,
        host: this.host,
        port: this.port
      });
    }
  }

  /**
   * Verify connection status
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.isAuthenticated && this.connectionReady && this.ib !== null;
  }

  /**
   * Get account balance and equity
   * @param {string} currency - Currency code (default: USD)
   * @returns {Promise<Object>} Balance information
   */
  async getBalance(currency = 'USD') {
    await this.ensureAuthenticated();

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Account summary request timeout'));
        }, 10000);

        const accountValues = {};

        this.ib.reqAccountSummary(
          1,
          'All',
          ['TotalCashValue', 'NetLiquidation', 'BuyingPower', 'GrossPositionValue'].join(',')
        );

        this.ib.on('accountSummary', (reqId, account, tag, value, currency) => {
          accountValues[tag] = parseFloat(value);
        });

        this.ib.on('accountSummaryEnd', reqId => {
          clearTimeout(timeout);

          this.ib.cancelAccountSummary(reqId);

          resolve({
            total: accountValues.NetLiquidation || 0,
            available: accountValues.BuyingPower || 0,
            equity: accountValues.NetLiquidation || 0,
            cash: accountValues.TotalCashValue || 0,
            currency: currency,
            portfolioValue: accountValues.GrossPositionValue || 0,
            profitLoss: 0, // Calculated separately if needed
            profitLossPercent: 0
          });
        });
      });
    } catch (error) {
      this.handleError('get balance', error, { currency });
    }
  }

  /**
   * Create an order (place trade)
   * @param {Object} order - Order details
   * @returns {Promise<Object>} Order result
   */
  async createOrder(order) {
    await this.ensureAuthenticated();

    try {
      const { symbol, side, type, quantity, price, stopPrice, timeInForce } = order;

      // Create contract
      const contract = new Contract();
      contract.symbol = this.normalizeSymbol(symbol);
      contract.secType = 'STK'; // Stock
      contract.exchange = 'SMART'; // Smart routing
      contract.currency = 'USD';

      // Create order
      const ibOrder = new Order();
      ibOrder.orderId = this.nextValidOrderId++;
      ibOrder.action = side.toUpperCase(); // BUY or SELL
      ibOrder.totalQuantity = quantity;
      ibOrder.orderType = this.mapOrderType(type);
      ibOrder.tif = this.mapTimeInForce(timeInForce || 'DAY');

      // Set price parameters based on order type
      if (type === 'LIMIT' || type === 'STOP_LIMIT') {
        ibOrder.lmtPrice = price;
      }
      if (type === 'STOP' || type === 'STOP_LIMIT') {
        ibOrder.auxPrice = stopPrice;
      }

      logger.info('[IBKRAdapter] Placing order', {
        side,
        type,
        quantity,
        symbol,
        price: price || 'market',
        orderId: ibOrder.orderId
      });

      // Place order and wait for confirmation
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Order placement timeout'));
        }, 15000);

        const orderStatus = {
          orderId: ibOrder.orderId,
          status: 'PENDING',
          filledQuantity: 0,
          avgFillPrice: 0
        };

        this.ib.on('orderStatus', (id, status, filled, remaining, avgFillPrice) => {
          if (id === ibOrder.orderId) {
            orderStatus.status = this.mapOrderStatus(status);
            orderStatus.filledQuantity = filled;
            orderStatus.avgFillPrice = avgFillPrice;

            if (status === 'Filled' || status === 'Cancelled') {
              clearTimeout(timeout);
              resolve({
                orderId: ibOrder.orderId.toString(),
                status: orderStatus.status,
                symbol: symbol,
                side: side,
                type: type,
                quantity: quantity,
                filledQuantity: filled,
                avgFillPrice: avgFillPrice,
                timestamp: new Date().toISOString()
              });
            }
          }
        });

        this.ib.on('error', (err, data) => {
          if (data && data.id === ibOrder.orderId) {
            clearTimeout(timeout);
            reject(new Error(`Order failed: ${err.message}`));
          }
        });

        // Place the order
        this.ib.placeOrder(ibOrder.orderId, contract, ibOrder);
      });
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
   * Cancel an existing order
   * @param {string} orderId - Order ID to cancel
   * @returns {Promise<boolean>} Cancellation success
   */
  async cancelOrder(orderId) {
    await this.ensureAuthenticated();

    try {
      const id = parseInt(orderId);
      logger.info('[IBKRAdapter] Cancelling order', {
        orderId: id
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Order cancellation timeout'));
        }, 10000);

        this.ib.on('orderStatus', (ordId, status) => {
          if (ordId === id && status === 'Cancelled') {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        this.ib.cancelOrder(id);
      });
    } catch (error) {
      this.handleError('cancel order', error, { orderId });
    }
  }

  /**
   * Get current positions
   * @returns {Promise<Array>} List of positions
   */
  async getPositions() {
    await this.ensureAuthenticated();

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Positions request timeout'));
        }, 10000);

        const positions = [];

        this.ib.reqPositions();

        this.ib.on('position', (account, contract, pos, avgCost) => {
          if (contract.secType === 'STK') {
            positions.push({
              symbol: this.denormalizeSymbol(contract.symbol),
              quantity: pos,
              avgCost: avgCost,
              marketValue: 0, // Updated with real-time price if needed
              unrealizedPnL: 0, // Calculated separately
              realizedPnL: 0
            });
          }
        });

        this.ib.on('positionEnd', () => {
          clearTimeout(timeout);
          this.ib.cancelPositions();
          resolve(positions);
        });
      });
    } catch (error) {
      this.handleError('get positions', error);
    }
  }

  /**
   * Map standard order types to IBKR format
   * @param {string} type - Standard order type
   * @returns {string} IBKR order type
   */
  mapOrderType(type) {
    const typeMap = {
      MARKET: 'MKT',
      LIMIT: 'LMT',
      STOP: 'STP',
      STOP_LIMIT: 'STP LMT',
      TRAILING_STOP: 'TRAIL'
    };
    return typeMap[type] || 'MKT';
  }

  /**
   * Map time in force to IBKR format
   * @param {string} tif - Time in force
   * @returns {string} IBKR TIF
   */
  mapTimeInForce(tif) {
    const tifMap = {
      DAY: 'DAY',
      GTC: 'GTC',
      IOC: 'IOC',
      FOK: 'FOK'
    };
    return tifMap[tif] || 'DAY';
  }

  /**
   * Map IBKR order status to standard format using centralized mapper
   * @param {string} status - IBKR order status
   * @returns {string} Standard status
   */
  mapOrderStatus(status) {
    return OrderStatusMapper.mapStatus(status, 'ibkr');
  }

  /**
   * Set stop-loss order for a position
   * @param {Object} params - Stop-loss parameters
   * @returns {Promise<Object>} Created stop-loss order
   */
  async setStopLoss(params) {
    const { symbol, quantity, stopPrice, type, trailPercent } = params;

    if (type === 'TRAILING_STOP') {
      // For trailing stops, use trailPercent
      return await this.createOrder({
        symbol,
        side: quantity > 0 ? 'SELL' : 'BUY',
        type: 'TRAILING_STOP',
        quantity: Math.abs(quantity),
        trailPercent: trailPercent || 5, // Default 5%
        timeInForce: 'GTC'
      });
    } else {
      // Regular stop order
      return await this.createOrder({
        symbol,
        side: quantity > 0 ? 'SELL' : 'BUY',
        type: 'STOP',
        quantity: Math.abs(quantity),
        stopPrice: stopPrice,
        timeInForce: 'GTC'
      });
    }
  }

  /**
   * Set take-profit order for a position
   * @param {Object} params - Take-profit parameters
   * @returns {Promise<Object>} Created take-profit order
   */
  async setTakeProfit(params) {
    const { symbol, quantity, limitPrice } = params;

    return await this.createOrder({
      symbol,
      side: quantity > 0 ? 'SELL' : 'BUY',
      type: 'LIMIT',
      quantity: Math.abs(quantity),
      price: limitPrice,
      timeInForce: 'GTC'
    });
  }

  /**
   * Get order history
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Array of historical orders
   */
  async getOrderHistory(filters = {}) {
    await this.ensureAuthenticated();

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Order history request timeout'));
        }, 15000);

        const executions = [];

        // Request executions (filled orders)
        this.ib.reqExecutions(1, {
          symbol: filters.symbol || '',
          time: filters.startDate ? filters.startDate.toISOString() : '',
          clientId: this.clientId
        });

        this.ib.on('execDetails', (reqId, contract, execution) => {
          if (!filters.symbol || contract.symbol === filters.symbol) {
            executions.push({
              orderId: execution.orderId.toString(),
              symbol: this.denormalizeSymbol(contract.symbol),
              side: execution.side,
              quantity: execution.shares,
              price: execution.price,
              timestamp: execution.time,
              status: 'FILLED'
            });
          }
        });

        this.ib.on('execDetailsEnd', reqId => {
          clearTimeout(timeout);
          resolve(executions);
        });
      });
    } catch (error) {
      this.handleError('get order history', error, { filters });
    }
  }

  /**
   * Get current market price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Price information
   */
  async getMarketPrice(symbol) {
    await this.ensureAuthenticated();

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Market price request timeout'));
        }, 10000);

        const priceData = { bid: 0, ask: 0, last: 0 };
        const reqId = Math.floor(Math.random() * 10000);

        // Create contract
        const contract = new Contract();
        contract.symbol = this.normalizeSymbol(symbol);
        contract.secType = 'STK';
        contract.exchange = 'SMART';
        contract.currency = 'USD';

        this.ib.reqMktData(reqId, contract, '', false, false);

        this.ib.on('tickPrice', (tickerId, tickType, price) => {
          if (tickerId === reqId) {
            if (tickType === 1) priceData.bid = price; // Bid price
            if (tickType === 2) priceData.ask = price; // Ask price
            if (tickType === 4) priceData.last = price; // Last price

            // If we have at least last price, resolve
            if (priceData.last > 0 || (priceData.bid > 0 && priceData.ask > 0)) {
              clearTimeout(timeout);
              this.ib.cancelMktData(reqId);
              resolve(priceData);
            }
          }
        });
      });
    } catch (error) {
      this.handleError('get market price', error, { symbol });
    }
  }

  /**
   * Validate if a symbol is supported by this broker
   * @param {string} symbol - Trading symbol
   * @returns {Promise<boolean>} True if symbol is supported
   */
  async isSymbolSupported(symbol) {
    await this.ensureAuthenticated();

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(false); // Timeout means not supported
        }, 5000);

        const reqId = Math.floor(Math.random() * 10000);

        // Create contract
        const contract = new Contract();
        contract.symbol = this.normalizeSymbol(symbol);
        contract.secType = 'STK';
        contract.exchange = 'SMART';
        contract.currency = 'USD';

        this.ib.reqContractDetails(reqId, contract);

        this.ib.on('contractDetails', (requestId, contractDetails) => {
          if (requestId === reqId) {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        this.ib.on('contractDetailsEnd', requestId => {
          if (requestId === reqId) {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        this.ib.on('error', (err, data) => {
          if (data && data.id === reqId) {
            clearTimeout(timeout);
            resolve(false);
          }
        });
      });
    } catch (error) {
      logger.error('[IBKRAdapter] isSymbolSupported error', {
        error: error.message,
        stack: error.stack,
        symbol
      });
      return false;
    }
  }

  /**
   * Get broker-specific fees structure
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Fee structure
   */
  async getFees(symbol) {
    // IBKR fees vary by account type and volume
    // These are typical IBKR Pro fees for US stocks
    // In production, you'd query this from IBKR API or maintain a fee schedule
    return {
      maker: 0.0005, // 0.05% or $0.005 per share (min $1, max 0.5% of trade value)
      taker: 0.0005, // Same as maker for stocks
      withdrawal: 0, // No withdrawal fees for cash
      commission: 0.0005, // Per share commission
      minimum: 1.0, // Minimum commission per order
      maximum: 0.005, // Maximum 0.5% of trade value
      currency: 'USD',
      notes: 'IBKR Pro tiered pricing. Actual fees may vary based on account type, volume, and market.'
    };
  }

  /**
   * Disconnect from TWS/IB Gateway
   */
  async disconnect() {
    if (this.ib) {
      logger.info('[IBKRAdapter] Disconnecting from TWS/IB Gateway');
      this.ib.disconnect();
      this.ib = null;
      this.connectionReady = false;
      this.isAuthenticated = false;
    }
  }

  /**
   * Get broker-specific information
   * @returns {Object} Broker metadata
   */
  getBrokerInfo() {
    return {
      name: 'Interactive Brokers',
      type: 'stock',
      features: ['stocks', 'options', 'futures', 'forex', 'bonds'],
      requiresTWSRunning: true,
      supportsWebSocket: true,
      rateLimit: {
        orders: 50, // per second
        requests: 50 // per second
      }
    };
  }
}

module.exports = IBKRAdapter;
