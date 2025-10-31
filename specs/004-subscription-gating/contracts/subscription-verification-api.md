# API Contract: Subscription Verification Service

**Feature**: 004-subscription-gating  
**Created**: 2025-10-29  
**Phase**: 1 (Design & Contracts)

## Overview

This document defines the internal API contract for the subscription verification service. This is **not** an HTTP REST API, but rather internal TypeScript interfaces and service contracts that define how components interact.

## Service Interfaces

### SubscriptionProvider (Interface)

**Purpose**: Abstract interface for subscription verification, enables multiple implementations (Discord, Mock)

```typescript
interface SubscriptionProvider {
  /**
   * Verify if a user has the required subscription/role in a guild
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @param requiredRoleIds - Array of role IDs, user needs ANY of these
   * @returns Promise<SubscriptionVerificationResult>
   */
  verifySubscription(
    guildId: string,
    userId: string,
    requiredRoleIds: string[]
  ): Promise<SubscriptionVerificationResult>;

  /**
   * Get all roles for a user in a guild
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @returns Promise<string[]> Array of role IDs
   */
  getUserRoles(guildId: string, userId: string): Promise<string[]>;

  /**
   * Check if a specific role exists in a guild
   * @param guildId - Discord guild ID
   * @param roleId - Role ID to check
   * @returns Promise<boolean>
   */
  roleExists(guildId: string, roleId: string): Promise<boolean>;
}
```

---

### SubscriptionVerificationResult (Type)

**Purpose**: Standard result object returned by verification operations

```typescript
interface SubscriptionVerificationResult {
  hasAccess: boolean;              // Whether user has required subscription
  verifiedAt: Date;                // Timestamp of verification
  userRoleIds: string[];           // User's current roles
  matchingRoles: string[];         // Which required roles user has (if any)
  reason?: string;                 // Denial reason if hasAccess = false
  cacheHit: boolean;               // Whether result came from cache
  apiLatency?: number;             // Discord API latency in ms (if cache miss)
}
```

---

### AccessControlService (Class)

**Purpose**: Main service orchestrating subscription gating logic

```typescript
class AccessControlService {
  constructor(
    private subscriptionProvider: SubscriptionProvider,
    private cacheService: SubscriptionCacheService,
    private configService: ServerConfigurationService
  ) {}

  /**
   * Check if user can execute a command in a guild
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @param commandName - Name of command being attempted
   * @returns Promise<AccessCheckResult>
   */
  async checkAccess(
    guildId: string,
    userId: string,
    commandName: string
  ): Promise<AccessCheckResult>;

  /**
   * Invalidate cached subscription status for a user
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @returns Promise<void>
   */
  async invalidateCache(guildId: string, userId: string): Promise<void>;

  /**
   * Log an access denial event for analytics
   * @param event - AccessDenialEventData
   * @returns Promise<void>
   */
  async logDenialEvent(event: AccessDenialEventData): Promise<void>;
}
```

---

### AccessCheckResult (Type)

**Purpose**: Result of access control check

```typescript
interface AccessCheckResult {
  allowed: boolean;                     // Whether access is granted
  reason: 'subscription_required' 
        | 'open_access' 
        | 'no_subscription' 
        | 'verification_failed';
  serverConfig: IServerConfiguration;   // Server's access control config
  verificationResult?: SubscriptionVerificationResult;  // If subscription check was performed
  denialMessage?: DiscordEmbed;         // Pre-formatted denial message (if denied)
}
```

---

### SubscriptionCacheService (Class)

**Purpose**: Redis caching layer for subscription verification results

```typescript
class SubscriptionCacheService {
  constructor(private redisClient: RedisClient) {}

  /**
   * Get cached subscription status
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @returns Promise<SubscriptionVerificationResult | null>
   */
  async get(
    guildId: string,
    userId: string
  ): Promise<SubscriptionVerificationResult | null>;

  /**
   * Cache subscription status for 60 seconds
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @param result - Verification result to cache
   * @returns Promise<void>
   */
  async set(
    guildId: string,
    userId: string,
    result: SubscriptionVerificationResult
  ): Promise<void>;

  /**
   * Invalidate cache for a specific user
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @returns Promise<void>
   */
  async invalidate(guildId: string, userId: string): Promise<void>;

  /**
   * Batch get cached statuses for multiple users
   * @param guildId - Discord guild ID
   * @param userIds - Array of user IDs
   * @returns Promise<Map<string, SubscriptionVerificationResult>>
   */
  async getBatch(
    guildId: string,
    userIds: string[]
  ): Promise<Map<string, SubscriptionVerificationResult>>;
}
```

