# Railway Redis Setup Guide

Complete guide for deploying Redis on Railway for WebSocket horizontal scaling.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Railway Redis Provisioning](#railway-redis-provisioning)
- [Environment Configuration](#environment-configuration)
- [WebSocket Integration](#websocket-integration)
- [Testing](#testing)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ Railway account ([railway.app](https://railway.app))
- ✅ GitHub account (for deployments)
- ✅ Node.js 18+ installed locally

### Required Knowledge
- Redis fundamentals
- Socket.io adapter concepts
- Environment variable management
- Railway CLI basics

---

## Railway Redis Provisioning

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init
```

### 2. Add Redis Service

**Option A: Via Railway Dashboard**
1. Navigate to your project dashboard
2. Click **"+ New"** → **"Database"** → **"Add Redis"**
3. Railway automatically provisions Redis instance
4. Copy connection details from **"Connect"** tab

**Option B: Via Railway CLI**
```bash
# Add Redis plugin
railway add --plugin redis

# View connection details
railway variables
```

### 3. Redis Configuration

Railway automatically configures:
- **Memory**: 512MB (upgradeable)
- **Persistence**: RDB + AOF
- **Eviction Policy**: `allkeys-lru`
- **Max Connections**: 10,000
- **TLS**: Enabled by default

**Custom Configuration** (if needed):
```bash
# Set custom Redis config via Railway environment
railway variables set REDIS_MAX_MEMORY=1gb
railway variables set REDIS_EVICTION_POLICY=volatile-lru
```

---

## Environment Configuration

### 1. Get Redis Connection URL

Railway provides `REDIS_URL` automatically. Format:
```
redis://default:<password>@<host>:<port>
```

### 2. Update Application Environment

**For Railway Deployment:**
```bash
# Redis URL is auto-injected by Railway
# No manual configuration needed
```

**For Local Development:**

Create `.env.local`:
```bash
# Copy from Railway dashboard
REDIS_URL=redis://default:your-password@your-host.railway.app:6379

# Or use local Redis for development
# REDIS_URL=redis://localhost:6379
```

**For Production (Manual Setup):**
```bash
# Set via Railway dashboard or CLI
railway variables set REDIS_URL="redis://default:password@host:6379"
```

### 3. Environment Variable Validation

Add to your application startup:

```javascript
// src/config/redis.js
const validateRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('⚠️ REDIS_URL not set - WebSocket will run in single-server mode');
    return false;
  }

  if (!redisUrl.startsWith('redis://')) {
    throw new Error('Invalid REDIS_URL format. Must start with redis://');
  }

  console.log('✅ Redis configuration validated');
  return true;
};

module.exports = { validateRedisConfig };
```

---

## WebSocket Integration

### 1. Update WebSocket Server Configuration

The WebSocket server is already configured to use Redis adapter when `REDIS_URL` is set:

```javascript
// src/services/websocket/WebSocketServer.js (already implemented)

async initializeRedisAdapter() {
  try {
    // Create separate Redis clients for pub/sub
    this.redisPubClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: times => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3
    });

    this.redisSubClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: times => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3
    });

    // Create and attach adapter
    this.io.adapter(createAdapter(this.redisPubClient, this.redisSubClient));

    logger.info('✅ Redis adapter initialized for WebSocket server');
  } catch (error) {
    logger.error('Failed to initialize Redis adapter:', error);
    throw error;
  }
}
```

### 2. Verify Auto-Initialization

When `REDIS_URL` is set, the server automatically:
- ✅ Creates pub/sub Redis clients
- ✅ Attaches Socket.io Redis adapter
- ✅ Enables cross-server broadcasting
- ✅ Supports horizontal scaling

**Startup Log (with Redis):**
```
✅ Redis adapter initialized for WebSocket server
✅ WebSocket server initialized successfully
   Transport modes: websocket, polling
   Redis adapter: enabled
```

**Startup Log (without Redis):**
```
[WARN] No REDIS_URL provided - running in single-server mode (not recommended for production)
✅ WebSocket server initialized successfully
   Transport modes: websocket, polling
   Redis adapter: disabled
```

### 3. Connection Pooling

Redis clients use connection pooling by default:

```javascript
// Recommended pool settings (optional customization)
const redisConfig = {
  retryStrategy: times => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false, // Fail fast if Redis unavailable
  connectTimeout: 10000,
  keepAlive: 30000
};
```

---

## Testing

### 1. Local Testing with Railway Redis

```bash
# Link local project to Railway
railway link

# Pull environment variables
railway run npm run dev

# Server should show:
# ✅ Redis adapter initialized for WebSocket server
```

### 2. Connection Test Script

Create `scripts/test-redis-connection.js`:

```javascript
const Redis = require('ioredis');

