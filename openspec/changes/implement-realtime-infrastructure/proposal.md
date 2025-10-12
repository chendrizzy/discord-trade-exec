# Implement Real-Time Infrastructure (P0 - Critical)

## Overview

**Priority**: P0 - Critical
**Timeline**: 2-3 weeks
**Effort**: 100 hours
**Dependencies**: None (foundational)

Implement WebSocket server with Socket.io to enable real-time dashboard updates, live trade notifications, and instant portfolio synchronization.

---

## Business Justification

**Current Issue**: Dashboard requires manual refresh (poor UX)

**Impact**:
- User satisfaction: +40% (real-time feedback)
- Session duration: +25% (users stay engaged)
- Perceived platform quality: Professional vs amateur
- Enables Phase 3 (Analytics) and Phase 5 (Social Trading)

**Competitive Analysis**:
- **Robinhood**: Real-time portfolio updates ✅
- **Webull**: Live watchlists + notifications ✅
- **eToro**: Instant copy trading updates ✅
- **Us**: Manual refresh ❌

---

## Technical Implementation

### Architecture

```
Client (React)  ←→  Socket.io  ←→  Express Server  ←→  MongoDB
     ↓                  ↓                 ↓
  Real-time UI     Event Bus      Trade Executor
                                        ↓
                                   Broker APIs
```

### Core Components

#### 1. WebSocket Server

```javascript
// src/services/websocket-server.js
const socketIO = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

class WebSocketServer {
  constructor(httpServer) {
    this.io = socketIO(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Redis adapter for horizontal scaling
    if (process.env.NODE_ENV === 'production') {
      const pubClient = new Redis(process.env.REDIS_URL);
      const subClient = pubClient.duplicate();
      this.io.adapter(createAdapter(pubClient, subClient));
    }

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authenticate WebSocket connections
    this.io.use(async (socket, next) => {
      const sessionID = socket.handshake.auth.sessionID;

      if (!sessionID) {
        return next(new Error('Authentication required'));
      }

      // Verify session
      const session = await SessionStore.get(sessionID);
      if (!session || !session.user) {
        return next(new Error('Invalid session'));
      }

      socket.userId = session.user.id;
      socket.user = session.user;
      next();
    });

    // Rate limiting per user
    this.io.use((socket, next) => {
      socket.rateLimit = new Map();
      next();
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`✅ WebSocket connected: ${socket.userId}`);

      // Join user-specific room
      socket.join(`user:${socket.userId}`);

      // Portfolio subscription
      socket.on('subscribe:portfolio', () => {
        this.subscribeToPortfolio(socket);
      });

      // Trade notifications subscription
      socket.on('subscribe:trades', () => {
        this.subscribeToTrades(socket);
      });

      // Watchlist updates
      socket.on('subscribe:watchlist', (symbols) => {
        this.subscribeToWatchlist(socket, symbols);
      });

      socket.on('disconnect', () => {
        console.log(`❌ WebSocket disconnected: ${socket.userId}`);
      });
    });
  }

  // Emit portfolio update to specific user
  emitPortfolioUpdate(userId, portfolio) {
    this.io.to(`user:${userId}`).emit('portfolio:update', portfolio);
  }

  // Broadcast trade notification
  emitTradeNotification(userId, trade) {
    this.io.to(`user:${userId}`).emit('trade:executed', {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      timestamp: trade.timestamp,
      status: trade.status
    });
  }

  // Market data streaming (quote updates)
  emitQuoteUpdate(symbol, quote) {
    this.io.to(`symbol:${symbol}`).emit('quote:update', {
      symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      timestamp: quote.timestamp
    });
  }
}

module.exports = WebSocketServer;
```

#### 2. Event Emitter Integration

