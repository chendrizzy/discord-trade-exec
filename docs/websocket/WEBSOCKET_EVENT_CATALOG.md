# WebSocket Event Catalog
## Discord Trade Executor - Real-Time Communication Reference

**Version:** 1.0.0
**Last Updated:** 2025-10-20
**Status:** ✅ **PRODUCTION READY**

---

## Overview

This document catalogs all WebSocket events used in the Discord Trade Executor SaaS platform for real-time communication between client (React dashboard) and server (Node.js/Socket.io).

**Technology Stack:**
- **Server**: Socket.io 4.x with Redis adapter
- **Client**: socket.io-client 4.x (React hooks)
- **Transport**: WebSocket (primary), polling (fallback)
- **Scaling**: Redis adapter for horizontal scaling

---

## Event Categories

### 1. Connection Lifecycle Events
Automatic events managed by Socket.io for connection state management.

### 2. Client → Server Events (C→S)
User-initiated actions sent from React dashboard to server.

### 3. Server → Client Events (S→C)
Server-initiated notifications pushed to dashboard clients.

### 4. Room-Based Events
Events scoped to specific user rooms or symbol watchlist rooms.

---

## Connection Lifecycle Events

### Standard Socket.io Connection Events

| Event | Direction | Description | Payload |
|-------|-----------|-------------|---------|
| `connect` | Auto (S→C) | Socket connection established | `{ socketId, userId, timestamp, message }` |
| `connect_error` | Auto (S→C) | Connection failed or authentication error | `Error` object with message |
| `disconnect` | Auto (S→C) | Socket disconnected | `reason` string |
| `reconnect_attempt` | Auto (S→C) | Attempting to reconnect | `attemptNumber` |
| `reconnect` | Auto (S→C) | Reconnection successful | `attemptNumber` |
| `reconnect_failed` | Auto (S→C) | All reconnection attempts failed | N/A |

**File Locations:**
- **Server**: `src/services/websocket/WebSocketServer.js:80,185-203`
- **Client**: `src/dashboard/hooks/useWebSocket.js:66-121`

**Authentication Requirements:**
```javascript
// Server-side authentication via middleware
socket.handshake.auth = {
  sessionID: 'express-session-id',
  userId: 'user-uuid',
  userName: 'Display Name',
  authenticated: true  // Set by auth middleware
}
```

---

## Client → Server Events (C→S)

### 1. `subscribe:portfolio`

**Purpose**: Subscribe to real-time portfolio value and performance updates.

**Direction**: C→S

**Payload**: None (authentication from `socket.handshake.auth`)

**Response Events**:
- Success: `subscribed:portfolio` - Subscription confirmed
- Error: `error` with code `UNAUTHORIZED`, `RATE_LIMIT`, `SUBSCRIPTION_LIMIT`, or `SERVER_ERROR`

**Rate Limits**:
- Max subscription requests: 10 per minute
- Max concurrent subscriptions: 50 per user

**Room Behavior**:
- Joins room: `portfolio:${userId}`
- Receives broadcast events: `portfolio:update`

**File Location**: `src/services/websocket/handlers/index.js:30-87`

**Example Usage (Client)**:
```javascript
const { emit, subscribe } = useWebSocket({ sessionID, userId });

// Subscribe to portfolio updates
emit('subscribe:portfolio');

// Listen for portfolio updates
subscribe('portfolio:update', (data) => {
  console.log('Portfolio updated:', data.portfolio);
  setPortfolioValue(data.portfolio.value);
});

// Listen for subscription confirmation
subscribe('subscribed:portfolio', (data) => {
  console.log('Subscribed at:', data.timestamp);
});
```

---

### 2. `subscribe:trades`

**Purpose**: Subscribe to real-time trade execution and failure notifications.

**Direction**: C→S

**Payload**: None (authentication from `socket.handshake.auth`)

**Response Events**:
- Success: `subscribed:trades` - Subscription confirmed
- Error: `error` with code `UNAUTHORIZED`, `RATE_LIMIT`, `SUBSCRIPTION_LIMIT`, or `SERVER_ERROR`

