# Test Strategy for Week 3 Track B - Real-Time Features

## Executive Summary

Comprehensive testing strategy for Week 3 Track B real-time features: Portfolio Updates, Trade Notifications, and Live Watchlist. This strategy leverages existing Jest 30.2.0, React Testing Library, and socket.io-client infrastructure while maintaining consistency with 454+ existing tests.

**Test Coverage Goals:**
- Unit Tests: 90%+ coverage
- Integration Tests: 85%+ coverage
- E2E Tests: Critical user journeys
- Performance Tests: <100ms latency for WebSocket events

---

## 1. Test Coverage Analysis

### 1.1 Existing Test Infrastructure

**✅ Strengths:**
- Jest 30.2.0 with jsdom environment for React tests
- MongoDB Memory Server for database isolation
- Comprehensive mock utilities in `tests/setup.js`
- 454+ passing tests (280 broker + 174+ WebSocket)
- Supertest for API integration testing
- Well-established patterns for mocking and assertions

**📦 Available Tools:**
- `@testing-library/react` v16.3.0 - React component testing
- `@testing-library/jest-dom` v6.9.1 - DOM matchers
- `socket.io-client` v4.7.5 - WebSocket client testing
- `sinon` v21.0.0 - Advanced mocking/spying
- `nock` v14.0.10 - HTTP mocking
- `@playwright/test` v1.55.0 - E2E testing

**📁 Test Organization:**
```
tests/
├── unit/                    # Unit tests
│   ├── websocket/          # WebSocket server-side logic
│   ├── analytics/          # Analytics services
│   └── config-validator.test.js
├── integration/            # Integration tests
│   ├── analytics-api.test.js
│   └── (WebSocket flows - to be added)
├── security/              # Security tests
│   └── tenant-isolation.test.js
└── setup.js               # Global test configuration
```

### 1.2 Coverage Thresholds (jest.config.js)

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

**Target for Week 3 Track B:**
- Server-side WebSocket emitters: 90%+
- React components: 85%+
- Integration flows: 85%+
- Hook logic (useWebSocket): 95%+

---

## 2. Unit Tests

### 2.1 Server-Side WebSocket Emitters

#### Test File: `tests/unit/websocket/emitters/portfolio.test.js`

**Purpose:** Test server-side portfolio update emission logic

**Test Cases:**
```javascript
describe('Portfolio Update Emitter', () => {
  // Setup
  let mockSocket;
  let mockPortfolioService;

  beforeEach(() => {
    mockSocket = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      join: jest.fn(),
      leave: jest.fn(),
      id: 'test-socket-123'
    };

    mockPortfolioService = {
      calculatePortfolioValue: jest.fn(),
      getActiveBots: jest.fn(),
      get24hPnL: jest.fn()
    };
  });

  describe('emitPortfolioUpdate()', () => {
    test('should emit portfolio:update event with correct data structure', async () => {
      // Arrange
      mockPortfolioService.calculatePortfolioValue.mockResolvedValue(45678.90);
      mockPortfolioService.getActiveBots.mockResolvedValue({ active: 3, total: 5 });
      mockPortfolioService.get24hPnL.mockResolvedValue({
        totalPnL: 234.56,
        winRate: 67.5,
        change24hPercent: 0.52,
        change24hValue: 234.56
      });

      const userId = 'user123';

      // Act
      await emitPortfolioUpdate(mockSocket, userId, mockPortfolioService);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('portfolio:update', {
        totalValue: 45678.90,
        activeBots: 3,
        totalBots: 5,
        totalPnL: 234.56,
        winRate: 67.5,
        change24hPercent: 0.52,
        change24hValue: 234.56,
        timestamp: expect.any(Number)
      });
    });

    test('should handle calculation errors gracefully', async () => {
      // Arrange
      mockPortfolioService.calculatePortfolioValue.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(
        emitPortfolioUpdate(mockSocket, 'user123', mockPortfolioService)
      ).rejects.toThrow('Database connection failed');

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    test('should throttle rapid updates (max 1 per second)', async () => {
      // Arrange
      jest.useFakeTimers();
      mockPortfolioService.calculatePortfolioValue.mockResolvedValue(1000);
      mockPortfolioService.getActiveBots.mockResolvedValue({ active: 1, total: 1 });
      mockPortfolioService.get24hPnL.mockResolvedValue({ totalPnL: 0, winRate: 0 });

      // Act - Trigger 5 updates rapidly
      for (let i = 0; i < 5; i++) {
        emitPortfolioUpdate(mockSocket, 'user123', mockPortfolioService);
      }

      // Assert - Should only emit once immediately
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);

      // Advance timer
      jest.advanceTimersByTime(1000);

      // Should emit again after throttle period
      emitPortfolioUpdate(mockSocket, 'user123', mockPortfolioService);
      expect(mockSocket.emit).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    test('should emit to correct user room', async () => {
      // Arrange
      const userId = 'user-abc-123';
      mockSocket.to = jest.fn().mockReturnThis();

      // Act
      await emitPortfolioUpdate(mockSocket, userId, mockPortfolioService);

      // Assert
      expect(mockSocket.to).toHaveBeenCalledWith(`user:${userId}`);
    });
  });
});
```

**Mocking Strategy:**
- Mock socket.io server Socket instance
- Mock portfolio calculation services
- Use fake timers for throttling tests
- Isolate emission logic from business logic

---

#### Test File: `tests/unit/websocket/emitters/trades.test.js`

**Purpose:** Test trade notification emission

