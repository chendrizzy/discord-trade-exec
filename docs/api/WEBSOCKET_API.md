# WebSocket API Reference

Complete API reference for the Discord Trade Exec WebSocket server.

## Table of Contents

- [Overview](#overview)
- [Connection](#connection)
- [Authentication](#authentication)
- [Events](#events)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Best Practices](#best-practices)
- [Code Examples](#code-examples)

---

## Overview

### Base URL

**Production**: `wss://your-app.railway.app`
**Development**: `ws://localhost:3000`

### Transport Modes

- **WebSocket** (preferred): Low latency, full-duplex communication
- **Polling** (fallback): HTTP long-polling for environments where WebSocket is blocked

### Features

- ✅ Session-based authentication via MongoDB
- ✅ Real-time portfolio updates
- ✅ Live trade notifications
- ✅ Watchlist quote streaming
- ✅ Market status updates
- ✅ Admin-only events
- ✅ Subscription tier restrictions
- ✅ Redis-backed rate limiting
- ✅ Horizontal scaling support (Redis adapter)

---

## Connection

### Establishing Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://your-app.railway.app', {
  auth: {
    sessionID: 'your-session-id',
    userId: 'your-user-id'
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
```

### Connection Events

#### `connect`

Emitted when connection is established.

```javascript
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  console.log('Socket ID:', socket.id);
});
```

#### `disconnect`

Emitted when connection is closed.

```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  if (reason === 'io server disconnect') {
    // Server forcefully disconnected - reconnect manually
    socket.connect();
  }
  // Other disconnect reasons will auto-reconnect
});
```

#### `connect_error`

Emitted when connection fails.

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);

  // Handle specific error codes
  if (error.data?.code === 'INVALID_SESSION') {
    // Redirect to login
    window.location.href = '/login';
  }
});
```

#### `reconnect`

Emitted when reconnection succeeds.

```javascript
socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});
```

---

## Authentication

### Session-Based Authentication

Authentication uses session ID from MongoDB sessions collection.

**Required Parameters**:
```javascript
{
  auth: {
    sessionID: string,  // MongoDB session ID
    userId: string      // User's MongoDB _id
  }
}
```

### Authentication Flow

1. User logs in via OAuth (Discord)
2. Server creates session in MongoDB
3. Client receives session ID
4. Client connects to WebSocket with session ID
5. Server validates session against MongoDB
6. Connection accepted or rejected

### Authentication Errors

| Error Code | Message | Action |
|------------|---------|--------|
| `NO_SESSION_ID` | Authentication required: No session ID provided | Provide sessionID in auth |
| `INVALID_SESSION` | Invalid or expired session | Re-authenticate |
| `SESSION_EXPIRED` | Session expired | Re-authenticate |
| `NO_USER_DATA` | No user data in session | Contact support |
| `USER_MISMATCH` | User ID mismatch | Use correct userId |
| `DATABASE_ERROR` | Database connection not available | Retry later |

### Example Error Handling

```javascript
socket.on('connect_error', (error) => {
  switch (error.data?.code) {
    case 'INVALID_SESSION':
    case 'SESSION_EXPIRED':
      // Redirect to login
      window.location.href = '/auth/discord';
      break;

    case 'DATABASE_ERROR':
      // Retry connection
      setTimeout(() => socket.connect(), 5000);
      break;

    default:
      console.error('Authentication error:', error.message);
  }
});
```

---

## Events

### Client → Server Events

#### `subscribe:portfolio`

Subscribe to portfolio updates for authenticated user.

**Payload**: `{}` (no payload required)

**Response**: `subscribed:portfolio`

```javascript
socket.emit('subscribe:portfolio', {});

socket.on('subscribed:portfolio', (data) => {
  // { success: true, userId: 'user-123', timestamp: '2025-01-17T12:00:00.000Z' }
  console.log('Subscribed to portfolio updates');
});
```

**Rate Limit**: 100 requests/minute

**Authorization**: Requires authentication

---

#### `unsubscribe:portfolio`

Unsubscribe from portfolio updates.

**Payload**: `{}` (no payload required)

**Response**: `unsubscribed:portfolio`

```javascript
socket.emit('unsubscribe:portfolio', {});

socket.on('unsubscribed:portfolio', (data) => {
  // { success: true, userId: 'user-123', timestamp: '2025-01-17T12:00:00.000Z' }
  console.log('Unsubscribed from portfolio updates');
});
```

**Rate Limit**: 100 requests/minute

---

#### `subscribe:trades`

Subscribe to trade execution notifications.

**Payload**: `{}` (no payload required)

**Response**: `subscribed:trades`

```javascript
socket.emit('subscribe:trades', {});

socket.on('subscribed:trades', (data) => {
  console.log('Subscribed to trade notifications');
});
```

**Rate Limit**: 100 requests/minute

**Authorization**: Requires authentication

---

#### `unsubscribe:trades`

Unsubscribe from trade notifications.

**Payload**: `{}` (no payload required)

**Response**: `unsubscribed:trades`

```javascript
socket.emit('unsubscribe:trades', {});
```

**Rate Limit**: 100 requests/minute

---

#### `subscribe:watchlist`

Subscribe to real-time quotes for watchlist symbols.

**Payload**:
```typescript
{
  symbol: string  // Stock symbol (e.g., 'AAPL', 'GOOGL')
}
```

**Response**: `subscribed:watchlist`

```javascript
socket.emit('subscribe:watchlist', { symbol: 'AAPL' });

socket.on('subscribed:watchlist', (data) => {
  // { success: true, symbol: 'AAPL', userId: 'user-123', timestamp: '...' }
  console.log(`Subscribed to ${data.symbol} quotes`);
});
```

**Rate Limit**: 100 requests/minute

**Authorization**: Requires authentication

**Subscription Tiers**: Premium or higher

---

#### `unsubscribe:watchlist`

Unsubscribe from symbol quotes.

**Payload**:
```typescript
{
  symbol: string  // Stock symbol
}
```

**Response**: `unsubscribed:watchlist`

```javascript
socket.emit('unsubscribe:watchlist', { symbol: 'AAPL' });
```

**Rate Limit**: 100 requests/minute

---

### Server → Client Events

#### `portfolio:update`

Real-time portfolio value update.

**Emitted To**: User's personal room (`portfolio:${userId}`)

**Payload**:
```typescript
{
  userId: string;
  portfolio: {
    totalValue: number;
    dayChange: number;
    dayChangePercent: number;
    positions: Array<{
      symbol: string;
      quantity: number;
      currentPrice: number;
      value: number;
      dayChange: number;
      dayChangePercent: number;
    }>;
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('portfolio:update', (data) => {
  console.log('Portfolio value:', data.portfolio.totalValue);
  console.log('Day change:', data.portfolio.dayChangePercent + '%');

  data.portfolio.positions.forEach(position => {
    console.log(`${position.symbol}: ${position.quantity} @ $${position.currentPrice}`);
  });
});
```

---

#### `trade:executed`

Trade execution notification.

**Emitted To**: User's trades room (`trades:${userId}`)

**Payload**:
```typescript
{
  userId: string;
  trade: {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    timestamp: string;
    broker: string;
    status: 'executed' | 'pending' | 'failed';
  };
  notification: {
    title: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('trade:executed', (data) => {
  const { trade, notification } = data;

  console.log(notification.title);
  console.log(notification.message);

  // Show toast notification
  showToast(notification.title, notification.message, notification.type);

  // Update UI
  updateTradeHistory(trade);
});
```

---

#### `trade:failed`

Trade execution failure notification.

**Emitted To**: User's trades room (`trades:${userId}`)

**Payload**:
```typescript
{
  userId: string;
  trade: {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    reason: string;
  };
  notification: {
    title: string;
    message: string;
    type: 'error';
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('trade:failed', (data) => {
  console.error('Trade failed:', data.trade.reason);
  showErrorToast(data.notification.title, data.notification.message);
});
```

---

#### `watchlist:quote`

Real-time stock quote update.

**Emitted To**: Symbol-specific room (`watchlist:${symbol}`)

**Payload**:
```typescript
{
  symbol: string;
  quote: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('watchlist:quote', (data) => {
  console.log(`${data.symbol}: $${data.quote.price} (${data.quote.changePercent}%)`);

  // Update quote display
  updateQuoteDisplay(data.symbol, data.quote);
});
```

---

#### `position:closed`

Position closure notification.

**Emitted To**: User's portfolio room (`portfolio:${userId}`)

**Payload**:
```typescript
{
  userId: string;
  position: {
    symbol: string;
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    profitLoss: number;
    profitLossPercent: number;
  };
  notification: {
    title: string;
    message: string;
    type: 'success' | 'warning';
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('position:closed', (data) => {
  const { position, notification } = data;

  console.log(`Closed ${position.symbol}: ${position.profitLossPercent}% P/L`);
  showToast(notification.title, notification.message, notification.type);
});
```

---

#### `notification`

General notification message.

**Emitted To**: User's personal room (`user:${userId}`)

**Payload**:
```typescript
{
  userId: string;
  notification: {
    title: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    action?: {
      label: string;
      url: string;
    };
  };
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('notification', (data) => {
  const { notification } = data;

  showToast(notification.title, notification.message, notification.type);

  if (notification.action) {
    // Show action button
    showActionButton(notification.action.label, notification.action.url);
  }
});
```

---

#### `market:status`

Market open/close status update.

**Emitted To**: Global broadcast (`market:status`)

**Payload**:
```typescript
{
  status: 'open' | 'closed' | 'pre-market' | 'after-hours';
  nextChange: string;  // ISO timestamp
  message: string;
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('market:status', (data) => {
  console.log('Market status:', data.status);
  console.log('Next change:', new Date(data.nextChange));

  updateMarketStatusBanner(data.status, data.message);
});
```

---

## Error Handling

### Error Event

All errors are emitted via the `error` event.

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);

  // Handle error based on code
  switch (error.code) {
    case 'RATE_LIMIT_EXCEEDED':
      showWarning('Too many requests. Please slow down.');
      break;

    case 'NOT_AUTHENTICATED':
      window.location.href = '/login';
      break;

    case 'FORBIDDEN':
      showError('You do not have permission for this action.');
      break;

    case 'SUBSCRIPTION_REQUIRED':
      showUpgradeModal(error.requiredTiers);
      break;

    default:
      showError('An error occurred: ' + error.message);
  }
});
```

### Common Error Codes

| Code | Description | Status Code |
|------|-------------|-------------|
| `NOT_AUTHENTICATED` | User not authenticated | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `SUBSCRIPTION_REQUIRED` | Upgrade subscription needed | 403 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `VALIDATION_ERROR` | Invalid event payload | 400 |
| `SERVER_ERROR` | Internal server error | 500 |

---

## Rate Limiting

### Rate Limit Configuration

| Event Type | Limit | Window |
|------------|-------|--------|
| Global | 1000 req | 1 minute |
| Subscribe | 100 req | 1 minute |
| Unsubscribe | 100 req | 1 minute |

### Rate Limit Headers

Rate limit information is included in error responses:

```javascript
{
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Rate limit exceeded',
  limit: 100,
  remaining: 0,
  resetAt: '2025-01-17T12:01:00.000Z'
}
```

### Handling Rate Limits

```javascript
let requestCount = 0;
const requestLimit = 100;
const resetTime = 60000; // 1 minute

