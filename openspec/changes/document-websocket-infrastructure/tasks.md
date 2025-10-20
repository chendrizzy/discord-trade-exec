# Tasks: Document WebSocket Infrastructure

## Phase 1: Event Catalog (1.5 hours)

### 1.1 Audit Socket.io Event Emitters
- [ ] **Task 1.1.1**: Search codebase for server-side event emissions
  ```bash
  rg "\.emit\(" --type js | grep -v node_modules
  rg "io\.emit\(" --type js
  rg "socket\.emit\(" --type js
  ```
- [ ] **Task 1.1.2**: Search codebase for client-side event emissions
  ```bash
  rg "socket\.emit\(" src/dashboard --type js
  ```
- [ ] **Task 1.1.3**: Create spreadsheet of all events
  - Columns: Event Name, Direction (C→S or S→C), File Location, Line Number
  - Group by domain: trades, signals, notifications, admin
- [ ] **Validation**: Complete list of events (estimate 15-25 events)

### 1.2 Document Client → Server Events
- [ ] **Task 1.2.1**: Document `subscribe:trades` event
  - Description: Subscribe to real-time trade execution updates
  - Payload schema: `{ userId: string }`
  - Response event: `trades:subscribed`
  - Authentication: Required (session-based)
  - Code reference: Server handler file and line number
- [ ] **Task 1.2.2**: Document `subscribe:signals` event
  - Description: Subscribe to new trading signals from Discord
  - Payload schema: `{ channelId?: string }`
  - Response event: `signals:subscribed`
  - Authentication: Required
- [ ] **Task 1.2.3**: Document `unsubscribe:trades` event
  - Description: Unsubscribe from trade updates
  - Payload schema: `{ userId: string }`
  - Response event: `trades:unsubscribed`
- [ ] **Task 1.2.4**: Document `unsubscribe:signals` event
  - Description: Unsubscribe from signal updates
  - Payload schema: `{}`
  - Response event: `signals:unsubscribed`
- [ ] **Task 1.2.5**: Document `execute:trade` event (if exists)
  - Description: Request immediate trade execution (admin/testing)
  - Payload schema: `{ symbol: string, side: 'buy'|'sell', quantity: number }`
  - Response events: `trade:executed` or `trade:error`
  - Authentication: Admin role required
- [ ] **Task 1.2.6**: Document any additional client events found in audit
  - Portfolio subscription events
  - Notification acknowledgment events
  - Admin control events
- [ ] **Validation**: All client→server events documented with complete payload schemas

### 1.3 Document Server → Client Events
- [ ] **Task 1.3.1**: Document `trade:update` event
  - Description: Real-time trade execution status update
  - Payload schema:
    ```json
    {
      "tradeId": "string",
      "userId": "string",
      "symbol": "string",
      "status": "pending" | "executed" | "failed" | "canceled",
      "executedPrice": number,
      "quantity": number,
      "timestamp": "ISO8601"
    }
    ```
  - Emitted when: Trade status changes (parser → executor → broker)
  - Room: `user:${userId}` (user-specific, not broadcast)
  - Code reference: TradeExecutor or similar service
- [ ] **Task 1.3.2**: Document `signal:new` event
  - Description: New trading signal detected from Discord channel
  - Payload schema:
    ```json
    {
      "signalId": "string",
      "providerId": "string",
      "providerName": "string",
      "symbol": "string",
      "action": "buy" | "sell" | "hold",
      "entryPrice": number,
      "stopLoss": number,
      "takeProfit": number,
      "confidence": number,
      "timestamp": "ISO8601"
    }
    ```
  - Emitted when: SignalParser validates Discord message as trade signal
  - Room: `signals` (broadcast to all subscribed users)
  - Code reference: SignalParser service
- [ ] **Task 1.3.3**: Document `portfolio:update` event
  - Description: User portfolio value or positions changed
  - Payload schema:
    ```json
    {
      "userId": "string",
      "totalValue": number,
      "cash": number,
      "positions": [
        { "symbol": "string", "quantity": number, "avgPrice": number }
      ],
      "timestamp": "ISO8601"
    }
    ```
  - Emitted when: Trade executed, market value changes
  - Room: `user:${userId}`