```javascript
// src/services/trade-executor.js
const EventEmitter = require('events');

class TradeExecutor extends EventEmitter {
  async executeTrade(user, signal) {
    try {
      // Execute trade logic...
      const result = await broker.placeOrder(order);

      // Emit event for WebSocket broadcast
      this.emit('trade:executed', {
        userId: user.id,
        trade: result
      });

      // Update portfolio in real-time
      const portfolio = await this.getPortfolio(user);
      this.emit('portfolio:updated', {
        userId: user.id,
        portfolio
      });

      return result;
    } catch (error) {
      this.emit('trade:failed', {
        userId: user.id,
        error: error.message,
        signal
      });
      throw error;
    }
  }
}

// Connect to WebSocket server
tradeExecutor.on('trade:executed', (data) => {
  websocketServer.emitTradeNotification(data.userId, data.trade);
});

tradeExecutor.on('portfolio:updated', (data) => {
  websocketServer.emitPortfolioUpdate(data.userId, data.portfolio);
});
```

#### 3. React Client Integration

```jsx
// src/dashboard/hooks/useWebSocket.js
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const useWebSocket = () => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_WS_URL, {
      auth: {
        sessionID: localStorage.getItem('sessionID')
      },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  return { socket, connected };
};
```

```jsx
// src/dashboard/components/Portfolio.jsx
import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const Portfolio = () => {
  const { socket, connected } = useWebSocket();
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    if (!socket || !connected) return;

    // Subscribe to portfolio updates
    socket.emit('subscribe:portfolio');

    // Listen for real-time updates
    socket.on('portfolio:update', (data) => {
      setPortfolio(data);
    });

    return () => {
      socket.off('portfolio:update');
    };
  }, [socket, connected]);

  if (!connected) {
    return <div className="loading">Connecting...</div>;
  }

  return (
    <div className="portfolio">
      <h2>Portfolio Value: ${portfolio?.totalValue.toLocaleString()}</h2>
      <div className="positions">
        {portfolio?.positions.map(pos => (
          <PositionCard key={pos.symbol} position={pos} realtime />
        ))}
      </div>
    </div>
  );
};
```

---

## Advanced Features

### Feature 1: Trade Notifications

