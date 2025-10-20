# WebSocket Connection Architecture
## Discord Trade Executor - Real-Time Infrastructure Guide

**Version:** 1.0.0
**Last Updated:** 2025-10-20
**Status:** ✅ **PRODUCTION READY**

---

## Overview

This document describes the WebSocket connection lifecycle, architecture patterns, and implementation details for the Discord Trade Executor real-time communication infrastructure.

**Related Documentation:**
- **Event Catalog**: `docs/websocket/WEBSOCKET_EVENT_CATALOG.md` - Complete event reference
- **Scaling Guide**: `docs/websocket/WEBSOCKET_SCALING_TROUBLESHOOTING.md` - Horizontal scaling patterns

---

## Connection Lifecycle

### 1. Connection Establishment

```
┌─────────────┐                                  ┌──────────────┐
│   Client    │                                  │    Server    │
│ (Dashboard) │                                  │  (Socket.io) │
└──────┬──────┘                                  └──────┬───────┘
       │                                                │
       │  1. io() with auth params                     │
       ├──────────────────────────────────────────────>│
       │                                                │
       │                                    2. Auth Middleware
       │                                       ┌────────┴────────┐
       │                                       │ Validate session │
       │                                       │ Check user ID    │
       │                                       └────────┬────────┘
       │                                                │
       │  3. connect event (success)                   │
       │<──────────────────────────────────────────────┤
       │                                                │
       │  4. connected event + welcome data            │
       │<──────────────────────────────────────────────┤
       │                                                │
       │                                    5. Join user room
       │                                       ┌────────┴────────┐
       │                                       │ user:${userId}  │
       │                                       └─────────────────┘
       │                                                │
```

#### Client-Side Implementation

**File**: `src/dashboard/hooks/useWebSocket.js:35-141`

```javascript
// Initialize connection
const connect = useCallback(() => {
  const socket = io(SOCKET_URL, {
    // Authentication payload
    auth: {
      sessionID,        // Express session ID from cookies
      userId,           // User UUID from session
      userName: 'User'  // Display name
    },
    // Transport configuration
    transports: ['websocket', 'polling'],
    // Reconnection settings
    reconnection: true,
    reconnectionDelay: 1000,          // Start with 1 second
    reconnectionDelayMax: 5000,       // Max 5 seconds
    reconnectionAttempts: Infinity    // Never give up
  });

  // Connection success handler
  socket.on('connect', () => {
    setConnected(true);
    setError(null);
    setReconnectAttempt(0);
  });

  socketRef.current = socket;
}, [sessionID, userId, SOCKET_URL]);
```

#### Server-Side Implementation

**File**: `src/services/websocket/WebSocketServer.js:153-212`

```javascript
handleConnection(socket) {
  const { userId, userName } = socket.handshake.auth || {};

  logger.info(`🔌 WebSocket connected: ${socket.id} (User: ${userName || userId})`);

  // Track active connection
  if (userId) {
    if (!this.activeConnections.has(userId)) {
      this.activeConnections.set(userId, new Set());
    }
    this.activeConnections.get(userId).add(socket.id);

    // Join user-specific room for targeted broadcasts
    socket.join(`user:${userId}`);
  }

  // Send welcome message
  socket.emit('connected', {
    socketId: socket.id,
    userId,
    timestamp: new Date().toISOString(),
    message: 'WebSocket connection established'
  });
}
```

---

### 2. Authentication Middleware

**Purpose**: Validate user session before allowing WebSocket connection.

**Flow**:
```
Client connects
     ↓
Extract auth payload
     ↓
Validate session with MongoDB store
     ↓
Check userId matches session
     ↓
Attach authenticated flag
     ↓
Allow/Deny connection
```

**File**: `src/services/websocket/middleware/auth.js`

