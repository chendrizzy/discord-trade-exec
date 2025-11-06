// Internal utilities and services
const BrokerAdapter = require('../BrokerAdapter');
const logger = require('../../utils/logger');
const OrderTypeMapper = require('../../utils/orderTypeMapper');

// Moomoo API loaded dynamically (ES Module)
let MoomooAPI = null;

/**
 * Moomoo (Futu) API Adapter
 * Implements trading through Moomoo OpenD Gateway
 * Requires OpenD Gateway to be running locally with API access enabled
 *
 * Configuration:
 * - accountId: Moomoo account ID
 * - password: Trading password for unlocking trades
 * - websocketKey: WebSocket authentication key from OpenD Gateway
 * - host: OpenD Gateway host (default: 127.0.0.1)
 * - port: WebSocket port (default: 33333)
 * - isTestnet: Use paper trading account (default: true)
 *
 * @extends BrokerAdapter
 */
class MoomooAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'moomoo';
    this.brokerType = 'stock';

    // Moomoo connection configuration
    this.accountId = credentials.accountId || process.env.MOOMOO_ID;
    this.password = credentials.password || process.env.MOOMOO_PASSWORD;
    this.websocketKey = credentials.websocketKey || process.env.MOOMOO_WEBSOCKET_KEY;
    this.host = credentials.host || process.env.MOOMOO_HOST || '127.0.0.1';
    this.port = credentials.port || parseInt(process.env.MOOMOO_PORT) || 33333;

    // Moomoo API client
    this.moomoo = null;
    this.connectionReady = false;
    this.accountInfo = null;
    this.tradeEnv = this.isTestnet ? 1 : 0; // 1 = paper trading, 0 = real

    logger.info('[MoomooAdapter] Initialized with config', {
      accountId: this.accountId,
      host: this.host,
      port: this.port,
      websocketKey: this.websocketKey ? `${this.websocketKey.substring(0, 4)}****` : 'NOT SET',
      isTestnet: this.isTestnet,
      tradeEnv: this.tradeEnv
    });
  }

  /**
   * Connect to OpenD Gateway and authenticate
   * @returns {Promise<boolean>} Connection status
   */
  async authenticate() {
    if (this.isAuthenticated && this.connectionReady) {
      return true;
    }

    try {
      // Dynamically load moomoo-api with CommonJS require to avoid ES/CJS module isolation
      if (!MoomooAPI) {
        logger.info('[MoomooAdapter] Loading moomoo-api package...');

        try {
          // Attempt CommonJS require to avoid ES/CJS module mixing
          // This prevents protobuf instance isolation between the global scope and moomoo-api's internal proto.js
          const moomooPackage = require('moomoo-api');
          MoomooAPI = moomooPackage.default || moomooPackage;
          logger.info('[MoomooAdapter] Loaded moomoo-api via require() - avoiding module isolation');
        } catch (requireError) {
          logger.info('[MoomooAdapter] require() failed, trying dynamic import...', {
            error: requireError.message
          });

          // Fallback to dynamic import with protobuf initialization
          const protobuf = require('protobufjs/light');

          // Ensure global protobuf is initialized
          if (!global.$protobuf) {
            global.$protobuf = protobuf;
          }
          if (!global.$protobuf.roots) {
            global.$protobuf.roots = {};
          }
          if (!global.$protobuf.roots.default) {
            global.$protobuf.roots.default = new protobuf.Root();
          }

          const moomooModule = await import('moomoo-api');
          MoomooAPI = moomooModule.default;
          logger.info('[MoomooAdapter] Loaded moomoo-api via import() - protobuf initialized');
        }
      }

      logger.info('[MoomooAdapter] Connecting to OpenD Gateway', {
        host: this.host,
        port: this.port
      });

      // Create Moomoo client instance
      this.moomoo = new MoomooAPI();

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);

        this.moomoo.onlogin = (ret, msg) => {
          clearTimeout(timeout);
          if (ret === 0) {
            logger.info('[MoomooAdapter] Connected to OpenD Gateway');
            resolve();
          } else {
            reject(new Error(`Connection failed: ${msg}`));
          }
        };

        // Start connection (host, port, ssl, websocket_key)
        // Note: 4th parameter is WebSocket auth key from OpenD Gateway, NOT the trading password
        this.moomoo.start(this.host, this.port, false, this.websocketKey);
      });

      // Unlock trading
      await this.moomoo.UnlockTrade({
        c2s: {
          unlock: true,
          pwdMD5: this.password, // Already MD5 hashed in start()
          securityFirm: 0 // 0 = Moomoo
        }
      });

      // Get account list to verify
      const accountList = await this.moomoo.GetAccList({
        c2s: {
          userID: 0
        }
      });

      if (accountList.s2c && accountList.s2c.accList && accountList.s2c.accList.length > 0) {
        // Find account matching our account ID or use first available
        this.accountInfo =
          accountList.s2c.accList.find(acc => acc.accID.toString() === this.accountId.toString()) ||
          accountList.s2c.accList[0];

        logger.info('[MoomooAdapter] Using account', {
          accountId: this.accountInfo.accID
        });
        this.connectionReady = true;
        this.isAuthenticated = true;
        return true;
      } else {
        throw new Error('No trading accounts found');
      }
    } catch (error) {
      this.isAuthenticated = false;
      this.connectionReady = false;
      this.handleError('authenticate', error);
    }
  }

  /**
   * Verify connection status
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.isAuthenticated && this.connectionReady && this.moomoo !== null;
  }

  /**
   * Get account balance and equity
   * @param {string} currency - Currency code (default: USD)
   * @returns {Promise<Object>} Balance information
   */
  async getBalance(currency = 'USD') {
    await this.ensureAuthenticated();

    try {
      const fundsResponse = await this.moomoo.GetFunds({
        c2s: {
          header: {
            trdEnv: this.tradeEnv,
            accID: this.accountInfo.accID,
            trdMarket: 1 // 1 = US market
          }
        }
      });

      if (fundsResponse.s2c && fundsResponse.s2c.funds) {
        const funds = fundsResponse.s2c.funds;

        return {
          total: funds.totalAssets || 0,
          available: funds.avlWithdrawalCash || 0,
          equity: funds.netAssets || 0,
          cash: funds.cash || 0,
          currency: currency,
          portfolioValue: funds.marketVal || 0,
          profitLoss: funds.unrealizedPL || 0,
          profitLossPercent: (funds.unrealizedPL / funds.totalAssets) * 100 || 0
        };
      } else {
        throw new Error('Invalid funds response');
      }
    } catch (error) {
      this.handleError('get balance', error);
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

      // Build security object
      const security = {
        market: this.getMarketCode(symbol),
        code: this.normalizeSymbol(symbol)
      };

      // Map order type and TIF
      const orderType = this.mapOrderType(type);
      const tif = this.mapTimeInForce(timeInForce || 'DAY');

      // Build order request
      const orderReq = {
        c2s: {
          packetID: {
            connID: this.moomoo.getConnID(),
            serialNo: Date.now()
          },
          header: {
            trdEnv: this.tradeEnv,
            accID: this.accountInfo.accID,
            trdMarket: security.market
          },
          trdSide: side === 'BUY' ? 1 : 2, // 1 = Buy, 2 = Sell
          orderType: orderType,
          code: security.code,
          qty: quantity,
          price: price || 0,
          adjustPrice: orderType === 1, // Auto-adjust for market orders
          adjustSideAndLimit: 0,
          secMarket: security.market,
          remark: '',
          timeInForce: tif,
          fillOutsideRTH: false,
          auxPrice: stopPrice || 0
        }
      };

      logger.info('[MoomooAdapter] Placing order', {
        side,
        type,
        quantity,
        symbol,
        price: price || 'market'
      });

      const response = await this.moomoo.PlaceOrder(orderReq);

      if (response.s2c && response.s2c.orderID) {
        return {
          orderId: response.s2c.orderID.toString(),
          status: 'PENDING',
          symbol: symbol,
          side: side,
          type: type,
          quantity: quantity,
          filledQuantity: 0,
          avgFillPrice: 0,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('Invalid order response');
      }
    } catch (error) {
      this.handleError('create order', error, {
        symbol: order?.symbol,
        side: order?.side,
        type: order?.type
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
      logger.info('[MoomooAdapter] Cancelling order', {
        orderId
      });

      const response = await this.moomoo.ModifyOrder({
        c2s: {
          packetID: {
            connID: this.moomoo.getConnID(),
            serialNo: Date.now()
          },
          header: {
            trdEnv: this.tradeEnv,
            accID: this.accountInfo.accID,
            trdMarket: 1 // US market
          },
          orderID: parseInt(orderId),
          modifyOrderOp: 3, // 3 = Cancel
          forAll: false
        }
      });

      if (response.s2c && response.s2c.orderID) {
        return true;
      } else {
        throw new Error('Invalid cancel response');
      }
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
      const response = await this.moomoo.GetPositionList({
        c2s: {
          header: {
            trdEnv: this.tradeEnv,
            accID: this.accountInfo.accID,
            trdMarket: 1 // US market
          },
          filterConditions: [],
          filterPLRatioMin: -1000,
          filterPLRatioMax: 1000,
          refreshCache: false
        }
      });

      if (response.s2c && response.s2c.positionList) {
        return response.s2c.positionList.map(pos => ({
          symbol: this.denormalizeSymbol(pos.code),
          quantity: pos.qty || 0,
          avgCost: pos.costPrice || 0,
          marketValue: pos.marketVal || 0,
          unrealizedPnL: pos.pl || 0,
          realizedPnL: pos.plRatio || 0
        }));
      } else {
        return [];
      }
    } catch (error) {
      this.handleError('get positions', error);
    }
  }

  /**
   * Set stop-loss order for a position
   * @param {Object} params - Stop-loss parameters
   * @returns {Promise<Object>} Created stop-loss order
   */
  async setStopLoss(params) {
    const { symbol, quantity, stopPrice, type, trailPercent } = params;

    if (type === 'TRAILING_STOP') {
      // Moomoo supports trailing stop through trail amount/percent
      return await this.createOrder({
        symbol,
        side: quantity > 0 ? 'SELL' : 'BUY',
        type: 'TRAILING_STOP',
        quantity: Math.abs(quantity),
        stopPrice: stopPrice,
        trailPercent: trailPercent || 5,
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
      const response = await this.moomoo.GetHistoryOrderFillList({
        c2s: {
          header: {
            trdEnv: this.tradeEnv,
            accID: this.accountInfo.accID,
            trdMarket: 1 // US market
          },
          filterConditions: [],
          filterStatusList: []
        }
      });

      if (response.s2c && response.s2c.orderFillList) {
        let orders = response.s2c.orderFillList.map(fill => ({
          orderId: fill.orderID ? fill.orderID.toString() : '',
          symbol: this.denormalizeSymbol(fill.code),
          side: fill.trdSide === 1 ? 'BUY' : 'SELL',
          quantity: fill.qty || 0,
          price: fill.price || 0,
          timestamp: fill.createTime || new Date().toISOString(),
          status: 'FILLED'
        }));

        // Apply filters
        if (filters.symbol) {
          orders = orders.filter(o => o.symbol === filters.symbol);
        }
        if (filters.startDate) {
          orders = orders.filter(o => new Date(o.timestamp) >= filters.startDate);
        }
        if (filters.endDate) {
          orders = orders.filter(o => new Date(o.timestamp) <= filters.endDate);
        }

        return orders;
      } else {
        return [];
      }
    } catch (error) {
      this.handleError('get order history', error);
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
      const security = {
        market: this.getMarketCode(symbol),
        code: this.normalizeSymbol(symbol)
      };

      const response = await this.moomoo.GetBasicQot({
        c2s: {
          securityList: [security]
        }
      });

      if (response.s2c && response.s2c.basicQotList && response.s2c.basicQotList.length > 0) {
        const quote = response.s2c.basicQotList[0];

        return {
          bid: quote.bidPrice || 0,
          ask: quote.askPrice || 0,
          last: quote.curPrice || 0
        };
      } else {
        throw new Error('Invalid quote response');
      }
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
      const security = {
        market: this.getMarketCode(symbol),
        code: this.normalizeSymbol(symbol)
      };

      const response = await this.moomoo.GetStaticInfo({
        c2s: {
          securityList: [security]
        }
      });

      if (response.s2c && response.s2c.staticInfoList && response.s2c.staticInfoList.length > 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      logger.error('[MoomooAdapter] Error checking symbol support', {
        symbol,
        error: error.message,
        stack: error.stack
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
    // Moomoo fees vary by account type and market
    // These are typical Moomoo fees for US stocks
    return {
      maker: 0.0, // No maker/taker distinction for stocks
      taker: 0.0,
      withdrawal: 0,
      commission: 0.0, // Free stock trading
      minimum: 0.0,
      maximum: 0.0,
      currency: 'USD',
      notes:
        'Moomoo offers commission-free stock trading. Regulatory fees may apply. Options and futures have separate fee structures.'
    };
  }

  /**
   * Map standard order types to Moomoo format using centralized mapper
   * @param {string} type - Standard order type
   * @returns {number} Moomoo order type
   */
  mapOrderType(type) {
    return OrderTypeMapper.mapType(type, 'moomoo');
  }

  /**
   * Map time in force to Moomoo format
   * @param {string} tif - Time in force
   * @returns {number} Moomoo TIF
   */
  mapTimeInForce(tif) {
    const tifMap = {
      DAY: 0, // Day order
      GTC: 1, // Good till cancelled
      GTD: 2 // Good till date
    };
    return tifMap[tif] || 0;
  }

  /**
   * Get market code for symbol
   * @param {string} symbol - Trading symbol
   * @returns {number} Market code
   */
  getMarketCode(symbol) {
    // For now, default to US market (1)
    // In production, would detect market from symbol format
    return 1; // 1 = US, 2 = HK, 3 = CN, 4 = SG, 5 = JP
  }

  /**
   * Disconnect from OpenD Gateway
   */
  async disconnect() {
    if (this.moomoo) {
      logger.info('[MoomooAdapter] Disconnecting from OpenD Gateway');
      this.moomoo.stop();
      this.moomoo = null;
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
      name: 'Moomoo',
      type: 'stock',
      features: ['stocks', 'options', 'futures', 'forex', 'crypto'],
      requiresOpenDRunning: true,
      supportsWebSocket: true,
      rateLimit: {
        orders: 10, // per second (conservative)
        requests: 100 // per second
      }
    };
  }
}

module.exports = MoomooAdapter;
