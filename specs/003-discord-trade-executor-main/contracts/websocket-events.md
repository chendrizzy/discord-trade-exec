# WebSocket Events Specification

**Feature**: 003-discord-trade-executor-main  
**Protocol**: Socket.IO 4.7.5  
**Transport**: WebSocket (with HTTP long-polling fallback)  
**Date**: 2025-10-22

---

## Connection

### Client → Server: Connection Upgrade

**Event**: `connection` (Socket.IO built-in)

**Authentication**: JWT token passed via query parameter

```javascript
const socket = io('wss://discord-trade-exec.up.railway.app', {
  query: { token: 'eyJhbGc...' },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: Infinity
});
```

**Server Response**: `connection.authorized` or disconnect with error

---

## Connection Lifecycle Events

### Server → Client: Connection Authorized

**Event**: `connection.authorized`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "ws_abc123xyz",
  "timestamp": "2024-03-15T14:23:11.000Z"
}
```

**Description**: Emitted when JWT validation succeeds and connection is established.

---

### Server → Client: Connection Closed

**Event**: `connection.closed`

**Payload**:
```json
{
  "reason": "logout" | "token_expired" | "duplicate_connection" | "server_shutdown",
  "message": "User initiated logout",
  "timestamp": "2024-03-15T14:30:00.000Z"
}
```

**Description**: Emitted before server closes connection. Client should not auto-reconnect for `logout` or `duplicate_connection`.

---

### Server → Client: Connection Error

**Event**: `connection.error`

**Payload**:
```json
{
  "error": "AUTHENTICATION_FAILED" | "RATE_LIMIT_EXCEEDED" | "INTERNAL_ERROR",
  "message": "JWT token expired",
  "timestamp": "2024-03-15T14:25:00.000Z"
}
```

**Description**: Emitted when connection encounters error. Client should attempt reconnection with exponential backoff.

---

### Server → Client: Token Expiring

**Event**: `token.expiring`

**Payload**:
```json
{
  "expiresIn": 300,
  "message": "Token expires in 5 minutes",
  "timestamp": "2024-03-15T14:55:00.000Z"
}
```

**Description**: Emitted 5 minutes before JWT expiry. Client should refresh token via `/auth/refresh` endpoint and reconnect.

---

## Portfolio Events

### Server → Client: Balance Changed

**Event**: `portfolio.balanceChanged`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "oldBalance": 50000.00,
  "newBalance": 48200.00,
  "currency": "USD",
  "change": -1800.00,
  "reason": "TRADE_EXECUTED" | "FUNDS_DEPOSITED" | "FUNDS_WITHDRAWN" | "EXTERNAL_SYNC",
  "timestamp": "2024-03-15T14:23:15.000Z"
}
```

**Description**: Emitted when portfolio cash balance changes. Triggered by trade execution, deposits/withdrawals, or broker sync.

---

### Server → Client: Position Added

**Event**: `portfolio.positionAdded`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "position": {
    "id": "pos_abc123",
    "symbol": "AAPL",
    "quantity": 100,
    "averageEntryPrice": 180.00,
    "currentPrice": 180.50,
    "unrealizedPnL": 50.00,
    "stopLossPrice": 176.40,
    "openedAt": "2024-03-15T14:23:15.000Z"
  },
  "timestamp": "2024-03-15T14:23:15.000Z"
}
```

**Description**: Emitted when new position is opened (buy order fills).

---

### Server → Client: Position Updated

**Event**: `portfolio.positionUpdated`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "positionId": "pos_abc123",
  "symbol": "AAPL",
  "updates": {
    "currentPrice": 182.50,
    "unrealizedPnL": 250.00
  },
  "timestamp": "2024-03-15T14:25:00.000Z"
}
```

**Description**: Emitted when position attributes change (price updates, quantity changes from partial fills).

---

### Server → Client: Position Closed