**Rate Limits**:
- Max subscription requests: 10 per minute
- Max concurrent subscriptions: 50 per user

**Room Behavior**:
- Joins room: `trades:${userId}`
- Receives broadcast events: `trade:executed`, `trade:failed`

**File Location**: `src/services/websocket/handlers/index.js:93-150`

**Example Usage (Client)**:
```javascript
const { emit, subscribe } = useWebSocket({ sessionID, userId });

// Subscribe to trade notifications
emit('subscribe:trades');

// Listen for trade executions
subscribe('trade:executed', (data) => {
  showNotification(`Trade executed: ${data.symbol} @ ${data.price}`);
});

// Listen for trade failures
subscribe('trade:failed', (data) => {
  showError(`Trade failed: ${data.error}`);
});
```

---

### 3. `subscribe:watchlist`

**Purpose**: Subscribe to live quote updates for specified symbols.

**Direction**: C→S

**Payload**:
```javascript
{
  symbols: string[]  // Array of ticker symbols (max 50)
}
```

**Response Events**:
- Success: `subscribed:watchlist` - Subscription confirmed
- Error: `error` with code `UNAUTHORIZED`, `RATE_LIMIT`, `SUBSCRIPTION_LIMIT`, `INVALID_PARAMS`, or `SERVER_ERROR`

**Rate Limits**:
- Max subscription requests: 10 per minute
- Max concurrent subscriptions: 50 symbols per user

**Room Behavior**:
- Joins rooms: `watchlist:${SYMBOL}` for each symbol (uppercase)
- Receives broadcast events: `quote:update` for subscribed symbols

**File Location**: `src/services/websocket/handlers/index.js:158-233`

**Example Usage (Client)**:
```javascript
const { emit, subscribe } = useWebSocket({ sessionID, userId });

// Subscribe to multiple symbols
emit('subscribe:watchlist', { symbols: ['AAPL', 'TSLA', 'NVDA'] });

// Listen for live quote updates
subscribe('quote:update', (data) => {
  updateQuote(data.symbol, data.quote);
});

// Listen for subscription confirmation
subscribe('subscribed:watchlist', (data) => {
  console.log('Watching symbols:', data.symbols);
});
```

---

### 4. `unsubscribe:watchlist`

**Purpose**: Unsubscribe from live quote updates for specified symbols.

**Direction**: C→S

**Payload**:
```javascript
{
  symbols: string[]  // Array of ticker symbols (max 50)
}
```

**Response Events**:
- Success: `unsubscribed:watchlist` - Unsubscription confirmed
- Error: `error` with code `UNAUTHORIZED`, `RATE_LIMIT`, `INVALID_PARAMS`, or `SERVER_ERROR`

**Rate Limits**:
- Max unsubscription requests: 10 per minute

**Room Behavior**:
- Leaves rooms: `watchlist:${SYMBOL}` for each symbol

**File Location**: `src/services/websocket/handlers/index.js:241-302`

**Example Usage (Client)**:
```javascript
const { emit, subscribe } = useWebSocket({ sessionID, userId });

// Unsubscribe from symbols
emit('unsubscribe:watchlist', { symbols: ['AAPL', 'TSLA'] });

// Listen for confirmation
subscribe('unsubscribed:watchlist', (data) => {
  console.log('Stopped watching:', data.symbols);
});
```

---

### 5. `ping`

**Purpose**: Health check to verify connection is alive (used for latency measurement).

**Direction**: C→S

**Payload**:
```javascript
{
  timestamp: string  // ISO 8601 timestamp
}
```

**Response Events**:
- Success: `pong` - Health check response

**File Location**: `src/services/websocket/handlers/index.js:308-313`

**Example Usage (Client)**:
```javascript
const { emit, subscribe } = useWebSocket({ sessionID, userId });

// Measure latency
const startTime = Date.now();
emit('ping', { timestamp: new Date().toISOString() });

subscribe('pong', (data) => {
  const latency = Date.now() - startTime;
  console.log(`Latency: ${latency}ms`);
});
```

---

## Server → Client Events (S→C)

### 1. `connected`

**Purpose**: Confirm successful WebSocket connection establishment.

