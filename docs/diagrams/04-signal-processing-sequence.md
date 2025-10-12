# Discord Trade Executor - Signal Processing Sequence Diagram

## Overview
This diagram illustrates the chronological sequence of interactions between all system components when processing a trading signal, from Discord message detection to final trade execution.

## Sequence Diagram

```mermaid
sequenceDiagram
    actor Provider as Signal Provider<br/>(Discord User)
    participant Discord as Discord<br/>Platform
    participant Bot as Discord Bot<br/>(discord.js)
    participant Parser as Signal Parser<br/>(NLP)
    participant Validator as Risk Validator<br/>(Pipeline)
    participant DB as MongoDB<br/>Database
    participant Executor as Trade Executor<br/>(Core Logic)
    participant CCXT as CCXT Library<br/>(Exchange API)
    participant Binance as Binance<br/>Exchange
    participant Notifier as Notification<br/>Service
    actor User as Subscribed<br/>User

    %% Signal Detection Phase
    Note over Provider,Discord: 📢 Signal Detection Phase (0-100ms)
    Provider->>+Discord: Post signal message<br/>"BUY BTC at $45,000<br/>SL: $43,500 TP: $47,000"
    Discord->>+Bot: messageCreate event<br/>(< 50ms latency)

    Bot->>Bot: Check if signal channel<br/>Verify message format
    alt Not a signal channel
        Bot-->>-Discord: Ignore message
    else Is signal channel
        Bot->>+Parser: Extract & parse signal<br/>rawText: "BUY BTC..."
    end

    %% Parsing Phase
    Note over Parser: 🧠 NLP Parsing Phase (100-300ms)
    Parser->>Parser: Tokenize message
    Parser->>Parser: Apply regex patterns<br/>Symbol, prices, side
    Parser->>Parser: Validate parsed data<br/>confidence: 0.95

    alt Parsing failed
        Parser-->>Bot: ParseError<br/>"Invalid signal format"
        Bot->>DB: Log failed parse
        Bot-->>-Discord: ❌ React with error emoji
    else Parsing successful
        Parser-->>-Bot: Parsed signal object<br/>{symbol, side, prices}
    end

    %% User Lookup Phase
    Note over Bot,DB: 👥 User Lookup Phase (50-100ms)
    Bot->>+DB: Query SignalProvider<br/>providerId: "provider123"
    DB-->>-Bot: Provider metadata

    Bot->>+DB: Find subscribed users<br/>with active bots
    DB-->>-Bot: List of subscribers<br/>[user1, user2, user3]

    %% Process each subscriber in parallel
    Note over Bot: 🔄 Process Each Subscriber (Parallel)

    loop For each subscribed user
        Bot->>+DB: Fetch user config<br/>userId: "user_abc123"
        DB-->>-Bot: User object<br/>(subscription, config, limits)

        %% Risk Validation Phase
        Note over Bot,Validator: 🛡️ Risk Validation (200-500ms)
        Bot->>+Validator: Validate trade<br/>(signal, user)

        %% Gate 1: Subscription
        Validator->>Validator: Gate 1: Check subscription<br/>status: active?
        alt Subscription inactive
            Validator-->>Bot: ❌ Validation failed<br/>"Subscription inactive"
            Bot->>DB: Log rejection
            Bot->>Notifier: Notify user<br/>"Upgrade required"
            Notifier->>User: 📧 Upgrade email
        else Subscription active
            Validator->>Validator: ✅ Gate 1 passed
        end

        %% Gate 2: Daily Limits
        Validator->>DB: Check signals used today
        DB-->>Validator: signalsUsedToday: 42
        Validator->>Validator: Gate 2: Daily limit<br/>42 < limit?
        alt Daily limit reached
            Validator-->>Bot: ❌ Validation failed<br/>"Daily limit reached"
            Bot->>DB: Log rejection
            Bot->>Notifier: Notify user<br/>"Limit exceeded"
            Notifier->>User: 📧 Limit warning
        else Within limits
            Validator->>Validator: ✅ Gate 2 passed
        end

        %% Gate 3: Trading Hours
        Validator->>Validator: Gate 3: Trading hours<br/>Current UTC: 14:30
        alt Outside trading hours
            Validator-->>Bot: ❌ Validation failed<br/>"Outside trading hours"
            Bot->>DB: Log rejection
        else Within hours
            Validator->>Validator: ✅ Gate 3 passed
        end

        %% Gate 4: Daily Loss
        Validator->>+DB: Fetch today's trades<br/>Calculate P&L
        DB-->>-Validator: todayPnL: -$150 (-1.5%)
        Validator->>Validator: Gate 4: Daily loss<br/>-1.5% < maxLoss (5%)?
        alt Daily loss limit hit
            Validator-->>Bot: ❌ Validation failed<br/>"Daily loss limit exceeded"
            Bot->>DB: Log rejection
            Bot->>Notifier: Critical alert<br/>"Trading paused"
            Notifier->>User: 🚨 Loss limit alert
        else Within loss limit
            Validator->>Validator: ✅ Gate 4 passed
        end

        %% Gate 5: Position Limits
        Validator->>+DB: Count open positions<br/>symbol: BTC/USDT
        DB-->>-Validator: open: 3, symbol: 1
        Validator->>Validator: Gate 5: Position limits<br/>3 < max (5)?
        alt Max positions reached
            Validator-->>Bot: ❌ Validation failed<br/>"Max positions reached"
            Bot->>DB: Log rejection
        else Within position limits
            Validator->>Validator: ✅ Gate 5 passed
            Validator-->>-Bot: ✅ All gates passed<br/>Ready to execute
        end

        %% Trade Execution Phase
        Note over Bot,Binance: 💱 Trade Execution (500-2000ms)
        Bot->>+Executor: Execute trade<br/>(signal, user, validated)

        %% Position Sizing
        Executor->>+CCXT: Initialize exchange<br/>apiKey, apiSecret
        CCXT-->>-Executor: Exchange instance

        Executor->>+CCXT: Fetch balance<br/>exchange.fetchBalance()
        CCXT->>+Binance: GET /api/v3/account
        Binance-->>-CCXT: Account data<br/>USDT balance: 10,000
        CCXT-->>-Executor: Balances parsed

        Executor->>Executor: Calculate position size<br/>Method: risk_based<br/>Risk: 3% ($300)
        Executor->>Executor: stopLossDistance: 3.33%<br/>positionSize: $9000<br/>quantity: 0.2 BTC

        %% Check sufficient balance
        alt Insufficient balance
            Executor-->>Bot: ❌ Execution failed<br/>"Insufficient funds"
            Bot->>DB: Log failed trade
            Bot->>Notifier: Notify user<br/>"Add funds"
            Notifier->>User: 📧 Low balance alert
        else Balance sufficient
            %% Create market order
            Executor->>+CCXT: Create market order<br/>BUY 0.2 BTC @ market
            CCXT->>+Binance: POST /api/v3/order<br/>{symbol, side, quantity, type}
            Binance->>Binance: Match order<br/>Execute @ $45,012.50

            alt Order failed
                Binance-->>CCXT: Error response<br/>"Invalid order"
                CCXT-->>Executor: ExchangeError
                Executor->>Executor: Retry logic<br/>Attempt 1/3
                Executor->>CCXT: Retry order...
            else Order successful
                Binance-->>-CCXT: Order filled<br/>{orderId, fillPrice, fees}
                CCXT-->>-Executor: Order object parsed<br/>orderId: "28457"
            end
        end

        %% Set Stop-Loss
        alt Stop-loss enabled
            Executor->>Executor: Check trailing stop<br/>enabled: true

            alt Trailing stop
                Executor->>Executor: Start background monitor<br/>Adjust stop with profit
                Note over Executor: Trailing stop runs async
            else Fixed stop
                Executor->>+CCXT: Create stop-loss order<br/>STOP_LOSS_LIMIT @ $43,500
                CCXT->>+Binance: POST /api/v3/order<br/>{type: STOP_LOSS_LIMIT}
                Binance-->>-CCXT: Stop order created<br/>orderId: "28458"
                CCXT-->>-Executor: Stop-loss set
            end
        end

        %% Set Take-Profit
        alt Take-profit enabled
            Executor->>+CCXT: Create take-profit order<br/>LIMIT SELL @ $47,000
            CCXT->>+Binance: POST /api/v3/order<br/>{type: LIMIT, price: 47000}
            Binance-->>-CCXT: Limit order created<br/>orderId: "28459"
            CCXT-->>-Executor: Take-profit set
        end

        %% Database Persistence Phase
        Note over Executor,DB: 💾 Database Persistence (50-100ms)
        Executor->>+DB: Create trade record<br/>Trade.create({...})
        DB->>DB: Insert document<br/>Trades collection
        DB-->>-Executor: Trade saved<br/>_id: ObjectId(...)

        Executor->>+DB: Update user stats<br/>$inc: {trades, signals}
        DB->>DB: Update Users collection<br/>Atomic increment
        DB-->>-Executor: Stats updated

        Executor-->>-Bot: ✅ Trade executed<br/>(tradeId, orderId)

        %% Notification Phase
        Note over Bot,User: 📬 Notification Phase (100-300ms)
        Bot->>+Notifier: Send confirmation<br/>(userId, tradeDetails)

        par Parallel Notifications
            Notifier->>User: 📱 Discord DM<br/>"Trade executed: BUY 0.2 BTC"
        and
            Notifier->>User: 📧 Email notification<br/>"Trade confirmation"
        and
            Notifier->>User: 🌐 Dashboard update<br/>WebSocket push
        end

        Notifier-->>-Bot: Notifications sent

        Bot->>Discord: ✅ React with success emoji
        Bot->>DB: Log successful execution
    end

    %% Success confirmation
    Bot-->>-Discord: All subscribers processed
    Note over Provider,User: ✅ Signal Processing Complete (Total: 1-3 seconds)
```

