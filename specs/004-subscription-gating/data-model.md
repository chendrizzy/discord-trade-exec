# Data Model: Discord Server Subscription/Membership Gating

**Feature**: 004-subscription-gating  
**Created**: 2025-10-29  
**Phase**: 1 (Design & Contracts)

## Overview

This document defines the MongoDB data models (Mongoose schemas) for the subscription gating feature. All models follow existing project conventions and integrate with the current database structure.

## Entities

### 1. ServerConfiguration

**Purpose**: Stores access control configuration for each Discord server (guild)

**Schema**:
```typescript
interface IServerConfiguration {
  guildId: string;                    // Discord guild ID (primary key)
  accessControlMode: 'subscription_required' | 'open_access';
  requiredRoleIds: string[];          // Discord role IDs that grant access (empty if open_access)
  lastModified: Date;                 // Timestamp of last configuration change
  modifiedBy: string;                 // Discord user ID who made last change
  createdAt: Date;                    // When configuration was first created
  isActive: boolean;                  // Soft delete flag
}
```

**Validation Rules**:
- `guildId`: Required, unique, matches Discord snowflake pattern (`/^\d{17,19}$/`)
- `accessControlMode`: Required, enum ['subscription_required', 'open_access']
- `requiredRoleIds`: Array of strings, each matching snowflake pattern, required if mode is 'subscription_required'
- `lastModified`: Required, defaults to current timestamp
- `modifiedBy`: Required, Discord user ID
- `createdAt`: Required, auto-set on creation
- `isActive`: Required, defaults to true

**Indexes**:
```javascript
{ guildId: 1 }              // Primary lookup (unique)
{ isActive: 1, guildId: 1 } // Active configurations
```

**Mongoose Model**:
```typescript
const ServerConfigurationSchema = new Schema({
  guildId: { type: String, required: true, unique: true, match: /^\d{17,19}$/ },
  accessControlMode: { 
    type: String, 
    required: true, 
    enum: ['subscription_required', 'open_access'] 
  },
  requiredRoleIds: [{ type: String, match: /^\d{17,19}$/ }],
  lastModified: { type: Date, required: true, default: Date.now },
  modifiedBy: { type: String, required: true, match: /^\d{17,19}$/ },
  createdAt: { type: Date, required: true, default: Date.now },
  isActive: { type: Boolean, required: true, default: true }
});
```

---

### 2. UserAccessStatus

**Purpose**: Caches subscription verification results to minimize Discord API calls

**Schema**:
```typescript
interface IUserAccessStatus {
  guildId: string;              // Discord guild ID
  userId: string;               // Discord user ID
  hasAccess: boolean;           // Current access status
  verifiedAt: Date;             // When status was last verified
  expiresAt: Date;              // When cache expires (verifiedAt + 60s)
  roleIds: string[];            // User's role IDs at time of verification
  discordApiResponse: object;   // Raw Discord API response (for debugging)
}
```

**Validation Rules**:
- `guildId`: Required, Discord snowflake pattern
- `userId`: Required, Discord snowflake pattern
- `hasAccess`: Required, boolean
- `verifiedAt`: Required, timestamp of verification
- `expiresAt`: Required, calculated as `verifiedAt + 60 seconds`
- `roleIds`: Array of Discord role IDs (can be empty)
- `discordApiResponse`: Optional, JSON object

**Indexes**:
```javascript
{ guildId: 1, userId: 1 }       // Composite primary lookup (unique)
{ expiresAt: 1 }                 // TTL index for automatic cleanup
```

**Mongoose Model**:
```typescript
const UserAccessStatusSchema = new Schema({
  guildId: { type: String, required: true, match: /^\d{17,19}$/ },
  userId: { type: String, required: true, match: /^\d{17,19}$/ },
  hasAccess: { type: Boolean, required: true },
  verifiedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true, expires: 0 },  // TTL index
  roleIds: [{ type: String, match: /^\d{17,19}$/ }],
  discordApiResponse: { type: Schema.Types.Mixed }
});

// Compound index for lookups
UserAccessStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });
```

**Note**: The `expires: 0` on `expiresAt` field creates a MongoDB TTL index that automatically deletes documents when `expiresAt` timestamp is reached.

---

### 3. AccessDenialEvent

**Purpose**: Audit log of access denial attempts for analytics and security monitoring

**Schema**:
```typescript
interface IAccessDenialEvent {
  guildId: string;                // Discord guild ID
  userId: string;                 // Discord user ID who was denied
  timestamp: Date;                // When denial occurred
  commandAttempted: string;       // Which bot command they tried to use
  denialReason: string;           // Why access was denied
  userRoleIds: string[];          // User's roles at time of denial
  requiredRoleIds: string[];      // Roles that would have granted access
  wasInformed: boolean;           // Whether denial message was sent to user
}
```

**Validation Rules**:
- `guildId`: Required, Discord snowflake
- `userId`: Required, Discord snowflake
- `timestamp`: Required, defaults to current time
- `commandAttempted`: Required, string (e.g., "/trade buy")
- `denialReason`: Required, enum ['no_subscription', 'subscription_expired', 'verification_failed']
- `userRoleIds`: Array of role IDs (can be empty)
- `requiredRoleIds`: Array of role IDs that grant access
- `wasInformed`: Required, boolean (true if denial message sent)