---

### ServerConfigurationService (Class)

**Purpose**: Manage server access control configurations

```typescript
class ServerConfigurationService {
  constructor(private configModel: Model<IServerConfiguration>) {}

  /**
   * Get configuration for a guild (with in-memory cache)
   * @param guildId - Discord guild ID
   * @returns Promise<IServerConfiguration>
   */
  async getConfig(guildId: string): Promise<IServerConfiguration>;

  /**
   * Create initial configuration for a new guild
   * @param guildId - Discord guild ID
   * @param accessMode - Access control mode
   * @param requiredRoleIds - Role IDs (if subscription_required)
   * @param modifiedBy - Discord user ID of server owner
   * @returns Promise<IServerConfiguration>
   */
  async createConfig(
    guildId: string,
    accessMode: 'subscription_required' | 'open_access',
    requiredRoleIds: string[],
    modifiedBy: string
  ): Promise<IServerConfiguration>;

  /**
   * Update existing configuration
   * @param guildId - Discord guild ID
   * @param updates - Partial configuration updates
   * @param modifiedBy - Discord user ID making the change
   * @returns Promise<IServerConfiguration>
   */
  async updateConfig(
    guildId: string,
    updates: Partial<IServerConfiguration>,
    modifiedBy: string
  ): Promise<IServerConfiguration>;

  /**
   * Check if guild has a configuration
   * @param guildId - Discord guild ID
   * @returns Promise<boolean>
   */
  async configExists(guildId: string): Promise<boolean>;

  /**
   * Invalidate in-memory cache for a guild
   * @param guildId - Discord guild ID
   * @returns void
   */
  invalidateCache(guildId: string): void;
}
```

---

## Command Middleware Contract

### SubscriptionGateMiddleware (Function)

**Purpose**: Middleware that intercepts all bot commands to enforce subscription gating

```typescript
/**
 * Middleware for Discord.js command handling
 * Checks subscription status before allowing command execution
 * 
 * @param interaction - Discord command interaction
 * @param next - Next middleware function
 * @returns Promise<void>
 */
async function subscriptionGateMiddleware(
  interaction: CommandInteraction,
  next: () => Promise<void>
): Promise<void> {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const commandName = interaction.commandName;

  // Get access control service
  const accessControl = container.resolve(AccessControlService);

  // Check access
  const result = await accessControl.checkAccess(guildId, userId, commandName);

  if (result.allowed) {
    // Allow command to proceed
    await next();
  } else {
    // Send denial message and stop execution
    await interaction.reply({
      embeds: [result.denialMessage],
      ephemeral: true
    });
    
    // Log denial event
    await accessControl.logDenialEvent({
      guildId,
      userId,
      commandAttempted: commandName,
      denialReason: result.reason,
      userRoleIds: result.verificationResult?.userRoleIds || [],
      requiredRoleIds: result.serverConfig.requiredRoleIds
    });
  }
}
```

---

## Event Handler Contracts

### GuildMemberUpdateHandler

**Purpose**: Handle Discord role change events to invalidate cache

```typescript
/**
 * Discord.js event handler for role changes
 * Invalidates cache when user's roles change
 * 
 * @param oldMember - Member state before update
 * @param newMember - Member state after update
 * @returns Promise<void>
 */
async function handleGuildMemberUpdate(
  oldMember: GuildMember,
  newMember: GuildMember
): Promise<void> {
  // Check if roles changed
  if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
    const accessControl = container.resolve(AccessControlService);
    
    // Invalidate cache
    await accessControl.invalidateCache(
      newMember.guild.id,
      newMember.id
    );
    
    // Log role change
    logger.info('User roles changed, cache invalidated', {
      guildId: newMember.guild.id,
      userId: newMember.id,
      addedRoles: newMember.roles.cache.difference(oldMember.roles.cache).map(r => r.name),
      removedRoles: oldMember.roles.cache.difference(newMember.roles.cache).map(r => r.name)
    });
  }
}
```

