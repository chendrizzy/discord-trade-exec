# Quickstart: Discord Server Subscription/Membership Gating

**Feature**: 004-subscription-gating  
**Created**: 2025-10-29  
**Phase**: 1 (Design & Contracts)

## For Developers Implementing This Feature

This guide helps developers get started implementing the subscription gating feature. Follow these steps to understand the architecture, set up your environment, and begin development.

## Prerequisites

- Node.js >=22.11.0
- MongoDB running (local or Railway addon)
- Redis running (local or Railway addon)
- Discord bot token with required permissions
- Familiarity with Discord.js v14+

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord Bot Commands                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ SubscriptionGateMiddleware │ ◄─── Intercepts all commands
        └────────────┬───────────────┘
                     │
                     ▼
           ┌─────────────────────┐
           │ AccessControlService │ ◄─── Main orchestration
           └──────┬──────────────┘
                  │
         ┌────────┼────────┐
         │        │        │
         ▼        ▼        ▼
    ┌──────┐ ┌──────┐ ┌────────┐
    │Config│ │Cache │ │Provider│
    │Service│ │Service│ │(Discord)│
    └───┬──┘ └──┬───┘ └───┬────┘
        │       │         │
        ▼       ▼         ▼
    [MongoDB] [Redis] [Discord API]
```

## Key Components

1. **SubscriptionProvider**: Abstract interface for subscription verification
   - `DiscordSubscriptionProvider`: Production implementation
   - `MockSubscriptionProvider`: Testing implementation

2. **AccessControlService**: Main business logic
   - Orchestrates cache, provider, and configuration
   - Handles access checks and denial logging

3. **SubscriptionCacheService**: Redis caching layer
   - 60-second TTL on verification results
   - Batch operations for performance

4. **ServerConfigurationService**: Configuration management
   - In-memory cache (5min TTL)
   - MongoDB persistence

5. **SubscriptionGateMiddleware**: Command interception
   - Applied to all bot commands
   - Returns denial message or allows execution

## File Structure

```
src/
├── models/
│   ├── server-configuration.model.ts
│   ├── user-access-status.model.ts
│   └── access-denial-event.model.ts
├── services/
│   ├── subscription/
│   │   ├── subscription-provider.interface.ts
│   │   ├── discord-subscription-provider.ts
│   │   └── mock-subscription-provider.ts
│   ├── access-control/
│   │   ├── access-control.service.ts
│   │   └── subscription-cache.service.ts
│   └── setup-wizard/
│       └── setup-wizard.service.ts
├── commands/
│   ├── setup/
│   │   └── configure-access.command.ts
│   └── config/
│       └── access-settings.command.ts
├── middleware/
│   └── subscription-gate.middleware.ts
└── events/
    └── subscription-change.handler.ts
```

## Development Workflow

### Step 1: Set Up Environment

```bash
# Clone repository
git clone <repo-url>
cd discord-trade-exec

# Checkout feature branch
git checkout 004-subscription-gating

# Install dependencies (if needed)
npm install

# Set up environment variables
cp .env.example .env
# Edit .env to add:
# - DISCORD_BOT_TOKEN
# - MONGODB_URI
# - REDIS_URL
```

### Step 2: Create Models (TDD: Write Tests First)

```bash
# Create test file FIRST
touch tests/unit/models/server-configuration.model.test.ts

# Write failing tests
# Then implement model
touch src/models/server-configuration.model.ts
```

**Test Example**:
```typescript
describe('ServerConfiguration Model', () => {
  it('should require guildId', async () => {
    const config = new ServerConfiguration({});
    await expect(config.save()).rejects.toThrow();
  });
  
  it('should validate Discord snowflake pattern', async () => {
    const config = new ServerConfiguration({ guildId: 'invalid' });
    await expect(config.save()).rejects.toThrow();
  });
  
  it('should require roleIds if mode is subscription_required', async () => {
    const config = new ServerConfiguration({
      guildId: '123456789012345678',
      accessControlMode: 'subscription_required',
      requiredRoleIds: [],  // Empty array should fail
      modifiedBy: '123456789012345678'
    });
    await expect(config.save()).rejects.toThrow();
  });
});
```

### Step 3: Implement Subscription Provider (TDD)

```bash
# Tests first
touch tests/unit/services/subscription/discord-subscription-provider.test.ts

# Then implementation
touch src/services/subscription/subscription-provider.interface.ts
touch src/services/subscription/discord-subscription-provider.ts
touch src/services/subscription/mock-subscription-provider.ts
```

**Test Example**:
```typescript
describe('DiscordSubscriptionProvider', () => {
  let provider: DiscordSubscriptionProvider;
  let mockClient: MockDiscordClient;
  
  beforeEach(() => {
    mockClient = new MockDiscordClient();
    provider = new DiscordSubscriptionProvider(mockClient);
  });
  
  it('should return true when user has required role', async () => {
    mockClient.setUserRoles('guild123', 'user456', ['role789']);
    
    const result = await provider.verifySubscription(
      'guild123',
      'user456',
      ['role789']
    );
    
    expect(result.hasAccess).toBe(true);
    expect(result.matchingRoles).toEqual(['role789']);
  });
  
  it('should return false when user lacks required roles', async () => {
    mockClient.setUserRoles('guild123', 'user456', ['role111']);
    
    const result = await provider.verifySubscription(
      'guild123',
      'user456',
      ['role789']
    );
    
    expect(result.hasAccess).toBe(false);
    expect(result.matchingRoles).toEqual([]);
  });
  
  it('should throw error on Discord API failure', async () => {
    mockClient.simulateError('TIMEOUT');
    
    await expect(
      provider.verifySubscription('guild123', 'user456', ['role789'])
    ).rejects.toThrow(SubscriptionVerificationError);
  });
});
```

### Step 4: Implement Cache Service (TDD)

```bash
# Tests first
touch tests/unit/services/access-control/subscription-cache.service.test.ts

