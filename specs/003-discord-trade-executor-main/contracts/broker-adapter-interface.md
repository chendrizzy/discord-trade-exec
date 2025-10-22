# Broker Adapter Interface

**Feature**: 003-discord-trade-executor-main  
**Pattern**: Adapter with Factory  
**Date**: 2025-10-22  
**Status**: COMPLETE

---

## Overview

The `BrokerAdapter` interface defines a unified contract for all broker integrations (stocks and crypto). This abstraction enables:

- **Constitutional Compliance**: Principle III (Broker Abstraction) mandates adapter pattern
- **Extensibility**: New brokers added without modifying core trading engine
- **Testability**: Mock adapters for unit testing without real API calls
- **Provider Independence**: Switch brokers (Alpaca → IBKR) without code changes in routes/services

**Base Class**: `src/brokers/adapters/BrokerAdapter.js`  
**Implementations**: 6 adapters (Alpaca, IBKR, Schwab, Coinbase, Kraken, Binance)  
**Factory**: `src/brokers/BrokerFactory.js` instantiates adapters by `brokerType`

---

## Base Interface: BrokerAdapter

### Constructor

```javascript
class BrokerAdapter {
  constructor(brokerType, credentials) {
    if (this.constructor === BrokerAdapter) {
      throw new Error('BrokerAdapter is abstract - cannot instantiate directly');
    }
    this.brokerType = brokerType;
    this.credentials = credentials;
    this.isConnected = false;
    this.rateLimiter = null;  // Initialized in connect()
  }
}
```

**Parameters**:
- `brokerType`: String enum (alpaca | ibkr | schwab | coinbase | kraken | binance)
- `credentials`: Object (encrypted, broker-specific structure)

---

## Core Methods (15 required implementations)

### 1. connect()

**Purpose**: Authenticate with broker API and initialize connection.

**Signature**:
```javascript
async connect()
```

**Returns**: `Promise<void>`

**Throws**: `BrokerAuthError` if credentials invalid

**Implementation Requirements**:
- Decrypt credentials using AES-256-GCM
- Test API connection (e.g., GET `/account` endpoint)
- Initialize rate limiter with broker-specific limits
- Set `this.isConnected = true` on success
- Throw error with sanitized message on failure

**Example (Alpaca)**:
```javascript
async connect() {
  const { apiKey, apiSecret } = decrypt(this.credentials);
  this.client = new AlpacaAPI({ keyId: apiKey, secretKey: apiSecret });
  
  try {
    await this.client.getAccount();  // Test connection
    this.rateLimiter = new RateLimiter({ points: 200, duration: 60 });  // 200 req/min
    this.isConnected = true;
  } catch (error) {
    throw new BrokerAuthError('Alpaca authentication failed');
  }
}
```

---

### 2. disconnect()

**Purpose**: Close connection and cleanup resources.

**Signature**:
```javascript
async disconnect()
```

**Returns**: `Promise<void>`

**Implementation Requirements**:
- Close WebSocket streams if any
- Clear rate limiter
- Set `this.isConnected = false`
- Gracefully handle already-disconnected state

---

### 3. placeOrder()

**Purpose**: Submit trade order to broker.

**Signature**:
```javascript
async placeOrder(symbol, quantity, orderType, side, limitPrice = null, stopPrice = null)
```

**Parameters**:
- `symbol`: String (ticker like "AAPL" or crypto pair "BTC/USD")
- `quantity`: Number (positive decimal)
- `orderType`: String enum (market | limit | stop_loss | stop_limit | trailing_stop)
- `side`: String enum (buy | sell)
- `limitPrice`: Number (required for limit/stop_limit orders)
- `stopPrice`: Number (required for stop_loss/stop_limit/trailing_stop)

**Returns**: `Promise<Order>`

**Order Object**:
```javascript
{
  brokerOrderId: String,      // Broker's unique order ID
  symbol: String,
  quantity: Number,
  orderType: String,
  side: String,
  status: String,             // pending | submitted | filled | rejected
  submittedAt: Date,
  fillPrice: Number | null,   // null if not filled yet
  fillTime: Date | null
}
```

**Throws**: 
- `InsufficientFundsError` if buying power insufficient
- `InvalidSymbolError` if ticker not found
- `MarketClosedError` if market hours violation
- `RateLimitError` if broker rate limit exceeded

**Implementation Requirements**:
- Consume rate limiter token before API call
- Validate order type parameters (limitPrice required for limit orders)
- Map broker-specific order format to standardized response
- Handle broker-specific error codes via `ErrorMapper`