**Test Cases:**
```javascript
describe('Trade Notification Emitter', () => {
  let mockSocket;

  beforeEach(() => {
    mockSocket = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis()
    };
  });

  describe('emitTradeExecuted()', () => {
    test('should emit trade:executed with complete trade data', () => {
      // Arrange
      const tradeData = {
        orderId: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        price: 175.50,
        timestamp: Date.now(),
        userId: 'user-abc',
        profit: 25.75
      };

      // Act
      emitTradeExecuted(mockSocket, tradeData);

      // Assert
      expect(mockSocket.to).toHaveBeenCalledWith(`user:${tradeData.userId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('trade:executed', {
        orderId: tradeData.orderId,
        symbol: tradeData.symbol,
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price,
        profit: tradeData.profit,
        timestamp: tradeData.timestamp
      });
    });

    test('should omit sensitive data from emission', () => {
      // Arrange
      const tradeData = {
        orderId: 'order-456',
        symbol: 'TSLA',
        side: 'sell',
        quantity: 5,
        price: 250.00,
        userId: 'user-xyz',
        // Sensitive fields that shouldn't be emitted
        apiKey: 'secret-key',
        accountBalance: 50000,
        internalNotes: 'Private data'
      };

      // Act
      emitTradeExecuted(mockSocket, tradeData);

      // Assert
      const emittedData = mockSocket.emit.mock.calls[0][1];
      expect(emittedData).not.toHaveProperty('apiKey');
      expect(emittedData).not.toHaveProperty('accountBalance');
      expect(emittedData).not.toHaveProperty('internalNotes');
    });
  });

  describe('emitTradeFailed()', () => {
    test('should emit trade:failed with error details', () => {
      // Arrange
      const failureData = {
        orderId: 'order-789',
        symbol: 'NVDA',
        reason: 'Insufficient funds',
        userId: 'user-123',
        timestamp: Date.now()
      };

      // Act
      emitTradeFailed(mockSocket, failureData);

      // Assert
      expect(mockSocket.to).toHaveBeenCalledWith(`user:${failureData.userId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('trade:failed', {
        orderId: failureData.orderId,
        symbol: failureData.symbol,
        reason: failureData.reason,
        timestamp: failureData.timestamp
      });
    });

    test('should sanitize error messages for security', () => {
      // Arrange
      const failureData = {
        orderId: 'order-999',
        symbol: 'BTC',
        reason: 'Database error: Connection to mongodb://admin:password@localhost failed',
        userId: 'user-456'
      };

      // Act
      emitTradeFailed(mockSocket, failureData);

      // Assert
      const emittedReason = mockSocket.emit.mock.calls[0][1].reason;
      expect(emittedReason).not.toContain('password');
      expect(emittedReason).not.toContain('mongodb://');
      expect(emittedReason).toBe('Trade execution failed');
    });
  });
});
```

---

#### Test File: `tests/unit/websocket/emitters/quotes.test.js`

**Purpose:** Test live quote update emission

**Test Cases:**
```javascript
describe('Quote Update Emitter', () => {
  let mockSocket;
  let mockMarketDataService;

  beforeEach(() => {
    mockSocket = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      join: jest.fn(),
      leave: jest.fn()
    };

    mockMarketDataService = {
      subscribeToSymbol: jest.fn(),
      unsubscribeFromSymbol: jest.fn(),
      getLatestQuote: jest.fn()
    };
  });

  describe('emitQuoteUpdate()', () => {
    test('should emit quote:update with price and volume data', () => {
      // Arrange
      const quoteData = {
        symbol: 'AAPL',
        price: 175.50,
        change: 2.75,
        changePercent: 1.59,
        volume: 52341789,
        timestamp: Date.now()
      };

      // Act
      emitQuoteUpdate(mockSocket, quoteData);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('quote:update', quoteData);
    });

    test('should debounce rapid quote updates (100ms window)', async () => {
      // Arrange
      jest.useFakeTimers();
      const symbol = 'TSLA';

      // Act - Send 10 updates in rapid succession
      for (let i = 0; i < 10; i++) {
        emitQuoteUpdate(mockSocket, {
          symbol,
          price: 250 + i,
          change: i,
          changePercent: i * 0.1,
          volume: 1000000,
          timestamp: Date.now()
        });
      }

      // Assert - Should only emit the last update after debounce
      expect(mockSocket.emit).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(100);

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.emit).toHaveBeenCalledWith('quote:update',
        expect.objectContaining({ symbol, price: 259 })
      );

      jest.useRealTimers();
    });

    test('should handle subscription management', () => {
      // Arrange
      const userId = 'user-123';
      const symbol = 'NVDA';

      // Act - Subscribe
      handleQuoteSubscription(mockSocket, userId, symbol, mockMarketDataService);

      // Assert
      expect(mockSocket.join).toHaveBeenCalledWith(`quotes:${symbol}`);
      expect(mockMarketDataService.subscribeToSymbol).toHaveBeenCalledWith(symbol);
    });

    test('should handle unsubscription cleanup', () => {
      // Arrange
      const userId = 'user-123';
      const symbol = 'MSFT';

      // Act - Unsubscribe
      handleQuoteUnsubscription(mockSocket, userId, symbol, mockMarketDataService);

      // Assert
      expect(mockSocket.leave).toHaveBeenCalledWith(`quotes:${symbol}`);
      expect(mockMarketDataService.unsubscribeFromSymbol).toHaveBeenCalledWith(symbol);
    });
  });
});
```

---

### 2.2 React Components

#### Test File: `tests/unit/dashboard/components/PortfolioOverview.test.jsx`

**Purpose:** Test PortfolioOverview component with WebSocket integration

**Test Cases:**
```javascript
import { render, screen, waitFor } from '@testing-library/react';
import { PortfolioOverview } from '@/components/PortfolioOverview';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket context
const mockWebSocketContext = {
  connected: true,
  subscribe: jest.fn(),
  emit: jest.fn(),
  error: null,
  reconnectAttempt: 0
};

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocketContext: () => mockWebSocketContext
}));

describe('PortfolioOverview Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful API response
    global.fetch.mockResolvedValue({
      json: async () => ({
        success: true,
        portfolio: {
          totalValue: 50000.00,
          change24hPercent: 2.5,
          change24hValue: 1250.00
        },
        performance: {
          totalPnL: 5000.00,
          winRate: 65.5
        },
        bots: {
          active: 3,
          total: 5,
          status: 'running'
        }
      })
    });
  });

  afterEach(() => {
    global.fetch.mockRestore();
  });

  describe('Initial Render', () => {
    test('should render portfolio value from API', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert - Loading state
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Assert - Data loaded
      await waitFor(() => {
        expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      });
    });

    test('should display 24h change with correct styling', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        const changeElement = screen.getByText(/\+2.50% today/);
        expect(changeElement).toBeInTheDocument();
        expect(changeElement).toHaveClass('text-profit-text');
      });
    });

    test('should show active bots count', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('3 / 5')).toBeInTheDocument();
        expect(screen.getByText('2 bots paused')).toBeInTheDocument();
      });
    });

    test('should display 24h P&L with profit/loss styling', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        const pnlElement = screen.getByText('+$5,000.00');
        expect(pnlElement).toBeInTheDocument();
        expect(pnlElement).toHaveClass('text-profit-text');
      });
    });
  });

  describe('WebSocket Real-Time Updates', () => {
    test('should subscribe to portfolio:update on mount when connected', async () => {
      // Arrange
      const mockUnsubscribe = jest.fn();
      mockWebSocketContext.subscribe.mockReturnValue(mockUnsubscribe);

      // Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
          'portfolio:update',
          expect.any(Function)
        );
      });
    });

    test('should update portfolio value when receiving WebSocket event', async () => {
      // Arrange
      let portfolioUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'portfolio:update') {
          portfolioUpdateHandler = handler;
        }
        return jest.fn();
      });

      // Act
      render(<PortfolioOverview />);

      await waitFor(() => {
        expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      });

      // Simulate WebSocket update
      portfolioUpdateHandler({
        totalValue: 52500.00,
        change24hPercent: 3.2,
        change24hValue: 1625.00,
        activeBots: 4,
        totalBots: 5,
        totalPnL: 5500.00,
        winRate: 68.0
      });

      // Assert - Updated values
      await waitFor(() => {
        expect(screen.getByText('$52,500.00')).toBeInTheDocument();
        expect(screen.getByText(/\+3.20% today/)).toBeInTheDocument();
        expect(screen.getByText('4 / 5')).toBeInTheDocument();
        expect(screen.getByText('+$5,500.00')).toBeInTheDocument();
      });
    });

    test('should not subscribe when WebSocket is disconnected', () => {
      // Arrange
      mockWebSocketContext.connected = false;

      // Act
      render(<PortfolioOverview />);

      // Assert
      expect(mockWebSocketContext.subscribe).not.toHaveBeenCalled();
    });

    test('should unsubscribe on component unmount', async () => {
      // Arrange
      const mockUnsubscribe = jest.fn();
      mockWebSocketContext.subscribe.mockReturnValue(mockUnsubscribe);

      // Act
      const { unmount } = render(<PortfolioOverview />);

      await waitFor(() => {
        expect(mockWebSocketContext.subscribe).toHaveBeenCalled();
      });

      unmount();

      // Assert
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    test('should handle WebSocket reconnection gracefully', async () => {
      // Arrange
      const { rerender } = render(<PortfolioOverview />);

      // Simulate disconnection
      mockWebSocketContext.connected = false;
      rerender(<PortfolioOverview />);

      // Simulate reconnection
      mockWebSocketContext.connected = true;
      rerender(<PortfolioOverview />);

      // Assert - Should resubscribe
      await waitFor(() => {
        expect(mockWebSocketContext.subscribe).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle API fetch errors', async () => {
      // Arrange
      global.fetch.mockRejectedValue(new Error('Network error'));
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to fetch portfolio data:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });

    test('should display fallback values when API fails', async () => {
      // Arrange
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('$0.00')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('region', { name: 'Key Performance Indicators' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Quick Actions' })).toBeInTheDocument();
      });
    });

    test('should announce portfolio value changes via aria-live', async () => {
      // Arrange & Act
      render(<PortfolioOverview />);

      // Assert
      await waitFor(() => {
        const valueElement = screen.getByText('$50,000.00');
        expect(valueElement.closest('[aria-live="polite"]')).toBeInTheDocument();
      });
    });
  });
});
```

---

#### Test File: `tests/unit/dashboard/components/TradeNotifications.test.jsx`

**Purpose:** Test trade notification toast system

**Test Cases:**
```javascript
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeNotifications } from '@/components/TradeNotifications';

// Mock WebSocket context
const mockWebSocketContext = {
  connected: true,
  subscribe: jest.fn(),
  emit: jest.fn()
};

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocketContext: () => mockWebSocketContext
}));

describe('TradeNotifications Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Subscription Management', () => {
    test('should subscribe to trade:executed and trade:failed on mount', () => {
      // Arrange & Act
      render(<TradeNotifications />);

      // Assert
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'trade:executed',
        expect.any(Function)
      );
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'trade:failed',
        expect.any(Function)
      );
    });

    test('should unsubscribe on unmount', () => {
      // Arrange
      const mockUnsubscribeExecuted = jest.fn();
      const mockUnsubscribeFailed = jest.fn();

      mockWebSocketContext.subscribe.mockImplementation((event) => {
        if (event === 'trade:executed') return mockUnsubscribeExecuted;
        if (event === 'trade:failed') return mockUnsubscribeFailed;
      });

      // Act
      const { unmount } = render(<TradeNotifications />);
      unmount();

      // Assert
      expect(mockUnsubscribeExecuted).toHaveBeenCalled();
      expect(mockUnsubscribeFailed).toHaveBeenCalled();
    });
  });

  describe('Trade Executed Notifications', () => {
    test('should display success notification for executed trade', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeExecutedHandler({
          orderId: 'order-123',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175.50,
          profit: 25.75
        });
      });

      // Assert
      expect(screen.getByText('Trade Executed')).toBeInTheDocument();
      expect(screen.getByText('BUY 10 AAPL @ $175.50')).toBeInTheDocument();
      expect(screen.getByText(/P&L: \+\$25.75/)).toBeInTheDocument();
      expect(screen.getByText('✓ Success')).toBeInTheDocument();
    });

    test('should display notification with correct styling for profit', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeExecutedHandler({
          symbol: 'TSLA',
          side: 'sell',
          quantity: 5,
          price: 250.00,
          profit: 125.50
        });
      });

      // Assert
      const notification = screen.getByRole('alert');
      expect(notification).toHaveClass('bg-green-950/90');
      expect(notification).toHaveClass('border-green-600');
    });

    test('should auto-dismiss notification after 5 seconds', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeExecutedHandler({
          symbol: 'NVDA',
          side: 'buy',
          quantity: 20,
          price: 500.00
        });
      });

      // Assert - Notification visible
      expect(screen.getByText('Trade Executed')).toBeInTheDocument();

      // Advance timers to trigger auto-dismiss
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Assert - Notification removed
      expect(screen.queryByText('Trade Executed')).not.toBeInTheDocument();
    });
  });

  describe('Trade Failed Notifications', () => {
    test('should display error notification for failed trade', () => {
      // Arrange
      let tradeFailedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:failed') {
          tradeFailedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeFailedHandler({
          orderId: 'order-456',
          symbol: 'MSFT',
          reason: 'Insufficient funds',
          timestamp: Date.now()
        });
      });

      // Assert
      expect(screen.getByText('Trade Failed')).toBeInTheDocument();
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
      expect(screen.getByText('✗ Failed')).toBeInTheDocument();
    });

    test('should display notification with error styling', () => {
      // Arrange
      let tradeFailedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:failed') {
          tradeFailedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeFailedHandler({
          symbol: 'GOOG',
          reason: 'Order rejected'
        });
      });

      // Assert
      const notification = screen.getByRole('alert');
      expect(notification).toHaveClass('bg-red-950/90');
      expect(notification).toHaveClass('border-red-600');
    });
  });

  describe('Manual Dismiss', () => {
    test('should allow manual dismissal of notifications', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      act(() => {
        tradeExecutedHandler({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175.00
        });
      });

      // Assert - Notification visible
      expect(screen.getByText('Trade Executed')).toBeInTheDocument();

      // Act - Click dismiss button
      const dismissButton = screen.getByRole('button', { name: 'Dismiss notification' });
      await act(async () => {
        await user.click(dismissButton);
      });

      // Assert - Notification removed
      expect(screen.queryByText('Trade Executed')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Notifications', () => {
    test('should display multiple notifications in queue', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act - Add 3 notifications
      act(() => {
        tradeExecutedHandler({ symbol: 'AAPL', side: 'buy', quantity: 10, price: 175.00 });
        tradeExecutedHandler({ symbol: 'TSLA', side: 'sell', quantity: 5, price: 250.00 });
        tradeExecutedHandler({ symbol: 'NVDA', side: 'buy', quantity: 20, price: 500.00 });
      });

      // Assert - All notifications visible
      expect(screen.getByText(/AAPL/)).toBeInTheDocument();
      expect(screen.getByText(/TSLA/)).toBeInTheDocument();
      expect(screen.getByText(/NVDA/)).toBeInTheDocument();
    });

    test('should stack notifications with most recent on top', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeExecutedHandler({ symbol: 'FIRST', side: 'buy', quantity: 1, price: 100 });
        tradeExecutedHandler({ symbol: 'SECOND', side: 'buy', quantity: 1, price: 100 });
      });

      // Assert - SECOND should appear first in DOM
      const notifications = screen.getAllByRole('alert');
      expect(notifications[0]).toHaveTextContent('SECOND');
      expect(notifications[1]).toHaveTextContent('FIRST');
    });
  });

  describe('No Notifications State', () => {
    test('should render nothing when no notifications', () => {
      // Arrange & Act
      const { container } = render(<TradeNotifications />);

      // Assert
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA attributes', () => {
      // Arrange
      let tradeExecutedHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'trade:executed') {
          tradeExecutedHandler = handler;
        }
        return jest.fn();
      });

      render(<TradeNotifications />);

      // Act
      act(() => {
        tradeExecutedHandler({
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175.00
        });
      });

      // Assert
      const notificationRegion = screen.getByRole('region', { name: 'Trade notifications' });
      expect(notificationRegion).toHaveAttribute('aria-live', 'polite');
      expect(notificationRegion).toHaveAttribute('aria-atomic', 'false');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-labelledby');
      expect(alert).toHaveAttribute('aria-describedby');
    });
  });
});
```

---

#### Test File: `tests/unit/dashboard/components/LiveWatchlist.test.jsx`

**Purpose:** Test live quote updates and watchlist management

**Test Cases:**
```javascript
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveWatchlist } from '@/components/LiveWatchlist';

// Mock WebSocket context
const mockWebSocketContext = {
  connected: true,
  subscribe: jest.fn(),
  emit: jest.fn()
};

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocketContext: () => mockWebSocketContext
}));

describe('LiveWatchlist Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Render', () => {
    test('should render default watchlist symbols', () => {
      // Arrange & Act
      render(<LiveWatchlist />);

      // Assert
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });

    test('should show loading state for quotes initially', () => {
      // Arrange & Act
      render(<LiveWatchlist />);

      // Assert
      const loadingElements = screen.getAllByText('Loading...');
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    test('should emit subscribe:quote for each watchlist symbol', () => {
      // Arrange & Act
      render(<LiveWatchlist />);

      // Assert
      expect(mockWebSocketContext.emit).toHaveBeenCalledWith('subscribe:quote',
        { symbol: 'AAPL' }
      );
      expect(mockWebSocketContext.emit).toHaveBeenCalledWith('subscribe:quote',
        { symbol: 'TSLA' }
      );
      expect(mockWebSocketContext.emit).toHaveBeenCalledWith('subscribe:quote',
        { symbol: 'NVDA' }
      );
      expect(mockWebSocketContext.emit).toHaveBeenCalledWith('subscribe:quote',
        { symbol: 'MSFT' }
      );
    });
  });

  describe('Real-Time Quote Updates', () => {
    test('should update quote when receiving WebSocket event', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Act
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 175.50,
          change: 2.75,
          changePercent: 1.59,
          volume: 52341789,
          timestamp: Date.now()
        });
      });

      // Assert
      expect(screen.getByText('$175.50')).toBeInTheDocument();
      expect(screen.getByText(/▲ 1.59%/)).toBeInTheDocument();
      expect(screen.getByText(/Vol: 52,341,789/)).toBeInTheDocument();
    });

    test('should apply green animation for price increase', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Set initial price
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 175.00,
          change: 0,
          changePercent: 0,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Act - Price increases
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 176.00,
          change: 1.00,
          changePercent: 0.57,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Assert - Green background applied
      const quoteElement = screen.getByText('AAPL').closest('div[role="article"]');
      expect(quoteElement).toHaveClass('bg-profit-bg');
      expect(quoteElement).toHaveClass('border-profit-border');

      // Assert - Animation clears after 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(quoteElement).not.toHaveClass('bg-profit-bg');
    });

    test('should apply red animation for price decrease', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Set initial price
      act(() => {
        quoteUpdateHandler({
          symbol: 'TSLA',
          price: 250.00,
          change: 0,
          changePercent: 0,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Act - Price decreases
      act(() => {
        quoteUpdateHandler({
          symbol: 'TSLA',
          price: 245.00,
          change: -5.00,
          changePercent: -2.0,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Assert
      const quoteElement = screen.getByText('TSLA').closest('div[role="article"]');
      expect(quoteElement).toHaveClass('bg-loss-bg');
      expect(quoteElement).toHaveClass('border-loss-border');
    });

    test('should display change badge with correct styling', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Act - Positive change
      act(() => {
        quoteUpdateHandler({
          symbol: 'NVDA',
          price: 500.00,
          change: 25.50,
          changePercent: 5.37,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Assert
      const changeBadge = screen.getByText(/▲ 5.37%/);
      expect(changeBadge).toHaveClass('variant-profit');
    });
  });

  describe('Symbol Management', () => {
    test('should add new symbol to watchlist', async () => {
      // Note: This test assumes an "Add Symbol" UI exists
      // Adjust based on actual implementation

      // Arrange
      const user = userEvent.setup({ delay: null });
      const { rerender } = render(<LiveWatchlist />);

      // Act - Simulate adding a symbol (implementation-specific)
      // This would involve clicking "Add Symbol" button and entering data
      // For now, we'll test the underlying function if exposed

      // Assert
      // Verify symbol appears in list
      // Verify subscribe:quote was emitted
    });

    test('should remove symbol from watchlist', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      render(<LiveWatchlist />);

      // Act - Click remove button for AAPL
      const removeButtons = screen.getAllByRole('button', { name: /Remove .* from watchlist/ });
      await act(async () => {
        await user.click(removeButtons[0]);
      });

      // Assert
      expect(mockWebSocketContext.emit).toHaveBeenCalledWith('unsubscribe:quote',
        { symbol: 'AAPL' }
      );

      await waitFor(() => {
        expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
      });
    });
  });

  describe('Cleanup on Unmount', () => {
    test('should clear all price change timeouts on unmount', () => {
      // Arrange
      let quoteUpdateHandler;
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      const { unmount } = render(<LiveWatchlist />);

      // Trigger some price changes
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 175.00,
          change: 1.00,
          changePercent: 0.57,
          volume: 1000000,
          timestamp: Date.now()
        });
      });

      // Act
      unmount();

      // Assert
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Connection Status', () => {
    test('should display reconnecting message when disconnected', () => {
      // Arrange
      mockWebSocketContext.connected = false;

      // Act
      render(<LiveWatchlist />);

      // Assert
      expect(screen.getByText(/Not connected to live quotes. Reconnecting.../)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels for quotes', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Act
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 175.50,
          change: 2.75,
          changePercent: 1.59,
          volume: 52341789,
          timestamp: Date.now()
        });
      });

      // Assert
      const quoteArticle = screen.getByRole('article', { name: 'AAPL quote' });
      expect(quoteArticle).toBeInTheDocument();
    });

    test('should announce price changes via aria-live', () => {
      // Arrange
      let quoteUpdateHandler;
      mockWebSocketContext.subscribe.mockImplementation((event, handler) => {
        if (event === 'quote:update') {
          quoteUpdateHandler = handler;
        }
        return jest.fn();
      });

      render(<LiveWatchlist />);

      // Act
      act(() => {
        quoteUpdateHandler({
          symbol: 'AAPL',
          price: 175.50,
          change: 2.75,
          changePercent: 1.59,
          volume: 52341789,
          timestamp: Date.now()
        });
      });

      // Assert
      const priceElement = screen.getByText('$175.50');
      expect(priceElement.closest('[aria-live="polite"]')).toBeInTheDocument();
    });
  });
});
```

---

### 2.3 WebSocket Hook (useWebSocket)

#### Test File: `tests/unit/dashboard/hooks/useWebSocket.test.js`

**Purpose:** Test custom WebSocket React hook

**Test Cases:**
```javascript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { io } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('useWebSocket Hook', () => {
  let mockSocket;

  beforeEach(() => {
    // Create mock socket instance
    mockSocket = {
      id: 'test-socket-123',
      connected: false,
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    };

    io.mockReturnValue(mockSocket);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should connect automatically when sessionID is provided', () => {
      // Arrange & Act
      renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc',
        autoConnect: true
      }));

      // Assert
      expect(io).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          auth: {
            sessionID: 'session-123',
            userId: 'user-abc',
            userName: 'User'
          },
          transports: ['websocket', 'polling'],
          reconnection: true
        })
      );
    });

    test('should not connect without sessionID', () => {
      // Arrange & Act
      const { result } = renderHook(() => useWebSocket({
        autoConnect: true
      }));

      // Assert
      expect(io).not.toHaveBeenCalled();
      expect(result.current.connected).toBe(false);
      expect(result.current.error).toBe('Authentication required');
    });

    test('should not auto-connect when autoConnect is false', () => {
      // Arrange & Act
      renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc',
        autoConnect: false
      }));

      // Assert
      expect(io).not.toHaveBeenCalled();
    });
  });

  describe('Connection Management', () => {
    test('should update connected state on connect event', async () => {
      // Arrange
      let connectHandler;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
      });

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        mockSocket.connected = true;
        connectHandler();
      });

      // Assert
      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });
      expect(result.current.error).toBeNull();
      expect(result.current.reconnectAttempt).toBe(0);
    });

    test('should handle connection errors', async () => {
      // Arrange
      let connectErrorHandler;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'connect_error') {
          connectErrorHandler = handler;
        }
      });

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        connectErrorHandler(new Error('Connection refused'));
      });

      // Assert
      await waitFor(() => {
        expect(result.current.connected).toBe(false);
      });
      expect(result.current.error).toBe('Connection refused');
      expect(result.current.reconnectAttempt).toBe(1);
    });

    test('should handle disconnect event', async () => {
      // Arrange
      let disconnectHandler;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
      });

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        disconnectHandler('transport close');
      });

      // Assert
      await waitFor(() => {
        expect(result.current.connected).toBe(false);
      });
    });

    test('should attempt reconnection on server disconnect', async () => {
      // Arrange
      jest.useFakeTimers();
      let disconnectHandler;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
      });

      renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        disconnectHandler('io server disconnect');
      });

      // Advance timer to trigger reconnect
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Assert
      expect(mockSocket.connect).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Event Subscription', () => {
    test('should subscribe to custom events', () => {
      // Arrange
      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      const mockHandler = jest.fn();

      // Act
      act(() => {
        result.current.subscribe('portfolio:update', mockHandler);
      });

      // Assert
      expect(mockSocket.on).toHaveBeenCalledWith('portfolio:update', mockHandler);
    });

    test('should return unsubscribe function', () => {
      // Arrange
      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      const mockHandler = jest.fn();

      // Act
      let unsubscribe;
      act(() => {
        unsubscribe = result.current.subscribe('trade:executed', mockHandler);
      });

      act(() => {
        unsubscribe();
      });

      // Assert
      expect(mockSocket.off).toHaveBeenCalledWith('trade:executed', mockHandler);
    });

    test('should handle subscription when socket not connected', () => {
      // Arrange
      const { result } = renderHook(() => useWebSocket({
        autoConnect: false
      }));

      const mockHandler = jest.fn();

      // Act
      let unsubscribe;
      act(() => {
        unsubscribe = result.current.subscribe('test:event', mockHandler);
      });

      // Assert - Should return no-op function
      expect(typeof unsubscribe).toBe('function');
      expect(mockSocket.on).not.toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    test('should emit events when connected', () => {
      // Arrange
      mockSocket.connected = true;

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        result.current.emit('subscribe:portfolio', { userId: 'user-abc' });
      });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:portfolio',
        { userId: 'user-abc' }
      );
    });

    test('should not emit events when disconnected', () => {
      // Arrange
      mockSocket.connected = false;

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      act(() => {
        result.current.emit('test:event', {});
      });

      // Assert
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot emit test:event')
      );

      consoleWarn.mockRestore();
    });
  });

  describe('Cleanup', () => {
    test('should disconnect on unmount', () => {
      // Arrange
      const { unmount } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      unmount();

      // Assert
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    test('should clear reconnect timeout on unmount', () => {
      // Arrange
      jest.useFakeTimers();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const { unmount } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      unmount();

      // Assert
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Convenience Methods', () => {
    test('should emit subscribe:portfolio event', () => {
      // Arrange
      mockSocket.connected = true;

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        result.current.subscribeToPortfolio();
      });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:portfolio');
    });

    test('should emit subscribe:trades event', () => {
      // Arrange
      mockSocket.connected = true;

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        result.current.subscribeToTrades();
      });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:trades');
    });

    test('should emit subscribe:watchlist with symbols', () => {
      // Arrange
      mockSocket.connected = true;

      const { result } = renderHook(() => useWebSocket({
        sessionID: 'session-123',
        userId: 'user-abc'
      }));

      // Act
      act(() => {
        result.current.subscribeToWatchlist(['AAPL', 'TSLA', 'NVDA']);
      });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:watchlist',
        ['AAPL', 'TSLA', 'NVDA']
      );
    });
  });
});
```

---

## 3. Integration Tests

### 3.1 WebSocket Event Flows

#### Test File: `tests/integration/websocket-portfolio.test.js`

**Purpose:** End-to-end WebSocket portfolio update flow

**Test Setup:**
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { io as Client } = require('socket.io-client');
const request = require('supertest');

describe('WebSocket Portfolio Integration', () => {
  let app;
  let server;
  let ioServer;
  let serverSocket;
  let clientSocket;
  let httpServer;

  beforeAll((done) => {
    // Create Express app
    app = express();
    httpServer = http.createServer(app);

    // Create Socket.IO server
    ioServer = new Server(httpServer, {
      cors: { origin: '*' }
    });

    // Handle connection
    ioServer.on('connection', (socket) => {
      serverSocket = socket;
      console.log('Server: Client connected', socket.id);

      // Handle portfolio subscription
      socket.on('subscribe:portfolio', () => {
        socket.join(`user:${socket.handshake.auth.userId}`);
        console.log('Server: Subscribed to portfolio updates');
      });

      // Simulate portfolio update emission
      socket.on('trigger:portfolio:update', (data) => {
        ioServer.to(`user:${socket.handshake.auth.userId}`).emit('portfolio:update', data);
      });
    });

    // Start server
    httpServer.listen(0, () => {
      const port = httpServer.address().port;

      // Create client connection
      clientSocket = Client(`http://localhost:${port}`, {
        auth: {
          sessionID: 'test-session-123',
          userId: 'test-user-abc',
          userName: 'Test User'
        }
      });

      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    ioServer.close();
    httpServer.close();
    clientSocket.close();
  });

  describe('Portfolio Update Flow', () => {
    test('should receive portfolio update after subscription', (done) => {
      // Arrange
      const expectedUpdate = {
        totalValue: 50000.00,
        change24hPercent: 2.5,
        change24hValue: 1250.00,
        activeBots: 3,
        totalBots: 5,
        totalPnL: 5000.00,
        winRate: 65.5,
        timestamp: Date.now()
      };

      // Act - Subscribe to portfolio updates
      clientSocket.emit('subscribe:portfolio');

      // Listen for update
      clientSocket.on('portfolio:update', (data) => {
        // Assert
        expect(data).toMatchObject({
          totalValue: expectedUpdate.totalValue,
          change24hPercent: expectedUpdate.change24hPercent,
          activeBots: expectedUpdate.activeBots
        });
        done();
      });

      // Trigger update from server
      setTimeout(() => {
        clientSocket.emit('trigger:portfolio:update', expectedUpdate);
      }, 100);
    });

    test('should handle multiple portfolio updates', (done) => {
      // Arrange
      const updates = [];
      let updateCount = 0;

      clientSocket.on('portfolio:update', (data) => {
        updates.push(data);
        updateCount++;

        if (updateCount === 3) {
          // Assert - All updates received
          expect(updates).toHaveLength(3);
          expect(updates[0].totalValue).toBe(50000);
          expect(updates[1].totalValue).toBe(51000);
          expect(updates[2].totalValue).toBe(52000);
          done();
        }
      });

      // Act - Send 3 updates
      clientSocket.emit('subscribe:portfolio');

      setTimeout(() => {
        clientSocket.emit('trigger:portfolio:update', {
          totalValue: 50000,
          timestamp: Date.now()
        });
      }, 100);

      setTimeout(() => {
        clientSocket.emit('trigger:portfolio:update', {
          totalValue: 51000,
          timestamp: Date.now()
        });
      }, 200);

      setTimeout(() => {
        clientSocket.emit('trigger:portfolio:update', {
          totalValue: 52000,
          timestamp: Date.now()
        });
      }, 300);
    });

    test('should not receive updates before subscription', (done) => {
      // Arrange
      let updateReceived = false;

      const newClient = Client(`http://localhost:${httpServer.address().port}`, {
        auth: {
          sessionID: 'test-session-456',
          userId: 'test-user-xyz',
          userName: 'Test User 2'
        }
      });

      newClient.on('portfolio:update', () => {
        updateReceived = true;
      });

      // Act - Emit update WITHOUT subscription
      setTimeout(() => {
        serverSocket.to('user:test-user-xyz').emit('portfolio:update', {
          totalValue: 100000,
          timestamp: Date.now()
        });
      }, 100);

      // Assert - Should not receive update
      setTimeout(() => {
        expect(updateReceived).toBe(false);
        newClient.close();
        done();
      }, 500);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed update data gracefully', (done) => {
      // Arrange
      clientSocket.on('error', (error) => {
        // Should not receive error for malformed data
        // Server should validate and reject
        done(new Error('Should not emit error to client'));
      });

      clientSocket.on('portfolio:update', (data) => {
        // If received, data should be validated/sanitized
        expect(data).toBeDefined();
        done();
      });

      // Act - Send malformed data
      clientSocket.emit('trigger:portfolio:update', {
        totalValue: 'invalid-number',
        activeBots: null
      });

      // Assert - Should either reject or sanitize
      setTimeout(() => {
        done(); // No error occurred
      }, 500);
    });
  });

  describe('Connection Stability', () => {
    test('should reconnect and resubscribe after disconnect', (done) => {
      // Arrange
      let reconnectCount = 0;
      let updateReceived = false;

      const testClient = Client(`http://localhost:${httpServer.address().port}`, {
        auth: {
          sessionID: 'test-reconnect',
          userId: 'user-reconnect',
          userName: 'Reconnect Test'
        }
      });

      testClient.on('connect', () => {
        reconnectCount++;

        if (reconnectCount === 1) {
          // First connection - subscribe and disconnect
          testClient.emit('subscribe:portfolio');
          setTimeout(() => {
            testClient.disconnect();
          }, 100);
        } else if (reconnectCount === 2) {
          // Reconnected - resubscribe
          testClient.emit('subscribe:portfolio');
        }
      });

      testClient.on('disconnect', () => {
        // Reconnect
        setTimeout(() => {
          testClient.connect();
        }, 100);
      });

      testClient.on('portfolio:update', (data) => {
        updateReceived = true;
        expect(data.totalValue).toBe(75000);
        testClient.close();
        done();
      });

      // Wait for reconnection and send update
      setTimeout(() => {
        ioServer.to('user:user-reconnect').emit('portfolio:update', {
          totalValue: 75000,
          timestamp: Date.now()
        });
      }, 1000);
    });
  });
});
```

---

#### Test File: `tests/integration/websocket-trades.test.js`

**Purpose:** Trade notification integration tests

**Test Cases:**
```javascript
const { Server } = require('socket.io');
const { io as Client } = require('socket.io-client');
const http = require('http');

describe('WebSocket Trade Notifications Integration', () => {
  let httpServer;
  let ioServer;
  let clientSocket;

  beforeAll((done) => {
    httpServer = http.createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' } });

    ioServer.on('connection', (socket) => {
      // Subscribe to trades
      socket.on('subscribe:trades', () => {
        socket.join(`user:${socket.handshake.auth.userId}`);
      });

      // Simulate trade execution
      socket.on('trigger:trade:executed', (data) => {
        ioServer.to(`user:${socket.handshake.auth.userId}`).emit('trade:executed', data);
      });

      // Simulate trade failure
      socket.on('trigger:trade:failed', (data) => {
        ioServer.to(`user:${socket.handshake.auth.userId}`).emit('trade:failed', data);
      });
    });

    httpServer.listen(0, () => {
      const port = httpServer.address().port;
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { sessionID: 'session-123', userId: 'user-abc', userName: 'Test' }
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    ioServer.close();
    httpServer.close();
    clientSocket.close();
  });

  describe('Trade Executed Notifications', () => {
    test('should receive trade:executed event with complete data', (done) => {
      // Arrange
      const tradeData = {
        orderId: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        price: 175.50,
        profit: 25.75,
        timestamp: Date.now()
      };

      // Act
      clientSocket.emit('subscribe:trades');

      clientSocket.on('trade:executed', (data) => {
        // Assert
        expect(data).toMatchObject({
          orderId: tradeData.orderId,
          symbol: tradeData.symbol,
          side: tradeData.side,
          quantity: tradeData.quantity,
          price: tradeData.price,
          profit: tradeData.profit
        });
        done();
      });

      setTimeout(() => {
        clientSocket.emit('trigger:trade:executed', tradeData);
      }, 100);
    });

    test('should receive multiple trade notifications in sequence', (done) => {
      // Arrange
      const trades = [];
      let count = 0;

      clientSocket.on('trade:executed', (data) => {
        trades.push(data);
        count++;

        if (count === 3) {
          // Assert
          expect(trades).toHaveLength(3);
          expect(trades[0].symbol).toBe('AAPL');
          expect(trades[1].symbol).toBe('TSLA');
          expect(trades[2].symbol).toBe('NVDA');
          done();
        }
      });

      // Act
      clientSocket.emit('subscribe:trades');

      setTimeout(() => {
        clientSocket.emit('trigger:trade:executed', {
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175
        });
      }, 100);

      setTimeout(() => {
        clientSocket.emit('trigger:trade:executed', {
          symbol: 'TSLA',
          side: 'sell',
          quantity: 5,
          price: 250
        });
      }, 200);

      setTimeout(() => {
        clientSocket.emit('trigger:trade:executed', {
          symbol: 'NVDA',
          side: 'buy',
          quantity: 20,
          price: 500
        });
      }, 300);
    });
  });

  describe('Trade Failed Notifications', () => {
    test('should receive trade:failed event with error reason', (done) => {
      // Arrange
      const failureData = {
        orderId: 'order-456',
        symbol: 'MSFT',
        reason: 'Insufficient funds',
        timestamp: Date.now()
      };

      // Act
      clientSocket.emit('subscribe:trades');

      clientSocket.on('trade:failed', (data) => {
        // Assert
        expect(data).toMatchObject({
          orderId: failureData.orderId,
          symbol: failureData.symbol,
          reason: failureData.reason
        });
        done();
      });

      setTimeout(() => {
        clientSocket.emit('trigger:trade:failed', failureData);
      }, 100);
    });
  });
});
```

---

#### Test File: `tests/integration/websocket-quotes.test.js`

**Purpose:** Live quote update integration tests

**Test Cases:**
```javascript
describe('WebSocket Quote Updates Integration', () => {
  // Similar setup as previous integration tests

  describe('Quote Subscription', () => {
    test('should subscribe to quote updates for specific symbol', (done) => {
      // Test symbol subscription
    });

    test('should receive quote:update events after subscription', (done) => {
      // Test quote updates
    });

    test('should handle quote unsubscription', (done) => {
      // Test unsubscription
    });

    test('should debounce rapid quote updates', (done) => {
      // Test debouncing logic
    });
  });
});
```

---

## 4. End-to-End Tests

### 4.1 Complete User Journeys

#### Test File: `tests/e2e/real-time-features.spec.js`

**Purpose:** Playwright E2E tests for real-time features

**Test Scenarios:**
```javascript
const { test, expect } = require('@playwright/test');

test.describe('Real-Time Portfolio Updates', () => {
  test('should display real-time portfolio value updates', async ({ page }) => {
    // 1. Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');

    // 2. Wait for initial load
    await page.waitForSelector('[data-testid="portfolio-value"]');

    // 3. Get initial value
    const initialValue = await page.textContent('[data-testid="portfolio-value"]');

    // 4. Trigger backend event to simulate portfolio update
    // (This would require test API endpoint to emit WebSocket events)

    // 5. Wait for value to update
    await page.waitForFunction(
      (expectedValue) => {
        const element = document.querySelector('[data-testid="portfolio-value"]');
        return element && element.textContent !== expectedValue;
      },
      initialValue,
      { timeout: 5000 }
    );

    // 6. Verify new value displayed
    const updatedValue = await page.textContent('[data-testid="portfolio-value"]');
    expect(updatedValue).not.toBe(initialValue);
  });

  test('should show connection status indicator', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    // Verify connection indicator is present
    const statusIndicator = await page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toBeVisible();

    // Verify shows "connected" state
    await expect(statusIndicator).toContainText('Connected');
  });
});

test.describe('Trade Notifications', () => {
  test('should display toast notification for executed trade', async ({ page }) => {
    // 1. Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');

    // 2. Trigger trade execution via test endpoint
    await page.evaluate(() => {
      // Simulate WebSocket event
      window.dispatchEvent(new CustomEvent('test:trade:executed', {
        detail: {
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175.50
        }
      }));
    });

    // 3. Verify toast appears
    const toast = page.locator('[role="alert"]').first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Trade Executed');
    await expect(toast).toContainText('AAPL');

    // 4. Verify auto-dismiss after 5 seconds
    await page.waitForTimeout(5500);
    await expect(toast).not.toBeVisible();
  });

  test('should allow manual dismissal of notifications', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    // Trigger notification
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:trade:executed', {
        detail: { symbol: 'TSLA', side: 'sell', quantity: 5, price: 250 }
      }));
    });

    // Click dismiss button
    const dismissButton = page.locator('[aria-label="Dismiss notification"]').first();
    await dismissButton.click();

    // Verify notification removed
    const toast = page.locator('[role="alert"]').first();
    await expect(toast).not.toBeVisible();
  });
});

test.describe('Live Watchlist', () => {
  test('should update quote prices in real-time', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    // Wait for watchlist to load
    await page.waitForSelector('[data-testid="watchlist"]');

    // Get initial AAPL price
    const initialPrice = await page.textContent('[data-symbol="AAPL"] [data-testid="price"]');

    // Simulate quote update
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:quote:update', {
        detail: {
          symbol: 'AAPL',
          price: 176.00,
          change: 1.50,
          changePercent: 0.86
        }
      }));
    });

    // Wait for price update
    await page.waitForFunction(
      (oldPrice) => {
        const element = document.querySelector('[data-symbol="AAPL"] [data-testid="price"]');
        return element && element.textContent !== oldPrice;
      },
      initialPrice
    );

    // Verify new price
    const updatedPrice = await page.textContent('[data-symbol="AAPL"] [data-testid="price"]');
    expect(updatedPrice).toBe('$176.00');
  });

  test('should show visual feedback for price changes', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    // Trigger price increase
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:quote:update', {
        detail: { symbol: 'AAPL', price: 180.00, change: 5.00, changePercent: 2.86 }
      }));
    });

    // Verify green background animation
    const quoteCard = page.locator('[data-symbol="AAPL"]');
    await expect(quoteCard).toHaveClass(/bg-profit-bg/);

    // Wait for animation to clear
    await page.waitForTimeout(1100);
    await expect(quoteCard).not.toHaveClass(/bg-profit-bg/);
  });
});