```javascript
async function authenticateWebSocket(socket, next) {
  try {
    const { sessionID, userId } = socket.handshake.auth;

    if (!sessionID || !userId) {
      return next(new Error('UNAUTHORIZED: Missing authentication credentials'));
    }

    // Validate session with express-session MongoDB store
    const sessionStore = require('../../config/session').sessionStore;
    const session = await new Promise((resolve, reject) => {
      sessionStore.get(sessionID, (err, session) => {
        if (err) reject(err);
        else resolve(session);
      });
    });

    // Verify session exists and matches user
    if (!session || !session.passport || session.passport.user !== userId) {
      return next(new Error('UNAUTHORIZED: Invalid session or user mismatch'));
    }

    // Attach authentication data
    socket.handshake.auth.authenticated = true;
    socket.handshake.auth.userName = session.userName || 'User';
    socket.handshake.auth.userRole = session.userRole || 'user';

    logger.info(`✅ WebSocket authenticated: ${userId} (${session.userName})`);
    next(); // Allow connection

  } catch (error) {
    logger.error('WebSocket authentication failed:', error);
    next(new Error('AUTHENTICATION_FAILED'));
  }
}

module.exports = { authenticateWebSocket };
```

**Integration**: `src/index.js`

```javascript
const { authenticateWebSocket } = require('./services/websocket/middleware/auth');

// Apply authentication middleware
webSocketServer.setAuthMiddleware(authenticateWebSocket);
```

---

### 3. Subscription Management

**Purpose**: Manage user subscriptions to real-time data streams.

**Subscription Flow**:
```
Client emits 'subscribe:portfolio'
     ↓
Server validates authentication
     ↓
Server checks rate limits
     ↓
Server checks subscription limits
     ↓
Server joins socket to room 'portfolio:userId'
     ↓
Server increments subscription counter
     ↓
Server emits 'subscribed:portfolio' confirmation
     ↓
Client receives updates via 'portfolio:update' events
```

**File**: `src/services/websocket/handlers/index.js:30-87`

**Key Concepts**:

1. **Rate Limiting**: Prevent abuse via rate limiter middleware
   - Max 10 subscription requests per minute
   - Max 50 concurrent subscriptions per user

2. **Room-Based Broadcasting**: Efficient targeting of specific users
   - `portfolio:${userId}` - Portfolio updates for specific user
   - `trades:${userId}` - Trade notifications for specific user
   - `watchlist:${SYMBOL}` - Quote updates for specific symbol

3. **Subscription Tracking**: Monitor active subscriptions
   ```javascript
   // Track subscription count
   await rateLimiter.incrementSubscription(socket);

   // On unsubscribe
   await rateLimiter.decrementSubscription(socket);
   ```

---

### 4. Disconnection Handling

**Graceful Disconnection Flow**:

```
Client/Server initiates disconnect
     ↓
socket.on('disconnect', reason) fires
     ↓
Log disconnect reason
     ↓
Remove from activeConnections map
     ↓
Leave all rooms (automatic)
     ↓
Decrement subscription counters
     ↓
Clean up resources
```

**Client-Side Implementation**:

```javascript
socket.on('disconnect', reason => {
  logger.info(`🔌 WebSocket disconnected: ${reason}`);
  setConnected(false);

  // Handle different disconnect reasons
  if (reason === 'io server disconnect') {
    // Server initiated disconnect - reconnect manually
    setTimeout(() => socket.connect(), 1000);
  } else if (reason === 'transport close' || reason === 'ping timeout') {
    // Network issues - socket.io will auto-reconnect
    console.log('Network issue detected, auto-reconnecting...');
  }
});
```

**Server-Side Implementation**:

```javascript
socket.on('disconnect', reason => {
  logger.info(`🔌 WebSocket disconnected: ${socket.id} (Reason: ${reason})`);

  // Remove from active connections
  if (userId) {
    const connections = this.activeConnections.get(userId);
    if (connections) {
      connections.delete(socket.id);
      if (connections.size === 0) {
        this.activeConnections.delete(userId);
      }
    }
  }
});
```

**Common Disconnect Reasons**:

| Reason | Meaning | Action |
|--------|---------|--------|
| `transport close` | Network connection lost | Auto-reconnect |
| `ping timeout` | Client didn't respond to ping | Auto-reconnect |
| `io server disconnect` | Server initiated disconnect | Manual reconnect |
| `io client disconnect` | Client called `socket.disconnect()` | No action |
| `transport error` | Transport failure | Auto-reconnect |

---

### 5. Reconnection Logic

**Automatic Reconnection Flow**:

```
Connection lost
     ↓
Emit 'disconnect' event
     ↓
Wait reconnectionDelay (1s)
     ↓
Emit 'reconnect_attempt' event
     ↓
Attempt reconnection
     ↓
Success? ──Yes──> Emit 'reconnect' event
     │               ↓
     │          Restore subscriptions
     │
     No
     ↓
Exponential backoff (up to 5s)
     ↓
Retry (up to Infinity attempts)
```

