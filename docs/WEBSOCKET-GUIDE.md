# WebSocket Real-Time Communication Guide

## Overview

The Discord Trade Executor uses Socket.io for real-time, bidirectional communication between the server and dashboard clients. This enables instant updates for portfolio changes, trade executions, and live market quotes.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Client Setup](#client-setup)
- [Authentication](#authentication)
- [Available Events](#available-events)
- [React Integration](#react-integration)
- [Error Handling](#error-handling)
- [Performance](#performance)
- [Production Deployment](#production-deployment)

---

## Quick Start

### Server-Side (Already Configured)

The WebSocket server is automatically initialized in `src/index.js`:

```javascript
const WebSocketServer = require('./services/websocket-server');

// After HTTP server is created
const wsServer = new WebSocketServer(httpServer);
```

### Client-Side (Dashboard Integration)

Install Socket.io client:

```bash
npm install socket.io-client
```

Connect to the WebSocket server:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
    auth: {
        sessionID: 'your-session-id',
        userId: 'user-123',
        userName: 'John Doe'
    },
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('✅ Connected:', socket.id);
});
```

---

## Architecture

```
┌─────────────────┐
│  Dashboard UI   │
│   (React App)   │
└────────┬────────┘
         │ Socket.io Client
         │
    ┌────▼────┐
    │  HTTP   │
    │ Server  │
    └────┬────┘
         │
    ┌────▼──────────┐
    │   WebSocket   │
    │    Server     │
    │ (Socket.io)   │
    └───────────────┘
         │
    ┌────▼────┐
    │  Redis  │  (Production only)
    │ Adapter │  (Horizontal scaling)
    └─────────┘
```

### Key Components

1. **WebSocket Server** (`src/services/websocket-server.js`)
   - Handles all real-time connections
   - Manages subscriptions and broadcasts
   - Implements authentication and rate limiting

2. **WebSocket Context** (`src/dashboard/contexts/WebSocketContext.jsx`)
   - React context provider for WebSocket state
   - Auto-reconnection logic
   - Event subscription management

3. **Dashboard Components**
   - `LivePortfolio`: Real-time portfolio updates
   - `LiveWatchlist`: Live market quotes
   - `TradeNotifications`: Toast notifications for trades

---

## Client Setup

### React Context Provider

Wrap your app with the WebSocket provider:

```javascript
// src/dashboard/App.jsx
import { WebSocketProvider } from './contexts/WebSocketContext';

function App() {
    return (
        <WebSocketProvider>
            <YourAppComponents />
        </WebSocketProvider>
    );
}
```

### Using the WebSocket Hook

Access WebSocket functionality in any component:

```javascript
import { useWebSocketContext } from '../contexts/WebSocketContext';

function MyComponent() {
    const { connected, subscribe, emit } = useWebSocketContext();

    useEffect(() => {
        if (!connected) return;

        // Subscribe to events
        const unsubscribe = subscribe('portfolio:update', (data) => {
            console.log('Portfolio update:', data);
        });

        // Cleanup
        return unsubscribe;
    }, [connected, subscribe]);

    // Emit events to server
    const subscribeToPortfolio = () => {
        emit('subscribe:portfolio');
    };

    return (
        <div>
            {connected ? '✅ Connected' : '⚠️ Disconnected'}
        </div>
    );
}
```

---

## Authentication

### Session-Based Authentication

WebSocket connections require authentication via session data:

```javascript
const socket = io('http://localhost:3000', {
    auth: {
        sessionID: 'your-session-id',    // Required
        userId: 'user-123',               // Required
        userName: 'John Doe'              // Optional
    }
});
```

### Authentication Flow

1. User logs in via HTTP API → receives session ID
2. Dashboard passes session ID to WebSocket connection
3. Server validates session and associates socket with user
4. User-specific room created: `user:${userId}`

### Connection Limits

- **Max 5 concurrent connections per user**
- Prevents resource abuse
- Automatically enforced by middleware

---

## Available Events

### Client → Server Events

#### Subscribe to Portfolio Updates

```javascript
socket.emit('subscribe:portfolio');

// Response
socket.on('subscription:confirmed', (data) => {
    console.log('Subscribed to:', data.type); // 'portfolio'
});
```

#### Subscribe to Trade Notifications

```javascript
socket.emit('subscribe:trades');

// Response
socket.on('subscription:confirmed', (data) => {
    console.log('Subscribed to:', data.type); // 'trades'
});
```

#### Subscribe to Live Quotes (Watchlist)

```javascript
socket.emit('subscribe:watchlist', ['AAPL', 'TSLA', 'NVDA']);

// Response
socket.on('subscription:confirmed', (data) => {
    console.log('Subscribed to:', data.symbols); // ['AAPL', 'TSLA', 'NVDA']
});
```

#### Unsubscribe from Watchlist

```javascript
socket.emit('unsubscribe:watchlist', ['AAPL']);

// Response
socket.on('unsubscription:confirmed', (data) => {
    console.log('Unsubscribed from:', data.symbols); // ['AAPL']
});
```

---

### Server → Client Events

#### Portfolio Update

Sent when user's portfolio changes (after trades, market movements):

```javascript
socket.on('portfolio:update', (data) => {
    console.log('Portfolio:', data);
    // {
    //     totalValue: 50000,
    //     cash: 10000,
    //     equity: 40000,
    //     positions: [...],
    //     dayChange: 500,
    //     dayChangePercent: 1.0,
    //     timestamp: '2025-01-15T12:00:00.000Z'
    // }
});
```

#### Trade Executed

Sent when a trade executes successfully:

```javascript
socket.on('trade:executed', (data) => {
    console.log('Trade executed:', data);
    // {
    //     id: 'trade-123',
    //     symbol: 'AAPL',
    //     side: 'buy',
    //     quantity: 10,
    //     price: 175.50,
    //     status: 'filled',
    //     timestamp: '2025-01-15T12:00:00.000Z'
    // }
});
```

#### Trade Failed

Sent when a trade fails to execute:

```javascript
socket.on('trade:failed', (data) => {
    console.error('Trade failed:', data);
    // {
    //     error: 'Insufficient funds',
    //     signal: { symbol: 'AAPL', side: 'buy', quantity: 10 },
    //     timestamp: '2025-01-15T12:00:00.000Z'
    // }
});
```

#### Quote Update

Sent when subscribed symbols have price updates:

```javascript
socket.on('quote:update', (data) => {
    console.log('Quote:', data);
    // {
    //     symbol: 'AAPL',
    //     price: 175.50,
    //     change: 2.50,
    //     changePercent: 1.45,
    //     volume: 50000000,
    //     timestamp: '2025-01-15T12:00:00.000Z'
    // }
});
```

#### Market Status

Broadcast to all clients when market hours change:

```javascript
socket.on('market:status', (data) => {
    console.log('Market status:', data);
    // {
    //     isOpen: true,
    //     nextOpen: null,
    //     nextClose: '2025-01-15T16:00:00Z',
    //     timestamp: '2025-01-15T12:00:00.000Z'
    // }
});
```

#### Server Shutdown

Sent before server gracefully shuts down:

```javascript
socket.on('server:shutdown', (data) => {
    console.warn('Server shutting down:', data.message);
    // Implement reconnection logic
});
```

---

## React Integration

### Complete Example Component

```javascript
import React, { useState, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { Card } from './ui/card';

export function LivePortfolio() {
    const [portfolio, setPortfolio] = useState(null);
    const { connected, subscribe, emit } = useWebSocketContext();

    useEffect(() => {
        if (!connected) return;

        // Subscribe to portfolio updates
        const unsubscribe = subscribe('portfolio:update', (data) => {
            setPortfolio(data);
        });

        // Request initial subscription
        emit('subscribe:portfolio');

        // Cleanup
        return () => {
            unsubscribe();
        };
    }, [connected, subscribe, emit]);

    if (!connected) {
        return <Card>⚠️ Connecting to live data...</Card>;
    }

    if (!portfolio) {
        return <Card>📊 Loading portfolio...</Card>;
    }

    return (
        <Card>
            <h2>Live Portfolio</h2>
            <p>Total Value: ${portfolio.totalValue.toLocaleString()}</p>
            <p>Day Change: {portfolio.dayChangePercent.toFixed(2)}%</p>
            <p className="text-xs text-gray-500">
                Last update: {new Date(portfolio.timestamp).toLocaleTimeString()}
            </p>
        </Card>
    );
}
```

---

## Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
    console.error('Connection failed:', error.message);

    if (error.message.includes('Authentication required')) {
        // Redirect to login
        window.location.href = '/login';
    }
});
```

### Rate Limiting

Events are rate-limited per user to prevent abuse:

```javascript
socket.on('error', (data) => {
    if (data.message.includes('Rate limit')) {
        console.warn('Rate limit exceeded, backing off...');
        // Implement exponential backoff
    }
});
```

### Auto-Reconnection

Socket.io automatically reconnects on disconnect:

```javascript
socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);

    if (reason === 'io server disconnect') {
        // Server forcibly disconnected - manual reconnect needed
        socket.connect();
    }
    // Otherwise, auto-reconnect is handled by Socket.io
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    // Re-subscribe to channels
    socket.emit('subscribe:portfolio');
});
```

---

## Performance

### Connection Metrics

Based on load tests (`tests/load/websocket-load.test.js`):

- ✅ **1000+ concurrent connections** supported
- ✅ **P95 connection latency:** < 500ms
- ✅ **P95 broadcast latency:** < 200ms
- ✅ **Connection rate:** > 100 connections/second
- ✅ **No memory leaks** under sustained load

### Rate Limits

| Event | Max Requests | Time Window |
|-------|-------------|-------------|
| `subscribe:portfolio` | 1 | 60 seconds |
| `subscribe:trades` | 1 | 60 seconds |
| `subscribe:watchlist` | 10 | 60 seconds |

### Best Practices

1. **Batch subscriptions:** Subscribe to multiple symbols at once
   ```javascript
   socket.emit('subscribe:watchlist', ['AAPL', 'TSLA', 'NVDA']);
   // Instead of 3 separate calls
   ```

2. **Unsubscribe when unmounting:**
   ```javascript
   useEffect(() => {
       const unsubscribe = subscribe('portfolio:update', handler);
       return unsubscribe; // Cleanup
   }, []);
   ```

3. **Throttle UI updates:**
   ```javascript
   const throttledUpdate = useCallback(
       throttle((data) => setPortfolio(data), 100),
       []
   );
   ```

---

## Production Deployment

### Environment Variables

```bash
# Required in production
NODE_ENV=production
FRONTEND_URL=https://your-app.com
REDIS_URL=redis://your-redis-server:6379

# Optional
WEBSOCKET_PORT=3000
```

### Redis Adapter (Horizontal Scaling)

For multiple server instances, configure Redis:

1. **Add Redis to Railway:**
   ```bash
   railway add redis
   ```

2. **Set environment variables:**
   ```bash
   REDIS_URL=redis://...  # Auto-set by Railway
   NODE_ENV=production
   ```

3. **Scale your service:**
   ```bash
   railway service scale 3  # 3 replicas
   ```

See [Railway Redis Setup Guide](./railway-redis-setup.md) for complete instructions.

### Monitoring

Check connection health:

```bash
curl https://your-app.com/health/websocket

# Response:
# {
#   "status": "healthy",
#   "activeConnections": 523,
#   "uniqueUsers": 312,
#   "uptime": 86400
# }
```

### Debugging

Enable verbose logging:

```javascript
// Client-side
const socket = io('http://localhost:3000', {
    auth: { ... },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    // Debug mode
    debug: true
});
```

Check server logs:

```bash
railway logs | grep "WebSocket"

# Look for:
# ✅ WebSocket server initialized
# ✅ WebSocket connected: abc123 (User: user-456)
# 📊 Portfolio update sent to user user-456
```

---

## Testing

### Unit Tests

Run WebSocket server unit tests:

```bash
npm test -- tests/unit/websocket-server.test.js

# 47 tests covering:
# - Authentication
# - Connection pooling
# - Rate limiting
# - Event handlers
# - Error handling
```

### Integration Tests

Run end-to-end flow tests:

```bash
npm test -- tests/integration/websocket-flow.test.js

# 17 tests covering:
# - Complete connection flows
# - Multi-client scenarios
# - Error recovery
# - Data consistency
```

### Load Tests

Run performance tests:

```bash
npm test -- tests/load/websocket-load.test.js

# 7 tests covering:
# - 1000+ concurrent connections
# - Broadcast performance
# - Memory leak detection
# - Resource cleanup
```

---

## Common Patterns

### Real-Time Notifications

```javascript
function TradeNotifications() {
    const { subscribe } = useWebSocketContext();
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        const unsubExecuted = subscribe('trade:executed', (trade) => {
            toast.success(`✅ ${trade.side} ${trade.quantity} ${trade.symbol} @ $${trade.price}`);
            setNotifications(prev => [trade, ...prev].slice(0, 10));
        });

        const unsubFailed = subscribe('trade:failed', (error) => {
            toast.error(`❌ Trade failed: ${error.message}`);
        });

        return () => {
            unsubExecuted();
            unsubFailed();
        };
    }, [subscribe]);

    return <NotificationList notifications={notifications} />;
}
```

### Live Watchlist

```javascript
function LiveWatchlist() {
    const [quotes, setQuotes] = useState({});
    const { subscribe, emit } = useWebSocketContext();

    useEffect(() => {
        // Subscribe to quote updates
        const unsubscribe = subscribe('quote:update', (quote) => {
            setQuotes(prev => ({
                ...prev,
                [quote.symbol]: quote
            }));
        });

        // Subscribe to watchlist symbols
        emit('subscribe:watchlist', ['AAPL', 'TSLA', 'NVDA']);

        return unsubscribe;
    }, [subscribe, emit]);

    return (
        <div>
            {Object.values(quotes).map(quote => (
                <div key={quote.symbol}>
                    {quote.symbol}: ${quote.price}
                    <span className={quote.changePercent > 0 ? 'text-green' : 'text-red'}>
                        {quote.changePercent > 0 ? '▲' : '▼'} {Math.abs(quote.changePercent)}%
                    </span>
                </div>
            ))}
        </div>
    );
}
```

---

## Troubleshooting

### Connection Issues

**Problem:** Client can't connect

**Solutions:**
1. Check CORS configuration in `src/services/websocket-server.js:20-23`
2. Verify `FRONTEND_URL` environment variable
3. Test WebSocket endpoint: `wscat -c ws://localhost:3000`

### Authentication Failures

**Problem:** `Authentication required: No session ID provided`

**Solutions:**
1. Ensure `sessionID` is included in auth object
2. Verify session is valid and not expired
3. Check server logs for authentication errors

### Missing Updates

**Problem:** Not receiving portfolio/trade updates

**Solutions:**
1. Verify subscription: Check for `subscription:confirmed` event
2. Check rate limits: Look for rate limit errors
3. Verify user ID matches the updates being sent

---

## Resources

- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Railway Redis Setup](./railway-redis-setup.md)
- [WebSocket Server Source](../src/services/websocket-server.js)
- [React Context Source](../src/dashboard/contexts/WebSocketContext.jsx)
- [Test Suite](../tests/unit/websocket-server.test.js)

---

## Support

For WebSocket issues:

1. Check server logs: `railway logs | grep WebSocket`
2. Run verification script: `node scripts/verify-redis.js`
3. Review test results: `npm test -- tests/integration/websocket-flow.test.js`
4. Check Redis status (production): `railway logs -s redis`

---

*Last updated: January 2025*