## Interaction Patterns

### 1. Synchronous vs. Asynchronous Operations

#### Synchronous (Blocking)
```javascript
// Parser waits for result
const parsed = await signalParser.parse(rawText);

// Validator waits for all gates
const validation = await riskValidator.validate(signal, user);

// Executor waits for order confirmation
const order = await exchange.createMarketOrder(symbol, side, quantity);
```

#### Asynchronous (Non-blocking)
```javascript
// Process multiple users in parallel
const promises = users.map(user =>
  executeTrade(signal, user).catch(err => logError(err))
);
await Promise.allSettled(promises);

// Trailing stop runs in background
if (useTrailingStop) {
  startTrailingStopMonitor(tradeId, exchange, symbol);
  // Don't await - continues execution
}

// Notifications sent in parallel
await Promise.all([
  sendDiscordDM(userId, message),
  sendEmail(userEmail, message),
  broadcastWebSocket(userId, data)
]);
```

### 2. Error Propagation & Recovery

#### Error Handling Strategy
```javascript
// At each phase, errors are caught and logged
try {
  const parsed = await parser.parse(rawText);
  try {
    const validated = await validator.validate(parsed, user);
    try {
      const executed = await executor.execute(parsed, user);
      // Success path
      return { success: true, tradeId: executed.id };
    } catch (executionError) {
      // Retry if retriable
      if (RETRIABLE_ERRORS.includes(executionError.code)) {
        return await retryExecution(parsed, user, 3);
      }
      // Otherwise log and notify
      await logError('execution_failed', executionError);
      await notifyUser(user, 'trade_failed', executionError);
      return { success: false, reason: executionError.message };
    }
  } catch (validationError) {
    // Validation errors don't retry
    await logError('validation_failed', validationError);
    if (NOTIFIABLE_ERRORS.includes(validationError.code)) {
      await notifyUser(user, 'validation_failed', validationError);
    }
    return { success: false, reason: validationError.message };
  }
} catch (parseError) {
  // Parse errors affect all users
  await logError('parse_failed', parseError);
  return { success: false, reason: 'Invalid signal format' };
}
```