**Direction**: S→C

**Payload**:
```javascript
{
  socketId: string,      // Socket.io connection ID
  userId: string,        // User UUID
  timestamp: string,     // ISO 8601 timestamp
  message: string        // "WebSocket connection established"
}
```

**Trigger**: Automatically sent when client connects

**File Location**: `src/services/websocket/WebSocketServer.js:206-211`

**Example Handler (Client)**:
```javascript
subscribe('connected', (data) => {
  console.log('Connected to WebSocket:', data.socketId);
  setConnectionStatus('connected');
});
```

---

### 2. `subscribed:portfolio`

**Purpose**: Confirm successful portfolio subscription.

**Direction**: S→C

**Payload**:
```javascript
{
  success: true,
  userId: string,       // User UUID
  timestamp: string     // ISO 8601 timestamp
}
```

**Trigger**: Response to `subscribe:portfolio` event

**File Location**: `src/services/websocket/handlers/index.js:74-78`

---

### 3. `subscribed:trades`

**Purpose**: Confirm successful trade notifications subscription.

**Direction**: S→C

**Payload**:
```javascript
{
  success: true,
  userId: string,       // User UUID
  timestamp: string     // ISO 8601 timestamp
}
```

**Trigger**: Response to `subscribe:trades` event

**File Location**: `src/services/websocket/handlers/index.js:137-141`

---

### 4. `subscribed:watchlist`

**Purpose**: Confirm successful watchlist subscription.

**Direction**: S→C

**Payload**:
```javascript
{
  success: true,
  symbols: string[],    // Subscribed symbols (uppercase)
  userId: string,       // User UUID
  timestamp: string     // ISO 8601 timestamp
}
```

**Trigger**: Response to `subscribe:watchlist` event

**File Location**: `src/services/websocket/handlers/index.js:219-224`

---

### 5. `unsubscribed:watchlist`

**Purpose**: Confirm successful watchlist unsubscription.

**Direction**: S→C

**Payload**:
```javascript
{
  success: true,
  symbols: string[],    // Unsubscribed symbols
  userId: string,       // User UUID
  timestamp: string     // ISO 8601 timestamp
}
```

**Trigger**: Response to `unsubscribe:watchlist` event

**File Location**: `src/services/websocket/handlers/index.js:288-293`

---

### 6. `portfolio:update`

**Purpose**: Real-time portfolio value and performance update.

**Direction**: S→C (Broadcast to room `portfolio:${userId}`)

**Payload**:
```javascript
{
  userId: string,
  portfolio: {
    value: number,              // Total portfolio value (USD)
    cash: number,               // Available cash balance
    positions: number,          // Number of open positions
    dayPL: number,              // Day profit/loss (USD)
    dayPLPercent: number,       // Day profit/loss (%)
    totalPL: number,            // Total profit/loss (USD)
    totalPLPercent: number      // Total profit/loss (%)
  },
  timestamp: string             // ISO 8601 timestamp
}
```

**Trigger**: Portfolio value changes (trade execution, market price updates)

**File Location**: `src/services/websocket/WebSocketServer.js:220-234`

**Example Handler (Client)**:
```javascript
subscribe('portfolio:update', (data) => {
  setPortfolioValue(data.portfolio.value);
  setDayPL(data.portfolio.dayPL);
  setDayPLPercent(data.portfolio.dayPLPercent);
});
```

---

### 7. `trade:executed`

**Purpose**: Notification of successful trade execution.

**Direction**: S→C (Broadcast to room `trades:${userId}`)

**Payload**:
```javascript
{
  userId: string,
  trade: {
    id: string,                 // Trade ID
    symbol: string,             // Ticker symbol
    side: 'buy' | 'sell',       // Order side
    quantity: number,           // Shares/contracts
    price: number,              // Execution price
    value: number,              // Total value (price × quantity)
    status: 'filled',           // Order status
    broker: string,             // Broker name
    executedAt: string          // ISO 8601 timestamp
  },
  timestamp: string
}
```

**Trigger**: Trade successfully executed via broker API

**File Location**: `src/services/websocket/WebSocketServer.js:220-234`

