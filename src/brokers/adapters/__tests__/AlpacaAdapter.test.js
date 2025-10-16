// Internal utilities and services
const AlpacaAdapter = require('../AlpacaAdapter');

/**
 * AlpacaAdapter Integration Tests
 *
 * SETUP REQUIRED:
 * 1. Create .env file with Alpaca paper trading credentials:
 *    ALPACA_PAPER_KEY=your_paper_api_key
 *    ALPACA_PAPER_SECRET=your_paper_api_secret
 *
 * 2. Or set environment variables:
 *    export ALPACA_PAPER_KEY=your_paper_api_key
 *    export ALPACA_PAPER_SECRET=your_paper_api_secret
 *
 * Get paper trading credentials at: https://app.alpaca.markets/paper/dashboard/overview
 */

describe('AlpacaAdapter', () => {
  let adapter;
  const testSymbol = 'AAPL';
  let testOrderId;

  beforeAll(() => {
    // Ensure credentials are available
    if (!process.env.ALPACA_PAPER_KEY || !process.env.ALPACA_PAPER_SECRET) {
      console.warn('⚠️  Alpaca paper trading credentials not found.');
      console.warn('Set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to run tests.');
    }

    // Initialize adapter with paper trading credentials
    adapter = new AlpacaAdapter(
      {
        apiKey: process.env.ALPACA_PAPER_KEY,
        apiSecret: process.env.ALPACA_PAPER_SECRET
      },
      {
        isTestnet: true // Use paper trading API
      }
    );
  });

  afterAll(async () => {
    // Clean up any open test orders
    if (testOrderId) {
      try {
        await adapter.cancelOrder(testOrderId);
      } catch (error) {
        // Order might already be filled/cancelled
      }
    }
  });

  describe('Initialization', () => {
    it('should create adapter with correct broker info', () => {
      expect(adapter.brokerName).toBe('alpaca');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.isTestnet).toBe(true);
      expect(adapter.isAuthenticated).toBe(false);
    });

    it('should have correct base URL for paper trading', () => {
      expect(adapter.baseURL).toBe('https://paper-api.alpaca.markets');
    });

    it('should return broker info', () => {
      const info = adapter.getBrokerInfo();
      expect(info).toEqual({
        name: 'alpaca',
        type: 'stock',
        isTestnet: true,
        isAuthenticated: false,
        supportsStocks: true,
        supportsCrypto: false,
        supportsOptions: false,
        supportsFutures: false
      });
    });
  });

  describe('Authentication', () => {
    it('should authenticate with API key credentials', async () => {
      if (!process.env.ALPACA_PAPER_KEY) {
        return; // Skip if no credentials
      }

      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.alpacaClient).toBeDefined();
    });

    it('should fail authentication with invalid credentials', async () => {
      const badAdapter = new AlpacaAdapter(
        {
          apiKey: 'invalid_key',
          apiSecret: 'invalid_secret'
        },
        {
          isTestnet: true
        }
      );

      await expect(badAdapter.authenticate()).rejects.toThrow();
      expect(badAdapter.isAuthenticated).toBe(false);
    });

    it('should throw error with no credentials', async () => {
      const noCredsAdapter = new AlpacaAdapter({}, { isTestnet: true });
      await expect(noCredsAdapter.authenticate()).rejects.toThrow('No valid credentials provided');
    });
  });

  describe('Balance Operations', () => {
    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY) {
        await adapter.authenticate();
      }
    });

    it('should get account balance', async () => {
      if (!adapter.isAuthenticated) return;

      const balance = await adapter.getBalance();

      expect(balance).toHaveProperty('total');
      expect(balance).toHaveProperty('available');
      expect(balance).toHaveProperty('equity');
      expect(balance).toHaveProperty('cash');
      expect(balance).toHaveProperty('currency');
      expect(balance).toHaveProperty('portfolioValue');
      expect(balance).toHaveProperty('profitLoss');
      expect(balance).toHaveProperty('profitLossPercent');

      expect(balance.currency).toBe('USD');
      expect(typeof balance.total).toBe('number');
      expect(typeof balance.available).toBe('number');
    });

    it('should auto-authenticate if not authenticated', async () => {
      if (!process.env.ALPACA_PAPER_KEY) return;

      const newAdapter = new AlpacaAdapter(
        {
          apiKey: process.env.ALPACA_PAPER_KEY,
          apiSecret: process.env.ALPACA_PAPER_SECRET
        },
        {
          isTestnet: true
        }
      );

      expect(newAdapter.isAuthenticated).toBe(false);

      const balance = await newAdapter.getBalance();
      expect(newAdapter.isAuthenticated).toBe(true);
      expect(balance).toHaveProperty('total');
    });
  });

  describe('Market Data', () => {
    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY && !adapter.isAuthenticated) {
        await adapter.authenticate();
      }
    });

    it('should get market price for symbol', async () => {
      if (!adapter.isAuthenticated) return;

      const price = await adapter.getMarketPrice(testSymbol);

      expect(price).toHaveProperty('symbol');
      expect(price).toHaveProperty('bid');
      expect(price).toHaveProperty('ask');
      expect(price).toHaveProperty('last');
      expect(price).toHaveProperty('bidSize');
      expect(price).toHaveProperty('askSize');
      expect(price).toHaveProperty('timestamp');

      expect(price.symbol).toBe(testSymbol);
      expect(typeof price.bid).toBe('number');
      expect(typeof price.ask).toBe('number');
      expect(price.ask).toBeGreaterThan(0);
    });

    it('should check if symbol is supported', async () => {
      if (!adapter.isAuthenticated) return;

      const isSupported = await adapter.isSymbolSupported(testSymbol);
      expect(typeof isSupported).toBe('boolean');
      expect(isSupported).toBe(true);
    });

    it('should return false for unsupported symbol', async () => {
      if (!adapter.isAuthenticated) return;

      const isSupported = await adapter.isSymbolSupported('INVALID_SYMBOL_XYZ');
      expect(isSupported).toBe(false);
    });
  });

  describe('Order Creation', () => {
    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY && !adapter.isAuthenticated) {
        await adapter.authenticate();
      }
    });

    it('should create market buy order', async () => {
      if (!adapter.isAuthenticated) return;

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        timeInForce: 'DAY'
      });

      testOrderId = order.orderId; // Save for cleanup

      expect(order).toHaveProperty('orderId');
      expect(order).toHaveProperty('symbol');
      expect(order).toHaveProperty('side');
      expect(order).toHaveProperty('type');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('quantity');

      expect(order.symbol).toBe(testSymbol);
      expect(order.side).toBe('BUY');
      expect(order.type).toBe('MARKET');
      expect(order.quantity).toBe(1);
      expect(['PENDING', 'FILLED', 'PARTIAL', 'ACCEPTED']).toContain(order.status);
    });

    it('should create limit sell order', async () => {
      if (!adapter.isAuthenticated) return;

      // Get current price first
      const price = await adapter.getMarketPrice(testSymbol);
      const limitPrice = Math.ceil(price.ask * 1.1); // 10% above current price

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: 1,
        price: limitPrice,
        timeInForce: 'GTC'
      });

      expect(order.side).toBe('SELL');
      expect(order.type).toBe('LIMIT');
      expect(order.limitPrice).toBe(limitPrice);
      expect(order.timeInForce).toBe('GTC');

      // Cancel the order
      await adapter.cancelOrder(order.orderId);
    });

    it('should create stop order', async () => {
      if (!adapter.isAuthenticated) return;

      const price = await adapter.getMarketPrice(testSymbol);
      const stopPrice = Math.floor(price.bid * 0.95); // 5% below current price

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'STOP',
        quantity: 1,
        stopPrice: stopPrice,
        timeInForce: 'GTC'
      });

      expect(order.type).toBe('STOP');
      expect(order.stopPrice).toBe(stopPrice);

      await adapter.cancelOrder(order.orderId);
    });

    it('should create stop-limit order', async () => {
      if (!adapter.isAuthenticated) return;

      const price = await adapter.getMarketPrice(testSymbol);
      const stopPrice = Math.floor(price.bid * 0.95);
      const limitPrice = Math.floor(price.bid * 0.94);

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'STOP_LIMIT',
        quantity: 1,
        stopPrice: stopPrice,
        price: limitPrice,
        timeInForce: 'GTC'
      });

      expect(order.type).toBe('STOP_LIMIT');
      expect(order.stopPrice).toBe(stopPrice);
      expect(order.limitPrice).toBe(limitPrice);

      await adapter.cancelOrder(order.orderId);
    });
  });

  describe('Order Management', () => {
    let orderId;

    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY && !adapter.isAuthenticated) {
        await adapter.authenticate();
      }
    });

    it('should cancel order', async () => {
      if (!adapter.isAuthenticated) return;

      // Create a limit order that won't fill immediately
      const price = await adapter.getMarketPrice(testSymbol);
      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: Math.floor(price.bid * 0.5), // Way below market
        timeInForce: 'GTC'
      });

      orderId = order.orderId;

      const result = await adapter.cancelOrder(orderId);
      expect(result).toBe(true);
    });

    it('should handle canceling already cancelled order', async () => {
      if (!adapter.isAuthenticated || !orderId) return;

      const result = await adapter.cancelOrder(orderId);
      expect(result).toBe(true); // Should return true even if already cancelled
    });

    it('should get order history', async () => {
      if (!adapter.isAuthenticated) return;

      const orders = await adapter.getOrderHistory({ limit: 10 });

      expect(Array.isArray(orders)).toBe(true);

      if (orders.length > 0) {
        const order = orders[0];
        expect(order).toHaveProperty('orderId');
        expect(order).toHaveProperty('symbol');
        expect(order).toHaveProperty('side');
        expect(order).toHaveProperty('type');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('quantity');
        expect(order).toHaveProperty('createdAt');
      }
    });

    it('should filter order history by symbol', async () => {
      if (!adapter.isAuthenticated) return;

      const orders = await adapter.getOrderHistory({
        symbol: testSymbol,
        limit: 5
      });

      expect(Array.isArray(orders)).toBe(true);
      orders.forEach(order => {
        expect(order.symbol).toBe(testSymbol);
      });
    });
  });

  describe('Position Management', () => {
    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY && !adapter.isAuthenticated) {
        await adapter.authenticate();
      }
    });

    it('should get positions', async () => {
      if (!adapter.isAuthenticated) return;

      const positions = await adapter.getPositions();

      expect(Array.isArray(positions)).toBe(true);

      if (positions.length > 0) {
        const position = positions[0];
        expect(position).toHaveProperty('symbol');
        expect(position).toHaveProperty('quantity');
        expect(position).toHaveProperty('side');
        expect(position).toHaveProperty('entryPrice');
        expect(position).toHaveProperty('currentPrice');
        expect(position).toHaveProperty('marketValue');
        expect(position).toHaveProperty('unrealizedPnL');
        expect(position).toHaveProperty('unrealizedPnLPercent');
      }
    });
  });

  describe('Risk Management', () => {
    beforeAll(async () => {
      if (process.env.ALPACA_PAPER_KEY && !adapter.isAuthenticated) {
        await adapter.authenticate();
      }
    });

    it('should set stop-loss order', async () => {
      if (!adapter.isAuthenticated) return;

      const price = await adapter.getMarketPrice(testSymbol);

      const stopLoss = await adapter.setStopLoss({
        symbol: testSymbol,
        quantity: 1,
        stopPrice: Math.floor(price.bid * 0.95),
        side: 'sell'
      });

      expect(stopLoss).toHaveProperty('orderId');
      expect(stopLoss).toHaveProperty('type');
      expect(stopLoss).toHaveProperty('status');
      expect(stopLoss).toHaveProperty('stopPrice');
      expect(stopLoss.type).toBe('STOP_LOSS');

      await adapter.cancelOrder(stopLoss.orderId);
    });

    it('should set trailing stop-loss', async () => {
      if (!adapter.isAuthenticated) return;

      const stopLoss = await adapter.setStopLoss({
        symbol: testSymbol,
        quantity: 1,
        type: 'TRAILING_STOP',
        trailPercent: 2.0,
        side: 'sell'
      });

      expect(stopLoss.type).toBe('STOP_LOSS');
      expect(stopLoss.trailPercent).toBe(2.0);

      await adapter.cancelOrder(stopLoss.orderId);
    });

    it('should set take-profit order', async () => {
      if (!adapter.isAuthenticated) return;

      const price = await adapter.getMarketPrice(testSymbol);

      const takeProfit = await adapter.setTakeProfit({
        symbol: testSymbol,
        quantity: 1,
        limitPrice: Math.ceil(price.ask * 1.1),
        side: 'sell'
      });

      expect(takeProfit).toHaveProperty('orderId');
      expect(takeProfit).toHaveProperty('type');
      expect(takeProfit).toHaveProperty('status');
      expect(takeProfit).toHaveProperty('limitPrice');
      expect(takeProfit.type).toBe('TAKE_PROFIT');

      await adapter.cancelOrder(takeProfit.orderId);
    });
  });

  describe('Fee Structure', () => {
    it('should return zero-commission fee structure', async () => {
      const fees = await adapter.getFees(testSymbol);

      expect(fees).toEqual({
        maker: 0,
        taker: 0,
        withdrawal: 0,
        notes: 'Alpaca offers commission-free trading for stocks and ETFs'
      });
    });
  });

  describe('Symbol Normalization', () => {
    it('should normalize symbols correctly', () => {
      expect(adapter.normalizeSymbol('AAPL')).toBe('AAPL');
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('BTC/USD')).toBe('BTCUSD');
    });
  });

  describe('OAuth Static Methods', () => {
    it('should generate OAuth authorization URL', () => {
      const clientId = 'test_client_id';
      const redirectUri = 'https://example.com/callback';
      const state = 'random_state_123';
      const scope = 'account:write trading';

      const url = AlpacaAdapter.getOAuthURL(clientId, redirectUri, state, scope);

      expect(url).toContain('https://app.alpaca.markets/oauth/authorize');
      expect(url).toContain(`client_id=${clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(url).toContain(`state=${state}`);
      // URLSearchParams encodes spaces as + so check both formats
      expect(url).toMatch(/scope=(account%3Awrite\+trading|account%3Awrite%20trading)/);
      expect(url).toContain('response_type=code');
    });

    it('should use default scope if not provided', () => {
      const url = AlpacaAdapter.getOAuthURL('client', 'https://example.com', 'state');
      // Check that scope contains the expected values (encoded with + or %20)
      expect(url).toMatch(/scope=(account%3Awrite\+trading|account%3Awrite%20trading)/);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid symbol in market price', async () => {
      if (!adapter.isAuthenticated) return;

      await expect(adapter.getMarketPrice('INVALID_SYMBOL_XYZ123')).rejects.toThrow();
    });

    it('should handle invalid order parameters', async () => {
      if (!adapter.isAuthenticated) return;

      await expect(
        adapter.createOrder({
          symbol: testSymbol,
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1
          // Missing required 'price' for LIMIT order
        })
      ).rejects.toThrow();
    });
  });
});
