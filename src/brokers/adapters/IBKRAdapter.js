const BrokerAdapter = require('../BrokerAdapter');
const { IB, Contract, Order } = require('@stoqey/ib');

/**
 * Interactive Brokers (IBKR) API Adapter
 * Implements trading through TWS (Trader Workstation) or IB Gateway
 * Requires TWS/IB Gateway to be running locally with API access enabled
 *
 * Configuration:
 * - clientId: Unique client identifier (default: 1)
 * - host: TWS/IB Gateway host (default: 127.0.0.1)
 * - port: API port (4001 for paper, 7496 for live)
 * - isTestnet: Use paper trading account (default: true)
 *
 * @extends BrokerAdapter
 */
class IBKRAdapter extends BrokerAdapter {
  constructor(credentials = {}, options = {}) {
    super(credentials, options);

    this.brokerName = 'ibkr';
    this.brokerType = 'stock';

    // IBKR connection configuration
    this.clientId = credentials.clientId || parseInt(process.env.IBKR_CLIENT_ID) || 1;
    this.host = credentials.host || process.env.IBKR_HOST || '127.0.0.1';
    this.port = credentials.port ||
      (this.isTestnet ? 4001 : parseInt(process.env.IBKR_PORT) || 7496);

    // IB API client
    this.ib = null;
    this.nextValidOrderId = null;
    this.connectionReady = false;

    // Event handlers storage
    this.orderStatusHandlers = new Map();
    this.accountSummaryHandlers = [];
    this.positionHandlers = [];

    console.log(`[IBKRAdapter] Initialized with config:`, {
      clientId: this.clientId,
      host: this.host,
      port: this.port,
      isTestnet: this.isTestnet
    });
  }

  /**
   * Connect to TWS/IB Gateway and authenticate
   * @returns {Promise<boolean>} Connection status
   */
  async authenticate() {
    if (this.isAuthenticated && this.connectionReady) {
      return true;
    }

    try {
      console.log(`[IBKRAdapter] Connecting to TWS/IB Gateway at ${this.host}:${this.port}...`);

      // Create IB client instance
      this.ib = new IB({
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
          console.log('[IBKRAdapter] Connected to TWS/IB Gateway');
        });

        this.ib.on('nextValidId', (orderId) => {
          clearTimeout(timeout);
          this.nextValidOrderId = orderId;
          this.connectionReady = true;
          console.log(`[IBKRAdapter] Connection ready, next valid order ID: ${orderId}`);
          resolve();
        });

        this.ib.on('error', (err, data) => {
          if (err.code === -1 || err.code === 502) {
            // Connection errors
            clearTimeout(timeout);
            reject(new Error(`TWS connection failed: ${err.message}`));
          } else {
            console.error('[IBKRAdapter] IB API error:', err, data);
          }
        });

        this.ib.on('disconnected', () => {
          console.log('[IBKRAdapter] Disconnected from TWS/IB Gateway');
          this.connectionReady = false;
          this.isAuthenticated = false;
        });

        // Initiate connection
        this.ib.connect();
      });

      this.isAuthenticated = true;
      return true;

    } catch (error) {
      console.error('[IBKRAdapter] Authentication failed:', error.message);
      this.isAuthenticated = false;
      this.connectionReady = false;
      throw new Error(`IBKR authentication failed: ${error.message}. Ensure TWS/IB Gateway is running with API access enabled.`);
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
    if (!this.isConnected()) {
      await this.authenticate();
    }

    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Account summary request timeout'));
        }, 10000);

        const accountValues = {};

        this.ib.reqAccountSummary(1, 'All', [
          'TotalCashValue',
          'NetLiquidation',
          'BuyingPower',
          'GrossPositionValue'
        ].join(','));

        this.ib.on('accountSummary', (reqId, account, tag, value, currency) => {
          accountValues[tag] = parseFloat(value);
        });

        this.ib.on('accountSummaryEnd', (reqId) => {
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
      console.error('[IBKRAdapter] getBalance error:', error.message);
      throw new Error(`Failed to get IBKR balance: ${error.message}`);
    }
  }

  /**
   * Create an order (place trade)
   * @param {Object} order - Order details
   * @returns {Promise<Object>} Order result
   */
  async createOrder(order) {
    if (!this.isConnected()) {
      await this.authenticate();
    }

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

      console.log(`[IBKRAdapter] Placing ${side} ${type} order for ${quantity} ${symbol} @ ${price || 'market'}`);

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
      console.error('[IBKRAdapter] createOrder error:', error.message);
      throw new Error(`Failed to create IBKR order: ${error.message}`);
    }
  }

  /**
   * Cancel an existing order
   * @param {string} orderId - Order ID to cancel
   * @returns {Promise<boolean>} Cancellation success
   */
  async cancelOrder(orderId) {
    if (!this.isConnected()) {
      await this.authenticate();
    }

    try {
      const id = parseInt(orderId);
      console.log(`[IBKRAdapter] Cancelling order ${id}`);

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
      console.error('[IBKRAdapter] cancelOrder error:', error.message);
      throw new Error(`Failed to cancel IBKR order: ${error.message}`);
    }
  }

  /**
   * Get current positions
   * @returns {Promise<Array>} List of positions
   */
  async getPositions() {
    if (!this.isConnected()) {
      await this.authenticate();
    }

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
      console.error('[IBKRAdapter] getPositions error:', error.message);
      throw new Error(`Failed to get IBKR positions: ${error.message}`);
    }
  }

  /**
   * Map standard order types to IBKR format
   * @param {string} type - Standard order type
   * @returns {string} IBKR order type
   */
  mapOrderType(type) {
    const typeMap = {
      'MARKET': 'MKT',
      'LIMIT': 'LMT',
      'STOP': 'STP',
      'STOP_LIMIT': 'STP LMT',
      'TRAILING_STOP': 'TRAIL'
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
      'DAY': 'DAY',
      'GTC': 'GTC',
      'IOC': 'IOC',
      'FOK': 'FOK'
    };
    return tifMap[tif] || 'DAY';
  }

  /**
   * Map IBKR order status to standard format
   * @param {string} status - IBKR order status
   * @returns {string} Standard status
   */
  mapOrderStatus(status) {
    const statusMap = {
      'PendingSubmit': 'PENDING',
      'PendingCancel': 'PENDING',
      'PreSubmitted': 'PENDING',
      'Submitted': 'PENDING',
      'Filled': 'FILLED',
      'Cancelled': 'CANCELLED',
      'Inactive': 'CANCELLED'
    };
    return statusMap[status] || 'UNKNOWN';
  }

  /**
   * Disconnect from TWS/IB Gateway
   */
  async disconnect() {
    if (this.ib) {
      console.log('[IBKRAdapter] Disconnecting from TWS/IB Gateway');
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