**Example Handler (Client)**:
```javascript
subscribe('trade:executed', (data) => {
  showNotification(`✅ ${data.trade.side.toUpperCase()} ${data.trade.quantity} ${data.trade.symbol} @ $${data.trade.price}`);
  refreshPortfolio();
});
```

---

### 8. `trade:failed`

**Purpose**: Notification of trade execution failure.

**Direction**: S→C (Broadcast to room `trades:${userId}`)

**Payload**:
```javascript
{
  userId: string,
  trade: {
    id: string,                 // Trade ID
    symbol: string,             // Ticker symbol
    side: 'buy' | 'sell',       // Order side
    quantity: number,           // Shares/contracts
    error: string,              // Error message
    errorCode: string,          // Error code (e.g., 'INSUFFICIENT_FUNDS')
    broker: string,             // Broker name
    failedAt: string            // ISO 8601 timestamp
  },
  timestamp: string
}
```

**Trigger**: Trade failed to execute (insufficient funds, market closed, invalid symbol, etc.)

**File Location**: `src/services/websocket/WebSocketServer.js:220-234`

**Example Handler (Client)**:
```javascript
subscribe('trade:failed', (data) => {
  showError(`❌ Trade failed: ${data.trade.error}`);
});
```

---

### 9. `quote:update`

**Purpose**: Real-time quote update for watchlist symbols.

**Direction**: S→C (Broadcast to room `watchlist:${SYMBOL}`)

**Payload**:
```javascript
{
  symbol: string,               // Ticker symbol
  quote: {
    price: number,              // Last traded price
    bid: number,                // Bid price
    ask: number,                // Ask price
    volume: number,             // Trading volume
    change: number,             // Price change (USD)
    changePercent: number,      // Price change (%)
    high: number,               // Day high
    low: number,                // Day low
    open: number,               // Opening price
    previousClose: number       // Previous close
  },
  timestamp: string             // ISO 8601 timestamp
}
```

**Trigger**: Real-time market data updates from broker API

**File Location**: Server integration with broker adapters

**Example Handler (Client)**:
```javascript
subscribe('quote:update', (data) => {
  updateWatchlistQuote(data.symbol, data.quote);
});
```

---

### 10. `position:closed`

**Purpose**: Notification when a position is closed.

**Direction**: S→C (Broadcast to room `portfolio:${userId}`)

**Payload**:
```javascript
{
  userId: string,
  position: {
    symbol: string,             // Ticker symbol
    quantity: number,           // Shares/contracts closed
    entryPrice: number,         // Original entry price
    exitPrice: number,          // Exit price
    pl: number,                 // Profit/loss (USD)
    plPercent: number,          // Profit/loss (%)
    holdingPeriod: number,      // Days held
    closedAt: string            // ISO 8601 timestamp
  },
  timestamp: string
}
```

**Trigger**: Position fully closed via sell order

**File Location**: Trade execution logic

**Example Handler (Client)**:
```javascript
subscribe('position:closed', (data) => {
  const plSign = data.position.pl >= 0 ? '✅' : '❌';
  showNotification(`${plSign} Closed ${data.position.symbol}: ${data.position.plPercent}% P/L`);
});
```

---

### 11. `server:shutdown`

**Purpose**: Notify clients of impending server shutdown.

**Direction**: S→C (Broadcast to all clients)

**Payload**:
```javascript
{
  message: string,              // "Server is shutting down for maintenance"
  timestamp: string             // ISO 8601 timestamp
}
```

**Trigger**: Server graceful shutdown (deployment, maintenance)

**File Locations**:
- **Server**: `src/services/websocket/WebSocketServer.js:310-313`
- **Client**: `src/dashboard/hooks/useWebSocket.js:124-127`

**Example Handler (Client)**:
```javascript
subscribe('server:shutdown', (data) => {
  showWarning('Server maintenance in progress. Reconnecting...');
  setConnectionStatus('reconnecting');
});
```

---

### 12. `error`

**Purpose**: Generic error notification for failed operations.

**Direction**: S→C (Sent to specific client)