- [ ] **Task 1.3.4**: Document `notification:new` event
  - Description: System notification for user (errors, alerts, updates)
  - Payload schema:
    ```json
    {
      "notificationId": "string",
      "type": "info" | "warning" | "error" | "success",
      "title": "string",
      "message": "string",
      "actionUrl": "string | null",
      "timestamp": "ISO8601"
    }
    ```
  - Emitted when: Important system events (API key invalid, subscription expiring)
  - Room: `user:${userId}`
- [ ] **Task 1.3.5**: Document connection lifecycle events
  - `connect`: Client successfully connected to Socket.io server
  - `disconnect`: Client disconnected (reason provided)
  - `error`: Connection or authentication error
  - `reconnect`: Client reconnected after disconnection
  - `reconnect_attempt`: Client attempting to reconnect (exponential backoff)
- [ ] **Task 1.3.6**: Document any additional server events found in audit
- [ ] **Validation**: All server→client events documented with complete schemas

### 1.4 Create Event Reference Table
- [ ] **Task 1.4.1**: Create master event catalog document
  - Path: `docs/websocket-event-catalog.md` or add to specs
  - Table format:
    | Event Name | Direction | Payload Schema | Authentication | Room | Code Reference |
    |------------|-----------|----------------|----------------|------|----------------|
- [ ] **Task 1.4.2**: Add event versioning strategy (if applicable)
  - How to handle breaking changes to event payloads
  - Versioning scheme (e.g., `trade:update:v2`)
- [ ] **Task 1.4.3**: Document event naming conventions
  - Pattern: `domain:action` (e.g., `trade:update`, `signal:new`)
  - Subscription pattern: `subscribe:domain`, `unsubscribe:domain`
- [ ] **Validation**: Event catalog complete and reviewed by frontend team

## Phase 2: Connection & Architecture (1 hour)

### 2.1 Document Connection Lifecycle
- [ ] **Task 2.1.1**: Document initial connection handshake
  - Client configuration:
    ```javascript
    const socket = io('https://app.example.com', {
      auth: { sessionId: getSessionId() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
    ```
  - Server initialization (attached to Express HTTP server)
  - Code references: `server.js` Socket.io setup
- [ ] **Task 2.1.2**: Document authentication middleware
  - Session-based authentication (express-session integration)
  - Code reference: `src/websocket/middleware/auth.js` or equivalent
  - Authentication flow:
    1. Client sends session cookie with Socket.io handshake
    2. Server middleware validates session from MongoDB (connect-mongo)
    3. If valid, attach `socket.userId` and allow connection
    4. If invalid, reject with error
- [ ] **Task 2.1.3**: Document room subscription patterns
  - User-specific rooms: `user:${userId}` (private updates)
  - Broadcast rooms: `signals` (public signals)
  - Admin rooms: `admin` (admin-only events)
  - Room joining logic:
    ```javascript
    socket.on('subscribe:trades', ({ userId }) => {
      if (socket.userId !== userId) {
        return socket.emit('error', { message: 'Unauthorized' });
      }
      socket.join(`user:${userId}`);
      socket.emit('trades:subscribed', { room: `user:${userId}` });
    });
    ```
- [ ] **Task 2.1.4**: Document disconnection handling
  - Graceful disconnection (client calls `socket.disconnect()`)
  - Abrupt disconnection (network failure, browser close)
  - Server cleanup: Remove from rooms, clear subscriptions
  - Client reconnection strategy (exponential backoff)
- [ ] **Task 2.1.5**: Document reconnection logic
  - Client-side:
    ```javascript
    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      // Re-subscribe to rooms
      socket.emit('subscribe:trades', { userId: currentUser.id });
    });
    ```
  - Server-side: Handle duplicate subscriptions gracefully
- [ ] **Validation**: Connection lifecycle documented with code examples

### 2.2 Create Architecture Diagrams
- [ ] **Task 2.2.1**: Create Socket.io server initialization diagram
  - Show Express HTTP server → Socket.io attachment
  - Middleware stack (authentication, logging)
  - Event handler registration
- [ ] **Task 2.2.2**: Create event flow diagram
  - Example: Discord Signal → Backend Flow
    ```
    Discord Bot
        ↓ (receives message)
    Signal Parser
        ↓ (validates signal)
    Socket.io Server
        ↓ (emits `signal:new`)
    Dashboard Client (subscribed to `signals` room)
    ```