**Client Configuration**:

```javascript
const socket = io(SOCKET_URL, {
  reconnection: true,               // Enable auto-reconnect
  reconnectionDelay: 1000,          // Start with 1 second delay
  reconnectionDelayMax: 5000,       // Max delay of 5 seconds
  reconnectionAttempts: Infinity    // Never give up
});

// Track reconnection attempts
socket.on('reconnect_attempt', attempt => {
  console.log(`🔄 Reconnection attempt ${attempt}...`);
  setReconnectAttempt(attempt);
});

// Reconnection successful
socket.on('reconnect', attempt => {
  console.log(`✅ Reconnected after ${attempt} attempts`);
  setConnected(true);
  setError(null);

  // Re-subscribe to all subscriptions
  restoreSubscriptions();
});
```

**Best Practice**: Store active subscriptions in state and re-subscribe after reconnection:

```javascript
const [activeSubscriptions, setActiveSubscriptions] = useState(new Set());

const restoreSubscriptions = useCallback(() => {
  activeSubscriptions.forEach(subscription => {
    if (subscription.type === 'portfolio') {
      emit('subscribe:portfolio');
    } else if (subscription.type === 'trades') {
      emit('subscribe:trades');
    } else if (subscription.type === 'watchlist') {
      emit('subscribe:watchlist', { symbols: subscription.symbols });
    }
  });
}, [activeSubscriptions, emit]);
```

---

## Architecture Patterns

### 1. Client-Server Communication Model

```
┌─────────────────────────────────────────────────────────┐
│                    React Dashboard                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │          useWebSocket Hook                         │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Connection Management                       │ │ │
│  │  │  - Auto-connect on mount                     │ │ │
│  │  │  - Reconnection handling                     │ │ │
│  │  │  - State tracking (connected, error)         │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Event Management                            │ │ │
│  │  │  - subscribe(event, handler)                 │ │ │
│  │  │  - emit(event, data)                         │ │ │
│  │  │  - Cleanup on unmount                        │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ socket.io-client
                          │ (WebSocket/polling)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Express.js Server                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │          WebSocketServer Class                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Middleware Stack                            │ │ │
│  │  │  1. Authentication (session validation)      │ │ │
│  │  │  2. Rate Limiting (event + subscription)     │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Event Handlers                              │ │ │
│  │  │  - subscribe:portfolio                       │ │ │
│  │  │  - subscribe:trades                          │ │ │
│  │  │  - subscribe:watchlist                       │ │ │
│  │  │  - unsubscribe:watchlist                     │ │ │
│  │  │  - ping                                       │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Broadcast Methods                           │ │ │
│  │  │  - emitToUser(userId, event, data)           │ │ │
│  │  │  - emitToRoom(room, event, data)             │ │ │
│  │  │  - emitToAll(event, data)                    │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Socket.io Adapter                         │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Single Server: Default Adapter              │ │ │
│  │  │  - In-memory room management                 │ │ │
│  │  │  - No horizontal scaling                     │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Multi-Server: Redis Adapter                 │ │ │
│  │  │  - Redis pub/sub for cross-server events    │ │ │
│  │  │  - Horizontal scaling support                │ │ │
│  │  │  - Shared room state                         │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Redis pub/sub
                          │ (if multi-server)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Redis Server                        │
│  - Pub/sub for cross-server communication               │
│  - Room state synchronization                            │
│  - Adapter scaling to N servers                          │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Room-Based Broadcasting Architecture

**Room Strategy**: Organize clients into logical groups for efficient broadcasting.

```
┌───────────────────────────────────────────────────────┐
│                  Socket.io Server                      │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Room: user:12345                      │ │
│  │  ┌──────┐  ┌──────┐  ┌──────┐                  │ │
│  │  │ Sock │  │ Sock │  │ Sock │  (User 12345's  │ │
│  │  │  A   │  │  B   │  │  C   │   connections)  │ │
│  │  └──────┘  └──────┘  └──────┘                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │        Room: portfolio:12345                    │ │
│  │  ┌──────┐  ┌──────┐  ┌──────┐                  │ │
│  │  │ Sock │  │ Sock │  │ Sock │  (Portfolio     │ │
│  │  │  A   │  │  B   │  │  C   │   subscribers)  │ │
│  │  └──────┘  └──────┘  └──────┘                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │        Room: trades:12345                       │ │
│  │  ┌──────┐  ┌──────┐                             │ │
│  │  │ Sock │  │ Sock │  (Trade notification        │ │
│  │  │  A   │  │  C   │   subscribers)              │ │
│  │  └──────┘  └──────┘                             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │        Room: watchlist:AAPL                     │ │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │ │
│  │  │ User │  │ User │  │ User │  │ User │        │ │
│  │  │12345 │  │67890 │  │54321 │  │11111 │        │ │
│  │  └──────┘  └──────┘  └──────┘  └──────┘        │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