**Payload**:
```javascript
{
  event: string,                // Event that triggered error
  code: string,                 // Error code
  message: string               // Human-readable error message
}
```

**Error Codes**:
- `UNAUTHORIZED` - Authentication required or invalid session
- `RATE_LIMIT` - Too many requests (rate limit exceeded)
- `SUBSCRIPTION_LIMIT` - Maximum subscriptions reached
- `INVALID_PARAMS` - Invalid parameters provided
- `SERVER_ERROR` - Internal server error

**Trigger**: Any failed operation (subscription, authentication, validation)

**File Locations**: Multiple event handlers in `src/services/websocket/handlers/index.js`

**Example Handler (Client)**:
```javascript
subscribe('error', (data) => {
  console.error(`WebSocket error [${data.code}]:`, data.message);

  if (data.code === 'UNAUTHORIZED') {
    redirectToLogin();
  } else if (data.code === 'RATE_LIMIT') {
    showWarning('Please slow down your requests');
  }
});
```

---

### 13. `pong`

**Purpose**: Health check response for connection latency measurement.

**Direction**: S→C

**Payload**:
```javascript
{
  clientTimestamp: string,      // Original client timestamp
  serverTimestamp: string       // Server response timestamp
}
```

**Trigger**: Response to `ping` event

**File Location**: `src/services/websocket/handlers/index.js:309-312`

**Example Handler (Client)**:
```javascript
const startTime = Date.now();
emit('ping', { timestamp: new Date().toISOString() });

subscribe('pong', (data) => {
  const latency = Date.now() - startTime;
  setConnectionLatency(latency);
});
```

---

## Room-Based Broadcasting

### Room Naming Conventions

| Room Type | Pattern | Purpose | Example |
|-----------|---------|---------|---------|
| User-specific | `user:${userId}` | Target specific user (all connections) | `user:550e8400-e29b-41d4-a716-446655440000` |
| Portfolio updates | `portfolio:${userId}` | Portfolio value broadcasts | `portfolio:550e8400-e29b-41d4-a716-446655440000` |
| Trade notifications | `trades:${userId}` | Trade execution broadcasts | `trades:550e8400-e29b-41d4-a716-446655440000` |
| Watchlist quotes | `watchlist:${SYMBOL}` | Symbol-specific quote updates | `watchlist:AAPL`, `watchlist:TSLA` |

### Broadcast Methods

```javascript
// Broadcast to specific user (all their connections)
webSocketServer.emitToUser(userId, 'portfolio:update', portfolioData);

// Broadcast to specific room
webSocketServer.emitToRoom('watchlist:AAPL', 'quote:update', quoteData);

// Broadcast to all connected clients
webSocketServer.emitToAll('server:shutdown', { message: 'Maintenance mode' });
```

**File Location**: `src/services/websocket/WebSocketServer.js:220-267`

---

## Authentication Flow

### Connection Authentication

**Server-Side Middleware** (`src/services/websocket/middleware/auth.js`):

```javascript
async function authenticateWebSocket(socket, next) {
  try {
    const { sessionID, userId } = socket.handshake.auth;

    // Validate session with express-session store
    const session = await validateSession(sessionID);

    if (!session || session.userId !== userId) {
      return next(new Error('UNAUTHORIZED'));
    }

    // Attach authentication data to socket
    socket.handshake.auth.authenticated = true;
    socket.handshake.auth.userName = session.userName;

    next(); // Allow connection
  } catch (error) {
    next(new Error('AUTHENTICATION_FAILED'));
  }
}
```

**Client-Side Authentication** (`src/dashboard/hooks/useWebSocket.js:52-63`):

```javascript
const socket = io(SOCKET_URL, {
  auth: {
    sessionID: expressSessionID,  // From cookies
    userId: userUUID,
    userName: displayName
  },
  transports: ['websocket', 'polling'],
  reconnection: true
});
```

---

## Rate Limiting

### Per-Event Rate Limits