- [ ] **Task 2.2.3**: Create multi-server architecture diagram
  - Show load balancer → multiple Socket.io servers
  - Redis adapter for PubSub (if used)
  - Client connection routing
- [ ] **Task 2.2.4**: Create room/namespace structure diagram
  - Namespaces (if used): default `/`, admin `/admin`
  - Rooms within default namespace: `user:123`, `signals`, `admin`
- [ ] **Validation**: Diagrams clear and accurately represent architecture

### 2.3 Document Middleware and Error Handling
- [ ] **Task 2.3.1**: Document authentication middleware implementation
  - Code reference: File and function name
  - Session validation logic
  - Error responses for failed authentication
- [ ] **Task 2.3.2**: Document logging middleware (if exists)
  - Event logging (all emits/receives logged?)
  - Connection/disconnection logging
  - Performance monitoring (event latency)
- [ ] **Task 2.3.3**: Document error handling patterns
  - Server-side error emission: `socket.emit('error', { message, code })`
  - Client-side error listeners: `socket.on('error', handleError)`
  - Error types: AuthenticationError, SubscriptionError, PayloadError
- [ ] **Validation**: Middleware documented with code examples

## Phase 3: Scaling & Troubleshooting (30 minutes)

### 3.1 Document Scaling Patterns
- [ ] **Task 3.1.1**: Document single-server deployment
  - Current production setup (single Railway/Heroku dyno?)
  - Connection limits (~1000 concurrent connections per server)
  - Memory usage per connection (~10KB)
  - No special configuration needed
- [ ] **Task 3.1.2**: Document sticky session approach
  - Load balancer configuration (session affinity by IP)
  - Pros: Simple, no Redis dependency
  - Cons: Uneven load distribution, connection loss on restart
  - When to use: <5000 concurrent connections
- [ ] **Task 3.1.3**: Document Redis adapter approach (recommended)
  - Install `socket.io-redis` package
  - Configuration:
    ```javascript
    const redisAdapter = require('socket.io-redis');
    io.adapter(redisAdapter({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    }));
    ```
  - Pros: True horizontal scaling, no sticky sessions needed
  - Cons: Redis dependency, slight latency increase (<5ms)
  - When to use: >5000 concurrent connections or multi-region deployment
- [ ] **Task 3.1.4**: Document load balancer configuration
  - Railway: WebSocket support enabled by default
  - Heroku: Ensure dyno supports WebSockets (all dyno types do)
  - Custom proxy: Ensure `Upgrade: websocket` header forwarded
- [ ] **Task 3.1.5**: Document performance benchmarks
  - Connections per server: ~1000-2000 recommended
  - Events per second: Measure actual throughput
  - Memory usage: Monitor with `process.memoryUsage()`
- [ ] **Validation**: Scaling patterns documented and validated

### 3.2 Create Troubleshooting Guide
- [ ] **Task 3.2.1**: Document "Transport Error" issue
  - **Symptoms**: Client cannot establish WebSocket connection
  - **Root Causes**: Firewall, proxy not forwarding WebSocket headers, CORS
  - **Debugging Steps**:
    1. Browser DevTools → Network → WS tab
    2. Verify `Upgrade: websocket` header in request
    3. Test with polling transport: `transports: ['polling']`
    4. Check server logs for connection attempts
  - **Solution**: Configure proxy to forward WebSocket headers, update CORS
- [ ] **Task 3.2.2**: Document "Events Not Received" issue
  - **Symptoms**: Server emits event but client listener not triggered
  - **Root Causes**: Client not in room, event name typo, payload serialization error
  - **Debugging Steps**:
    1. Server: Log room membership: `console.log(io.sockets.adapter.rooms)`
    2. Client: Add catch-all listener: `socket.onAny((event, ...args) => console.log(event, args))`
    3. Verify event names match exactly (case-sensitive)
    4. Check payload serialization: `JSON.stringify(payload)`
  - **Solution**: Verify room subscription, fix event names, sanitize payloads
- [ ] **Task 3.2.3**: Document "Connection Drops Frequently" issue
  - **Symptoms**: Client reconnects every few minutes
  - **Root Causes**: Proxy timeout, Heroku/Railway idle timeout, ping/pong misconfigured
  - **Debugging Steps**:
    1. Check Socket.io `pingTimeout` and `pingInterval` settings
    2. Monitor DevTools Network tab for disconnect reasons
    3. Check server logs for ping timeout errors
  - **Solution**: Configure `pingInterval: 25000` and `pingTimeout: 60000`
