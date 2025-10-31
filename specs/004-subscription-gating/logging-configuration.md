# Subscription Gating Feature - Logging Configuration

**Feature**: 004-subscription-gating
**Task**: T021 - Configure structured logging with correlation IDs
**Date**: 2025-10-30

## Overview

The Subscription Gating feature uses the project's centralized structured logging system (`src/utils/logger.js`) with correlation IDs for request tracing.

## Logger Features

### ✅ Structured Logging
- **Format**: JSON-formatted logs with timestamps
- **Library**: Winston
- **Transports**:
  - Console (development with colorization)
  - File: `logs/app.log` (all logs)
  - File: `logs/error.log` (errors only)
- **Rotation**: 100MB max file size, 30 days retention

### ✅ Correlation IDs
- **Implementation**: AsyncLocalStorage for context propagation
- **Format**: UUID v4
- **Usage**: Tracks requests across async boundaries
- **API**:
  ```javascript
  logger.withCorrelation(correlationId, async () => {
    // All logs within this context include correlationId
  });

  logger.getCorrelationId(); // Get current context ID
  logger.setCorrelationId(id); // Set context ID
  ```

### ✅ Sensitive Data Sanitization
- **Module**: `src/utils/log-sanitizer.js`
- **Protection**: Automatically sanitizes sensitive fields in metadata
- **Fields**: Tokens, passwords, API keys, etc.

### ✅ Environment-Based Configuration
- **Production**: `info` level
- **Development**: `debug` level
- **Test**: Silent unless `DEBUG_LOGS=true`

## Feature-Specific Logging

### SubscriptionCacheService
```javascript
const logger = require('@utils/logger');

logger.info('Cache hit for subscription verification', {
  guildId: '123...',
  userId: '456...',
  service: 'SubscriptionCacheService'
});
```

### DiscordSubscriptionProvider
```javascript
logger.debug('Fetching Discord member roles', {
  guildId,
  userId,
  service: 'DiscordSubscriptionProvider'
});

logger.warn('Discord API rate limit approaching', {
  remaining: rateLimitInfo.remaining,
  resetAt: rateLimitInfo.resetAt
});

logger.error('Discord API error during verification', {
  error: error.message,
  code: error.code,
  retryable: true
});
```

### ServerConfigurationService
```javascript
logger.info('Guild configuration created', {
  guildId,
  accessMode,
  service: 'ServerConfigurationService'
});

logger.debug('Cache invalidated for guild', {
  guildId,
  reason: 'config_update'
});
```

## Correlation ID Flow

### Middleware Integration (Future)
When implementing subscription gate middleware (Phase 4 - US2):

```javascript
// src/middleware/correlation.js
const logger = require('@utils/logger');

module.exports = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || logger.getCorrelationId();

  logger.withCorrelation(correlationId, () => {
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });
};
```

### Discord.js Integration
For Discord commands:

```javascript
// Generate correlation ID per command interaction
client.on('interactionCreate', async interaction => {
  const correlationId = logger.getCorrelationId();

  await logger.withCorrelation(correlationId, async () => {
    logger.info('Discord command received', {
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    // All subsequent logs include correlationId
    await handleCommand(interaction);
  });
});
```

## Testing Logging

### Unit Tests
Logs are silent in tests by default unless `DEBUG_LOGS=true`:

```javascript
// In test file
process.env.DEBUG_LOGS = 'true'; // Enable logs for debugging
```

### Correlation ID Testing
```javascript
const logger = require('@utils/logger');

test('should maintain correlation ID across async operations', async () => {
  const testCorrelationId = 'test-correlation-123';

  await logger.withCorrelation(testCorrelationId, async () => {
    const id1 = logger.getCorrelationId();

    await someAsyncOperation();

    const id2 = logger.getCorrelationId();

    expect(id1).toBe(testCorrelationId);
    expect(id2).toBe(testCorrelationId);
  });
});
```

## Performance Considerations

- **Async Logging**: Winston transports are non-blocking
- **File I/O**: Buffered writes with rotation
- **Memory**: AsyncLocalStorage has negligible overhead
- **CPU**: JSON serialization is fast for structured data

## Production Monitoring

### Log Aggregation (Recommended)
- Ship logs to: Datadog, CloudWatch, Elasticsearch, Loki
- Query by: `correlationId`, `service`, `level`, `guildId`
- Alerts on: Error rate spikes, correlation chains

### Example Queries
```json
// Find all logs for a specific request
{ "correlationId": "abc-123-def" }

// Find all subscription verification errors
{ "service": "DiscordSubscriptionProvider", "level": "error" }

// Find cache hit rate
{ "service": "SubscriptionCacheService", "message": "*Cache hit*" }
```

## Compliance

- ✅ **GDPR**: Sanitizer removes PII before logging
- ✅ **Audit Trail**: All actions logged with correlation IDs
- ✅ **Data Retention**: 30-day automatic rotation

## Status

**T021**: ✅ **COMPLETE** - Structured logging with correlation IDs fully configured

All subscription gating services will use this centralized logging infrastructure with consistent correlation ID propagation for end-to-end request tracing.
