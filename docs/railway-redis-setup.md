# Railway Redis Configuration Guide

## Overview

This guide explains how to configure Redis on Railway for horizontal scaling of the WebSocket server. Redis enables multiple server instances to share WebSocket connection state, allowing seamless scaling across multiple Railway deployments.

## Prerequisites

- Railway project with the Discord Trade Executor deployed
- Railway CLI installed (optional): `npm i -g @railway/cli`
- Access to Railway project dashboard

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Railway   │────▶│   Client    │
│   Socket    │     │   Instance  │     │   Socket    │
└─────────────┘     │      1      │     └─────────────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │   Adapter   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Railway   │
                    │   Instance  │
                    │      2      │
                    └─────────────┘
```

With Redis adapter:
- Multiple Railway instances share WebSocket rooms
- Broadcasts work across all instances
- Clients can connect to any instance
- Session data persists across reconnects

## Step-by-Step Configuration

### Step 1: Add Redis to Railway Project

1. **Via Railway Dashboard:**
   ```
   1. Open your Railway project
   2. Click "New" → "Database" → "Add Redis"
   3. Wait for Redis to provision (takes 1-2 minutes)
   4. Redis will automatically create a REDIS_URL variable
   ```

2. **Via Railway CLI (alternative):**
   ```bash
   railway login
   railway link  # Select your project
   railway add redis
   ```

### Step 2: Verify Environment Variables

Railway automatically sets these variables when Redis is added:

```bash
# Automatically created by Railway
REDIS_URL=redis://default:password@redis.railway.internal:6379

# May also include:
REDIS_HOST=redis.railway.internal
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
```

**Verify in Railway Dashboard:**
1. Go to your service
2. Click "Variables" tab
3. Confirm `REDIS_URL` exists

### Step 3: Update Production Environment

The WebSocket server automatically uses Redis in production when `REDIS_URL` is set:

```javascript
// From src/services/websocket-server.js (lines 31-33)
if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
    this.setupRedisAdapter();
}
```

**Set NODE_ENV to production:**

```bash
# Via Railway Dashboard
Variables → Add Variable:
  NODE_ENV=production

# Via Railway CLI
railway variables set NODE_ENV=production
```

### Step 4: Deploy and Test

1. **Deploy the changes:**
   ```bash
   git push  # Railway auto-deploys on push

   # Or manually trigger deploy
   railway up
   ```

2. **Verify Redis connection in logs:**
   ```bash
   railway logs

   # Look for:
   # ✅ WebSocket Redis adapter configured for horizontal scaling
   # ✅ WebSocket server initialized
   ```

3. **Test horizontal scaling:**
   ```bash
   # Scale to 2 replicas in Railway Dashboard:
   # Service → Settings → Deployment → Replicas: 2

   # Or via CLI:
   railway service scale 2
   ```

### Step 5: Verify Cross-Instance Communication

Create a simple test script to verify Redis is working:

```javascript
// test-redis-scaling.js
const io = require('socket.io-client');

const client1 = io('https://your-app.railway.app', {
    auth: { sessionID: 'test-session-1', userId: 'test-user' }
});

const client2 = io('https://your-app.railway.app', {
    auth: { sessionID: 'test-session-2', userId: 'test-user' }
});

client1.on('connect', () => {
    console.log('✅ Client 1 connected:', client1.id);
    client1.emit('subscribe:portfolio');
});

client2.on('connect', () => {
    console.log('✅ Client 2 connected:', client2.id);
    client2.emit('subscribe:portfolio');
});

client2.on('portfolio:update', (data) => {
    console.log('✅ Client 2 received broadcast from different instance:', data);
    process.exit(0);
});