**Broadcasting Examples**:

```javascript
// Broadcast to specific user (all their connections)
webSocketServer.emitToUser('user-12345', 'portfolio:update', {
  userId: 'user-12345',
  portfolio: { value: 125000, dayPL: +2500 }
});

// Broadcast to room (all subscribers)
webSocketServer.emitToRoom('watchlist:AAPL', 'quote:update', {
  symbol: 'AAPL',
  quote: { price: 185.50, change: +1.25 }
});

// Broadcast to all connected clients (rare - use sparingly)
webSocketServer.emitToAll('server:shutdown', {
  message: 'Maintenance starting in 5 minutes'
});
```

---

### 3. Multi-Connection Support

**Why**: Users may have multiple browser tabs/devices connected simultaneously.

**Implementation**:

```javascript
// Server tracks all connections per user
this.activeConnections = new Map(); // userId -> Set of socket IDs

// On connection
if (userId) {
  if (!this.activeConnections.has(userId)) {
    this.activeConnections.set(userId, new Set());
  }
  this.activeConnections.get(userId).add(socket.id);
}

// On disconnect
if (userId) {
  const connections = this.activeConnections.get(userId);
  if (connections) {
    connections.delete(socket.id);
    if (connections.size === 0) {
      this.activeConnections.delete(userId);
    }
  }
}
```

**Benefits**:
- All user devices receive real-time updates simultaneously
- Graceful handling when one tab closes
- Clean state management when all connections close

---

### 4. Event-Driven Architecture

**Integration with Trade Executor**:

```
Trade Signal
     ↓
Discord/TradingView Webhook
     ↓
API Route Handler
     ↓
Trade Executor Service
     ↓
Broker Adapter (Alpaca, Binance, etc.)
     ↓
Broker API Response
     ↓
Trade Executor emits 'trade:executed' or 'trade:failed'
     ↓
WebSocket Server listens for trade events
     ↓
Broadcast to user room: trades:${userId}
     ↓
All user clients receive notification
```

**File**: Integration between services

```javascript
// In Trade Executor service
class TradeExecutor extends EventEmitter {
  async executeTrade(signal) {
    try {
      const result = await brokerAdapter.executeTrade(signal);

      // Emit trade executed event (caught by WebSocket server)
      this.emit('trade:executed', {
        userId: signal.userId,
        trade: {
          id: result.orderId,
          symbol: signal.symbol,
          side: signal.side,
          quantity: result.quantity,
          price: result.price,
          status: 'filled'
        }
      });
    } catch (error) {
      // Emit trade failed event
      this.emit('trade:failed', {
        userId: signal.userId,
        trade: {
          symbol: signal.symbol,
          error: error.message
        }
      });
    }
  }
}

// In WebSocket integration (src/index.js)
tradeExecutor.on('trade:executed', (data) => {
  webSocketServer.emitToUser(data.userId, 'trade:executed', data);
});

tradeExecutor.on('trade:failed', (data) => {
  webSocketServer.emitToUser(data.userId, 'trade:failed', data);
});
```

---

## Middleware Architecture

### 1. Authentication Middleware

**Purpose**: Validate user session before connection.

**Order**: FIRST (before rate limiting)

**File**: `src/services/websocket/middleware/auth.js`

```javascript
io.use(authenticateWebSocket);
```

**What it does**:
1. Extract `sessionID` and `userId` from `socket.handshake.auth`
2. Query MongoDB session store to validate session
3. Verify `userId` matches session data
4. Attach `authenticated: true` flag to socket
5. Allow connection or reject with error

**Error Handling**:
- Missing credentials → `UNAUTHORIZED`
- Invalid session → `UNAUTHORIZED`
- User mismatch → `UNAUTHORIZED`
- Database error → `AUTHENTICATION_FAILED`