### 3. Database Transaction Patterns

#### Atomic Operations
```javascript
// Use MongoDB transactions for critical updates
const session = await mongoose.startSession();
session.startTransaction();

try {
  // 1. Create trade record
  const trade = await Trade.create([tradeData], { session });

  // 2. Update user stats atomically
  await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        'stats.totalTradesExecuted': 1,
        'subscription.signalsUsedToday': 1
      },
      $set: {
        'stats.lastTradeAt': new Date()
      }
    },
    { session }
  );

  // 3. Record signal usage
  await SignalProvider.findByIdAndUpdate(
    providerId,
    { $inc: { 'stats.signalsProcessed': 1 } },
    { session }
  );

  // Commit transaction
  await session.commitTransaction();
  return trade;
} catch (error) {
  // Rollback on any error
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

#### Query Optimization
```javascript
// Use projection to fetch only needed fields
const user = await User.findById(userId)
  .select('subscription tradingConfig stats')
  .lean();  // Return plain JS object (faster)

// Use indexes for fast lookups
// Index on: Users.discordId, Trades.userId + status, Trades.entryTime

// Batch queries when processing multiple users
const userIds = subscribers.map(s => s.userId);
const users = await User.find({ _id: { $in: userIds } })
  .select('subscription tradingConfig')
  .lean();