| Event | Limit | Window | Error Code |
|-------|-------|--------|------------|
| `subscribe:portfolio` | 10 requests | 1 minute | `RATE_LIMIT` |
| `subscribe:trades` | 10 requests | 1 minute | `RATE_LIMIT` |
| `subscribe:watchlist` | 10 requests | 1 minute | `RATE_LIMIT` |
| `unsubscribe:watchlist` | 10 requests | 1 minute | `RATE_LIMIT` |

### Subscription Limits

- **Max concurrent subscriptions**: 50 per user
- **Max watchlist symbols**: 50 per subscription request
- **Error code**: `SUBSCRIPTION_LIMIT`

**Implementation**: `src/services/websocket/middleware/rateLimiter.js`

---

## Error Handling

### Error Response Format

All error events follow this structure:

```javascript
socket.emit('error', {
  event: string,      // Event that triggered error (e.g., 'subscribe:portfolio')
  code: string,       // Error code (e.g., 'RATE_LIMIT')
  message: string     // Human-readable error message
});
```

### Common Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| `UNAUTHORIZED` | Authentication required or invalid session | Re-authenticate or login again |
| `RATE_LIMIT` | Too many requests in time window | Wait before retrying |
| `SUBSCRIPTION_LIMIT` | Maximum subscriptions reached | Unsubscribe from unused subscriptions |
| `INVALID_PARAMS` | Invalid parameters provided | Fix request payload |
| `SERVER_ERROR` | Internal server error | Retry or contact support |

---

## Event Flow Diagrams

### Portfolio Subscription Flow

```
Client                                  Server
  |                                       |
  |-- subscribe:portfolio -------------->|
  |                                       |-- Validate auth
  |                                       |-- Check rate limit
  |                                       |-- Check subscription limit
  |                                       |-- Join room 'portfolio:userId'
  |                                       |
  |<-- subscribed:portfolio --------------|
  |                                       |
  |                                       |-- (Portfolio value changes)
  |<-- portfolio:update ------------------|
  |                                       |
  |<-- portfolio:update ------------------|
  |                                       |
```

### Trade Notification Flow

```
Signal Provider                Client                Server                Broker
     |                           |                     |                     |
     |-- Discord signal -------->|                     |                     |
     |                           |                     |                     |
     |                           |-- API: Execute ---->|                     |
     |                           |                     |-- Place order ----->|
     |                           |                     |                     |
     |                           |                     |<-- Order filled ----|
     |                           |                     |                     |
     |                           |<-- trade:executed --|                     |
     |                           |                     |                     |
```

### Watchlist Subscription Flow

```
Client                                  Server                         Market Data
  |                                       |                                 |
  |-- subscribe:watchlist --------------->|                                 |
  |    { symbols: ['AAPL', 'TSLA'] }      |                                 |
  |                                       |-- Join rooms:                   |
  |                                       |   'watchlist:AAPL'              |
  |                                       |   'watchlist:TSLA'              |
  |                                       |                                 |
  |<-- subscribed:watchlist --------------|                                 |
  |                                       |                                 |
  |                                       |<-- Price update (AAPL) ---------|
  |<-- quote:update (AAPL) --------------|                                 |
  |                                       |                                 |
  |                                       |<-- Price update (TSLA) ---------|
  |<-- quote:update (TSLA) --------------|                                 |
  |                                       |                                 |
```

---

## Testing Events

### Development/Testing Events

These events are **ONLY** available in `NODE_ENV=development` or `NODE_ENV=test` and are used for integration testing.

| Event | Direction | Purpose |
|-------|-----------|---------|
| `test:trigger-portfolio-update` | C→S | Trigger mock portfolio update |
| `test:trigger-trade-notification` | C→S | Trigger mock trade notification |
| `test:trigger-quote-update` | C→S | Trigger mock quote update |

**File Location**: `src/services/WebSocketServer.js` (legacy implementation)

**⚠️ Security**: These events are disabled in production via environment check.

---

## Best Practices

### Client-Side

1. **Always handle errors**: Subscribe to `error` event globally
2. **Cleanup on unmount**: Use `useEffect` return function to disconnect
3. **Avoid memory leaks**: Unsubscribe from events when component unmounts
4. **Check connection state**: Verify `socket.connected` before emitting
5. **Use reconnection logic**: Enable `reconnection: true` in socket options
6. **Batch subscriptions**: Subscribe to multiple events in same connection