---

### 2. Rate Limiting Middleware

**Purpose**: Prevent abuse and ensure fair resource allocation.

**Order**: SECOND (after authentication)

**File**: `src/services/websocket/middleware/rateLimiter.js`

**Two-Tier Limiting**:

#### a) Event Rate Limiting
- Limits how often a user can emit specific events
- Example: Max 10 `subscribe:portfolio` requests per minute

```javascript
const rateLimiter = new RateLimiter({
  events: {
    'subscribe:portfolio': { max: 10, window: 60000 },
    'subscribe:trades': { max: 10, window: 60000 },
    'subscribe:watchlist': { max: 10, window: 60000 }
  }
});
```

#### b) Subscription Limiting
- Limits total concurrent subscriptions per user
- Example: Max 50 subscriptions (prevents resource exhaustion)

```javascript
async checkSubscriptionLimit(socket) {
  const userId = socket.handshake.auth.userId;
  const currentSubscriptions = await redis.get(`subscriptions:${userId}`);

  if (currentSubscriptions >= 50) {
    return false; // Limit reached
  }

  return true;
}
```

---

## Transport Configuration

### Transport Modes

Socket.io supports multiple transport mechanisms with automatic fallback:

```javascript
const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']  // Priority order
});
```

**Transport Comparison**:

| Transport | Latency | Bandwidth | Firewall Friendly | When to Use |
|-----------|---------|-----------|-------------------|-------------|
| `websocket` | 10-50ms | Efficient | No (port 80/443) | Modern browsers, direct connection |
| `polling` | 100-500ms | Higher | Yes (HTTP) | Corporate firewalls, legacy browsers |

**Automatic Upgrade Flow**:
1. Client connects with `polling` (HTTP long-polling)
2. Socket.io tests WebSocket support
3. Upgrades to `websocket` if supported
4. Falls back to `polling` if WebSocket fails

---

## Security Considerations

### 1. Authentication

- **Session-Based**: Uses express-session with MongoDB store
- **Validation**: Every connection validates session before allowing
- **Secure Cookies**: `httpOnly`, `secure`, `sameSite` flags
- **Session Expiry**: 7-day cookie lifetime (configurable)

### 2. Authorization

- **Per-Event Checks**: Each event handler validates `socket.handshake.auth.authenticated`
- **Room-Based**: Users can only join their own rooms (`portfolio:${userId}`)
- **Rate Limiting**: Prevents DOS attacks via subscription spam

### 3. Data Validation

- **Input Validation**: All event payloads validated (type, format, ranges)
- **Sanitization**: User inputs sanitized to prevent injection
- **Error Handling**: Graceful errors without exposing internals

### 4. CORS Configuration

```javascript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',    // Restrict in production
    methods: ['GET', 'POST'],
    credentials: true                           // Allow cookies
  }
});
```

**Production CORS**:
```bash
CORS_ORIGIN=https://yourdomain.com
```

---

## Performance Optimizations

### 1. Connection Pooling

- **Keep-Alive**: Persistent connections reduce handshake overhead
- **Ping/Pong**: Health checks every 25 seconds (configurable)
- **Timeout**: 60-second ping timeout before disconnect

```javascript
const io = new Server(httpServer, {
  pingTimeout: 60000,      // 60 seconds
  pingInterval: 25000      // 25 seconds
});
```

### 2. Room-Based Broadcasting

- **Targeted Delivery**: Send only to subscribed clients
- **Efficient Routing**: O(1) room lookups via hash maps
- **Memory Efficient**: Shared room state via Redis adapter

### 3. Event Compression (Future Enhancement)

```javascript
// Enable compression for large payloads
const io = new Server(httpServer, {
  perMessageDeflate: {
    threshold: 1024  // Compress messages >1KB
  }
});
```

### 4. Binary Data Support

Socket.io supports binary data (ArrayBuffers, Blobs) for efficient transmission:

```javascript
// Send binary chart data
socket.emit('chart:data', new Uint8Array([...]));
```

---

## Monitoring & Health Checks

### Health Check Endpoint

**File**: Server setup in `src/index.js`

```javascript
app.get('/health/websocket', (req, res) => {
  const stats = webSocketServer.getStats();

  res.json({
    status: stats.initialized ? 'healthy' : 'unhealthy',
    stats: {
      totalConnections: stats.totalConnections,
      uniqueUsers: stats.uniqueUsers,
      redisAdapter: stats.redisAdapter,
      uptime: stats.uptime
    }
  });
});
```