test.describe('Performance', () => {
  test('should handle rapid WebSocket updates without lag', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');

    const startTime = Date.now();

    // Send 50 rapid updates
    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        window.dispatchEvent(new CustomEvent('test:portfolio:update', {
          detail: {
            totalValue: 50000 + (i * 100),
            timestamp: Date.now()
          }
        }));
      }
    });

    // Wait for updates to process
    await page.waitForTimeout(500);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Should process in < 1 second
    expect(processingTime).toBeLessThan(1000);
  });
});
```

---

## 5. Test Data Fixtures

### 5.1 Mock Portfolio Data

**File:** `tests/fixtures/portfolio.js`

```javascript
module.exports = {
  portfolioUpdateEvent: {
    totalValue: 50000.00,
    change24hPercent: 2.5,
    change24hValue: 1250.00,
    activeBots: 3,
    totalBots: 5,
    totalPnL: 5000.00,
    winRate: 65.5,
    timestamp: Date.now()
  },

  portfolioApiResponse: {
    success: true,
    portfolio: {
      totalValue: 50000.00,
      change24hPercent: 2.5,
      change24hValue: 1250.00
    },
    performance: {
      totalPnL: 5000.00,
      winRate: 65.5
    },
    bots: {
      active: 3,
      total: 5,
      status: 'running'
    }
  },

  portfolioLossScenario: {
    totalValue: 48000.00,
    change24hPercent: -4.0,
    change24hValue: -2000.00,
    activeBots: 2,
    totalBots: 5,
    totalPnL: -2000.00,
    winRate: 45.0,
    timestamp: Date.now()
  }
};
```

---

### 5.2 Mock Trade Events

**File:** `tests/fixtures/trades.js`

```javascript
module.exports = {
  tradeExecutedEvent: {
    orderId: 'order-abc-123',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 10,
    price: 175.50,
    profit: 25.75,
    timestamp: Date.now(),
    userId: 'user-test-123'
  },

  tradeFailedEvent: {
    orderId: 'order-xyz-456',
    symbol: 'TSLA',
    side: 'sell',
    quantity: 5,
    reason: 'Insufficient funds',
    timestamp: Date.now(),
    userId: 'user-test-123'
  },

  multipleTrades: [
    {
      orderId: 'order-001',
      symbol: 'AAPL',
      side: 'buy',
      quantity: 10,
      price: 175.00,
      profit: 50.00,
      timestamp: Date.now()
    },
    {
      orderId: 'order-002',
      symbol: 'TSLA',
      side: 'sell',
      quantity: 5,
      price: 250.00,
      profit: -25.00,
      timestamp: Date.now() + 1000
    },
    {
      orderId: 'order-003',
      symbol: 'NVDA',
      side: 'buy',
      quantity: 20,
      price: 500.00,
      profit: 200.00,
      timestamp: Date.now() + 2000
    }
  ]
};
```

---

### 5.3 Mock Market Quotes

**File:** `tests/fixtures/quotes.js`

```javascript
module.exports = {
  quoteUpdateEvent: {
    symbol: 'AAPL',
    price: 175.50,
    change: 2.75,
    changePercent: 1.59,
    volume: 52341789,
    timestamp: Date.now()
  },

  watchlistQuotes: {
    AAPL: {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 175.50,
      change: 2.75,
      changePercent: 1.59,
      volume: 52341789,
      timestamp: Date.now()
    },
    TSLA: {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      price: 250.00,
      change: -5.00,
      changePercent: -2.0,
      volume: 85321456,
      timestamp: Date.now()
    },
    NVDA: {
      symbol: 'NVDA',
      name: 'NVIDIA Corp.',
      price: 500.00,
      change: 25.50,
      changePercent: 5.37,
      volume: 45678912,
      timestamp: Date.now()
    },
    MSFT: {
      symbol: 'MSFT',
      name: 'Microsoft Corp.',
      price: 350.00,
      change: 0.00,
      changePercent: 0.00,
      volume: 30456789,
      timestamp: Date.now()
    }
  },

  rapidQuoteUpdates: Array.from({ length: 50 }, (_, i) => ({
    symbol: 'AAPL',
    price: 175.00 + (i * 0.01),
    change: i * 0.01,
    changePercent: (i * 0.01 / 175.00) * 100,
    volume: 52000000 + (i * 1000),
    timestamp: Date.now() + (i * 10)
  }))
};
```

---

## 6. Performance Tests

### 6.1 WebSocket Latency Tests

**File:** `tests/performance/websocket-latency.test.js`

```javascript
const { io: Client } = require('socket.io-client');