**Event**: `portfolio.positionClosed`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "positionId": "pos_abc123",
  "symbol": "AAPL",
  "quantity": 100,
  "entryPrice": 180.00,
  "exitPrice": 185.00,
  "realizedPnL": 500.00,
  "holdingPeriod": 3600,
  "closedAt": "2024-03-15T15:23:15.000Z",
  "timestamp": "2024-03-15T15:23:15.000Z"
}
```

**Description**: Emitted when position is closed (sell order fills). Includes realized P&L and holding period in seconds.

---

## Trade Events

### Server → Client: Trade Submitted

**Event**: `trade.submitted`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_xyz789",
  "symbol": "TSLA",
  "quantity": 50,
  "orderType": "market",
  "side": "buy",
  "brokerOrderId": "alpaca_abc123",
  "status": "submitted",
  "submittedAt": "2024-03-15T14:23:10.000Z",
  "timestamp": "2024-03-15T14:23:10.000Z"
}
```

**Description**: Emitted when order is successfully submitted to broker API.

---

### Server → Client: Trade Filled

**Event**: `trade.filled`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_xyz789",
  "symbol": "TSLA",
  "quantity": 50,
  "fillPrice": 250.75,
  "side": "buy",
  "totalCost": 12537.50,
  "filledAt": "2024-03-15T14:23:15.000Z",
  "executionTime": 5000,
  "timestamp": "2024-03-15T14:23:15.000Z"
}
```

**Description**: Emitted when order is completely filled. `executionTime` is milliseconds from submission to fill.

---

### Server → Client: Trade Partially Filled

**Event**: `trade.partialFill`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_xyz789",
  "symbol": "NVDA",
  "requestedQuantity": 100,
  "filledQuantity": 60,
  "remainingQuantity": 40,
  "averageFillPrice": 475.25,
  "partialFillAt": "2024-03-15T14:23:20.000Z",
  "timestamp": "2024-03-15T14:23:20.000Z"
}
```

**Description**: Emitted when order is partially filled. Multiple partial fill events may occur before final `trade.filled`.

---

### Server → Client: Trade Rejected

**Event**: `trade.rejected`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_xyz789",
  "symbol": "AAPL",
  "quantity": 200,
  "side": "buy",
  "reason": "INSUFFICIENT_FUNDS" | "INVALID_SYMBOL" | "MARKET_CLOSED" | "RISK_LIMIT_EXCEEDED",
  "message": "Insufficient buying power: $20,000 available, $36,000 required",
  "rejectedAt": "2024-03-15T14:23:05.000Z",
  "timestamp": "2024-03-15T14:23:05.000Z"
}
```

**Description**: Emitted when order is rejected by broker or risk management system.

---

### Server → Client: Trade Cancelled

**Event**: `trade.cancelled`

**Payload**:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tradeId": "trade_xyz789",
  "symbol": "AAPL",
  "quantity": 100,
  "cancelledBy": "user" | "system" | "broker",
  "reason": "User requested cancellation",
  "cancelledAt": "2024-03-15T14:25:00.000Z",
  "timestamp": "2024-03-15T14:25:00.000Z"
}
```

**Description**: Emitted when pending order is cancelled (before fill).

---

## Market Data Events

### Server → Client: Market Quote

**Event**: `market.quote`

**Payload**:
```json
{
  "symbol": "AAPL",
  "bid": 180.45,
  "ask": 180.50,
  "last": 180.48,
  "volume": 52384756,
  "change": 2.35,
  "changePercent": 1.32,
  "timestamp": "2024-03-15T14:23:30.000Z"
}
```

**Description**: Emitted for symbols user is watching or has positions in. Throttled to max 1 update per symbol per second.

**Subscription**: Client subscribes via `market.subscribe` event

---

### Client → Server: Subscribe to Market Data

**Event**: `market.subscribe`

**Payload**:
```json
{
  "symbols": ["AAPL", "TSLA", "NVDA"]
}
```

**Response**: Server emits `market.quote` events for subscribed symbols

---

### Client → Server: Unsubscribe from Market Data

**Event**: `market.unsubscribe`

**Payload**:
```json
{
  "symbols": ["TSLA"]
}
```

**Response**: Server stops emitting `market.quote` for unsubscribed symbols

---

## State Sync Events

### Client → Server: Request Full State Sync

**Event**: `state.requestSync`

**Payload**:
```json
{
  "syncTypes": ["portfolio", "positions", "trades"]
}
```

**Description**: Client requests full state sync after reconnection or when local state appears stale.