**Indexes**:
```javascript
{ guildId: 1, timestamp: -1 }   // Analytics queries by server
{ userId: 1, timestamp: -1 }    // User-specific queries
{ timestamp: -1 }               // Time-based queries (TTL for cleanup)
```

**Mongoose Model**:
```typescript
const AccessDenialEventSchema = new Schema({
  guildId: { type: String, required: true, match: /^\d{17,19}$/ },
  userId: { type: String, required: true, match: /^\d{17,19}$/ },
  timestamp: { type: Date, required: true, default: Date.now, expires: 2592000 }, // 30 days
  commandAttempted: { type: String, required: true },
  denialReason: { 
    type: String, 
    required: true, 
    enum: ['no_subscription', 'subscription_expired', 'verification_failed'] 
  },
  userRoleIds: [{ type: String, match: /^\d{17,19}$/ }],
  requiredRoleIds: [{ type: String, match: /^\d{17,19}$/ }],
  wasInformed: { type: Boolean, required: true, default: false }
});

// Indexes for analytics queries
AccessDenialEventSchema.index({ guildId: 1, timestamp: -1 });
AccessDenialEventSchema.index({ userId: 1, timestamp: -1 });
```

**Note**: TTL index set to 30 days (`2592000` seconds) to automatically clean up old audit logs per spec's data retention policy.

---

## Data Relationships

```
ServerConfiguration (1) --- (N) AccessDenialEvent
    |                              |
    | guildId                      | guildId, userId
    |                              |
    +------------ (N) UserAccessStatus (cache)
```

**Relationship Rules**:
- One `ServerConfiguration` per Discord guild
- Multiple `UserAccessStatus` entries per guild (one per user)
- Multiple `AccessDenialEvent` entries per guild (audit trail)
- No foreign key constraints (MongoDB design), relationships by `guildId`

## State Transitions

### ServerConfiguration State Machine

```
[New Guild] 
    ↓ (bot joins server)
[Setup Wizard Triggered]
    ↓ (owner selects mode)
[Configuration Saved] ← → [Configuration Modified]
    ↓ (owner removes bot)
[Soft Deleted] (isActive = false)
```

### UserAccessStatus Cache Lifecycle

```
[Cache Miss]
    ↓ (Discord API call)
[Fresh Cache Entry] (expiresAt = now + 60s)
    ↓ (time passes OR role change event)
[Expired/Invalidated]
    ↓ (MongoDB TTL or manual delete)
[Removed from DB]
```

## Data Retention Policy

| Entity | Retention Period | Cleanup Method |
|--------|------------------|----------------|
| ServerConfiguration | Indefinite (soft delete) | Manual admin action |
| UserAccessStatus | 60 seconds | MongoDB TTL index |
| AccessDenialEvent | 30 days | MongoDB TTL index |

## Migration Strategy

**Initial Deployment**:
1. Create indexes on empty collections (no downtime)
2. Deploy application code
3. Existing servers get default configuration on first command use
4. No data migration required (new feature, no existing data)

**Future Schema Changes**:
- Use Mongoose migrations for schema updates
- Add fields with defaults to avoid breaking existing documents
- Use `isActive` flag for soft deletes (never hard delete configurations)

## Performance Considerations

**Query Patterns**:
- Primary: Lookup by `guildId` (server configuration, cache lookup)
- Secondary: Lookup by `guildId + userId` (user-specific cache)
- Analytics: Time-range queries on `AccessDenialEvent` (infrequent, can be slow)

**Optimization Strategy**:
- In-memory caching of `ServerConfiguration` (5min TTL, read-heavy)
- Redis caching of `UserAccessStatus` to avoid MongoDB queries
- MongoDB only for persistence and TTL cleanup
- Indexes on all lookup fields

**Estimated Storage**:
- ServerConfiguration: ~500 bytes per guild × 100 guilds = 50KB
- UserAccessStatus: ~200 bytes per user × 1000 users × 0.1 (cache hit rate) = 20KB
- AccessDenialEvent: ~300 bytes per event × 100 events/day × 30 days = 900KB

**Total**: ~1MB storage for 100 servers (negligible impact)

## Security Considerations

**Data Sensitivity**:
- No sensitive data stored (Discord IDs are public)
- No encryption required (per constitution, only sensitive data requires AES-256-GCM)
- Audit logs contain no PII beyond Discord user IDs

**Access Control**:
- Only bot service account can read/write these collections
- No user-facing API exposes raw data
- Admin endpoints require authentication (existing middleware)

## Testing Strategy

**Unit Tests**:
- Model validation (invalid Discord IDs, missing required fields)
- TTL index behavior (verify documents auto-delete)
- Enum validation (invalid access control modes)

**Integration Tests**:
- CRUD operations on all models
- Index performance (query explain plans)
- Concurrent writes (race conditions)

**Data Integrity Tests**:
- Foreign key consistency (guildId references)
- Cascade behavior (when guild config deleted)
- TTL cleanup verification (documents removed after expiry)

---

**Status**: ✅ Ready for implementation
**Next Phase**: Generate API contracts