```

### 4. Rate Limiting & Throttling

#### Discord API Rate Limits
```javascript
// Discord: 50 requests per second per bot
const discordRateLimiter = new RateLimiter({
  tokensPerInterval: 50,
  interval: 1000  // 1 second
});

await discordRateLimiter.removeTokens(1);
await channel.send(message);
```

#### Binance API Rate Limits
```javascript
// Binance: 1200 requests per minute, 10 orders per second
const binanceOrderLimiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 1000  // 1 second
});

await binanceOrderLimiter.removeTokens(1);
const order = await exchange.createMarketOrder(...);
```

#### User-Level Throttling
```javascript
// Prevent spam from individual users
const userRateLimiter = new RateLimiter({
  tokensPerInterval: 5,  // 5 signals
  interval: 60000,  // per minute
  fireImmediately: false
});

const userKey = `user:${userId}`;
const allowed = await userRateLimiter.tryRemoveTokens(1, userKey);
if (!allowed) {
  throw new Error('Rate limit exceeded: Max 5 signals per minute');
}
```

## Timing Analysis

### Critical Path (Single User)
```
Time     Component           Operation                    Duration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0ms      Provider           Post signal                   -
50ms     Discord            Forward to bot                50ms
150ms    Bot                Detect & extract              100ms
400ms    Parser             NLP parsing                   250ms
500ms    Bot                User lookup                   100ms
700ms    Validator          5-gate validation             200ms
1000ms   Executor           Position sizing               300ms
1200ms   CCXT               Fetch balance                 200ms
1800ms   Binance            Execute order                 600ms
1900ms   Executor           Set stop-loss                 100ms
2000ms   Executor           Set take-profit               100ms
2100ms   Database           Save trade record             100ms
2200ms   Notifier           Send notifications            100ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 2200ms (2.2 seconds)
```

### Parallel Processing (10 Users)
```
Time     Component           Operation                    Duration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0ms      Provider           Post signal                   -
50ms     Discord            Forward to bot                50ms
150ms    Bot                Detect & extract              100ms
400ms    Parser             NLP parsing (once)            250ms
500ms    Bot                Batch user lookup             100ms

         ┌─── User 1 ───┬─── User 2 ───┬─── ... ───┬─── User 10 ───┐
700ms    │ Validate      │ Validate      │    ...     │ Validate       │
1000ms   │ Position size │ Position size │    ...     │ Position size  │
1800ms   │ Execute order │ Execute order │    ...     │ Execute order  │  ← Binance rate limit: 10/sec
2100ms   │ Save DB       │ Save DB       │    ...     │ Save DB        │
2200ms   └─── Notify ────┴─── Notify ────┴─── ... ───┴─── Notify ──────┘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 2200ms (2.2 seconds) - Same as single user!
(Parallel processing with rate limit consideration)
```

### Bottleneck Analysis

#### Current Bottlenecks
1. **Binance Order Execution** (600ms average)
   - Network latency: ~200ms
   - Order matching: ~300ms
   - Response processing: ~100ms
   - **Mitigation**: Use WebSocket for faster order updates

2. **Risk Validation** (200ms)
   - Database queries: ~100ms
   - Computation: ~100ms
   - **Mitigation**: Cache user configs in Redis

3. **NLP Parsing** (250ms)
   - Tokenization: ~100ms
   - Regex matching: ~100ms
   - Confidence calculation: ~50ms
   - **Mitigation**: Pre-compile regex, use faster NLP library

#### Scalability Limits
```javascript
// Current architecture can handle:
- 50 signals/minute (comfortable)
- 200 signals/minute (with optimization)
- 1000+ signals/minute (requires major refactor)

