# WebSocket Architecture

Technical architecture documentation for the Discord Trade Exec WebSocket server.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Scalability](#scalability)
- [Security](#security)
- [Performance](#performance)
- [Monitoring](#monitoring)

---

## Overview

### Design Principles

1. **Modularity**: Separation of concerns with dedicated modules
2. **Scalability**: Horizontal scaling with Redis adapter
3. **Security**: Session-based auth, rate limiting, tenant isolation
4. **Performance**: Optimized event handling, connection pooling
5. **Reliability**: Graceful degradation, error handling, health checks

### Technology Stack

```yaml
WebSocket Server: Socket.io 4.8.1
Redis Adapter: @socket.io/redis-adapter 8.3.0
Redis Client: ioredis 5.4.2
Database: MongoDB (Mongoose)
Authentication: Session-based (MongoDB sessions)
Rate Limiting: Redis-backed with in-memory fallback
Deployment: Railway (PaaS)
CI/CD: GitHub Actions
```

---

## Architecture Diagram

### High-Level Architecture

```
┌──────────────┐
│   Clients    │
│ (Browser/App)│
└──────┬───────┘
       │ WSS/HTTPS
       ▼
┌─────────────────────────────────────┐
│      Railway Load Balancer          │
└──────────┬──────────────┬───────────┘
           │              │
           ▼              ▼
    ┌──────────┐   ┌──────────┐
    │ Server 1 │   │ Server 2 │ ... (Horizontal Scaling)
    └────┬─────┘   └────┬─────┘
         │              │
         └──────┬───────┘
                │
         ┌──────▼────────┐
         │ Redis Adapter │ (Pub/Sub)
         └──────┬────────┘
                │
         ┌──────▼────────┐
         │  Railway Redis│
         └───────────────┘
                │
         ┌──────▼────────┐
         │  MongoDB Atlas│
         └───────────────┘
```

### Component Architecture

```
WebSocket Server
├── Core Server (WebSocketServer.js)
│   ├── Socket.io instance
│   ├── Redis adapter (optional)
│   ├── Connection management
│   └── Event routing
│
├── Middleware
│   ├── Authentication (auth.js)
│   │   ├── Session validation
│   │   ├── User verification
│   │   └── Admin checks
│   │
│   └── Rate Limiting (rateLimiter.js)
│       ├── Redis-backed limits
│       ├── In-memory fallback
│       └── Graceful degradation
│
├── Event Handlers (handlers/)
│   ├── subscribe:portfolio
│   ├── subscribe:trades
│   ├── subscribe:watchlist
│   ├── unsubscribe:*
│   └── Error handling
│
└── Emitters (emitters/)
    ├── emitPortfolioUpdate
    ├── emitTradeExecuted
    ├── emitTradeFailed
    ├── emitWatchlistQuote
    ├── emitPositionClosed
    ├── emitNotification
    └── emitMarketStatus
```

---

## Core Components

### 1. WebSocket Server (`WebSocketServer.js`)

**Purpose**: Core WebSocket server managing connections and events.

**Responsibilities**:
- Initialize Socket.io server
- Manage client connections
- Route events to handlers
- Broadcast messages to rooms
- Graceful shutdown

**Key Methods**:

```javascript
class WebSocketServer {
  async initialize()                  // Initialize server with optional Redis
  setAuthMiddleware(middleware)       // Set authentication middleware
  setRateLimitMiddleware(middleware)  // Set rate limiting middleware
  registerEventHandler(event, handler)// Register client event handler
  emitToUser(userId, event, data)     // Emit to specific user
  emitToRoom(room, event, data)       // Emit to room
  broadcast(event, data)              // Emit to all connected clients
  getTotalConnectionCount()           // Get total active connections
  getUserConnectionCount(userId)      // Get user's connection count
  getStats()                          // Get server statistics
  async shutdown()                    // Graceful shutdown
}
```

**Configuration**:
```javascript
{
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6
}
```

---

### 2. Authentication Middleware (`middleware/auth.js`)

**Purpose**: Validate sessions and enforce access control.

**Flow**:
```
1. Extract sessionID and userId from socket.handshake.auth
2. Query MongoDB sessions collection
3. Validate session expiration
4. Parse session data (JSON)
5. Verify user ID matches
6. Attach user data to socket
7. Allow or reject connection
```

**Functions**:

#### `createAuthMiddleware(options)`

Main authentication middleware factory.

**Options**:
```typescript
{
  required?: boolean;              // Reject unauthenticated? (default: true)
  sessionCollectionName?: string;  // MongoDB collection (default: 'sessions')
}
```

**User Data Attached**:
```javascript
socket.handshake.auth = {
  userId: string;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
  authenticated: true
}
```

#### `requireAdmin()`

Admin-only middleware.

```javascript
const adminMiddleware = requireAdmin();
socket.use(adminMiddleware);
```

#### `requireSubscriptionTier(tiers)`

Subscription tier middleware.

```javascript
const premiumMiddleware = requireSubscriptionTier(['premium', 'enterprise']);
socket.use(premiumMiddleware);
```

---

### 3. Rate Limiter (`middleware/rateLimiter.js`)

**Purpose**: Prevent abuse with configurable rate limits.

**Features**:
- ✅ Redis-backed for distributed rate limiting
- ✅ In-memory fallback if Redis unavailable
- ✅ Per-user and per-event limits
- ✅ Sliding window algorithm
- ✅ Graceful degradation

**Configuration**:
```javascript
{
  globalLimit: 1000,      // Global events per minute
  subscribeLimit: 100,    // Subscribe events per minute
  unsubscribeLimit: 100,  // Unsubscribe events per minute
  windowMs: 60000         // 1 minute window
}
```

**Rate Limiting Strategy**:

```
Redis Available:
  1. INCR key (user:event:timestamp)
  2. Check count <= limit
  3. EXPIRE key (window duration)
  4. Allow or reject

Redis Unavailable:
  1. Use in-memory Map
  2. Track counts per user+event
  3. Clean up expired entries
  4. Allow (fail open for availability)
```

**Key Methods**:

```javascript
class RateLimiter {
  async checkLimit(userId, event)     // Check if request allowed
  incrementSubscription(userId)       // Increment subscription count
  decrementSubscription(userId)       // Decrement on unsubscribe
  getSubscriptionCount(userId)        // Get user's subscription count
  cleanupInMemory()                   // Clean expired in-memory entries
}
```

---

### 4. Event Handlers (`handlers/index.js`)

**Purpose**: Handle client-to-server events.

**Handler Pattern**:

```javascript
const handler = async (socket, data) => {
  try {
    // 1. Validate input
    if (!data.symbol) {
      throw new Error('Symbol required');
    }

    // 2. Check rate limit
    const allowed = await rateLimiter.checkLimit(
      socket.handshake.auth.userId,
      'subscribe:watchlist'
    );
    if (!allowed) {
      throw new Error('Rate limit exceeded');
    }

    // 3. Business logic
    const room = `watchlist:${data.symbol}`;
    await socket.join(room);

    // 4. Confirm subscription
    socket.emit('subscribed:watchlist', {
      success: true,
      symbol: data.symbol,
      userId: socket.handshake.auth.userId,
      timestamp: new Date().toISOString()
    });

    // 5. Log activity
    logger.info('User subscribed to watchlist', {
      userId: socket.handshake.auth.userId,
      symbol: data.symbol
    });

  } catch (error) {
    logger.error('Subscription error', error);
    socket.emit('error', {
      code: 'SUBSCRIPTION_ERROR',
      message: error.message
    });
  }
};
```

**Registered Handlers**:

| Event | Handler | Rate Limit | Auth Required |
|-------|---------|------------|---------------|
| `subscribe:portfolio` | Join `portfolio:${userId}` | 100/min | Yes |
| `unsubscribe:portfolio` | Leave room | 100/min | Yes |
| `subscribe:trades` | Join `trades:${userId}` | 100/min | Yes |
| `unsubscribe:trades` | Leave room | 100/min | Yes |
| `subscribe:watchlist` | Join `watchlist:${symbol}` | 100/min | Yes, Premium |
| `unsubscribe:watchlist` | Leave room | 100/min | Yes |

---

### 5. Emitters (`emitters/index.js`)

**Purpose**: Broadcast server-to-client events.

**Emitter Pattern**:

```javascript
const emitPortfolioUpdate = (userId, portfolioData) => {
  const room = `portfolio:${userId}`;

  webSocketServer.emitToRoom(room, 'portfolio:update', {
    userId,
    portfolio: portfolioData,
    timestamp: new Date().toISOString()
  });

  logger.debug('Emitted portfolio update', { userId, room });
};
```

**Available Emitters**:

```javascript
emitPortfolioUpdate(userId, portfolioData)
emitTradeExecuted(userId, tradeData)
emitTradeFailed(userId, failureData)
emitWatchlistQuote(symbol, quoteData)
emitPositionClosed(userId, positionData)
emitNotification(userId, notification)
emitMarketStatus(statusData)
```

**Room Naming Convention**:

| Purpose | Room Name | Scope |
|---------|-----------|-------|
| Portfolio updates | `portfolio:${userId}` | Per-user |
| Trade notifications | `trades:${userId}` | Per-user |
| Watchlist quotes | `watchlist:${symbol}` | Per-symbol |
| User notifications | `user:${userId}` | Per-user |
| Market status | `market:status` | Global |

---

## Data Flow

### Connection Flow

```
1. Client initiates WebSocket connection
   ├─ Provides sessionID and userId in auth
   └─ Sets transport mode (websocket/polling)

2. Server receives connection request
   ├─ Authentication middleware runs
   │  ├─ Validates session against MongoDB
   │  ├─ Checks session expiration
   │  └─ Attaches user data to socket
   │
   └─ Rate limit middleware runs
      └─ Initializes rate limit tracking

3. Connection accepted or rejected
   ├─ If accepted:
   │  ├─ Socket added to connection pool
   │  ├─ 'connect' event emitted to client
   │  └─ Client can subscribe to events
   │
   └─ If rejected:
      ├─ 'connect_error' emitted with reason
      └─ Connection closed
```

### Subscription Flow

```
1. Client emits subscribe event (e.g., 'subscribe:portfolio')

2. Event handler receives request
   ├─ Validates payload
   ├─ Checks rate limit
   ├─ Verifies permissions (subscription tier)
   └─ Joins user to room

3. Server confirms subscription
   ├─ Emits 'subscribed:portfolio' to client
   └─ Increments subscription count

4. Server broadcasts updates to room
   ├─ Business logic triggers update (trade executed)
   ├─ Emitter called with user/room identifier
   └─ All subscribers receive update
```

### Message Broadcasting Flow

```
Single Server (No Redis):
  Event → WebSocketServer.emitToRoom() → Socket.io → Clients in room

Multiple Servers (Redis Adapter):
  Event → WebSocketServer.emitToRoom()
        → Socket.io
        → Redis Pub/Sub
        → All server instances
        → Socket.io on each server
        → Clients in room on each server
```

---

## Scalability

### Horizontal Scaling with Redis

**Without Redis** (Single Server):
```
✅ Simple setup
✅ No external dependencies
❌ Single point of failure
❌ Limited connections (~10,000)
❌ No cross-server broadcasting
```

**With Redis Adapter** (Multi-Server):
```
✅ Horizontal scaling
✅ Load balancing across instances
✅ Cross-server broadcasting
✅ High availability
✅ Supports 100,000+ connections
⚠️ Requires Redis infrastructure
```

### Scaling Strategy

**Traffic < 1,000 connections**:
- Single Railway instance
- No Redis required
- Cost-effective

**Traffic 1,000-10,000 connections**:
- Single Railway instance with Redis
- Prepare for horizontal scaling
- Monitor performance

**Traffic 10,000+ connections**:
- Multiple Railway instances
- Redis adapter required
- Load balancer distribution
- Auto-scaling policies

### Redis Adapter Configuration

```javascript
// src/services/websocket/WebSocketServer.js

async initializeRedisAdapter() {
  if (!process.env.REDIS_URL) {
    logger.warn('No REDIS_URL - running in single-server mode');
    return;
  }

  // Create separate pub/sub clients
  this.redisPubClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: times => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3
  });

  this.redisSubClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: times => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3
  });

  // Attach adapter
  const adapter = createAdapter(this.redisPubClient, this.redisSubClient);
  this.io.adapter(adapter);

  logger.info('✅ Redis adapter initialized for horizontal scaling');
}
```

### Load Balancing

Railway automatically load balances across instances:

```
Client Request
    │
    ▼
Railway Load Balancer
    │
    ├─► Instance 1 (33% traffic)
    ├─► Instance 2 (33% traffic)
    └─► Instance 3 (34% traffic)
```

**Session Affinity**: Not required - Redis adapter handles cross-server messaging.

---

## Security

### Authentication Security

**Session Validation**:
- ✅ Sessions stored in MongoDB
- ✅ Session expiration enforced
- ✅ User ID verification
- ✅ Tamper-proof session data

**Best Practices**:
- ✅ Use HTTPS/WSS only
- ✅ Rotate session secrets
- ✅ Short session lifetimes (30 days max)
- ✅ Invalidate sessions on logout

### Authorization Security

**Tiered Access Control**:

```javascript
// Free tier
socket.on('subscribe:portfolio', handler);  // ✅ Allowed
socket.on('subscribe:watchlist', handler);  // ❌ Premium required

// Premium tier
socket.on('subscribe:portfolio', handler);  // ✅ Allowed
socket.on('subscribe:watchlist', handler);  // ✅ Allowed

// Admin only
socket.on('admin:broadcast', handler);      // ❌ Admin required
```

### Rate Limiting Security

**Protection Against**:
- DDoS attacks
- Resource exhaustion
- Subscription spam
- API abuse

**Rate Limit Strategy**:
- Per-user limits (not per-IP)
- Event-specific limits
- Sliding window algorithm
- Graceful degradation

### Data Security

**Tenant Isolation**:
- Users only receive their own data
- Room-based access control
- Server-side validation

**Sensitive Data**:
- Never log credentials
- Redact PII in logs
- Encrypt data in transit (WSS)
- Encrypt data at rest (MongoDB)

---

## Performance

### Connection Handling

**Optimization Strategies**:

1. **Connection Pooling**:
   ```javascript
   maxHttpBufferSize: 1e6,  // 1MB buffer
   pingTimeout: 60000,       // 60s timeout
   pingInterval: 25000       // Ping every 25s
   ```

2. **Transport Optimization**:
   ```javascript
   transports: ['websocket', 'polling'],
   allowUpgrades: true,
   upgradeTimeout: 10000
   ```

3. **Memory Management**:
   - Track active connections
   - Clean up on disconnect
   - Limit subscriptions per user

### Event Handling Performance

**Optimizations**:

1. **Async Handlers**:
   ```javascript
   const handler = async (socket, data) => {
     // Non-blocking I/O
     await processSubscription(data);
   };
   ```

2. **Batching**:
   - Batch database queries
   - Debounce rapid updates
   - Aggregate broadcasts

3. **Caching**:
   - Cache user sessions (Redis)
   - Cache rate limit counters (Redis)
   - Cache frequently accessed data

### Broadcasting Performance

**Strategies**:

1. **Room-Based Broadcasting**:
   ```javascript
   // Efficient: Only to subscribers
   emitToRoom('watchlist:AAPL', 'quote', data);

   // Inefficient: To all clients
   broadcast('quote', data);
   ```

2. **Selective Updates**:
   - Send only changed data
   - Use delta updates
   - Compress large payloads

3. **Throttling**:
   - Limit update frequency
   - Debounce quote updates
   - Batch notifications

### Benchmarks

**Load Test Results** (from `tests/load/websocket-load.test.js`):

| Metric | Target | Actual |
|--------|--------|--------|
| Concurrent Connections | 1000 | ✅ 1000 (4.4s) |
| Connection Latency P50 | < 50ms | ✅ ~30ms |
| Connection Latency P95 | < 200ms | ✅ ~150ms |
| Connection Latency P99 | < 500ms | ✅ ~300ms |
| Memory per Connection | < 10KB | ✅ ~8KB |
| Broadcast to 200 clients | < 1s | ✅ ~800ms |

---

## Monitoring

### Application Metrics

**Key Metrics to Monitor**:

```javascript
{
  websocket: {
    totalConnections: number,    // Active WebSocket connections
    uniqueUsers: number,          // Unique users connected
    subscriptions: {
      portfolio: number,
      trades: number,
      watchlist: number
    },
    events: {
      received: number,           // Client → Server events
      emitted: number             // Server → Client events
    }
  },
  performance: {
    latency: {
      p50: number,
      p95: number,
      p99: number
    },
    throughput: number,           // Events per second
    errorRate: number             // Errors per minute
  },
  resources: {
    memory: {
      heapUsed: string,
      heapTotal: string,
      rss: string
    },
    cpu: number,
    uptime: number
  }
}
```

**Access Metrics**:
```bash
curl https://your-app.railway.app/metrics
```

### Health Monitoring

**Health Check Endpoints**:

1. **Server Health**: `GET /health`
2. **Redis Health**: `GET /health/redis`
3. **Database Health**: `GET /health/database`
4. **Metrics**: `GET /metrics`

**Monitoring Strategy**:
- Check health endpoints every 30s
- Alert on 3 consecutive failures
- Auto-restart unhealthy instances

### Logging Strategy

**Log Levels**:

```javascript
// Production
LOG_LEVEL=info  // INFO, WARN, ERROR only

// Development
LOG_LEVEL=debug // All levels including DEBUG
```

**Structured Logging**:

```javascript
logger.info('User subscribed', {
  userId: 'user-123',
  event: 'subscribe:portfolio',
  timestamp: new Date().toISOString()
});
```

**Log Aggregation**:
- Railway logs (built-in)
- Optional: Sentry for errors
- Optional: LogDNA/Datadog for advanced

### Alerting

**Critical Alerts**:
- Redis connection failures
- Database connection failures
- Error rate > 5%
- Memory usage > 90%
- CPU usage > 90%

**Warning Alerts**:
- Error rate > 1%
- Memory usage > 80%
- CPU usage > 70%
- Response time P95 > 500ms

**See**: `docs/deployment/MONITORING_SETUP.md` for complete monitoring configuration.

---

## Additional Resources

- **API Reference**: [WEBSOCKET_API.md](./WEBSOCKET_API.md)
- **Deployment Guide**: [../deployment/DEPLOYMENT_GUIDE.md](../deployment/DEPLOYMENT_GUIDE.md)
- **Railway Redis Setup**: [../deployment/RAILWAY_REDIS_SETUP.md](../deployment/RAILWAY_REDIS_SETUP.md)
- **Monitoring Setup**: [../deployment/MONITORING_SETUP.md](../deployment/MONITORING_SETUP.md)
- **Socket.io Documentation**: https://socket.io/docs/v4/
- **Redis Adapter Documentation**: https://socket.io/docs/v4/redis-adapter/