---

## Error Handling Contracts

### SubscriptionVerificationError

**Purpose**: Custom error type for subscription verification failures

```typescript
class SubscriptionVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 
      | 'DISCORD_API_ERROR'
      | 'GUILD_NOT_FOUND'
      | 'USER_NOT_FOUND'
      | 'TIMEOUT'
      | 'RATE_LIMITED',
    public readonly isRetryable: boolean = false,
    public readonly discordError?: unknown
  ) {
    super(message);
    this.name = 'SubscriptionVerificationError';
  }
}
```

### Error Handling Strategy

```typescript
// Example error handling in DiscordSubscriptionProvider
async verifySubscription(
  guildId: string,
  userId: string,
  requiredRoleIds: string[]
): Promise<SubscriptionVerificationResult> {
  try {
    // Discord API call
    const member = await guild.members.fetch(userId);
    const userRoles = member.roles.cache.map(r => r.id);
    
    return {
      hasAccess: requiredRoleIds.some(roleId => userRoles.includes(roleId)),
      verifiedAt: new Date(),
      userRoleIds: userRoles,
      matchingRoles: requiredRoleIds.filter(roleId => userRoles.includes(roleId)),
      cacheHit: false,
      apiLatency: Date.now() - startTime
    };
    
  } catch (error) {
    // Discord API errors
    if (error.code === 10007) {  // Unknown Member
      throw new SubscriptionVerificationError(
        'User not found in guild',
        'USER_NOT_FOUND',
        false,
        error
      );
    }
    
    if (error.code === 50013) {  // Missing Permissions
      throw new SubscriptionVerificationError(
        'Bot lacks permissions to fetch member',
        'DISCORD_API_ERROR',
        false,
        error
      );
    }
    
    if (error.message?.includes('timeout')) {
      throw new SubscriptionVerificationError(
        'Discord API timeout',
        'TIMEOUT',
        true,  // Retryable
        error
      );
    }
    
    // Unknown error
    throw new SubscriptionVerificationError(
      'Subscription verification failed',
      'DISCORD_API_ERROR',
      true,
      error
    );
  }
}
```

---

## Performance Contracts

### Service Level Agreements (SLAs)

| Operation | Target Latency | Notes |
|-----------|----------------|-------|
| `checkAccess` (cache hit) | <10ms | Redis lookup + in-memory config |
| `checkAccess` (cache miss) | <2s p95 | Discord API + cache write |
| `verifySubscription` (Discord API) | <500ms p95 | Discord.js member fetch |
| `getConfig` (cached) | <1ms | In-memory Map lookup |
| `invalidateCache` | <5ms | Redis delete operation |
| `logDenialEvent` | <50ms | MongoDB insert (async, non-blocking) |

### Caching Strategy

```typescript
// Example cache key format
const cacheKey = (guildId: string, userId: string) => 
  `subscription:${guildId}:${userId}`;

// Example cache TTL
const CACHE_TTL_SECONDS = 60;

// Example in-memory config cache
const configCache = new Map<string, {
  config: IServerConfiguration;
  expiresAt: number;
}>();

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

---

## Testing Contracts

### Mock Provider Implementation

```typescript
class MockSubscriptionProvider implements SubscriptionProvider {
  // Configurable mock data
  private mockRoles: Map<string, Map<string, string[]>> = new Map();
  
  async verifySubscription(
    guildId: string,
    userId: string,
    requiredRoleIds: string[]
  ): Promise<SubscriptionVerificationResult> {
    const userRoles = this.mockRoles.get(guildId)?.get(userId) || [];
    const matchingRoles = requiredRoleIds.filter(roleId => userRoles.includes(roleId));
    
    return {
      hasAccess: matchingRoles.length > 0,
      verifiedAt: new Date(),
      userRoleIds: userRoles,
      matchingRoles,
      cacheHit: false
    };
  }
  
  // Test helpers
  setUserRoles(guildId: string, userId: string, roleIds: string[]): void {
    if (!this.mockRoles.has(guildId)) {
      this.mockRoles.set(guildId, new Map());
    }
    this.mockRoles.get(guildId)!.set(userId, roleIds);
  }
}
```

---

**Status**: ✅ Contract specification complete
**Next Phase**: Generate quickstart.md
