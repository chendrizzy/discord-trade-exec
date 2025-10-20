# Proposal: Document WebSocket Infrastructure

## Summary

Create comprehensive documentation for the WebSocket/Socket.io infrastructure used for real-time features (trade execution updates, signal notifications, portfolio changes). Team lacks documentation on event types, connection management, scaling patterns, and troubleshooting.

## Motivation

### Current State: Undocumented WebSocket System
- Socket.io integration implemented and operational
- Real-time events emitted for trade updates and notifications
- WebSocket connections managed across Discord bot and dashboard
- **Zero comprehensive documentation** for event catalog, connection lifecycle, or scaling strategy

### Problems with Current Approach
1. **Event Contract Ambiguity**: Frontend and backend event expectations undocumented, causing integration bugs
2. **Connection Management Mystery**: Reconnection logic, authentication, and room management unclear
3. **Scaling Uncertainty**: How WebSocket state works across horizontal scaling (sticky sessions? Redis adapter?)
4. **Debugging Difficulty**: No guide for troubleshooting connection failures, event delivery issues, or message loss
5. **Onboarding Friction**: New developers can't understand real-time features without reverse-engineering code

### Desired State: Comprehensive WebSocket Documentation
- **Event Catalog**: Complete list of Socket.io events (client→server, server→client) with payload schemas
- **Connection Lifecycle**: Authentication flow, room joining, reconnection handling
- **Architecture Diagrams**: WebSocket server setup, event flow, integration with Express
- **Scaling Patterns**: Redis adapter for multi-server deployments, sticky session requirements
- **Troubleshooting Guide**: Common connection issues, event delivery debugging, monitoring

### Benefits
1. **Contract Clarity**: Frontend/backend teams aligned on event schemas, reducing bugs
2. **Faster Debugging**: Troubleshooting guide reduces MTTR for WebSocket issues
3. **Scalability Confidence**: Documented scaling patterns enable horizontal growth
4. **Onboarding Speed**: New developers understand real-time features quickly
5. **Monitoring Foundation**: Event catalog enables metrics and alerting

## Scope

### In Scope
- ✅ Complete Socket.io event catalog (event names, payloads, direction)
- ✅ Connection lifecycle documentation (authentication, rooms, disconnection)
- ✅ Architecture diagram (Socket.io server, Express integration, Redis adapter if used)
- ✅ Scaling patterns (sticky sessions, Redis PubSub for multi-server)
- ✅ Reconnection handling (client-side reconnection logic, exponential backoff)
- ✅ Troubleshooting guide (connection failures, event delivery issues, performance problems)
- ✅ Code references (event emitters, listeners, middleware)

### Out of Scope
- ❌ WebSocket implementation changes (documentation only)
- ❌ New Socket.io events (document existing events only)
- ❌ Performance optimization (covered in separate proposal)
- ❌ Alternative real-time protocols (Server-Sent Events, WebRTC)

## Technical Approach

### 1. Event Catalog Documentation

**Structure:**
```markdown
## Socket.io Event Catalog

### Client → Server Events

#### Event: `subscribe:trades`
**Description**: Subscribe to real-time trade execution updates
**Payload**:
```json
{
  "userId": "string"  // User ID to subscribe to
}
```
**Response**: `trades:subscribed` event with confirmation
**Authentication**: Required (session-based)
**Code Reference**: `server.js` or `src/websocket/handlers/trades.js`

#### Event: `execute:trade`
**Description**: Request immediate trade execution (admin/testing only)
**Payload**:
```json
{
  "symbol": "string",
  "side": "buy" | "sell",
  "quantity": number
}
```
**Response**: `trade:executed` or `trade:error`
**Authentication**: Admin role required

### Server → Client Events

#### Event: `trade:update`
**Description**: Real-time trade execution status update
**Payload**:
```json
{
  "tradeId": "string",
  "symbol": "string",
  "status": "pending" | "executed" | "failed",
  "executedPrice": number,
  "timestamp": "ISO8601"
}
```
**Emitted When**: Trade status changes (pending → executed → settled)
**Room**: `user:${userId}` (user-specific)

#### Event: `signal:new`
**Description**: New trading signal detected from Discord
**Payload**:
```json
{
  "signalId": "string",
  "provider": "string",
  "symbol": "string",
  "action": "buy" | "sell",
  "confidence": number
}
```
**Emitted When**: Signal parser detects valid trading signal
**Room**: `signals` (broadcast to all subscribed users)
```