**Example (Alpaca)**:
```javascript
async placeOrder(symbol, quantity, orderType, side, limitPrice, stopPrice) {
  await this.rateLimiter.consume(1);
  
  const orderParams = {
    symbol,
    qty: quantity,
    side,
    type: orderType === 'market' ? 'market' : 'limit',
    time_in_force: 'day'
  };
  
  if (orderType === 'limit') {
    orderParams.limit_price = limitPrice;
  }
  
  try {
    const response = await this.client.createOrder(orderParams);
    return {
      brokerOrderId: response.id,
      symbol: response.symbol,
      quantity: parseFloat(response.qty),
      orderType,
      side,
      status: response.status === 'accepted' ? 'submitted' : 'pending',
      submittedAt: new Date(response.submitted_at),
      fillPrice: response.filled_avg_price || null,
      fillTime: response.filled_at ? new Date(response.filled_at) : null
    };
  } catch (error) {
    throw ErrorMapper.mapBrokerError('alpaca', error);
  }
}
```

---

### 4. cancelOrder()

**Purpose**: Cancel pending order.

**Signature**:
```javascript
async cancelOrder(brokerOrderId)
```

**Parameters**:
- `brokerOrderId`: String (broker's order ID from placeOrder response)

**Returns**: `Promise<void>`

**Throws**: 
- `OrderNotFoundError` if order doesn't exist
- `OrderAlreadyFilledError` if order already executed

---

### 5. getOrderStatus()

**Purpose**: Query order status (for webhook validation).

**Signature**:
```javascript
async getOrderStatus(brokerOrderId)
```

**Parameters**:
- `brokerOrderId`: String

**Returns**: `Promise<Order>` (same structure as placeOrder)

---

### 6. getPositions()

**Purpose**: Fetch all open positions.

**Signature**:
```javascript
async getPositions()
```

**Returns**: `Promise<Position[]>`

**Position Object**:
```javascript
{
  symbol: String,
  quantity: Number,
  averageEntryPrice: Number,
  currentPrice: Number,
  marketValue: Number,         // quantity × currentPrice
  unrealizedPnL: Number,       // (currentPrice - averageEntryPrice) × quantity
  unrealizedPnLPercent: Number // (currentPrice / averageEntryPrice - 1) × 100
}
```

**Implementation Requirements**:
- Return empty array `[]` if no positions
- Calculate `unrealizedPnL` and `unrealizedPnLPercent` from broker data
- Handle crypto positions with decimal precision (8-10 decimals)

---

### 7. getBalance()

**Purpose**: Fetch account balance and buying power.

**Signature**:
```javascript
async getBalance()
```

**Returns**: `Promise<Balance>`

**Balance Object**:
```javascript
{
  currency: String,            // USD, USDT, etc.
  totalValue: Number,          // Total account value
  cashBalance: Number,         // Available cash
  buyingPower: Number,         // Cash + margin (if applicable)
  positionsValue: Number       // Total value of open positions
}
```

---

### 8. getAccountInfo()

**Purpose**: Fetch account metadata (for broker connection UI).

**Signature**:
```javascript
async getAccountInfo()
```

**Returns**: `Promise<AccountInfo>`

**AccountInfo Object**:
```javascript
{
  accountId: String,
  accountType: String,         // cash | margin | retirement
  status: String,              // active | suspended | closed
  createdAt: Date
}
```

---

### 9. healthCheck()

**Purpose**: Verify connection is still alive (called every 5 minutes).

**Signature**:
```javascript
async healthCheck()
```

**Returns**: `Promise<boolean>` (true if healthy, false if connection lost)

**Implementation Requirements**:
- Simple API call (e.g., GET `/account`)
- Return `false` on timeout or auth error
- Do NOT throw errors (used for monitoring, not critical path)

---

### 10. getRateLimitStatus()

**Purpose**: Check current rate limit consumption (for monitoring).

**Signature**:
```javascript
getRateLimitStatus()
```

**Returns**: `RateLimitInfo` (synchronous)

**RateLimitInfo Object**:
```javascript
{
  limit: Number,               // Max requests per window
  remaining: Number,           // Requests remaining in current window
  resetAt: Date,               // When limit resets
  consumedPercent: Number      // (limit - remaining) / limit × 100
}
```

---

### 11. handleError()

**Purpose**: Map broker-specific errors to standardized error types.

**Signature**:
```javascript
handleError(error)
```

**Parameters**:
- `error`: Error object from broker API

**Returns**: `StandardError` (one of predefined types)

**StandardError Types**:
- `INSUFFICIENT_FUNDS`: Buying power insufficient
- `INVALID_SYMBOL`: Ticker not found or unsupported
- `MARKET_CLOSED`: Trading hours violation
- `RATE_LIMIT_EXCEEDED`: API rate limit hit
- `AUTH_FAILED`: Credentials invalid or expired
- `ORDER_REJECTED`: Broker rejected order (generic)
- `INTERNAL_ERROR`: Unknown broker error

**Implementation Requirements**:
- Parse broker error code/message
- Map to standardized type
- Preserve original error message in `details` field
- Log full error context for debugging

---

### 12. subscribeMarketData()

**Purpose**: Subscribe to real-time price updates (if broker supports WebSocket).

**Signature**:
```javascript
async subscribeMarketData(symbols, callback)
```

**Parameters**:
- `symbols`: String[] (array of tickers)
- `callback`: Function receiving `{ symbol, price, timestamp }`

**Returns**: `Promise<void>`

**Implementation Requirements**:
- Establish WebSocket connection if not already open
- Subscribe to ticker feeds
- Call `callback` on each price update
- Handle reconnection on WebSocket disconnect

**Note**: Not all brokers support this (Schwab doesn't have public WebSocket). Return empty implementation if unsupported.

---

### 13. unsubscribeMarketData()

**Purpose**: Unsubscribe from price updates.

**Signature**:
```javascript
async unsubscribeMarketData(symbols)
```

**Parameters**:
- `symbols`: String[] (tickers to unsubscribe)

**Returns**: `Promise<void>`

---

### 14. getBrokerCapabilities()

**Purpose**: Return broker-specific features for UI conditional rendering.

**Signature**:
```javascript
getBrokerCapabilities()
```

**Returns**: `Capabilities` (synchronous)

**Capabilities Object**:
```javascript
{
  supportsMarketOrders: boolean,
  supportsLimitOrders: boolean,
  supportsStopLoss: boolean,
  supportsTrailingStop: boolean,
  supportsFractionalShares: boolean,
  supportsCrypto: boolean,
  supportsMarginTrading: boolean,
  supportsOptionsTrading: boolean,
  supportsWebSocketStreaming: boolean,
  minOrderValue: Number,       // Minimum order dollar value
  maxPositions: Number | null  // Max positions (null if unlimited)
}
```

**Example (Alpaca)**:
```javascript
getBrokerCapabilities() {
  return {
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsStopLoss: true,
    supportsTrailingStop: true,
    supportsFractionalShares: true,
    supportsCrypto: false,
    supportsMarginTrading: true,
    supportsOptionsTrading: false,
    supportsWebSocketStreaming: true,
    minOrderValue: 1.00,
    maxPositions: null
  };
}
```

---

### 15. formatSymbol()

**Purpose**: Convert internal symbol format to broker-specific format.

**Signature**:
```javascript
formatSymbol(symbol)
```

**Parameters**:
- `symbol`: String (internal format like "BTC/USD")

**Returns**: String (broker format like "BTCUSD" for Alpaca, "BTC-USD" for Coinbase)

**Example**:
```javascript
// Alpaca (stock)
formatSymbol('AAPL')  // => 'AAPL'

// Coinbase (crypto)
formatSymbol('BTC/USD')  // => 'BTC-USD'

// IBKR (complex)
formatSymbol('AAPL')  // => 'AAPL USD SMART' (stock at SMART exchange)
```

---

## Factory Pattern: BrokerFactory

**File**: `src/brokers/BrokerFactory.js`

**Purpose**: Instantiate correct adapter based on `brokerType`.

```javascript
class BrokerFactory {
  static create(brokerType, credentials) {
    switch (brokerType) {
      case 'alpaca':
        return new AlpacaAdapter(brokerType, credentials);
      case 'ibkr':
        return new IBKRAdapter(brokerType, credentials);
      case 'schwab':
        return new SchwabAdapter(brokerType, credentials);
      case 'coinbase':
        return new CoinbaseAdapter(brokerType, credentials);
      case 'kraken':
        return new KrakenAdapter(brokerType, credentials);
      case 'binance':
        return new BinanceAdapter(brokerType, credentials);
      default:
        throw new Error(`Unsupported broker type: ${brokerType}`);
    }
  }
  
  static getSupportedBrokers() {
    return ['alpaca', 'ibkr', 'schwab', 'coinbase', 'kraken', 'binance'];
  }
}
```

**Usage in Service**:
```javascript
// src/services/TradeExecutionService.js
const adapter = BrokerFactory.create(brokerConnection.brokerType, brokerConnection.credentials);
await adapter.connect();
const order = await adapter.placeOrder('AAPL', 100, 'market', 'buy');
```

---

## Rate Limiting Strategy

Each adapter implements broker-specific rate limits using token bucket algorithm:

| Broker   | Limit         | Implementation                                  |
|----------|---------------|-------------------------------------------------|
| Alpaca   | 200 req/min   | `RateLimiter({ points: 200, duration: 60 })`    |
| IBKR     | 50 req/min    | `RateLimiter({ points: 50, duration: 60 })`     |
| Schwab   | 120 req/min   | `RateLimiter({ points: 120, duration: 60 })`    |
| Coinbase | 10 req/sec    | `RateLimiter({ points: 10, duration: 1 })`      |
| Kraken   | 15 req/sec    | `RateLimiter({ points: 15, duration: 1 })`      |
| Binance  | 1200 req/min  | `RateLimiter({ points: 1200, duration: 60 })`   |

**Rate Limiter Configuration**:
```javascript
const { RateLimiterRedis } = require('rate-limiter-flexible');

this.rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: `ratelimit:${this.brokerType}`,
  points: 200,           // Max requests
  duration: 60,          // Time window (seconds)
  blockDuration: 60      // Cooldown after limit exceeded
});

// Before each API call
await this.rateLimiter.consume(userId, 1);
```

---

## Error Mapping

**File**: `src/brokers/utils/ErrorMapper.js`

**Purpose**: Standardize broker error codes.

```javascript
class ErrorMapper {
  static mapBrokerError(brokerType, error) {
    const errorMap = {
      alpaca: {
        403: 'INSUFFICIENT_FUNDS',
        404: 'INVALID_SYMBOL',
        422: 'MARKET_CLOSED',
        429: 'RATE_LIMIT_EXCEEDED'
      },
      ibkr: {
        201: 'ORDER_REJECTED',
        321: 'INSUFFICIENT_FUNDS',
        200: 'INVALID_SYMBOL'
      },
      coinbase: {
        'Insufficient funds': 'INSUFFICIENT_FUNDS',
        'Invalid product_id': 'INVALID_SYMBOL'
      }
    };
    
    const code = error.statusCode || error.message;
    const standardType = errorMap[brokerType]?.[code] || 'INTERNAL_ERROR';
    
    return new StandardError(standardType, error.message, {
      broker: brokerType,
      originalError: error
    });
  }
}
```

---

## Testing Strategy

### Unit Tests (Mock Broker APIs)

```javascript
// tests/unit/brokers/AlpacaAdapter.test.js
describe('AlpacaAdapter', () => {
  let adapter;
  let mockClient;
  
  beforeEach(() => {
    mockClient = {
      getAccount: jest.fn().mockResolvedValue({ id: 'acc123' }),
      createOrder: jest.fn().mockResolvedValue({
        id: 'order123',
        symbol: 'AAPL',
        qty: '100',
        status: 'accepted'
      })
    };
    
    adapter = new AlpacaAdapter('alpaca', encryptedCredentials);
    adapter.client = mockClient;  // Inject mock
  });
  
  test('placeOrder() creates market order', async () => {
    const order = await adapter.placeOrder('AAPL', 100, 'market', 'buy');
    
    expect(mockClient.createOrder).toHaveBeenCalledWith({
      symbol: 'AAPL',
      qty: 100,
      side: 'buy',
      type: 'market',
      time_in_force: 'day'
    });
    
    expect(order.brokerOrderId).toBe('order123');
    expect(order.status).toBe('submitted');
  });
  
  test('placeOrder() throws InsufficientFundsError on 403', async () => {
    mockClient.createOrder.mockRejectedValue({ statusCode: 403, message: 'Insufficient funds' });
    
    await expect(adapter.placeOrder('AAPL', 100, 'market', 'buy'))
      .rejects.toThrow(InsufficientFundsError);
  });
});
```

### Integration Tests (Paper Trading)

```javascript
// tests/integration/brokers/alpaca-paper.test.js
describe('Alpaca Paper Trading', () => {
  let adapter;
  
  beforeAll(async () => {
    const credentials = {
      apiKey: process.env.ALPACA_PAPER_KEY,
      apiSecret: process.env.ALPACA_PAPER_SECRET
    };
    adapter = new AlpacaAdapter('alpaca', encrypt(credentials));
    await adapter.connect();
  });
  
  test('Real paper trade execution', async () => {
    const order = await adapter.placeOrder('AAPL', 1, 'market', 'buy');
    
    expect(order.brokerOrderId).toBeDefined();
    expect(order.symbol).toBe('AAPL');
    
    // Poll order status until filled
    let status = await adapter.getOrderStatus(order.brokerOrderId);
    while (status.status !== 'filled') {
      await sleep(1000);
      status = await adapter.getOrderStatus(order.brokerOrderId);
    }
    
    expect(status.fillPrice).toBeGreaterThan(0);
  }, 30000);  // 30 second timeout
});
```

---

## Next Steps

1. ✅ **Broker adapter interface defined** - 15 methods with signatures
2. ⏳ **Implement base class** - `src/brokers/adapters/BrokerAdapter.js`
3. ⏳ **Implement Alpaca adapter** - `src/brokers/adapters/AlpacaAdapter.js`
4. ⏳ **Implement factory** - `src/brokers/BrokerFactory.js`
5. ⏳ **Write unit tests** - Mock API responses
6. ⏳ **Integration tests** - Paper trading accounts

**Status**: READY FOR IMPLEMENTATION