**Example Response**:
```json
{
  "status": "healthy",
  "stats": {
    "totalConnections": 1247,
    "uniqueUsers": 834,
    "redisAdapter": true,
    "uptime": 86400
  }
}
```

---

### Metrics to Track

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Total Connections | Current WebSocket connections | >5000 (scaling needed) |
| Unique Users | Distinct user IDs connected | Trending analysis |
| Reconnection Rate | Reconnections per minute | >100/min (network issues) |
| Event Latency | Time from emit to receive | >500ms p99 |
| Error Rate | Errors per minute | >10/min |
| Memory Usage | Process RSS memory | >1GB (check for leaks) |

---

## Graceful Shutdown

**Purpose**: Notify clients before server shutdown and clean up resources.

**Flow**:
```
1. Receive SIGTERM signal
     ↓
2. Emit 'server:shutdown' to all clients
     ↓
3. Wait 1 second for clients to receive
     ↓
4. Disconnect all sockets
     ↓
5. Close Socket.io server
     ↓
6. Close Redis pub/sub clients
     ↓
7. Exit process
```

**Implementation**:

```javascript
async shutdown() {
  logger.info('Shutting down WebSocket server...');

  // Notify all clients
  if (this.io) {
    this.io.emit('server:shutdown', {
      message: 'Server is shutting down for maintenance',
      timestamp: new Date().toISOString()
    });

    // Give clients time to receive shutdown message
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Disconnect all sockets
    this.io.disconnectSockets(true);

    // Close Socket.io server
    this.io.close();
  }

  // Close Redis clients
  if (this.redisPubClient) {
    await this.redisPubClient.quit();
  }

  if (this.redisSubClient) {
    await this.redisSubClient.quit();
  }

  logger.info('✅ WebSocket server shut down successfully');
}
```

**File**: `src/services/websocket/WebSocketServer.js:304-345`

---

## Client-Side Best Practices

### 1. Connection Management

```javascript
// Auto-connect on mount, disconnect on unmount
useEffect(() => {
  if (autoConnect && sessionID) {
    connect();
  }

  return () => {
    mountedRef.current = false;
    disconnect();  // Clean up on unmount
  };
}, [autoConnect, sessionID, connect, disconnect]);
```

### 2. Event Subscription Cleanup

```javascript
// Subscribe with cleanup
useEffect(() => {
  if (!socket?.connected) return;

  const unsubscribe = subscribe('portfolio:update', handlePortfolioUpdate);

  // Cleanup on unmount
  return () => {
    unsubscribe();
  };
}, [socket, subscribe]);
```

### 3. Error Handling

```javascript
// Global error handler
useEffect(() => {
  if (!socket) return;

  const handleError = (err) => {
    console.error('WebSocket error:', err);

    if (err.code === 'UNAUTHORIZED') {
      redirectToLogin();
    } else if (err.code === 'RATE_LIMIT') {
      showWarning('Please slow down your requests');
    } else {
      showError(err.message);
    }
  };

  socket.on('error', handleError);

  return () => {
    socket.off('error', handleError);
  };
}, [socket]);
```

---

## Architecture Diagrams

### Connection State Machine

```
          ┌──────────┐
    ┌────>│  IDLE    │
    │     └────┬─────┘
    │          │ connect()
    │          ▼
    │     ┌──────────┐
    │     │CONNECTING│
    │     └─┬──────┬─┘
    │       │      │
    │  success   fail
    │       │      │
    │       ▼      ▼
    │  ┌──────┐ ┌─────────┐
    │  │CONNEC│ │RECONNECT│
    │  │ TED  │ │  ING    │
    │  └──┬───┘ └────┬────┘
    │     │          │
    │disconnect   success
    │     │          │
    └─────┘          ▼
               ┌──────────┐
               │CONNECTED │
               │(restored)│
               └──────────┘
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-20 | Initial connection architecture documentation |

---

**Documentation Maintained By**: Architecture Team
**Next Review**: 2026-01-20 (quarterly review)
**Related Documentation**:
- Event Catalog: `docs/websocket/WEBSOCKET_EVENT_CATALOG.md`
- Scaling Guide: `docs/websocket/WEBSOCKET_SCALING_TROUBLESHOOTING.md`