### 2. Connection Lifecycle Documentation

**Topics:**
- Initial connection handshake
- Session-based authentication (express-session + Socket.io)
- Room joining patterns (`socket.join('user:123')`)
- Disconnection handling (graceful vs abrupt)
- Reconnection logic (client-side exponential backoff)

**Example:**
```markdown
## Connection Lifecycle

### 1. Initial Connection
```javascript
// Client
const socket = io('https://app.example.com', {
  auth: { sessionId: getSessionId() },
  transports: ['websocket', 'polling']
});
```

### 2. Authentication Middleware
```javascript
// Server: src/websocket/middleware/auth.js
io.use((socket, next) => {
  const session = socket.request.session;
  if (session && session.user) {
    socket.userId = session.user.id;
    next();
  } else {
    next(new Error('Authentication failed'));
  }
});
```

### 3. Room Subscription
```javascript
// Client subscribes to user-specific room
socket.emit('subscribe:trades', { userId: currentUser.id });

// Server joins user to room
socket.on('subscribe:trades', ({ userId }) => {
  socket.join(`user:${userId}`);
  socket.emit('trades:subscribed', { room: `user:${userId}` });
});
```

### 4. Disconnection Handling
- Client: Automatic reconnection with exponential backoff
- Server: Clean up subscriptions and rooms
- Notify user of connection status
```

### 3. Architecture Documentation

**Diagrams:**
- Socket.io server initialization (attached to Express HTTP server)
- Event flow: Discord bot → Signal parser → Socket.io → Dashboard
- Redis adapter (if used) for cross-server communication
- Namespace/room structure

**Example:**
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ Discord Bot │─────▶│ Signal Parser│─────▶│ Socket.io   │
└─────────────┘      └──────────────┘      │ Server      │
                                             └──────┬──────┘
                                                    │
                                             ┌──────▼──────┐
                                             │ Redis Adapter│ (Optional)
                                             │ (PubSub)     │
                                             └──────┬──────┘
                                                    │
                           ┌────────────────────────┼────────────────────────┐
                           │                        │                        │
                    ┌──────▼──────┐        ┌───────▼──────┐        ┌───────▼──────┐
                    │ Server 1    │        │ Server 2     │        │ Server 3     │
                    │ (Socket.io) │        │ (Socket.io)  │        │ (Socket.io)  │
                    └──────┬──────┘        └───────┬──────┘        └───────┬──────┘
                           │                       │                        │
                    ┌──────▼──────┐        ┌──────▼──────┐         ┌──────▼──────┐
                    │ Dashboard   │        │ Dashboard   │         │ Dashboard   │
                    │ Client 1    │        │ Client 2    │         │ Client 3    │
                    └─────────────┘        └─────────────┘         └─────────────┘
```

### 4. Scaling Patterns Documentation

**Topics:**
- Sticky sessions requirement (without Redis adapter)
- Redis adapter for stateless WebSocket scaling
- Load balancer configuration (Railway/Heroku)
- Performance considerations (connection limits, memory usage)

**Example:**
```markdown
## Scaling WebSocket Connections

### Single Server Deployment
- No special configuration needed
- All clients connect to same Socket.io instance
- Sufficient for <1000 concurrent connections

### Multi-Server Deployment (Horizontal Scaling)

**Option 1: Sticky Sessions** (Simple)
- Configure load balancer for session affinity
- Each client always routes to same server
- Pros: No Redis dependency, simple setup
- Cons: Uneven load distribution, client loses connection on server restart

**Option 2: Redis Adapter** (Recommended)
- Install socket.io-redis adapter
- Share events across servers via Redis PubSub
- Pros: True horizontal scaling, no sticky sessions needed
- Cons: Redis dependency, slight latency increase

```javascript
// server.js with Redis adapter
const redisAdapter = require('socket.io-redis');
io.adapter(redisAdapter({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
}));
```

