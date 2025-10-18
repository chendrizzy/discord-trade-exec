/**
 * Unit Tests for WebSocket Emitter Functions
 * Tests all server-to-client broadcast functions
 */

// Mock logger before importing modules
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

const { createEmitters } = require('../../../src/services/websocket/emitters');

describe('WebSocket Emitter Functions', () => {
  let emitters;
  let mockWebSocketServer;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock WebSocket server
    mockWebSocketServer = {
      emitToUser: jest.fn(),
      emitToRoom: jest.fn(),
      emitToAll: jest.fn()
    };

    // Create emitters
    emitters = createEmitters(mockWebSocketServer);
  });

  describe('emitPortfolioUpdate()', () => {
    const portfolioData = {
      totalValue: 150000.50,
      cash: 25000.00,
      equity: 125000.50,
      positions: [
        { symbol: 'AAPL', quantity: 100, value: 18000 },
        { symbol: 'GOOGL', quantity: 50, value: 7000 }
      ],
      dayChange: 2500.00,
      dayChangePercent: 1.69
    };

    test('should emit portfolio update to user room', () => {
      emitters.emitPortfolioUpdate('user-123', portfolioData);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalledWith(
        'portfolio:user-123',
        'portfolio:updated',
        {
          userId: 'user-123',
          portfolio: portfolioData,
          timestamp: expect.any(String)
        }
      );
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitPortfolioUpdate('user-123', portfolioData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should handle portfolioData with no positions', () => {
      const emptyPortfolio = {
        totalValue: 50000,
        cash: 50000,
        equity: 0,
        positions: [],
        dayChange: 0,
        dayChangePercent: 0
      };

      emitters.emitPortfolioUpdate('user-123', emptyPortfolio);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalled();
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitPortfolioUpdate('user-123', portfolioData);

      expect(mockWebSocketServer.emitToRoom).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToRoom.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitPortfolioUpdate('user-123', portfolioData);
      }).not.toThrow();
    });
  });

  describe('emitTradeExecuted()', () => {
    const tradeData = {
      id: 'trade-789',
      symbol: 'AAPL',
      side: 'buy',
      quantity: 100,
      price: 180.50,
      broker: 'alpaca',
      orderId: 'order-456'
    };

    test('should emit trade executed to trades room', () => {
      emitters.emitTradeExecuted('user-123', tradeData);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalledWith(
        'trades:user-123',
        'trade:executed',
        {
          userId: 'user-123',
          trade: tradeData,
          timestamp: expect.any(String),
          notification: {
            title: 'Trade Executed: AAPL',
            message: 'BUY 100 AAPL @ $180.5',
            type: 'success'
          }
        }
      );
    });

    test('should format notification message correctly', () => {
      emitters.emitTradeExecuted('user-123', tradeData);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.message).toBe('BUY 100 AAPL @ $180.5');
    });

    test('should uppercase trade side in notification', () => {
      const sellTrade = { ...tradeData, side: 'sell' };

      emitters.emitTradeExecuted('user-123', sellTrade);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.message).toContain('SELL');
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitTradeExecuted('user-123', tradeData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitTradeExecuted('user-123', tradeData);

      expect(mockWebSocketServer.emitToRoom).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToRoom.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitTradeExecuted('user-123', tradeData);
      }).not.toThrow();
    });
  });

  describe('emitTradeFailed()', () => {
    const errorData = {
      symbol: 'AAPL',
      side: 'buy',
      quantity: 100,
      reason: 'Insufficient funds',
      broker: 'alpaca'
    };

    test('should emit trade failed to trades room', () => {
      emitters.emitTradeFailed('user-123', errorData);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalledWith(
        'trades:user-123',
        'trade:failed',
        {
          userId: 'user-123',
          error: errorData,
          timestamp: expect.any(String),
          notification: {
            title: 'Trade Failed: AAPL',
            message: 'BUY 100 AAPL - Insufficient funds',
            type: 'error'
          }
        }
      );
    });

    test('should format error notification correctly', () => {
      emitters.emitTradeFailed('user-123', errorData);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.message).toBe('BUY 100 AAPL - Insufficient funds');
      expect(emitCall[2].notification.type).toBe('error');
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitTradeFailed('user-123', errorData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitTradeFailed('user-123', errorData);

      expect(mockWebSocketServer.emitToRoom).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToRoom.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitTradeFailed('user-123', errorData);
      }).not.toThrow();
    });
  });

  describe('emitWatchlistQuote()', () => {
    const quoteData = {
      price: 180.50,
      change: 2.50,
      changePercent: 1.40,
      volume: 50000000,
      high: 181.00,
      low: 178.50,
      open: 179.00
    };

    test('should emit quote to watchlist room', () => {
      emitters.emitWatchlistQuote('AAPL', quoteData);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalledWith(
        'watchlist:AAPL',
        'watchlist:quote',
        {
          symbol: 'AAPL',
          quote: quoteData,
          timestamp: expect.any(String)
        }
      );
    });

    test('should normalize symbol to uppercase', () => {
      emitters.emitWatchlistQuote('aapl', quoteData);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[0]).toBe('watchlist:AAPL');
      expect(emitCall[2].symbol).toBe('AAPL');
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitWatchlistQuote('AAPL', quoteData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitWatchlistQuote('AAPL', quoteData);

      expect(mockWebSocketServer.emitToRoom).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToRoom.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitWatchlistQuote('AAPL', quoteData);
      }).not.toThrow();
    });
  });

  describe('emitPositionClosed()', () => {
    const positionData = {
      symbol: 'AAPL',
      quantity: 100,
      entryPrice: 175.00,
      exitPrice: 180.50,
      pnl: 550.00,
      pnlPercent: 3.14
    };

    test('should emit position closed to trades room', () => {
      emitters.emitPositionClosed('user-123', positionData);

      expect(mockWebSocketServer.emitToRoom).toHaveBeenCalledWith(
        'trades:user-123',
        'position:closed',
        {
          userId: 'user-123',
          position: positionData,
          timestamp: expect.any(String),
          notification: {
            title: 'Position Closed: AAPL',
            message: 'P&L: +$550.00 (3.14%)',
            type: 'success'
          }
        }
      );
    });

    test('should format positive P&L with plus sign', () => {
      emitters.emitPositionClosed('user-123', positionData);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.message).toBe('P&L: +$550.00 (3.14%)');
      expect(emitCall[2].notification.type).toBe('success');
    });

    test('should format negative P&L correctly', () => {
      const lossPosition = {
        ...positionData,
        pnl: -350.00,
        pnlPercent: -2.00
      };

      emitters.emitPositionClosed('user-123', lossPosition);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.message).toBe('P&L: $-350.00 (-2.00%)');
      expect(emitCall[2].notification.type).toBe('warning');
    });

    test('should use warning type for negative P&L', () => {
      const lossPosition = {
        ...positionData,
        pnl: -100.00,
        pnlPercent: -0.57
      };

      emitters.emitPositionClosed('user-123', lossPosition);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.type).toBe('warning');
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitPositionClosed('user-123', positionData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitPositionClosed('user-123', positionData);

      expect(mockWebSocketServer.emitToRoom).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToRoom.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitPositionClosed('user-123', positionData);
      }).not.toThrow();
    });
  });

  describe('emitNotification()', () => {
    const notification = {
      title: 'System Notification',
      message: 'Your account has been upgraded',
      type: 'info',
      data: { tier: 'premium' }
    };

    test('should emit notification to user', () => {
      emitters.emitNotification('user-123', notification);

      expect(mockWebSocketServer.emitToUser).toHaveBeenCalledWith(
        'user-123',
        'notification',
        {
          userId: 'user-123',
          notification,
          timestamp: expect.any(String)
        }
      );
    });

    test('should support different notification types', () => {
      const types = ['info', 'success', 'warning', 'error'];

      types.forEach(type => {
        const notif = { ...notification, type };
        emitters.emitNotification('user-123', notif);
      });

      expect(mockWebSocketServer.emitToUser).toHaveBeenCalledTimes(4);
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitNotification('user-123', notification);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToUser.mock.calls[0];
      expect(emitCall[2].timestamp).toBeDefined();
      expect(emitCall[2].timestamp >= beforeTime).toBe(true);
      expect(emitCall[2].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitNotification('user-123', notification);

      expect(mockWebSocketServer.emitToUser).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToUser.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitNotification('user-123', notification);
      }).not.toThrow();
    });
  });

  describe('emitMarketStatus()', () => {
    const marketData = {
      isOpen: true,
      market: 'NYSE',
      nextOpen: '2025-10-18T09:30:00.000Z',
      nextClose: '2025-10-17T16:00:00.000Z'
    };

    test('should emit market status to all clients', () => {
      emitters.emitMarketStatus(marketData);

      expect(mockWebSocketServer.emitToAll).toHaveBeenCalledWith(
        'market:status',
        {
          market: marketData,
          timestamp: expect.any(String)
        }
      );
    });

    test('should handle market closed status', () => {
      const closedMarket = { ...marketData, isOpen: false };

      emitters.emitMarketStatus(closedMarket);

      const emitCall = mockWebSocketServer.emitToAll.mock.calls[0];
      expect(emitCall[1].market.isOpen).toBe(false);
    });

    test('should include current timestamp', () => {
      const beforeTime = new Date().toISOString();
      emitters.emitMarketStatus(marketData);
      const afterTime = new Date().toISOString();

      const emitCall = mockWebSocketServer.emitToAll.mock.calls[0];
      expect(emitCall[1].timestamp).toBeDefined();
      expect(emitCall[1].timestamp >= beforeTime).toBe(true);
      expect(emitCall[1].timestamp <= afterTime).toBe(true);
    });

    test('should warn when WebSocket server not initialized', () => {
      emitters = createEmitters(null);

      emitters.emitMarketStatus(marketData);

      expect(mockWebSocketServer.emitToAll).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      mockWebSocketServer.emitToAll.mockImplementation(() => {
        throw new Error('Emit error');
      });

      expect(() => {
        emitters.emitMarketStatus(marketData);
      }).not.toThrow();
    });
  });

  describe('createEmitters()', () => {
    test('should return all emitter functions', () => {
      const emitters = createEmitters(mockWebSocketServer);

      expect(emitters).toHaveProperty('emitPortfolioUpdate');
      expect(emitters).toHaveProperty('emitTradeExecuted');
      expect(emitters).toHaveProperty('emitTradeFailed');
      expect(emitters).toHaveProperty('emitWatchlistQuote');
      expect(emitters).toHaveProperty('emitPositionClosed');
      expect(emitters).toHaveProperty('emitNotification');
      expect(emitters).toHaveProperty('emitMarketStatus');
      expect(typeof emitters.emitPortfolioUpdate).toBe('function');
      expect(typeof emitters.emitTradeExecuted).toBe('function');
      expect(typeof emitters.emitTradeFailed).toBe('function');
      expect(typeof emitters.emitWatchlistQuote).toBe('function');
      expect(typeof emitters.emitPositionClosed).toBe('function');
      expect(typeof emitters.emitNotification).toBe('function');
      expect(typeof emitters.emitMarketStatus).toBe('function');
    });

    test('should work with null webSocketServer', () => {
      const emitters = createEmitters(null);

      expect(() => {
        emitters.emitPortfolioUpdate('user-123', {});
        emitters.emitTradeExecuted('user-123', { symbol: 'AAPL', side: 'buy', quantity: 100, price: 180 });
        emitters.emitTradeFailed('user-123', { symbol: 'AAPL', reason: 'Error' });
        emitters.emitWatchlistQuote('AAPL', { price: 180 });
        emitters.emitPositionClosed('user-123', { symbol: 'AAPL', pnl: 100, pnlPercent: 1 });
        emitters.emitNotification('user-123', { title: 'Test', message: 'Test', type: 'info' });
        emitters.emitMarketStatus({ isOpen: true, market: 'NYSE' });
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing optional fields in portfolioData', () => {
      const minimalPortfolio = {
        totalValue: 100000,
        positions: null
      };

      expect(() => {
        emitters.emitPortfolioUpdate('user-123', minimalPortfolio);
      }).not.toThrow();
    });

    test('should handle zero P&L correctly', () => {
      const breakEvenPosition = {
        symbol: 'AAPL',
        quantity: 100,
        entryPrice: 180.00,
        exitPrice: 180.00,
        pnl: 0,
        pnlPercent: 0
      };

      emitters.emitPositionClosed('user-123', breakEvenPosition);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[2].notification.type).toBe('success'); // >= 0 is success
      expect(emitCall[2].notification.message).toBe('P&L: +$0.00 (0.00%)');
    });

    test('should handle symbols with special characters', () => {
      const quoteData = { price: 100, change: 1, changePercent: 1 };

      emitters.emitWatchlistQuote('BRK.B', quoteData);

      const emitCall = mockWebSocketServer.emitToRoom.mock.calls[0];
      expect(emitCall[0]).toBe('watchlist:BRK.B');
      expect(emitCall[2].symbol).toBe('BRK.B');
    });
  });
});