// Broadcast should reach both clients even if on different instances
setTimeout(() => {
    console.error('❌ Timeout - Redis adapter may not be working');
    process.exit(1);
}, 10000);
```

Run the test:
```bash
node test-redis-scaling.js
```

Expected output:
```
✅ Client 1 connected: abc123
✅ Client 2 connected: def456
✅ Client 2 received broadcast from different instance: {...}
```

## Configuration Options

### Redis Connection Settings

The WebSocket server uses these Redis settings (see `src/services/websocket-server.js:58-63`):

```javascript
const pubClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});
```

**To customize Redis behavior:**

```bash
# Railway environment variables
REDIS_MAX_RETRIES=10
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
```

### Performance Tuning

For high-traffic applications, consider these Redis optimizations:

1. **Increase Redis memory:**
   ```bash
   # Railway Dashboard → Redis → Settings → Memory
   # Recommended: 512MB minimum for production
   ```

2. **Enable Redis persistence:**
   ```bash
   # Railway Dashboard → Redis → Settings
   # Enable "Persistence" for data durability
   ```

3. **Monitor Redis metrics:**
   ```bash
   railway logs -s redis

   # Watch for:
   # - Connection count
   # - Memory usage
   # - Command latency
   ```

## Troubleshooting

### Issue: "Redis adapter setup failed"

**Solution:**
```bash
# Check if REDIS_URL is set
railway variables

# Verify Redis is running
railway logs -s redis

# Test Redis connection
railway run redis-cli -u $REDIS_URL ping
```

### Issue: WebSocket running in single-instance mode

**Cause:** Either `NODE_ENV !== 'production'` or `REDIS_URL` not set

**Solution:**
```bash
railway variables set NODE_ENV=production

# Restart service
railway up
```

### Issue: Clients not receiving broadcasts across instances

**Cause:** Redis adapter not properly configured

**Debug:**
```javascript
// Add to src/services/websocket-server.js:72
console.log('✅ Redis adapter active:', this.io.sockets.adapter.constructor.name);
// Should output: "RedisAdapter" not "Adapter"
```

### Issue: High Redis memory usage

**Solution:**
```javascript
// Implement Redis key expiration
// Add to src/services/websocket-server.js after setupRedisAdapter()

this.io.of("/").adapter.on("create-room", (room) => {
    console.log(`Room created: ${room}`);
});

this.io.of("/").adapter.on("delete-room", (room) => {
    console.log(`Room deleted: ${room}`);
});
```

## Monitoring

### Health Checks

Add Redis health check endpoint:

```javascript
// src/index.js or src/server.js
app.get('/health/redis', async (req, res) => {
    try {
        const redisAdapter = io.of('/').adapter;
        const rooms = await redisAdapter.allRooms();

        res.json({
            status: 'healthy',
            adapter: redisAdapter.constructor.name,
            roomCount: rooms.size,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});
```

### Metrics Dashboard

Monitor these Redis metrics in Railway:

- **Connection count:** Should match number of Railway instances
- **Memory usage:** Should scale with WebSocket rooms/connections
- **Command latency:** Should be < 5ms for pub/sub operations
- **Error rate:** Should be near 0%

## Production Checklist

- [ ] Redis addon added to Railway project
- [ ] `REDIS_URL` environment variable set
- [ ] `NODE_ENV=production` environment variable set
- [ ] Service scaled to 2+ replicas for testing
- [ ] Cross-instance broadcast verified
- [ ] Health check endpoint responding
- [ ] Monitoring configured
- [ ] Error alerts set up
- [ ] Team documented on Redis configuration

## Cost Considerations

Railway Redis pricing (as of 2025):

- **Starter:** $5/month - 256MB memory (development/staging)
- **Pro:** $10/month - 512MB memory (production)
- **Enterprise:** Custom pricing - 1GB+ memory (high-scale)

**Recommendation:** Start with $10/month Pro plan for production workloads.

## Further Reading

- [Railway Redis Documentation](https://docs.railway.app/databases/redis)
- [Socket.io Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
- [ioredis Configuration](https://github.com/luin/ioredis#connect-to-redis)
- [Horizontal Scaling Best Practices](https://socket.io/docs/v4/using-multiple-nodes/)

## Support

For Railway-specific issues:
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- Railway Status: https://status.railway.app

For WebSocket/Redis issues:
- Check `railway logs` for error details
- Review `src/services/websocket-server.js:56-77` for Redis setup code
- Test Redis connection: `railway run redis-cli -u $REDIS_URL ping`
