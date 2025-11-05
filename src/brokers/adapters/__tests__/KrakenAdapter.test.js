const KrakenAdapter = require('../KrakenAdapter');

// Mock the ccxt library
jest.mock('ccxt', () => {
  return {
    kraken: class MockKrakenExchange {
      constructor(config) {
        this.config = config;
        this.apiKey = config.apiKey;
        this.secret = config.secret;
        this.enableRateLimit = config.enableRateLimit;
        this.timeout = config.timeout;
      }

      async fetchBalance() {
        return {
          USD: { total: 15000, free: 12000, used: 3000 },
          ZUSD: { total: 15000, free: 12000, used: 3000 },
          BTC: { total: 0.75, free: 0.75, used: 0 },
          XXBT: { total: 0.75, free: 0.75, used: 0 },
          ETH: { total: 8.0, free: 8.0, used: 0 }
        };
      }

      async createOrder(symbol, type, side, amount, price, params = {}) {
        return {
          id: `kraken-order-${Date.now()}`,
          symbol: symbol,
          type: type,
          side: side,
          amount: amount,
          price: price,
          filled: type === 'market' ? amount : 0,
          average: type === 'market' ? price || 50000 : null,
          status: type === 'market' ? 'closed' : 'open',
          timestamp: Date.now()
        };
      }

      async cancelOrder(orderId) {
        return {
          id: orderId,
          status: 'canceled'
        };
      }

      async fetchOrders(symbol = null) {
        const baseOrders = [
          {
            id: 'kraken-order-1',
            symbol: 'BTC/USD',
            type: 'limit',
            side: 'buy',
            amount: 0.2,
            filled: 0.2,
            price: 47500,
            status: 'closed',
            timestamp: Date.now() - 3600000
          },
          {
            id: 'kraken-order-2',
            symbol: 'ETH/USD',
            type: 'market',
            side: 'sell',
            amount: 2.0,
            filled: 2.0,
            price: 2950,
            status: 'closed',
            timestamp: Date.now() - 7200000
          },
          {
            id: 'kraken-order-3',
            symbol: 'BTC/USD',
            type: 'limit',
            side: 'buy',
            amount: 0.1,
            filled: 0,
            price: 46000,
            status: 'open',
            timestamp: Date.now() - 1800000
          }
        ];

        if (symbol) {
          return baseOrders.filter(o => o.symbol === symbol);
        }
        return baseOrders;
      }

      async fetchTicker(symbol) {
        const prices = {
          'BTC/USD': { bid: 49900, ask: 50100, last: 50000 },
          'ETH/USD': { bid: 2990, ask: 3010, last: 3000 },
          'DOT/USD': { bid: 9.95, ask: 10.05, last: 10 }
        };

        if (prices[symbol]) {
          return prices[symbol];
        }

        throw new Error(`Unknown symbol: ${symbol}`);
      }

      async fetchMarkets() {
        return [
          {
            symbol: 'BTC/USD',
            maker: 0.0016,
            taker: 0.0026
          },
          {
            symbol: 'ETH/USD',
            maker: 0.0016,
            taker: 0.0026
          },
          {
            symbol: 'DOT/USD',
            maker: 0.0016,
            taker: 0.0026
          }
        ];
      }
    }
  };
});

// Mock promise-timeout utility
jest.mock('../../../utils/promise-timeout', () => ({
  withTimeout: jest.fn(promise => promise)
}));