describe('WebSocket Performance Tests', () => {
  let clientSocket;

  beforeAll((done) => {
    clientSocket = Client('http://localhost:3000', {
      auth: { sessionID: 'perf-test', userId: 'perf-user' }
    });
    clientSocket.on('connect', done);
  });

  afterAll(() => {
    clientSocket.close();
  });

  describe('Event Latency', () => {
    test('portfolio:update should have <100ms latency', (done) => {
      const startTime = Date.now();

      clientSocket.on('portfolio:update', () => {
        const latency = Date.now() - startTime;
        expect(latency).toBeLessThan(100);
        done();
      });

      clientSocket.emit('subscribe:portfolio');
      clientSocket.emit('trigger:portfolio:update', {
        totalValue: 50000,
        timestamp: Date.now()
      });
    });

    test('quote:update should have <50ms latency', (done) => {
      const startTime = Date.now();

      clientSocket.on('quote:update', () => {
        const latency = Date.now() - startTime;
        expect(latency).toBeLessThan(50);
        done();
      });

      clientSocket.emit('trigger:quote:update', {
        symbol: 'AAPL',
        price: 175.50,
        timestamp: Date.now()
      });
    });
  });

  describe('Throughput', () => {
    test('should handle 100 events/second', (done) => {
      let receivedCount = 0;
      const totalEvents = 100;
      const startTime = Date.now();

      clientSocket.on('quote:update', () => {
        receivedCount++;

        if (receivedCount === totalEvents) {
          const duration = Date.now() - startTime;
          const eventsPerSecond = (totalEvents / duration) * 1000;

          expect(eventsPerSecond).toBeGreaterThan(100);
          done();
        }
      });

      // Send 100 events rapidly
      for (let i = 0; i < totalEvents; i++) {
        clientSocket.emit('trigger:quote:update', {
          symbol: 'AAPL',
          price: 175 + (i * 0.01),
          timestamp: Date.now()
        });
      }
    });
  });

  describe('Memory Usage', () => {
    test('should not leak memory with continuous updates', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Send 1000 updates
      for (let i = 0; i < 1000; i++) {
        clientSocket.emit('trigger:portfolio:update', {
          totalValue: 50000 + i,
          timestamp: Date.now()
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be < 10MB
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
```

---

## 7. Test Execution Strategy

### 7.1 Test Scripts (package.json)

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test",
    "test:websocket": "jest tests/unit/websocket tests/integration/websocket",
    "test:components": "jest tests/unit/dashboard/components",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:performance": "jest tests/performance"
  }
}
```

### 7.2 CI/CD Integration

**GitHub Actions Workflow:**
```yaml
name: Week 3 Track B Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22.11.0'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
```

---

## 8. Success Metrics

### 8.1 Coverage Targets

| Test Type | Target Coverage | Current Status |
|-----------|----------------|----------------|
| Server-side emitters | 90%+ | 🔄 Pending |
| React components | 85%+ | 🔄 Pending |
| WebSocket hook | 95%+ | 🔄 Pending |
| Integration flows | 85%+ | 🔄 Pending |
| E2E scenarios | 100% critical paths | 🔄 Pending |

### 8.2 Quality Gates

**All tests must pass:**
- ✅ Unit tests: >90% coverage
- ✅ Integration tests: All event flows working
- ✅ E2E tests: All user journeys complete
- ✅ Performance tests: <100ms latency maintained
- ✅ No memory leaks detected
- ✅ Accessibility tests passing

---

## 9. Implementation Timeline

**Phase 1 (Days 1-2):** Unit Tests
- Server-side WebSocket emitters
- React component tests
- WebSocket hook tests

**Phase 2 (Days 3-4):** Integration Tests
- Portfolio update flows
- Trade notification flows
- Quote update flows

**Phase 3 (Day 5):** E2E Tests
- Complete user journeys
- Performance tests
- Accessibility validation

**Phase 4 (Day 6):** CI/CD Integration
- GitHub Actions setup
- Coverage reporting
- Documentation

---

## 10. Maintenance & Best Practices

### 10.1 Test Maintenance Guidelines

1. **Keep tests isolated** - No dependencies between tests
2. **Use descriptive names** - `should update portfolio value when receiving WebSocket event`
3. **Mock external dependencies** - Always mock WebSocket connections
4. **Clean up resources** - Disconnect sockets, clear timers
5. **Test error cases** - Not just happy paths
6. **Maintain fixtures** - Keep test data centralized and DRY
7. **Review coverage regularly** - Ensure new features are tested

### 10.2 Common Patterns

**WebSocket Mock Pattern:**
```javascript
const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  disconnect: jest.fn()
};
```

**React Testing Pattern:**
```javascript
const { result } = renderHook(() => useWebSocket({ sessionID: 'test' }));
act(() => {
  result.current.subscribe('event', handler);
});
```

**Async Waiting Pattern:**
```javascript
await waitFor(() => {
  expect(screen.getByText('Expected Value')).toBeInTheDocument();
});
```

---

## 11. Known Issues & Limitations

1. **WebSocket Mock Complexity** - socket.io-client mocking can be challenging; consider using `socket.io-mock` library if needed
2. **Timing Issues** - Use `waitFor` and `act` properly to avoid flaky tests
3. **E2E Test Speed** - Playwright tests are slower; run in parallel where possible
4. **Coverage Gaps** - Lazy-loaded components may not show in coverage initially

---

## 12. Resources & References

**Documentation:**
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright](https://playwright.dev/)
- [Socket.IO Testing](https://socket.io/docs/v4/testing/)

**Project Files:**
- Test setup: `/tests/setup.js`
- Jest config: `/jest.config.js`
- Existing patterns: `/tests/integration/analytics-api.test.js`
- Component patterns: `/src/dashboard/components/`

---

## Appendix: Test File Locations

```
tests/
├── unit/
│   ├── websocket/
│   │   ├── emitters/
│   │   │   ├── portfolio.test.js       # NEW - Portfolio emitter tests
│   │   │   ├── trades.test.js          # NEW - Trade notification tests
│   │   │   └── quotes.test.js          # NEW - Quote update tests
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── PortfolioOverview.test.jsx    # NEW - Portfolio component tests
│   │   │   ├── TradeNotifications.test.jsx   # NEW - Notification component tests
│   │   │   └── LiveWatchlist.test.jsx        # NEW - Watchlist component tests
│   │   └── hooks/
│   │       └── useWebSocket.test.js          # NEW - WebSocket hook tests
├── integration/
│   ├── websocket-portfolio.test.js     # NEW - Portfolio flow integration
│   ├── websocket-trades.test.js        # NEW - Trade flow integration
│   └── websocket-quotes.test.js        # NEW - Quote flow integration
├── e2e/
│   └── real-time-features.spec.js      # NEW - Playwright E2E tests
├── performance/
│   └── websocket-latency.test.js       # NEW - Performance tests
├── fixtures/
│   ├── portfolio.js                    # NEW - Mock portfolio data
│   ├── trades.js                       # NEW - Mock trade events
│   └── quotes.js                       # NEW - Mock quote data
└── setup.js                            # EXISTING - Global test setup
```

---

**End of Test Strategy Document**

This comprehensive test strategy ensures Week 3 Track B real-time features are thoroughly tested, maintainable, and meet quality standards. All tests follow existing patterns from the 454+ passing tests in the codebase.