---

### Server → Client: State Sync Response

**Event**: `state.sync`

**Payload**:
```json
{
  "portfolio": {
    "totalValue": 68450.00,
    "cashBalance": 32000.00,
    "positionsValue": 36450.00
  },
  "positions": [
    {
      "id": "pos_abc123",
      "symbol": "AAPL",
      "quantity": 100,
      "averageEntryPrice": 180.00,
      "currentPrice": 182.50,
      "unrealizedPnL": 250.00
    }
  ],
  "pendingTrades": [
    {
      "id": "trade_xyz789",
      "symbol": "TSLA",
      "quantity": 50,
      "orderType": "limit",
      "limitPrice": 245.00,
      "status": "submitted"
    }
  ],
  "timestamp": "2024-03-15T14:23:35.000Z"
}
```

**Description**: Server responds with complete current state for requested sync types.

---

## Error Events

### Server → Client: Rate Limit Warning

**Event**: `error.rateLimitWarning`

**Payload**:
```json
{
  "limit": 10,
  "current": 8,
  "resetAt": "2024-03-15T14:24:00.000Z",
  "message": "Approaching rate limit: 8/10 messages per minute",
  "timestamp": "2024-03-15T14:23:40.000Z"
}
```

**Description**: Emitted when client approaches WebSocket message rate limit (10 messages/minute per constitutional standard).

---

### Server → Client: Broker Connection Lost

**Event**: `error.brokerDisconnected`

**Payload**:
```json
{
  "brokerType": "alpaca",
  "brokerConnectionId": "broker_abc123",
  "reason": "API authentication failed",
  "action": "Verify API keys in Settings → Brokers",
  "timestamp": "2024-03-15T14:23:45.000Z"
}
```

**Description**: Emitted when broker connection health check fails. User should re-authenticate broker.

---

## Event Flow Examples

### Example 1: Trade Execution Flow

```
1. Client sends trade request via POST /api/v1/trades/buy
2. Server validates and submits to broker
3. Server emits: trade.submitted
4. Broker fills order (5 seconds later)
5. Server emits: trade.filled
6. Server emits: portfolio.positionAdded (if new position)
7. Server emits: portfolio.balanceChanged (cash reduced)
```

### Example 2: Reconnection Flow

```
1. Client loses network connection
2. Socket.IO auto-reconnects with exponential backoff
3. Server validates JWT on reconnection
4. Server emits: connection.authorized
5. Client sends: state.requestSync
6. Server emits: state.sync (full portfolio + positions + pending trades)
7. Client UI updates with current state
```

### Example 3: Multi-Device Flow

```
User A logs in on laptop:
- Laptop WebSocket connects, receives connection.authorized

User A logs in on phone:
- Phone WebSocket connects, receives connection.authorized
- Both connections receive all events (portfolio.*, trade.*)

User A places trade on laptop:
- POST /api/v1/trades/buy on laptop
- Server emits trade.filled to BOTH laptop and phone WebSockets
- Both devices update UI simultaneously
```

---

## Implementation Notes

### Rate Limiting

- Client limited to 10 messages/minute per constitutional standard
- Server emits `error.rateLimitWarning` at 80% threshold (8/10)
- Exceeding limit triggers temporary connection close with 60-second cooldown

### Security

- JWT authentication required on connection upgrade (query param `?token=...`)
- Room isolation: Each user joins room `user:${userId}`, events broadcast only to that room
- No cross-user data leakage via Redis Pub/Sub channel namespacing

### Scalability

- Redis adapter enables horizontal scaling (1000+ concurrent connections per instance)
- Sticky sessions NOT required (Redis Pub/Sub distributes events across instances)
- WebSocket heartbeat every 25 seconds (Socket.IO default) detects dead connections

---

## Next Steps

1. ✅ **WebSocket events defined** - 20+ events with schemas
2. ⏳ **Implement handlers** - `src/websocket/handlers/*.js`
3. ⏳ **Add JWT middleware** - `src/websocket/middleware/JWTAuthMiddleware.js`
4. ⏳ **Integration tests** - `tests/integration/websocket/*.test.js`

**Status**: READY FOR IMPLEMENTATION