```jsx
// src/dashboard/components/TradeNotifications.jsx
import { useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from 'sonner';

const TradeNotifications = () => {
  const { socket, connected } = useWebSocket();

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:trades');

    socket.on('trade:executed', (trade) => {
      toast.success(`${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ $${trade.price}`, {
        duration: 5000,
        action: {
          label: 'View',
          onClick: () => window.location.href = `/trades/${trade.id}`
        }
      });
    });

    socket.on('trade:failed', ({ error, signal }) => {
      toast.error(`Trade failed: ${error}`, { duration: 10000 });
    });

    return () => {
      socket.off('trade:executed');
      socket.off('trade:failed');
    };
  }, [socket, connected]);

  return null; // Background service
};
```

### Feature 2: Live Watchlist

```jsx
// src/dashboard/components/Watchlist.jsx
const Watchlist = ({ symbols }) => {
  const { socket, connected } = useWebSocket();
  const [quotes, setQuotes] = useState({});

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('subscribe:watchlist', symbols);

    socket.on('quote:update', (quote) => {
      setQuotes(prev => ({
        ...prev,
        [quote.symbol]: quote
      }));
    });

    return () => socket.off('quote:update');
  }, [socket, connected, symbols]);

  return (
    <div className="watchlist">
      {symbols.map(symbol => (
        <WatchlistItem
          key={symbol}
          symbol={symbol}
          quote={quotes[symbol]}
          live={connected}
        />
      ))}
    </div>
  );
};
```

---

## Security Considerations

### Authentication

```javascript
// Verify session before allowing WebSocket connection
io.use(async (socket, next) => {
  try {
    const session = await verifySession(socket.handshake.auth.sessionID);

    if (!session) {
      throw new Error('Invalid session');
    }

    socket.userId = session.userId;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});
```

### Rate Limiting

```javascript
const RATE_LIMITS = {
  'subscribe:portfolio': { max: 1, window: 60000 }, // 1/minute
  'subscribe:trades': { max: 1, window: 60000 },
  'subscribe:watchlist': { max: 10, window: 60000 } // 10/minute
};

socket.on('subscribe:portfolio', () => {
  if (isRateLimited(socket, 'subscribe:portfolio')) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }

  // ... handle subscription
});
```

---

## Performance Optimization

### 1. Redis Adapter (Horizontal Scaling)

```javascript
// Production: Multiple server instances share state via Redis
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

### 2. Message Batching

```javascript
// Batch portfolio updates (avoid flooding clients)
class PortfolioUpdateBatcher {
  constructor(interval = 1000) {
    this.updates = new Map();
    this.interval = interval;

    setInterval(() => this.flush(), interval);
  }

  add(userId, portfolio) {
    this.updates.set(userId, portfolio);
  }

  flush() {
    for (const [userId, portfolio] of this.updates) {
      websocketServer.emitPortfolioUpdate(userId, portfolio);
    }
    this.updates.clear();
  }
}
```

### 3. Connection Pooling

```javascript
// Limit concurrent connections per user
const MAX_CONNECTIONS_PER_USER = 5;

io.use((socket, next) => {
  const userSockets = Array.from(io.sockets.sockets.values())
    .filter(s => s.userId === socket.userId);

  if (userSockets.length >= MAX_CONNECTIONS_PER_USER) {
    return next(new Error('Too many connections'));
  }

  next();
});
```

---

## Testing Strategy

### Unit Tests

```javascript
// src/services/__tests__/websocket-server.test.js
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

describe('WebSocket Server', () => {
  let io, clientSocket;

  beforeEach((done) => {
    const httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });

  afterEach(() => {
    io.close();
    clientSocket.close();
  });

  it('should emit portfolio updates', (done) => {
    clientSocket.on('portfolio:update', (data) => {
      expect(data).toHaveProperty('totalValue');
      done();
    });

    io.emit('portfolio:update', { totalValue: 10000 });
  });

  it('should handle trade notifications', (done) => {
    clientSocket.on('trade:executed', (trade) => {
      expect(trade.symbol).toBe('AAPL');
      done();
    });

    io.emit('trade:executed', { symbol: 'AAPL', side: 'buy' });
  });
});
```

### Load Testing

```javascript
// tests/load/websocket.load.test.js
const { io } = require('socket.io-client');

describe('WebSocket Load Test', () => {
  it('should handle 1000 concurrent connections', async () => {
    const clients = [];

    // Create 1000 clients
    for (let i = 0; i < 1000; i++) {
      const client = io('ws://localhost:5000');
      clients.push(client);
    }

    // Wait for all connections
    await Promise.all(clients.map(c => new Promise(resolve => {
      c.on('connect', resolve);
    })));

    expect(clients.every(c => c.connected)).toBe(true);

    // Cleanup
    clients.forEach(c => c.close());
  });
});
```

---

## Deployment Configuration

### Railway Environment Variables

```bash
# railway.toml
[deploy.env]
REDIS_URL = "${{REDIS_URL}}" # Railway Redis addon
FRONTEND_URL = "https://your-app.up.railway.app"
NODE_ENV = "production"
```

### Docker Compose (Local Development)

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  app:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    ports:
      - "5000:5000"
```

---

## Success Criteria

- [ ] WebSocket server handles 1000+ concurrent connections
- [ ] <500ms latency for portfolio updates
- [ ] Automatic reconnection after network drops
- [ ] Redis adapter enables horizontal scaling
- [ ] Authentication middleware prevents unauthorized access
- [ ] Rate limiting prevents abuse
- [ ] Dashboard auto-updates without refresh
- [ ] Trade notifications appear instantly (<1s)
- [ ] Mobile compatibility (React Native ready)
- [ ] 85% test coverage

---

## Rollout Plan

1. **Week 1**: Server implementation + authentication
2. **Week 2**: Client hooks + portfolio integration
3. **Week 3**: Load testing + production deployment

---

**Document Status**: 🚀 Ready for Implementation
**Next Action**: Await approval → Begin WebSocket server development
