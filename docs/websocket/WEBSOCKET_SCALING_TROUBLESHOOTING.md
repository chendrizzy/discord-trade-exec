# WebSocket Scaling & Troubleshooting Guide
## Discord Trade Executor - Production Operations Reference

**Version:** 1.0.0
**Last Updated:** 2025-10-20
**Status:** ✅ **PRODUCTION READY**

---

## Overview

This document covers horizontal scaling patterns, performance optimization, and troubleshooting for the Discord Trade Executor WebSocket infrastructure.

**Related Documentation:**
- **Event Catalog**: `docs/websocket/WEBSOCKET_EVENT_CATALOG.md`
- **Connection Architecture**: `docs/websocket/WEBSOCKET_CONNECTION_ARCHITECTURE.md`

---

## Horizontal Scaling Strategies

### Single-Server Mode (Default)

**When to Use**:
- Development environments
- Small deployments (<1000 concurrent connections)
- Testing/staging environments

**Configuration**:
```javascript
// No REDIS_URL configured
// Socket.io uses default in-memory adapter
const io = new Server(httpServer, options);
```

**Limitations**:
- No cross-server communication
- All clients must connect to same server instance
- Load balancer must use sticky sessions
- No horizontal scalability

---

### Multi-Server Mode (Redis Adapter)

**When to Use**:
- Production environments
- High traffic (>1000 concurrent connections)
- Horizontal scaling requirements
- High availability requirements

**Architecture**:

```
                            ┌──────────────┐
                            │ Load Balancer│
                            │ (NGINX/HAProxy)
                            └──────┬───────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
         ┌──────────┐       ┌──────────┐      ┌──────────┐
         │ Server 1 │       │ Server 2 │      │ Server 3 │
         │ Socket.io│       │ Socket.io│      │ Socket.io│
         └────┬─────┘       └────┬─────┘      └────┬─────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 │ Redis Pub/Sub
                                 ▼
                          ┌─────────────┐
                          │ Redis Server│
                          │ (Pub/Sub)   │
                          └─────────────┘
```

**Configuration**:

```javascript
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// Create Socket.io server
const io = new Server(httpServer, options);

// Initialize Redis clients for pub/sub
const redisPubClient = new Redis(process.env.REDIS_URL);
const redisSubClient = new Redis(process.env.REDIS_URL);

// Attach Redis adapter
io.adapter(createAdapter(redisPubClient, redisSubClient));
```

**File**: `src/services/websocket/WebSocketServer.js:95-116`

**Environment Variable**:
```bash
# Production Redis (required for multi-server)
REDIS_URL=redis://username:password@redis-host:6379
```

---

## Load Balancer Configuration

### Option 1: Sticky Sessions (Single-Server Compatibility)

**When to Use**:
- Single-server deployments
- No Redis adapter
- Simplest configuration

**NGINX Configuration**:

```nginx
upstream socketio_backend {
    # Enable sticky sessions via IP hash
    ip_hash;

    server backend1.example.com:5000;
    server backend2.example.com:5000;
    server backend3.example.com:5000;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    location /socket.io/ {
        proxy_pass http://socketio_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Preserve client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

**Pros**:
- Simple configuration
- Works with default Socket.io adapter
- No Redis dependency

**Cons**:
- Uneven load distribution (some clients stay on same server)
- Server failures disconnect all clients on that server
- No cross-server event broadcasting

---

### Option 2: Round-Robin (Redis Adapter Required)

**When to Use**:
- Production deployments with Redis
- High availability requirements
- Optimal load distribution

**NGINX Configuration**:

```nginx
upstream socketio_backend {
    # Round-robin load balancing (default)
    server backend1.example.com:5000;
    server backend2.example.com:5000;
    server backend3.example.com:5000;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    location /socket.io/ {
        proxy_pass http://socketio_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Preserve client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

**Pros**:
- Even load distribution
- Cross-server event broadcasting via Redis
- Graceful server failures (clients reconnect to different server)

**Cons**:
- Requires Redis infrastructure
- More complex setup
- Small latency overhead (~5-10ms) for Redis pub/sub

---

## Redis Adapter Deep Dive

### How It Works

**Event Flow**:
```
Server 1 receives event
     ↓
Server 1 emits to local clients in room
     ↓
Server 1 publishes event to Redis channel
     ↓
Redis broadcasts to all servers
     ↓
Server 2, 3, N receive event from Redis
     ↓
Each server emits to its local clients in room
```

### Redis Channels

Socket.io creates Redis pub/sub channels automatically:

| Channel | Purpose | Example |
|---------|---------|---------|
| `socket.io#/#` | Broadcast to all sockets | Server shutdown notifications |
| `socket.io#/namespace#room` | Room-specific events | `socket.io#/#user:12345#` |

### Performance Characteristics

**Latency Breakdown**:
```
Client A (Server 1) → Emit event
     ↓ [~5ms]
Server 1 local clients receive
     ↓ [~10ms]
Redis pub/sub propagation
     ↓ [~5ms]
Server 2,3 local clients receive
```

**Total latency**: ~20ms for cross-server event delivery

---

## Performance Tuning

### 1. Connection Limits

**Per-Server Limits**:

```javascript
// Maximum connections per server instance
const MAX_CONNECTIONS_PER_SERVER = 5000;

// Monitor connection count
io.on('connection', (socket) => {
  const connectionCount = io.sockets.sockets.size;

  if (connectionCount > MAX_CONNECTIONS_PER_SERVER) {
    logger.warn(`High connection count: ${connectionCount}`);
    // Consider scaling or rate limiting
  }
});
```

**Scaling Calculation**:
```
Target: 10,000 concurrent users
Per-server capacity: 5,000 connections
Required servers: 10,000 / 5,000 = 2 servers (+ 1 for redundancy)
Recommendation: 3 servers minimum
```

---

### 2. Redis Connection Pooling

**Configuration**:

```javascript
const redisPubClient = new Redis(process.env.REDIS_URL, {
  // Retry strategy with exponential backoff
  retryStrategy: times => Math.min(times * 50, 2000),

  // Maximum retries before giving up
  maxRetriesPerRequest: 3,

  // Connection timeout
  connectTimeout: 10000,

  // Keep-alive
  keepAlive: 30000,

  // Connection pool (for multi-threaded environments)
  maxRetriesPerRequest: null
});
```

**File**: `src/services/websocket/WebSocketServer.js:98-106`

---

### 3. Event Batching

**Problem**: High-frequency events (e.g., quote updates) can overwhelm clients.

**Solution**: Batch updates with throttling:

```javascript
const updateQueue = new Map(); // symbol -> latest quote

// Throttled broadcast (max once per 100ms per symbol)
const THROTTLE_MS = 100;

function queueQuoteUpdate(symbol, quote) {
  updateQueue.set(symbol, quote);
}

setInterval(() => {
  updateQueue.forEach((quote, symbol) => {
    webSocketServer.emitToRoom(`watchlist:${symbol}`, 'quote:update', {
      symbol,
      quote,
      timestamp: new Date().toISOString()
    });
  });

  updateQueue.clear();
}, THROTTLE_MS);
```

**Result**: Reduces event frequency from 1000/sec to 10/sec with minimal staleness.

---

### 4. Binary Data Optimization

**Use Case**: Sending large datasets (chart data, historical quotes)

```javascript
// Instead of JSON (inefficient)
socket.emit('chart:data', {
  prices: [150.25, 150.30, 150.28, ...],  // 1000+ values
  timestamps: [1234567890, 1234567891, ...]
});

// Use binary format (efficient)
const pricesBuffer = Float32Array.from(prices);
const timestampsBuffer = Uint32Array.from(timestamps);

socket.emit('chart:data', {
  prices: pricesBuffer.buffer,
  timestamps: timestampsBuffer.buffer
});
```

**Savings**: ~50% bandwidth reduction for numeric arrays.

---

## Monitoring & Observability

### Key Metrics

**Connection Metrics**:
```javascript
setInterval(() => {
  const stats = {
    totalConnections: io.sockets.sockets.size,
    uniqueUsers: webSocketServer.activeConnections.size,
    roomCount: io.sockets.adapter.rooms.size,
    redisStatus: redisPubClient.status  // 'ready', 'connecting', 'error'
  };

  logger.info('WebSocket stats:', stats);

  // Send to monitoring service (DataDog, Prometheus, etc.)
  monitoring.recordMetric('websocket.connections', stats.totalConnections);
  monitoring.recordMetric('websocket.unique_users', stats.uniqueUsers);
}, 60000);  // Every minute
```

**Event Metrics**:
```javascript
// Track event throughput
let eventCounts = {
  'portfolio:update': 0,
  'trade:executed': 0,
  'quote:update': 0
};

function trackEventEmit(event) {
  eventCounts[event] = (eventCounts[event] || 0) + 1;
}

setInterval(() => {
  logger.info('Event throughput (per minute):', eventCounts);
  monitoring.recordMetric('websocket.events', eventCounts);
  eventCounts = {};  // Reset for next interval
}, 60000);
```

---

### Health Checks

**Endpoint**: `GET /health/websocket`

**Implementation**:
```javascript
app.get('/health/websocket', (req, res) => {
  const stats = webSocketServer.getStats();

  const health = {
    status: stats.initialized && stats.totalConnections > 0 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    stats: {
      totalConnections: stats.totalConnections,
      uniqueUsers: stats.uniqueUsers,
      redisAdapter: stats.redisAdapter,
      uptime: stats.uptime
    }
  };

  // Check Redis connectivity
  if (stats.redisAdapter) {
    const redisStatus = redisPubClient.status;
    health.redis = {
      status: redisStatus,
      healthy: redisStatus === 'ready'
    };

    if (redisStatus !== 'ready') {
      health.status = 'unhealthy';
    }
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## Troubleshooting Guide

### Common Issues

#### Issue 1: Clients Can't Connect

**Symptoms**:
- `connect_error` event fires immediately
- No `connected` event received
- Console errors: "WebSocket connection failed"

**Potential Causes & Solutions**:

| Cause | Diagnostic | Solution |
|-------|------------|----------|
| CORS misconfiguration | Browser console: "CORS policy blocked" | Add client origin to `CORS_ORIGIN` |
| Server not running | `curl http://localhost:5000/socket.io/` returns 404 | Start server with `npm start` |
| Firewall blocking WebSocket | Polling works but WebSocket fails | Open port 80/443, check corporate firewall |
| SSL certificate issues | `ERR_CERT_AUTHORITY_INVALID` | Use valid SSL cert or disable in dev |
| Authentication failure | `error` event with code `UNAUTHORIZED` | Check session ID validity |

**Debug Steps**:
```bash
# 1. Check server is running
curl http://localhost:5000/health/websocket

# 2. Test Socket.io endpoint
curl http://localhost:5000/socket.io/

# 3. Check CORS in browser console (client-side)
# Look for "Access-Control-Allow-Origin" errors

# 4. Enable Socket.io debug logging
# Client: localStorage.debug = 'socket.io-client:*';
# Server: DEBUG=socket.io:* node server.js
```

---

#### Issue 2: Frequent Disconnections

**Symptoms**:
- `disconnect` events every few seconds
- Constant reconnection attempts
- Users report "connection unstable"

**Potential Causes & Solutions**:

| Cause | Diagnostic | Solution |
|-------|------------|----------|
| Ping timeout | `disconnect` reason: "ping timeout" | Increase `pingTimeout` (default: 60s) |
| Network issues | `disconnect` reason: "transport close" | Check network stability, DNS |
| Load balancer timeout | Disconnects after exactly 60s | Increase LB idle timeout to 7 days |
| Session expiry | `error` code `UNAUTHORIZED` after disconnect | Extend session lifetime or refresh session |
| Server overload | High CPU/memory on server | Scale horizontally, optimize event handlers |

**Configuration Fixes**:

```javascript
// Increase timeouts for unstable networks
const io = new Server(httpServer, {
  pingTimeout: 120000,      // 2 minutes (from 60s)
  pingInterval: 50000       // 50 seconds (from 25s)
});
```

```nginx
# NGINX load balancer timeout (7 days for WebSocket)
location /socket.io/ {
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
}
```

---

#### Issue 3: Events Not Received

**Symptoms**:
- Client subscribed but no `portfolio:update` events
- Server logs show events emitted
- Some clients receive events, others don't

**Potential Causes & Solutions**:

| Cause | Diagnostic | Solution |
|-------|------------|----------|
| Not subscribed to event | Check `subscribe` was called | Call `emit('subscribe:portfolio')` |
| Wrong room | Check room membership | Verify `socket.rooms` includes correct room |
| Multi-server without Redis | Half of clients don't receive | Enable Redis adapter |
| Rate limiting | `error` with code `RATE_LIMIT` | Reduce subscription frequency |
| Event handler not registered | No console logs on client | Add `socket.on(event, handler)` |

**Debug Steps**:

```javascript
// Client-side: Check subscriptions
socket.on('subscribed:portfolio', (data) => {
  console.log('Subscription confirmed:', data);
});

// Client-side: Check event reception
socket.on('portfolio:update', (data) => {
  console.log('Portfolio update received:', data);
});

// Server-side: Check room membership
console.log('Socket rooms:', Array.from(socket.rooms));
// Should include: [socket.id, 'user:12345', 'portfolio:12345']

// Server-side: Verify event emission
webSocketServer.emitToUser(userId, 'portfolio:update', data);
console.log(`Emitted portfolio:update to user ${userId}`);
```

---

#### Issue 4: High Memory Usage

**Symptoms**:
- Server memory grows over time
- Eventually crashes with OOM (Out of Memory)
- Memory doesn't decrease when clients disconnect

**Potential Causes & Solutions**:

| Cause | Diagnostic | Solution |
|-------|------------|----------|
| Event listener memory leak | `node --trace-warnings` shows MaxListenersExceededWarning | Remove listeners on disconnect |
| Subscription tracking leak | activeConnections map keeps growing | Clean up on disconnect |
| Large payload accumulation | Heap snapshot shows large arrays | Implement payload size limits |
| Redis client leak | Multiple Redis connections created | Reuse pub/sub clients, close on shutdown |

**Memory Leak Prevention**:

```javascript
// Proper cleanup on disconnect
socket.on('disconnect', () => {
  // Remove from active connections
  activeConnections.get(userId)?.delete(socket.id);

  // Remove all event listeners
  socket.removeAllListeners();

  // Decrement subscription counters
  rateLimiter.clearUserSubscriptions(socket);
});

// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  logger.info('Memory usage:', {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB'
  });

  // Alert if heap exceeds 1GB
  if (usage.heapUsed > 1024 * 1024 * 1024) {
    logger.warn('High memory usage detected!');
  }
}, 60000);
```

---

#### Issue 5: Redis Connection Errors

**Symptoms**:
- Server logs: "Redis connection failed"
- Events not broadcasting across servers
- `redisStatus: 'error'` in health check

**Potential Causes & Solutions**:

| Cause | Diagnostic | Solution |
|-------|------------|----------|
| Wrong Redis URL | Connection timeout | Verify `REDIS_URL` environment variable |
| Redis server down | `redis-cli ping` fails | Restart Redis server |
| Authentication failure | "NOAUTH Authentication required" | Add password to Redis URL |
| Network firewall | Can't reach Redis host | Open Redis port (6379) |
| Max clients reached | "ERR max number of clients reached" | Increase Redis `maxclients` config |

**Redis URL Format**:
```bash
# With authentication
REDIS_URL=redis://username:password@host:port

# Example (Railway)
REDIS_URL=redis://default:password123@redis-internal.railway.app:6379

# Example (AWS ElastiCache)
REDIS_URL=redis://my-cluster.cache.amazonaws.com:6379
```

**Retry Strategy**:
```javascript
const redisPubClient = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis reconnection attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3
});

// Handle errors
redisPubClient.on('error', (err) => {
  logger.error('Redis pub client error:', err);
});

redisPubClient.on('connect', () => {
  logger.info('✅ Redis pub client connected');
});
```

---

#### Issue 6: Cross-Origin Issues (CORS)

**Symptoms**:
- Browser console: "CORS policy: No 'Access-Control-Allow-Origin' header"
- Connection fails from different domain
- Works on `localhost` but not production

**Solution**:

```javascript
// Development (allow all origins)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Production (restrict to specific origin)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://yourdomain.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

**Environment Variables**:
```bash
# Production
FRONTEND_URL=https://yourdomain.com

# Development
FRONTEND_URL=http://localhost:3000
```

---

## Disaster Recovery

### Scenario 1: Redis Failure

**Impact**:
- Cross-server events stop working
- Each server operates independently
- Clients receive events only from their connected server

**Mitigation**:

```javascript
// Fallback to default adapter on Redis failure
try {
  const redisPubClient = new Redis(process.env.REDIS_URL);
  const redisSubClient = new Redis(process.env.REDIS_URL);

  redisPubClient.on('error', (err) => {
    logger.error('Redis pub client error - falling back to default adapter:', err);
    // Don't attach adapter, use default in-memory
  });

  io.adapter(createAdapter(redisPubClient, redisSubClient));
} catch (error) {
  logger.warn('Redis adapter initialization failed, using default adapter');
  // Continue with default adapter (single-server mode)
}
```

**Recovery Steps**:
1. Check Redis server status: `redis-cli ping`
2. Restart Redis server if down
3. Verify network connectivity to Redis
4. Check Redis logs for errors: `tail -f /var/log/redis/redis-server.log`
5. Increase Redis `maxmemory` if OOM errors
6. Consider Redis failover/replication for HA

---

### Scenario 2: Server Crash

**Impact**:
- All clients connected to crashed server disconnect
- Clients automatically reconnect to healthy server (if multi-server)

**Auto-Recovery**:

```javascript
// Client-side automatic reconnection
const socket = io(SOCKET_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);

  // Re-subscribe to all subscriptions
  restoreSubscriptions();
});
```

**Manual Recovery**:
1. Investigate crash: `pm2 logs` or `docker logs`
2. Fix root cause (OOM, unhandled exception, etc.)
3. Restart server: `pm2 restart all` or `docker restart`
4. Monitor reconnection rate
5. Verify clients successfully reconnected

---

### Scenario 3: Network Partition

**Impact**:
- Some clients can't reach server
- Split-brain scenario if multi-server without proper monitoring

**Detection**:

```javascript
// Monitor connection health
setInterval(() => {
  const connectionCount = io.sockets.sockets.size;

  if (connectionCount < EXPECTED_MIN_CONNECTIONS) {
    logger.warn(`Low connection count: ${connectionCount}, possible network partition`);
    // Alert operations team
  }
}, 60000);
```

**Recovery**:
1. Check network connectivity: `ping`, `traceroute`
2. Verify firewall rules
3. Check load balancer health
4. Review DNS resolution
5. Failover to backup data center if necessary

---

## Performance Benchmarks

### Expected Latency

| Operation | Target (p50) | Target (p99) | Alert Threshold |
|-----------|--------------|--------------|-----------------|
| Connection establishment | <500ms | <1000ms | >2000ms |
| Event round-trip (ping/pong) | <50ms | <100ms | >500ms |
| Subscription confirmation | <100ms | <200ms | >1000ms |
| Trade notification | <20ms | <50ms | >200ms |
| Cross-server broadcast (Redis) | <20ms | <50ms | >200ms |

### Capacity Planning

**Per-Server Capacity**:
- **Connections**: 5,000 concurrent (recommend 3,000 for headroom)
- **Events/sec**: 10,000 (recommend 5,000 for headroom)
- **Memory**: 512MB base + 100KB per connection = ~800MB for 3,000 connections
- **CPU**: 2 vCPUs recommended (1 for Node.js, 1 for OS/Redis)

**Scaling Formula**:
```
Required servers = (Expected concurrent users × 1.5 safety factor) / 3000
```

**Example**:
- 10,000 expected users
- Required servers: (10,000 × 1.5) / 3,000 = 5 servers
- Recommendation: 6 servers (1 extra for redundancy)

---

## Best Practices Summary

### ✅ Do

1. **Use Redis adapter in production** for cross-server events
2. **Monitor connection metrics** (count, latency, errors)
3. **Implement graceful shutdown** to notify clients
4. **Clean up event listeners** on disconnect to prevent memory leaks
5. **Use room-based broadcasting** instead of `io.emit()` for efficiency
6. **Log all events** for debugging and audit trail
7. **Implement rate limiting** to prevent abuse
8. **Use health checks** for load balancer integration
9. **Enable reconnection** with exponential backoff
10. **Validate all event payloads** to prevent injection attacks

### ❌ Don't

1. **Don't use sticky sessions with Redis adapter** (defeats the purpose)
2. **Don't emit to all clients** unless necessary (use rooms)
3. **Don't skip cleanup** on disconnect (causes memory leaks)
4. **Don't trust client data** without validation
5. **Don't emit high-frequency events** without throttling/batching
6. **Don't store sensitive data** in event payloads (encrypt first)
7. **Don't ignore reconnection logic** on client-side
8. **Don't hardcode origins** in CORS (use environment variables)
9. **Don't deploy without monitoring** (you're flying blind)
10. **Don't skip graceful shutdown** (causes poor user experience)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-20 | Initial scaling and troubleshooting documentation |

---

**Documentation Maintained By**: Architecture Team
**Next Review**: 2026-01-20 (quarterly review)
**Related Documentation**:
- Event Catalog: `docs/websocket/WEBSOCKET_EVENT_CATALOG.md`
- Connection Architecture: `docs/websocket/WEBSOCKET_CONNECTION_ARCHITECTURE.md`