# Then implementation
touch src/services/access-control/subscription-cache.service.ts
```

### Step 5: Implement Access Control Service (TDD)

This is a **CRITICAL PATH** per constitution - TDD is MANDATORY.

```bash
# Tests FIRST
touch tests/unit/services/access-control/access-control.service.test.ts

# Then implementation
touch src/services/access-control/access-control.service.ts
```

**Test Coverage Requirements**:
- ✅ Open access mode allows all users
- ✅ Subscription-required mode blocks non-subscribers
- ✅ Subscription-required mode allows subscribers
- ✅ Cache hit path (<10ms)
- ✅ Cache miss path (<2s)
- ✅ Cache invalidation on role change
- ✅ Graceful degradation on Discord API timeout
- ✅ Error handling for all failure modes

### Step 6: Implement Command Middleware

```bash
# Tests first
touch tests/unit/middleware/subscription-gate.middleware.test.ts

# Then implementation
touch src/middleware/subscription-gate.middleware.ts
```

### Step 7: Implement Setup Wizard (Test-After OK)

This is UI/UX, not a critical path, so test-after approach is acceptable per constitution.

```bash
# Implementation first (UI)
touch src/commands/setup/configure-access.command.ts
touch src/services/setup-wizard/setup-wizard.service.ts

# Then E2E tests
touch tests/e2e/setup-wizard.e2e.spec.ts
```

### Step 8: Integration Testing

```bash
# Create integration test
touch tests/integration/subscription-verification.integration.test.ts
```

**Integration Test Checklist**:
- [ ] End-to-end verification flow (Discord API → Cache → Response)
- [ ] Role change event triggers cache invalidation
- [ ] Configuration changes propagate immediately
- [ ] Access denial events logged to MongoDB
- [ ] Performance meets SLA (<2s p95)

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/services/access-control/access-control.service.test.ts

# Run with coverage
npm run test:coverage

# Verify 100% coverage on critical paths
npm run test:coverage -- --testPathPattern="access-control|subscription-provider"
```

## Manual Testing Checklist

### Test Setup Wizard
1. Install bot on test Discord server
2. Run `/setup access-control`
3. Verify button interaction works
4. Select "Subscription Required"
5. Verify role selection menu appears
6. Confirm configuration saves

### Test Subscription Gating
1. Create test user WITHOUT subscription role
2. Attempt bot command
3. Verify denial message displays with role info
4. Add subscription role to user
5. Wait 60 seconds (cache expiry)
6. Retry command
7. Verify command executes successfully

### Test Role Change Events
1. User with subscription executes command (succeeds)
2. Remove subscription role while bot is running
3. Immediately retry command
4. Verify denial (cache invalidated)

### Test Configuration Changes
1. Set server to "Open Access"
2. Non-subscriber executes command (succeeds)
3. Change to "Subscription Required"
4. Non-subscriber retries command
5. Verify denial within 60 seconds

## Performance Testing

```bash
# Load test with artillery
npm install -g artillery

# Create load-test.yml
artillery run load-test.yml
```

**Load Test Configuration**:
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users/sec
      
scenarios:
  - name: "Subscription verification"
    flow:
      - post:
          url: "/api/simulate-command"
          json:
            guildId: "{{ $randomString() }}"
            userId: "{{ $randomString() }}"
            command: "trade"
```

## Debugging Tips

### Enable Debug Logging

```typescript
// In src/services/access-control/access-control.service.ts
logger.debug('Access check', {
  guildId,
  userId,
  cacheHit: result.cacheHit,
  latency: Date.now() - startTime
});
```

### Monitor Redis Cache

```bash
# Connect to Redis
redis-cli

# Monitor cache operations
MONITOR

# Check specific cache key
GET subscription:123456789:987654321

# Check all cache keys
KEYS subscription:*
```

### Monitor MongoDB Queries

```typescript
// Enable Mongoose query logging
mongoose.set('debug', true);
```

## Common Issues & Solutions

### Issue: Tests failing due to Discord API rate limits

**Solution**: Use MockSubscriptionProvider in tests
```typescript
beforeEach(() => {
  container.register(SubscriptionProvider, {
    useClass: MockSubscriptionProvider
  });
});
```

### Issue: Cache not expiring after 60 seconds

**Solution**: Verify Redis TTL is set correctly
```typescript
await redis.setex(key, 60, JSON.stringify(data));  // TTL in seconds
```

### Issue: Role changes not detected

**Solution**: Verify `guildMemberUpdate` event is registered
```typescript
client.on('guildMemberUpdate', handleGuildMemberUpdate);
```

## Next Steps

1. Implement models with tests ✅
2. Implement provider with tests ✅
3. Implement cache service with tests ✅
4. Implement access control service with tests (CRITICAL PATH - TDD MANDATORY)
5. Implement middleware with tests ✅
6. Implement setup wizard (test-after OK) ✅
7. Integration testing ✅
8. Performance testing ✅
9. E2E testing with Playwright ✅
10. Deploy to staging ✅
11. Monitor and validate ✅

## Resources

- [Discord.js Documentation](https://discord.js.org)
- [Mongoose Documentation](https://mongoosejs.com)
- [Redis Commands](https://redis.io/commands)
- [Jest Testing Framework](https://jestjs.io)
- [Playwright E2E Testing](https://playwright.dev)
- [Constitution Check](../.specify/memory/constitution.md)

---

**Happy Coding!** 🚀

For questions, consult the spec: [`spec.md`](spec.md)