### Load Balancer Configuration (Railway)
- Enable WebSocket support (default on)
- If using sticky sessions: Add `affinity: client-ip`
- Monitor connection distribution across servers
```

### 5. Troubleshooting Guide

**Common Issues:**
```markdown
## Troubleshooting WebSocket Connections

### Issue: "Transport Error" on connection
**Symptoms**: Client cannot establish WebSocket connection
**Root Causes**:
1. Firewall blocking WebSocket protocol (port 443)
2. Proxy not forwarding WebSocket upgrade headers
3. CORS misconfiguration

**Debugging Steps**:
1. Check browser DevTools → Network → WS tab
2. Verify `Upgrade: websocket` header in request
3. Test with polling transport: `transports: ['polling']`
4. Check server CORS config allows client origin

**Solution**: Configure proxy to forward WebSocket headers, update CORS

### Issue: Events not received by client
**Symptoms**: Server emits event but client listener not triggered
**Root Causes**:
1. Client not in correct room
2. Event name typo (case-sensitive)
3. Payload serialization error (circular references)

**Debugging Steps**:
1. Server: Log room membership: `io.sockets.adapter.rooms`
2. Client: Add catch-all listener: `socket.onAny((event, ...args) => console.log(event, args))`
3. Verify event names match exactly (check for typos)
4. Check payload serialization: `JSON.stringify(payload)`

**Solution**: Verify room subscription, fix event names, sanitize payloads

### Issue: Connection drops frequently
**Symptoms**: Client reconnects every few minutes
**Root Causes**:
1. Reverse proxy timeout too short
2. Heroku/Railway idle timeout (55 seconds)
3. Ping/pong timeout misconfigured

**Debugging Steps**:
1. Check Socket.io pingTimeout/pingInterval settings
2. Monitor network tab for disconnect reasons
3. Check server logs for ping timeout errors

**Solution**: Configure pingInterval (25s) and pingTimeout (60s)
```

## Implementation Plan

### Phase 1: Event Catalog (1.5 hours)
1. Audit codebase for all Socket.io `emit()` calls
2. Document each event (name, payload, direction, authentication)
3. Create event reference table

### Phase 2: Connection & Architecture (1 hour)
1. Document connection lifecycle (authentication, rooms, disconnection)
2. Create architecture diagrams (Socket.io setup, event flow)
3. Document middleware (authentication, logging)

### Phase 3: Scaling & Troubleshooting (30 minutes)
1. Document scaling patterns (sticky sessions vs Redis adapter)
2. Compile troubleshooting guide (common issues + solutions)
3. Add monitoring recommendations (event metrics, connection count)

## Success Criteria

- [ ] Complete Socket.io event catalog (10+ events documented)
- [ ] Connection lifecycle documented (authentication, rooms, reconnection)
- [ ] Architecture diagram created (Socket.io server, Express integration)
- [ ] Scaling patterns documented (sticky sessions, Redis adapter)
- [ ] Reconnection handling documented (client-side logic)
- [ ] Troubleshooting guide covers 8+ common issues
- [ ] Code references validated (files exist, event names accurate)
- [ ] Documentation reviewed by team member
- [ ] Frontend team confirms event contract accuracy

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Event catalog becomes outdated | MEDIUM | Add CI check for new socket.emit() calls, require docs update |
| Scaling patterns incorrect | LOW | Verify with load testing, document actual production setup |
| Troubleshooting guide incomplete | LOW | Collect issues from support tickets, iterate over time |
| Code references drift | LOW | Use file paths, not line numbers; update on major refactors |

## Dependencies

**Blocking**:
- Real-time feature development (blocked until event contracts documented)

**Blocked By**:
- None (can document immediately based on existing implementation)

## Effort Estimate

**Total**: 3 hours (focused documentation work)

**Breakdown**:
- Event catalog: 1.5 hours (audit codebase, document events, create reference)
- Connection & architecture: 1 hour (lifecycle, diagrams, middleware)
- Scaling & troubleshooting: 30 minutes (patterns, common issues)

## Rollback Plan

Not applicable (documentation-only change). If documentation is inaccurate:
1. Flag inaccuracies via GitHub issues
2. Update documentation to match actual implementation
3. No code changes required