const testRedisConnection = async () => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('❌ REDIS_URL not set');
    process.exit(1);
  }

  console.log('🔍 Testing Redis connection...');
  console.log(`   URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`);

  const redis = new Redis(redisUrl);

  try {
    // Test connection
    await redis.ping();
    console.log('✅ Redis PING successful');

    // Test set/get
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    console.log(`✅ Redis SET/GET successful (value: ${value})`);

    // Test pub/sub
    const subscriber = new Redis(redisUrl);
    await subscriber.subscribe('test-channel');

    subscriber.on('message', (channel, message) => {
      console.log(`✅ Redis PUB/SUB successful (message: ${message})`);
      redis.quit();
      subscriber.quit();
      process.exit(0);
    });

    await redis.publish('test-channel', 'test-message');
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
    await redis.quit();
    process.exit(1);
  }
};

testRedisConnection();
```

Run the test:
```bash
railway run node scripts/test-redis-connection.js
```

### 3. Load Testing with Redis

```bash
# Run load tests with Railway Redis
railway run npm test -- tests/load/websocket-load.test.js --no-coverage

# Expected output:
# ✅ 1000 concurrent connections (with Redis adapter)
# ✅ Broadcast performance validated
```

---

## Monitoring

### 1. Railway Dashboard Metrics

Monitor via Railway dashboard:
- **CPU Usage**: Redis CPU %
- **Memory Usage**: Current / Max
- **Network I/O**: Bytes in/out
- **Connections**: Active connections
- **Operations**: Commands/sec

### 2. Redis Health Checks

Add health check endpoint:

```javascript
// src/routes/health.js
const Redis = require('ioredis');

router.get('/health/redis', async (req, res) => {
  if (!process.env.REDIS_URL) {
    return res.status(200).json({
      status: 'disabled',
      message: 'Redis not configured'
    });
  }

  const redis = new Redis(process.env.REDIS_URL);

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    const info = await redis.info('stats');
    const connections = info.match(/connected_clients:(\d+)/)?.[1];

    await redis.quit();

    res.json({
      status: 'healthy',
      latency: `${latency}ms`,
      connections: parseInt(connections || 0),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### 3. Application Logging

Monitor WebSocket + Redis logs:

```javascript
// Add to WebSocketServer.js
logger.info('WebSocket Stats', {
  totalConnections: this.getTotalConnectionCount(),
  uniqueUsers: this.activeConnections.size,
  redisAdapter: !!this.redisPubClient,
  uptime: process.uptime()
});
```

---

## Troubleshooting

### Issue: "ECONNREFUSED" or "Connection timeout"

**Cause**: Redis URL incorrect or Railway Redis not provisioned

**Solution**:
```bash
# Verify REDIS_URL is set
railway variables | grep REDIS_URL

# Test connection
railway run node scripts/test-redis-connection.js

# Check Railway Redis service status
railway status
```

### Issue: "ERR max number of clients reached"

**Cause**: Too many Redis connections

**Solution**:
```javascript
// Add connection limits
const redisConfig = {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false, // Prevent queue buildup
  lazyConnect: true // Connect on demand
};
```

### Issue: High Redis memory usage

**Cause**: No eviction policy or too much data

**Solution**:
```bash
# Check memory usage
railway run redis-cli INFO memory

# Set eviction policy
railway variables set REDIS_EVICTION_POLICY=allkeys-lru

# Monitor keys
railway run redis-cli DBSIZE
```

### Issue: WebSocket messages not broadcasting across servers

**Cause**: Redis adapter not initialized or pub/sub broken

**Solution**:
```bash
# Check adapter status in logs
railway logs

# Verify pub/sub working
railway run node scripts/test-redis-connection.js

# Restart services
railway restart
```

### Issue: "Socket.io adapter error"

**Cause**: Version mismatch or incorrect adapter setup

**Solution**:
```bash
# Ensure correct versions
npm list socket.io @socket.io/redis-adapter ioredis

# Should be:
# socket.io@4.8.1
# @socket.io/redis-adapter@8.3.0
# ioredis@5.4.2

# Reinstall if needed
npm install socket.io@latest @socket.io/redis-adapter@latest ioredis@latest
```

---

## Production Checklist

### Pre-Deployment
- [ ] Railway Redis service provisioned
- [ ] `REDIS_URL` environment variable set
- [ ] Connection test script passes
- [ ] Load tests pass with Redis enabled
- [ ] Health check endpoint implemented
- [ ] Monitoring alerts configured

### Deployment
- [ ] Deploy to Railway with Redis enabled
- [ ] Verify startup logs show "Redis adapter: enabled"
- [ ] Test cross-server broadcasting (if multiple instances)
- [ ] Run smoke tests with production Redis
- [ ] Monitor Redis metrics for 1 hour

### Post-Deployment
- [ ] Set up Redis backup schedule (Railway auto-backup enabled)
- [ ] Configure alerting for Redis connection failures
- [ ] Document Redis credentials rotation procedure
- [ ] Train team on Redis monitoring dashboard

---

## Additional Resources

- **Railway Docs**: https://docs.railway.app/databases/redis
- **Socket.io Redis Adapter**: https://socket.io/docs/v4/redis-adapter/
- **ioredis Documentation**: https://github.com/redis/ioredis
- **Redis Best Practices**: https://redis.io/docs/management/optimization/

---

## Support

For issues:
1. Check Railway status: https://status.railway.app
2. Review application logs: `railway logs`
3. Test Redis connection: `railway run node scripts/test-redis-connection.js`
4. Contact Railway support: https://railway.app/help