describe('KrakenAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new KrakenAdapter(
      {
        apiKey: 'test-kraken-key',
        apiSecret: 'test-kraken-secret'
      },
      {
        isTestnet: false,
        timeout: 30000
      }
    );
  });

  describe('Constructor', () => {
    test('should initialize with correct broker name and type', () => {
      expect(adapter.brokerName).toBe('kraken');
      expect(adapter.brokerType).toBe('crypto');
    });

    test('should initialize CCXT exchange with credentials', () => {
      expect(adapter.exchange).toBeDefined();
      expect(adapter.exchange.apiKey).toBe('test-kraken-key');
      expect(adapter.exchange.secret).toBe('test-kraken-secret');
    });

    test('should enable rate limiting by default', () => {
      expect(adapter.exchange.enableRateLimit).toBe(true);
    });

    test('should set timeout from options', () => {
      expect(adapter.exchange.timeout).toBe(30000);
    });

    test('should warn about testnet not supported', () => {
      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'warn').mockImplementation();
      new KrakenAdapter({ apiKey: 'test', apiSecret: 'test' }, { isTestnet: true });
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Kraken does not support testnet/sandbox mode'));
      loggerSpy.mockRestore();
    });
  });

  describe('authenticate()', () => {
    test('should authenticate successfully and return true', async () => {
      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
    });

    test('should log success message', async () => {
      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'info').mockImplementation();
      await adapter.authenticate();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Kraken authenticated successfully'));
      loggerSpy.mockRestore();
    });

    test('should handle authentication failure', async () => {
      const mockError = new Error('Invalid API credentials');
      adapter.exchange.fetchBalance = jest.fn().mockRejectedValue(mockError);

      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();
      const result = await adapter.authenticate();

      expect(result).toBe(false);
      expect(adapter.isAuthenticated).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed'),
        expect.objectContaining({
          error: 'Invalid API credentials'
        })
      );
      loggerSpy.mockRestore();
    });
  });

  describe('getBalance()', () => {
    test('should return USD balance by default', async () => {
      const balance = await adapter.getBalance();

      expect(balance).toHaveProperty('total', 15000);
      expect(balance).toHaveProperty('available', 12000);
      expect(balance).toHaveProperty('equity', 15000);
      expect(balance).toHaveProperty('currency', 'USD');
    });

    test('should return specific currency balance when requested', async () => {
      const btcBalance = await adapter.getBalance('BTC');

      expect(btcBalance).toHaveProperty('total', 0.75);
      expect(btcBalance).toHaveProperty('available', 0.75);
      expect(btcBalance).toHaveProperty('currency', 'BTC');
    });

    test('should handle Kraken prefixed currencies (XXBT for BTC)', async () => {
      const balance = await adapter.getBalance('BTC');

      // Should find either BTC or XXBT
      expect(balance.total).toBe(0.75);
      expect(balance.currency).toBe('BTC');
    });

    test('should handle Kraken prefixed currencies (ZUSD for USD)', async () => {
      const balance = await adapter.getBalance();

      // Should find either USD or ZUSD
      expect(balance.total).toBe(15000);
      expect(balance.currency).toBe('USD');
    });

    test('should return zero balance for unsupported currency', async () => {
      const balance = await adapter.getBalance('XRP');

      expect(balance).toHaveProperty('total', 0);
      expect(balance).toHaveProperty('available', 0);
      expect(balance).toHaveProperty('currency', 'XRP');
    });

    test('should handle API errors', async () => {
      const mockError = new Error('Network error');
      adapter.exchange.fetchBalance = jest.fn().mockRejectedValue(mockError);

      await expect(adapter.getBalance()).rejects.toThrow('Network error');
    });
  });

  describe('createOrder()', () => {
    test('should create market buy order successfully', async () => {
      const order = {
        symbol: 'BTC/USD',
        type: 'MARKET',
        side: 'BUY',
        quantity: 0.1
      };

      const result = await adapter.createOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('status', 'FILLED');
      expect(result).toHaveProperty('executedQty', 0.1);
      expect(result).toHaveProperty('symbol', 'BTC/USD');
      expect(result).toHaveProperty('side', 'BUY');
    });

    test('should create limit sell order successfully', async () => {
      const order = {
        symbol: 'ETH/USD',
        type: 'LIMIT',
        side: 'SELL',
        quantity: 2.0,
        price: 3100
      };

      const result = await adapter.createOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('symbol', 'ETH/USD');
      expect(result).toHaveProperty('type', 'LIMIT');
    });

    test('should normalize symbol format', async () => {
      const spy = jest.spyOn(adapter.exchange, 'createOrder');

      await adapter.createOrder({
        symbol: 'BTCUSDT',
        type: 'MARKET',
        side: 'BUY',
        quantity: 0.1
      });

      expect(spy).toHaveBeenCalledWith('BTC/USD', 'market', 'buy', 0.1, undefined, { stopLossPrice: undefined });
    });

    test('should handle stop orders with stop loss price', async () => {
      const order = {
        symbol: 'BTC/USD',
        type: 'STOP',
        side: 'SELL',
        quantity: 0.1,
        stopPrice: 47000
      };

      const result = await adapter.createOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('symbol', 'BTC/USD');
    });

    test('should handle order creation errors', async () => {
      const mockError = new Error('Insufficient balance');
      adapter.exchange.createOrder = jest.fn().mockRejectedValue(mockError);

      const order = {
        symbol: 'BTC/USD',
        type: 'MARKET',
        side: 'BUY',
        quantity: 10
      };

      await expect(adapter.createOrder(order)).rejects.toThrow('Insufficient balance');
    });
  });

  describe('cancelOrder()', () => {
    test('should cancel order successfully', async () => {
      const result = await adapter.cancelOrder('kraken-order-123');

      expect(result).toBe(true);
    });

    test('should log success message', async () => {
      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'info').mockImplementation();
      await adapter.cancelOrder('kraken-order-456');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Order cancelled'),
        expect.objectContaining({
          orderId: 'kraken-order-456'
        })
      );
      loggerSpy.mockRestore();
    });

    test('should handle cancellation errors', async () => {
      const mockError = new Error('Order not found');
      adapter.exchange.cancelOrder = jest.fn().mockRejectedValue(mockError);

      const result = await adapter.cancelOrder('invalid-order');

      expect(result).toBe(false);
    });
  });

  describe('getPositions()', () => {
    test('should return positions with current prices', async () => {
      const positions = await adapter.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);

      const btcPosition = positions.find(p => p.symbol.includes('BTC'));
      expect(btcPosition).toBeDefined();
      expect(btcPosition).toHaveProperty('quantity', 0.75);
      expect(btcPosition).toHaveProperty('currentPrice', 50000);
      expect(btcPosition).toHaveProperty('value', 37500);
    });

    test('should filter out dust amounts', async () => {
      adapter.exchange.fetchBalance = jest.fn().mockResolvedValue({
        USD: { total: 15000, free: 15000, used: 0 },
        BTC: { total: 0.00000001, free: 0.00000001, used: 0 }
      });

      const positions = await adapter.getPositions();

      const btcPosition = positions.find(p => p.symbol.includes('BTC'));
      expect(btcPosition).toBeUndefined();
    });

    test('should handle USD balance specially', async () => {
      const positions = await adapter.getPositions();

      const usdPosition = positions.find(p => p.symbol === 'USD/USD' || p.symbol === 'ZUSD/USD');
      if (usdPosition) {
        expect(usdPosition.currentPrice).toBe(1.0);
      }
    });

    test('should return empty array on error', async () => {
      adapter.exchange.fetchBalance = jest.fn().mockRejectedValue(new Error('API error'));

      const positions = await adapter.getPositions();

      expect(positions).toEqual([]);
    });
  });

  describe('setStopLoss()', () => {
    test('should create stop-loss order successfully', async () => {
      const params = {
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 0.1,
        stopPrice: 47500
      };

      const result = await adapter.setStopLoss(params);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('symbol', 'BTC/USD');
      expect(result).toHaveProperty('stopPrice', 47500);
    });

    test('should log success message', async () => {
      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'info').mockImplementation();

      await adapter.setStopLoss({
        symbol: 'ETH/USD',
        side: 'SELL',
        quantity: 1.0,
        stopPrice: 2750
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stop-loss order set'),
        expect.objectContaining({
          symbol: 'ETH/USD',
          stopPrice: 2750
        })
      );
      loggerSpy.mockRestore();
    });

    test('should use stop-loss order type for Kraken', async () => {
      const spy = jest.spyOn(adapter.exchange, 'createOrder');

      await adapter.setStopLoss({
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 0.1,
        stopPrice: 47500
      });

      expect(spy).toHaveBeenCalledWith('BTC/USD', 'stop-loss', 'sell', 0.1, null, { stopLossPrice: 47500 });
    });

    test('should handle stop-loss creation errors', async () => {
      const mockError = new Error('Invalid stop price');
      adapter.exchange.createOrder = jest.fn().mockRejectedValue(mockError);

      await expect(
        adapter.setStopLoss({
          symbol: 'BTC/USD',
          side: 'SELL',
          quantity: 0.1,
          stopPrice: 0
        })
      ).rejects.toThrow('Invalid stop price');
    });
  });

  describe('setTakeProfit()', () => {
    test('should create take-profit order successfully', async () => {
      const params = {
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 0.1,
        limitPrice: 55000
      };

      const result = await adapter.setTakeProfit(params);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('symbol', 'BTC/USD');
      expect(result).toHaveProperty('limitPrice', 55000);
    });

    test('should log success message', async () => {
      const logger = require('../../../utils/logger');
      const loggerSpy = jest.spyOn(logger, 'info').mockImplementation();

      await adapter.setTakeProfit({
        symbol: 'ETH/USD',
        side: 'SELL',
        quantity: 1.0,
        limitPrice: 3400
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Take-profit order set'),
        expect.objectContaining({
          symbol: 'ETH/USD',
          limitPrice: 3400
        })
      );
      loggerSpy.mockRestore();
    });

    test('should use take-profit order type for Kraken', async () => {
      const spy = jest.spyOn(adapter.exchange, 'createOrder');

      await adapter.setTakeProfit({
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 0.1,
        limitPrice: 55000
      });

      expect(spy).toHaveBeenCalledWith('BTC/USD', 'take-profit', 'sell', 0.1, null, { takeProfitPrice: 55000 });
    });

    test('should handle take-profit creation errors', async () => {
      const mockError = new Error('Invalid limit price');
      adapter.exchange.createOrder = jest.fn().mockRejectedValue(mockError);

      await expect(
        adapter.setTakeProfit({
          symbol: 'BTC/USD',
          side: 'SELL',
          quantity: 0.1,
          limitPrice: 0
        })
      ).rejects.toThrow('Invalid limit price');
    });
  });

  describe('getOrderHistory()', () => {
    test('should fetch all orders when no filters provided', async () => {
      const orders = await adapter.getOrderHistory();

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBe(3);
    });

    test('should filter orders by symbol', async () => {
      const orders = await adapter.getOrderHistory({ symbol: 'BTC/USD' });

      expect(orders.length).toBe(2);
      expect(orders.every(o => o.symbol === 'BTC/USD')).toBe(true);
    });

    test('should filter orders by start date', async () => {
      const startDate = new Date(Date.now() - 5400000); // 1.5 hours ago

      const orders = await adapter.getOrderHistory({ startDate });

      expect(orders.length).toBeGreaterThan(0);
      expect(orders.every(o => o.timestamp >= startDate)).toBe(true);
    });

    test('should filter orders by end date', async () => {
      const endDate = new Date(Date.now() - 3600000); // 1 hour ago

      const orders = await adapter.getOrderHistory({ endDate });

      expect(orders.every(o => o.timestamp <= endDate)).toBe(true);
    });

    test('should filter orders by status', async () => {
      // Pass CCXT status 'closed' which maps to 'FILLED'
      const orders = await adapter.getOrderHistory({ status: 'closed' });

      expect(orders.length).toBeGreaterThan(0);
      expect(orders.every(o => o.status === 'FILLED')).toBe(true);
    });

    test('should return properly formatted order objects', async () => {
      const orders = await adapter.getOrderHistory();
      const order = orders[0];

      expect(order).toHaveProperty('orderId');
      expect(order).toHaveProperty('symbol');
      expect(order).toHaveProperty('side');
      expect(order).toHaveProperty('type');
      expect(order).toHaveProperty('quantity');
      expect(order).toHaveProperty('executedQty');
      expect(order).toHaveProperty('price');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('timestamp');
      expect(order.timestamp).toBeInstanceOf(Date);
    });

    test('should return empty array on error', async () => {
      adapter.exchange.fetchOrders = jest.fn().mockRejectedValue(new Error('API error'));

      const orders = await adapter.getOrderHistory();

      expect(orders).toEqual([]);
    });
  });

  describe('getMarketPrice()', () => {
    test('should fetch market price successfully', async () => {
      const price = await adapter.getMarketPrice('BTC/USD');

      expect(price).toHaveProperty('bid', 49900);
      expect(price).toHaveProperty('ask', 50100);
      expect(price).toHaveProperty('last', 50000);
    });

    test('should normalize symbol before fetching', async () => {
      const spy = jest.spyOn(adapter.exchange, 'fetchTicker');

      await adapter.getMarketPrice('BTCUSDT');

      expect(spy).toHaveBeenCalledWith('BTC/USD');
    });

    test('should handle unknown symbols', async () => {
      await expect(adapter.getMarketPrice('INVALID/USD')).rejects.toThrow('Unknown symbol');
    });

    test('should handle API errors', async () => {
      const mockError = new Error('Network error');
      adapter.exchange.fetchTicker = jest.fn().mockRejectedValue(mockError);

      await expect(adapter.getMarketPrice('BTC/USD')).rejects.toThrow('Network error');
    });
  });

  describe('isSymbolSupported()', () => {
    test('should return true for supported symbols', async () => {
      const supported = await adapter.isSymbolSupported('BTC/USD');

      expect(supported).toBe(true);
    });

    test('should return true for normalized symbols', async () => {
      const supported = await adapter.isSymbolSupported('BTCUSDT');

      expect(supported).toBe(true);
    });

    test('should return false for unsupported symbols', async () => {
      const supported = await adapter.isSymbolSupported('INVALID/USD');

      expect(supported).toBe(false);
    });

    test('should cache supported pairs after first fetch', async () => {
      const spy = jest.spyOn(adapter.exchange, 'fetchMarkets');

      await adapter.isSymbolSupported('BTC/USD');
      await adapter.isSymbolSupported('ETH/USD');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('should handle API errors gracefully', async () => {
      adapter.exchange.fetchMarkets = jest.fn().mockRejectedValue(new Error('API error'));

      const supported = await adapter.isSymbolSupported('BTC/USD');

      expect(supported).toBe(false);
    });
  });

  describe('getFees()', () => {
    test('should return fee structure for supported symbol', async () => {
      const fees = await adapter.getFees('BTC/USD');

      expect(fees).toHaveProperty('maker', 0.0016);
      expect(fees).toHaveProperty('taker', 0.0026);
      expect(fees).toHaveProperty('withdrawal', 0);
    });

    test('should return default Kraken fees for unsupported symbol', async () => {
      const fees = await adapter.getFees('INVALID/USD');

      expect(fees).toHaveProperty('maker', 0.0016);
      expect(fees).toHaveProperty('taker', 0.0026);
      expect(fees).toHaveProperty('withdrawal', 0);
    });

    test('should normalize symbol before fetching', async () => {
      const fees = await adapter.getFees('ETHUSDT');

      expect(fees).toHaveProperty('maker');
      expect(fees).toHaveProperty('taker');
    });

    test('should return default fees on error', async () => {
      adapter.exchange.fetchMarkets = jest.fn().mockRejectedValue(new Error('API error'));

      const fees = await adapter.getFees('BTC/USD');

      expect(fees).toEqual({
        maker: 0.0016,
        taker: 0.0026,
        withdrawal: 0
      });
    });
  });

  describe('normalizeKrakenCurrency()', () => {
    test('should map BTC to XXBT', () => {
      expect(adapter.normalizeKrakenCurrency('BTC')).toBe('XXBT');
    });

    test('should map USD to ZUSD', () => {
      expect(adapter.normalizeKrakenCurrency('USD')).toBe('ZUSD');
    });

    test('should map EUR to ZEUR', () => {
      expect(adapter.normalizeKrakenCurrency('EUR')).toBe('ZEUR');
    });

    test('should map GBP to ZGBP', () => {
      expect(adapter.normalizeKrakenCurrency('GBP')).toBe('ZGBP');
    });

    test('should map JPY to ZJPY', () => {
      expect(adapter.normalizeKrakenCurrency('JPY')).toBe('ZJPY');
    });

    test('should map CAD to ZCAD', () => {
      expect(adapter.normalizeKrakenCurrency('CAD')).toBe('ZCAD');
    });

    test('should return unmapped currencies unchanged', () => {
      expect(adapter.normalizeKrakenCurrency('ETH')).toBe('ETH');
      expect(adapter.normalizeKrakenCurrency('ADA')).toBe('ADA');
    });
  });

  describe('normalizeSymbol()', () => {
    test('should replace USDT with USD in slash format', () => {
      expect(adapter.normalizeSymbol('BTC/USDT')).toBe('BTC/USD');
    });

    test('should convert BTCUSDT to BTC/USD', () => {
      expect(adapter.normalizeSymbol('BTCUSDT')).toBe('BTC/USD');
    });

    test('should convert ETHUSDT to ETH/USD', () => {
      expect(adapter.normalizeSymbol('ETHUSDT')).toBe('ETH/USD');
    });

    test('should handle symbols already in correct format', () => {
      expect(adapter.normalizeSymbol('BTC/USD')).toBe('BTC/USD');
    });

    test('should handle 3-letter base currencies', () => {
      expect(adapter.normalizeSymbol('DOTUSDT')).toBe('DOT/USD');
    });

    test('should handle 4-letter base currencies', () => {
      expect(adapter.normalizeSymbol('LINKUSDT')).toBe('LINK/USD');
    });

    test('should handle 5-letter base currencies', () => {
      expect(adapter.normalizeSymbol('MATICUSDT')).toBe('MATIC/USD');
    });

    test('should return unchanged if pattern does not match', () => {
      expect(adapter.normalizeSymbol('INVALID')).toBe('INVALID');
    });
  });

  describe('denormalizeSymbol()', () => {
    test('should keep slash format for crypto pairs', () => {
      expect(adapter.denormalizeSymbol('BTC/USD')).toBe('BTC/USD');
    });

    test('should not modify symbol format', () => {
      expect(adapter.denormalizeSymbol('ETH/USD')).toBe('ETH/USD');
    });
  });

  describe('mapOrderStatus()', () => {
    test('should map "open" to "PENDING"', () => {
      expect(adapter.mapOrderStatus('open')).toBe('PENDING');
    });

    test('should map "closed" to "FILLED"', () => {
      expect(adapter.mapOrderStatus('closed')).toBe('FILLED');
    });

    test('should map "canceled" to "CANCELLED"', () => {
      expect(adapter.mapOrderStatus('canceled')).toBe('CANCELLED');
    });

    test('should map "expired" to "CANCELLED"', () => {
      expect(adapter.mapOrderStatus('expired')).toBe('CANCELLED');
    });

    test('should map "rejected" to "CANCELLED"', () => {
      expect(adapter.mapOrderStatus('rejected')).toBe('CANCELLED');
    });

    test('should default to "PENDING" for unknown status', () => {
      expect(adapter.mapOrderStatus('unknown')).toBe('PENDING');
    });
  });

  describe('getBrokerInfo()', () => {
    test('should return comprehensive broker information', () => {
      const info = adapter.getBrokerInfo();

      expect(info).toHaveProperty('name', 'Kraken');
      expect(info).toHaveProperty('displayName', 'Kraken');
      expect(info).toHaveProperty('supportsCrypto', true);
      expect(info).toHaveProperty('supportsStocks', false);
      expect(info).toHaveProperty('supportsOptions', false);
      expect(info).toHaveProperty('supportsFutures', true);
      expect(info).toHaveProperty('minTradeAmount', 10);
      expect(info).toHaveProperty('website', 'https://www.kraken.com');
      expect(info).toHaveProperty('documentationUrl');
    });

    test('should indicate futures trading support', () => {
      const info = adapter.getBrokerInfo();

      expect(info.supportsFutures).toBe(true);
    });

    test('should extend base broker info', () => {
      const info = adapter.getBrokerInfo();

      // Properties from BrokerAdapter.getBrokerInfo()
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('displayName');
    });
  });
});