// Scaling strategy:
1. Cache layer (Redis) for user configs
2. WebSocket for real-time exchange data
3. Message queue (RabbitMQ/SQS) for async processing
4. Horizontal scaling with load balancer
```

## Failure Scenarios & Recovery

### Scenario 1: Binance API Down
```
Signal arrives → Parse successful → Validation passed
  ↓
Execute order → Binance timeout (30s)
  ↓
CCXT throws ExchangeNotAvailable
  ↓
Retry logic: Attempt 1/3 (wait 2s)
  ↓
Retry logic: Attempt 2/3 (wait 4s)
  ↓
Retry logic: Attempt 3/3 (wait 8s)
  ↓
All retries failed → Log error
  ↓
Save failed trade record (status: FAILED)
  ↓
Notify user: "Exchange temporarily unavailable"
  ↓
Alert admin: "Binance API down, 15 trades failed"
```

### Scenario 2: MongoDB Connection Lost
```
Order executed successfully on Binance
  ↓
Attempt to save trade record → MongoDB timeout
  ↓
CRITICAL: Order executed but not recorded!
  ↓
Retry save with exponential backoff
  ↓
If still failing after 3 attempts:
  ↓
Write to local file: /tmp/unsaved-trades.json
  ↓
Alert admin: "URGENT: Trade executed but not saved!"
  ↓
Manual recovery: Load from file & save to DB when available
```

### Scenario 3: User Daily Limit Edge Case
```
User has 99 signals used (limit: 100)
  ↓
Signal arrives → Validation starts
  ↓
Check: 99 < 100 → ✅ Pass Gate 2
  ↓
Meanwhile, another signal for same user arrives
  ↓
Both pass Gate 2 (race condition!)
  ↓
Both attempt to increment signalsUsedToday
  ↓
MongoDB atomic increment: 99 → 100 → 101
  ↓
User ends up with 101 signals (exceeded limit by 1)
  ↓
Prevention: Use MongoDB $setOnInsert with unique constraint
```

## Performance Optimization Opportunities

### 1. Database Query Optimization
```javascript
// Before: 3 separate queries
const user = await User.findById(userId);
const openTrades = await Trade.find({ userId, status: 'OPEN' });
const todayTrades = await Trade.find({ userId, entryTime: { $gte: today } });

// After: 1 aggregation query
const [result] = await User.aggregate([
  { $match: { _id: userId } },
  { $lookup: {
      from: 'trades',
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
        { $facet: {
            open: [{ $match: { status: 'OPEN' } }],
            today: [{ $match: { entryTime: { $gte: today } } }]
          }
        }
      ],
      as: 'trades'
    }
  }
]);

// Improvement: 200ms → 70ms (65% faster)
```

### 2. Caching Strategy
```javascript
// Cache user configs in Redis (5 min TTL)
const cacheKey = `user:config:${userId}`;
let userConfig = await redis.get(cacheKey);

if (!userConfig) {
  userConfig = await User.findById(userId).lean();
  await redis.setex(cacheKey, 300, JSON.stringify(userConfig));
}

// Improvement: 100ms → 2ms (98% faster)
```

### 3. Batch Processing
```javascript
// Before: Sequential execution per user
for (const user of users) {
  await executeTrade(signal, user);
}
// Total: 2000ms × 10 users = 20 seconds

// After: Parallel execution with concurrency limit
const limit = pLimit(10);  // Max 10 concurrent
await Promise.all(
  users.map(user => limit(() => executeTrade(signal, user)))
);
// Total: ~2500ms (8x faster)
```

## Source Code References
- Discord Bot: `src/bot.js:1`
- Message Handler: `src/bot.js:45-120`
- Signal Parser: `src/signal-parser.js:1`
- Risk Validator: `src/trade-executor.js:45-120`
- Trade Executor: `src/trade-executor.js:1`
- Position Sizing: `src/trade-executor.js:200-350`
- CCXT Integration: `src/trade-executor.js:400-500`
- Database Operations: `src/models/User.js:1`, `src/models/Trade.js:1`
- Notification Service: `src/services/notification.js:1`

## Next Diagram
See [Database ERD](./05-database-erd.md) for detailed entity-relationship diagram of the MongoDB collections.