- [ ] **Task 3.2.4**: Document "Authentication Failed" issue
  - **Symptoms**: Connection rejected with auth error
  - **Root Causes**: Invalid session, session expired, cookie not sent
  - **Debugging Steps**:
    1. Verify session cookie present in request (DevTools → Application → Cookies)
    2. Check session valid in MongoDB (not expired)
    3. Verify Socket.io `auth` object includes session ID
  - **Solution**: Re-authenticate user, extend session lifetime
- [ ] **Task 3.2.5**: Document "Events Delayed or Lost" issue
  - **Symptoms**: Events arrive late or not at all
  - **Root Causes**: Network congestion, server overload, missing Redis adapter
  - **Debugging Steps**:
    1. Check event queue size on server
    2. Monitor server CPU/memory usage
    3. Verify Redis adapter configured (if multi-server)
    4. Check network latency (ping times)
  - **Solution**: Scale horizontally, add Redis adapter, optimize event payloads
- [ ] **Task 3.2.6**: Add debugging tips section
  - Enable Socket.io debug logs: `localStorage.debug = '*'` (client)
  - Server debug: `DEBUG=socket.io:* node server.js`
  - Inspect rooms: `io.of('/').adapter.rooms`
  - Monitor event counts: Custom middleware to log event frequency
- [ ] **Validation**: Each troubleshooting entry tested against known issue

### 3.3 Document Monitoring and Metrics
- [ ] **Task 3.3.1**: Document key metrics to monitor
  - Active connections count: `io.engine.clientsCount`
  - Events per second (by type)
  - Connection/disconnection rate
  - Room membership counts
  - Event delivery latency (emit → client receive)
- [ ] **Task 3.3.2**: Document monitoring implementation
  - Custom middleware to track event counts
  - Prometheus metrics (if applicable)
  - Logging to Winston (connection events)
- [ ] **Task 3.3.3**: Document alerting thresholds
  - Connections drop >50% in 5 minutes → alert
  - Event delivery latency >1 second → alert
  - Reconnection rate >10/minute → investigate
- [ ] **Validation**: Monitoring approach documented

### 3.4 Review and Finalize Documentation
- [ ] **Task 3.4.1**: Cross-reference all code locations
  - Verify event handlers exist at referenced file paths
  - Check function names and logic match documentation
- [ ] **Task 3.4.2**: Add "Last Updated" metadata
  - Date at top of documentation
  - Commit hash reference
- [ ] **Task 3.4.3**: Create documentation index
  - Link to event catalog
  - Link to connection lifecycle
  - Link to architecture diagrams
  - Link to troubleshooting guide
- [ ] **Task 3.4.4**: Peer review documentation
  - Share with frontend team (event contract validation)
  - Share with backend team (architecture validation)
  - Collect feedback and revise
- [ ] **Validation**: Documentation peer-reviewed and approved

### 3.5 Integration with Project Documentation
- [ ] **Task 3.5.1**: Update main README.md with WebSocket docs link
- [ ] **Task 3.5.2**: Add link to `openspec/project.md` under "Real-Time Infrastructure" section
- [ ] **Task 3.5.3**: Create quick start guide for WebSocket development
  - How to add new event type
  - How to test WebSocket locally
  - How to emit event from server
  - How to listen on client
- [ ] **Validation**: New developer can add WebSocket event following guide

## Success Criteria Checklist

- [ ] Complete Socket.io event catalog (10+ events documented)
- [ ] Connection lifecycle documented (authentication, rooms, reconnection)
- [ ] Architecture diagram created (Socket.io server, Express integration)
- [ ] Scaling patterns documented (sticky sessions, Redis adapter)
- [ ] Reconnection handling documented (client-side logic)
- [ ] Troubleshooting guide covers 8+ common issues
- [ ] Code references validated (files exist, event names accurate)
- [ ] Documentation reviewed by team member
- [ ] Frontend team confirms event contract accuracy

## Effort Estimate

**Total**: 3 hours

- Event catalog: 1.5 hours
- Connection & architecture: 1 hour
- Scaling & troubleshooting: 30 minutes