### Server-Side

1. **Validate authentication**: Always check `socket.handshake.auth.authenticated`
2. **Enforce rate limits**: Use rate limiter middleware for all events
3. **Validate payloads**: Check data types and required fields
4. **Use rooms for targeting**: Avoid broadcasting to all clients
5. **Log all events**: Use structured logging for debugging
6. **Graceful shutdown**: Notify clients before server shutdown

---

## Performance Metrics

### Target Latency

| Metric | Target | Measurement |
|--------|--------|-------------|
| Connection establishment | <500ms | Time from `io()` to `connected` event |
| Event round-trip (ping/pong) | <100ms | Client → Server → Client latency |
| Subscription confirmation | <200ms | Time from `subscribe` to `subscribed` event |
| Trade notification | <50ms | Time from broker confirmation to client notification |

### Monitoring

**Health Check Endpoint**: `GET /health/websocket`

**Response**:
```javascript
{
  status: 'healthy',
  stats: {
    totalConnections: 1247,
    uniqueUsers: 834,
    redisAdapter: true,
    uptime: 86400  // seconds
  }
}
```

**File Location**: `src/services/websocket/WebSocketServer.js:291-299`

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Resolution |
|-------|---------|------------|
| Connection refused | `connect_error` immediately | Check server is running and CORS settings |
| Authentication failed | `error` with code `UNAUTHORIZED` | Verify session ID and user ID are valid |
| No events received | Subscribed but no data | Check if joined correct room and events are being emitted |
| Reconnection loop | Constant disconnect/reconnect | Check session expiry, rate limits, or server errors |
| Rate limit errors | `error` with code `RATE_LIMIT` | Reduce subscription frequency or contact support |

### Debug Mode

Enable verbose logging:

```javascript
// Client-side
localStorage.debug = 'socket.io-client:*';

// Server-side
process.env.DEBUG = 'socket.io:*';
```

---

## Event Summary Table

### Quick Reference

| Event | Direction | Auth Required | Rate Limited | Payload Required |
|-------|-----------|---------------|--------------|------------------|
| `connect` | Auto (S→C) | ✅ Yes | ❌ No | ❌ No |
| `connected` | S→C | ❌ No | ❌ No | ❌ No |
| `subscribe:portfolio` | C→S | ✅ Yes | ✅ Yes | ❌ No |
| `subscribe:trades` | C→S | ✅ Yes | ✅ Yes | ❌ No |
| `subscribe:watchlist` | C→S | ✅ Yes | ✅ Yes | ✅ Yes |
| `unsubscribe:watchlist` | C→S | ✅ Yes | ✅ Yes | ✅ Yes |
| `ping` | C→S | ❌ No | ❌ No | ✅ Yes |
| `subscribed:portfolio` | S→C | ❌ No | ❌ No | ❌ No |
| `subscribed:trades` | S→C | ❌ No | ❌ No | ❌ No |
| `subscribed:watchlist` | S→C | ❌ No | ❌ No | ❌ No |
| `unsubscribed:watchlist` | S→C | ❌ No | ❌ No | ❌ No |
| `portfolio:update` | S→C | ❌ No | ❌ No | ❌ No |
| `trade:executed` | S→C | ❌ No | ❌ No | ❌ No |
| `trade:failed` | S→C | ❌ No | ❌ No | ❌ No |
| `quote:update` | S→C | ❌ No | ❌ No | ❌ No |
| `position:closed` | S→C | ❌ No | ❌ No | ❌ No |
| `server:shutdown` | S→C | ❌ No | ❌ No | ❌ No |
| `error` | S→C | ❌ No | ❌ No | ❌ No |
| `pong` | S→C | ❌ No | ❌ No | ❌ No |

**Total Events Documented**: 18 production events + 3 development/testing events = **21 events**

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-20 | Initial event catalog documentation |

---

**Documentation Maintained By**: Architecture Team
**Next Review**: 2026-01-20 (quarterly review)
**Contact**: See `openspec/project.md` for team contacts