function makeRequest() {
  if (requestCount >= requestLimit) {
    console.warn('Rate limit reached, waiting...');
    setTimeout(makeRequest, resetTime);
    return;
  }

  requestCount++;
  socket.emit('subscribe:portfolio', {});

  // Reset counter after window
  setTimeout(() => {
    requestCount = 0;
  }, resetTime);
}
```

---

## Best Practices

### 1. Connection Management

**✅ DO**:
- Use connection pooling
- Implement exponential backoff for reconnection
- Handle `connect_error` gracefully
- Clean up event listeners on unmount

**❌ DON'T**:
- Create multiple connections per user
- Reconnect immediately on every error
- Leave event listeners attached after component unmounts

```javascript
// Good: Single connection with cleanup
useEffect(() => {
  const socket = io(url, config);

  const handleUpdate = (data) => {
    // Handle update
  };

  socket.on('portfolio:update', handleUpdate);

  return () => {
    socket.off('portfolio:update', handleUpdate);
    socket.disconnect();
  };
}, []);
```

---

### 2. Event Subscriptions

**✅ DO**:
- Subscribe only to needed events
- Unsubscribe when component unmounts
- Batch subscriptions when possible

**❌ DON'T**:
- Subscribe to all events "just in case"
- Forget to unsubscribe
- Re-subscribe on every render

```javascript
// Good: Subscribe on mount, unsubscribe on unmount
useEffect(() => {
  socket.emit('subscribe:portfolio', {});
  socket.emit('subscribe:trades', {});

  return () => {
    socket.emit('unsubscribe:portfolio', {});
    socket.emit('unsubscribe:trades', {});
  };
}, []);
```

---

### 3. Error Handling

**✅ DO**:
- Handle all error codes
- Show user-friendly messages
- Log errors for debugging
- Implement retry logic

**❌ DON'T**:
- Ignore errors
- Show technical error messages to users
- Retry infinitely

```javascript
// Good: Comprehensive error handling
socket.on('error', (error) => {
  logger.error('WebSocket error', { code: error.code, message: error.message });

  switch (error.code) {
    case 'NOT_AUTHENTICATED':
      redirectToLogin();
      break;
    case 'RATE_LIMIT_EXCEEDED':
      showRateLimitWarning(error.resetAt);
      break;
    default:
      showGenericError();
  }
});
```

---

### 4. Performance

**✅ DO**:
- Debounce rapid updates
- Use efficient data structures
- Implement virtual scrolling for large lists
- Monitor memory usage

**❌ DON'T**:
- Update DOM on every quote tick
- Keep all historical data in memory
- Create new functions in render

```javascript
// Good: Debounced updates
const debouncedUpdate = debounce((data) => {
  updatePortfolioDisplay(data);
}, 100);

socket.on('portfolio:update', debouncedUpdate);
```

---

## Code Examples

### React Hook

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useWebSocket(url: string, sessionID: string, userId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const newSocket = io(url, {
      auth: { sessionID, userId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      setError(null);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError(err);
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [url, sessionID, userId]);

  return { socket, connected, error };
}
```

### Portfolio Subscription

```typescript
import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';

export function usePortfolio(userId: string) {
  const { socket, connected } = useWebSocket(
    process.env.REACT_APP_WS_URL,
    sessionStorage.getItem('sessionID'),
    userId
  );

  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:portfolio', {});

    const handleUpdate = (data) => {
      setPortfolio(data.portfolio);
    };

    socket.on('portfolio:update', handleUpdate);
    socket.on('subscribed:portfolio', () => {
      console.log('Subscribed to portfolio updates');
    });

    return () => {
      socket.emit('unsubscribe:portfolio', {});
      socket.off('portfolio:update', handleUpdate);
    };
  }, [socket, connected]);

  return portfolio;
}
```

### Trade Notifications

```typescript
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { toast } from 'react-toastify';

export function useTradeNotifications(userId: string) {
  const { socket, connected } = useWebSocket(
    process.env.REACT_APP_WS_URL,
    sessionStorage.getItem('sessionID'),
    userId
  );

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:trades', {});

    socket.on('trade:executed', (data) => {
      toast.success(data.notification.message, {
        autoClose: 5000
      });
    });

    socket.on('trade:failed', (data) => {
      toast.error(data.notification.message, {
        autoClose: 10000
      });
    });

    return () => {
      socket.emit('unsubscribe:trades', {});
      socket.off('trade:executed');
      socket.off('trade:failed');
    };
  }, [socket, connected]);
}
```

### Watchlist Quotes

```typescript
import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';

export function useWatchlistQuote(symbol: string, userId: string) {
  const { socket, connected } = useWebSocket(
    process.env.REACT_APP_WS_URL,
    sessionStorage.getItem('sessionID'),
    userId
  );

  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:watchlist', { symbol });

    const handleQuote = (data) => {
      if (data.symbol === symbol) {
        setQuote(data.quote);
      }
    };

    socket.on('watchlist:quote', handleQuote);

    return () => {
      socket.emit('unsubscribe:watchlist', { symbol });
      socket.off('watchlist:quote', handleQuote);
    };
  }, [socket, connected, symbol]);

  return quote;
}
```

---

## Additional Resources

- **Architecture Documentation**: [WEBSOCKET_ARCHITECTURE.md](./WEBSOCKET_ARCHITECTURE.md)
- **Deployment Guide**: [../deployment/DEPLOYMENT_GUIDE.md](../deployment/DEPLOYMENT_GUIDE.md)
- **Socket.io Client Docs**: https://socket.io/docs/v4/client-api/
- **Socket.io Server Docs**: https://socket.io/docs/v4/server-api/
