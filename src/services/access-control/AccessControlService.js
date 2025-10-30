/**
 * Access Control Service
 *
 * Feature: 004-subscription-gating
 * Phase: 4 (User Story 2 - Subscriber Access)
 * Task: T033-T034 - Implement AccessControlService with checkAccess and invalidateCache methods
 *
 * Purpose: Central service for access control decisions
 *
 * This service provides:
 * - Fast cache-based access verification (<10ms cache hits per SC-002)
 * - Subscription provider integration (<2s p95 per SC-002)
 * - Graceful degradation (use stale cache on provider failure)
 * - Fail-closed security (deny when verification unavailable)
 * - Multi-guild support with isolated cache entries
 * - Open access bypass for unconfigured servers
 *
 * Architecture:
 * - Integrates with ServerConfigurationService for guild config
 * - Uses CacheService for fast lookups (60s TTL)
 * - Delegates subscription verification to SubscriptionProvider
 * - Returns structured access decisions for middleware
 *
 * Performance Requirements (SC-002):
 * - Cache hits: <10ms
 * - Provider verification: <2s p95
 * - Graceful degradation on failures
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 4, T033-T034
 */

const logger = require('@utils/logger');
const AccessDenialEvent = require('@models/AccessDenialEvent');
const { isValidSnowflake } = require('@utils/validators');

class AccessControlService {
  /**
   * Create an AccessControlService
   *
   * @param {ServerConfigurationService} configService - Service for server configuration
   * @param {SubscriptionCacheService} cacheService - Service for caching verification results
   * @param {SubscriptionProvider} subscriptionProvider - Provider for subscription verification
   * @throws {Error} If any required service is missing
   */
  constructor(configService, cacheService, subscriptionProvider) {
    if (!configService) {
      throw new Error('ServerConfigurationService is required');
    }
    if (!cacheService) {
      throw new Error('SubscriptionCacheService is required');
    }
    if (!subscriptionProvider) {
      throw new Error('DiscordSubscriptionProvider is required');
    }

    this.configService = configService;
    this.cacheService = cacheService;
    this.subscriptionProvider = subscriptionProvider;

    logger.info('AccessControlService initialized');
  }

  /**
   * Check if a user has access to bot commands in a guild
   *
   * Access Decision Logic:
   * 1. Validate input (snowflake IDs)
   * 2. Fetch guild configuration from DB
   * 3. If no config or inactive: DENY (fail-closed)
   * 4. If open_access mode: ALLOW immediately
   * 5. If subscription_required mode:
   *    a. Check cache first (fast path, <10ms)
   *    b. If cache miss: verify with provider (<2s p95)
   *    c. If provider fails: use stale cache (graceful degradation)
   *    d. If both fail: DENY (fail-closed for security)
   *
   * @param {string} guildId - Discord guild (server) ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<Object>} Access decision
   * @returns {boolean} return.hasAccess - Whether user has access
   * @returns {string} return.reason - Reason for decision
   * @returns {boolean} [return.cacheHit] - Whether result came from cache
   * @returns {Array<string>} [return.requiredRoles] - Required roles (on denial)
   * @returns {boolean} [return.degraded] - Whether using stale cache due to provider failure
   * @returns {string} [return.error] - Error message (on failure)
   */
  async checkAccess(guildId, userId) {
    const startTime = Date.now();

    try {
      // Validate input
      if (!isValidSnowflake(guildId)) {
        logger.warn('Invalid guild ID format', { guildId });
        return {
          hasAccess: false,
          reason: 'invalid_guild_id'
        };
      }

      if (!isValidSnowflake(userId)) {
        logger.warn('Invalid user ID format', { userId });
        return {
          hasAccess: false,
          reason: 'invalid_user_id'
        };
      }

      // Fetch guild configuration
      const config = await this.configService.getConfig(guildId);

      // No configuration = fail-closed (deny access)
      if (!config) {
        logger.info('No configuration found for guild', { guildId, userId });
        return {
          hasAccess: false,
          reason: 'configuration_not_found'
        };
      }

      // Inactive configuration = fail-closed (deny access)
      if (!config.isActive) {
        logger.info('Inactive configuration for guild', { guildId, userId });
        return {
          hasAccess: false,
          reason: 'configuration_inactive'
        };
      }

      // Open access mode = immediate allow (bypass all checks)
      if (config.accessMode === 'open_access') {
        const duration = Date.now() - startTime;
        logger.debug('Open access granted', { guildId, userId, duration });
        return {
          hasAccess: true,
          reason: 'open_access',
          cacheHit: false
        };
      }

      // Subscription required mode = check subscription
      if (config.accessMode === 'subscription_required') {
        return await this._checkSubscriptionAccess(
          guildId,
          userId,
          config.requiredRoleIds,
          startTime
        );
      }

      // Unknown access mode = fail-closed (deny access)
      logger.warn('Unknown access mode', { guildId, userId, accessMode: config.accessMode });
      return {
        hasAccess: false,
        reason: 'unknown_access_mode'
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Access check error', {
        error: error.message,
        stack: error.stack,
        guildId,
        userId,
        duration
      });

      return {
        hasAccess: false,
        reason: 'verification_error',
        error: error.message
      };
    }
  }

  /**
   * Check subscription-based access with cache and provider
   *
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @param {Array<string>} requiredRoleIds - Required subscription role IDs
   * @param {number} startTime - Request start timestamp
   * @returns {Promise<Object>} Access decision
   * @private
   */
  async _checkSubscriptionAccess(guildId, userId, requiredRoleIds, startTime) {
    // Try cache first (fast path, <10ms)
    try {
      const cachedResult = await this.cacheService.get(guildId, userId);
      if (cachedResult !== null) {
        const duration = Date.now() - startTime;
        logger.debug('Cache hit for access check', { guildId, userId, duration });

        return {
          ...cachedResult,
          cacheHit: true
        };
      }
    } catch (cacheError) {
      // Cache error - continue to provider (don't fail)
      logger.warn('Cache get error, falling through to provider', {
        error: cacheError.message,
        guildId,
        userId
      });
    }

    // Cache miss - verify with provider
    logger.debug('Cache miss - checking with provider', { guildId, userId });

    try {
      // H1 FIX: Use correct method name verifySubscription (not verifyUserSubscription)
      const verificationResult = await this.subscriptionProvider.verifySubscription(
        guildId,
        userId,
        requiredRoleIds
      );

      const duration = Date.now() - startTime;

      // H3 FIX: Validate result structure before using it
      if (!verificationResult || typeof verificationResult.hasAccess !== 'boolean') {
        logger.error('Invalid verification result structure', {
          guildId,
          userId,
          result: verificationResult
        });
        throw new Error('Invalid verification result from provider');
      }

      // Create properly structured result
      const result = verificationResult.hasAccess
        ? {
            hasAccess: true,
            reason: 'verified_subscription',
            cacheHit: false,
            ...(verificationResult.matchingRoles && { matchingRoles: verificationResult.matchingRoles })
          }
        : {
            hasAccess: false,
            reason: verificationResult.reason || 'no_subscription',
            requiredRoles: requiredRoleIds,
            cacheHit: false
          };

      // Cache the result
      try {
        await this.cacheService.set(guildId, userId, result);
      } catch (cacheError) {
        // Cache write error - log but don't fail
        logger.warn('Cache set error', {
          error: cacheError.message,
          guildId,
          userId
        });
      }

      logger.info('Subscription verified', {
        guildId,
        userId,
        hasAccess: result.hasAccess,
        duration
      });

      return result;
    } catch (providerError) {
      // Provider failed - try to use stale cache (graceful degradation)
      logger.warn('Provider verification failed, attempting stale cache', {
        error: providerError.message,
        guildId,
        userId
      });

      try {
        // Try to get from cache again (might have stale data)
        const staleResult = await this.cacheService.get(guildId, userId);
        if (staleResult !== null) {
          const duration = Date.now() - startTime;
          logger.info('Using stale cache due to provider failure', {
            guildId,
            userId,
            duration
          });

          return {
            ...staleResult,
            cacheHit: true,
            degraded: true,
            reason: 'verified_subscription_stale'
          };
        }
      } catch (cacheError) {
        // Cache also failed - will fall through to denial
        logger.warn('Stale cache retrieval failed', {
          error: cacheError.message,
          guildId,
          userId
        });
      }

      // Both cache and provider failed = fail-closed (deny access)
      const duration = Date.now() - startTime;
      logger.error('Both cache and provider failed - denying access', {
        error: providerError.message,
        guildId,
        userId,
        duration
      });

      return {
        hasAccess: false,
        reason: 'verification_unavailable',
        error: providerError.message
      };
    }
  }

  /**
   * Invalidate cached access result for a user in a guild
   *
   * Use cases:
   * - User role changes (gained/lost subscription role)
   * - Guild configuration changes
   * - Manual cache invalidation (admin action)
   *
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<void>}
   */
  async invalidateCache(guildId, userId) {
    try {
      await this.cacheService.invalidate(guildId, userId);
      logger.debug('Cache invalidated', { guildId, userId });
    } catch (error) {
      logger.error('Cache invalidation error', {
        error: error.message,
        guildId,
        userId
      });
      // Don't throw - cache invalidation failure shouldn't break flow
    }
  }

  /**
   * Log an access denial event for analytics and monitoring
   *
   * Feature: 004-subscription-gating
   * Phase: 5 (User Story 3 - Non-Subscriber Attempts)
   * Task: T043 - Implement logDenialEvent() method
   *
   * Purpose: Record access denial events for:
   * - Analytics queries (most denied users, denial reasons)
   * - Monitoring and alerting (spike detection)
   * - User education (which commands are restricted)
   * - Compliance tracking
   *
   * @param {Object} options - Denial event details
   * @param {string} options.guildId - Discord guild ID (17-19 digits)
   * @param {string} options.userId - Discord user ID (17-19 digits)
   * @param {string} options.commandAttempted - Command user tried to use
   * @param {string} options.denialReason - Why access was denied ('no_subscription', 'subscription_expired', 'verification_failed')
   * @param {string[]} [options.userRoleIds=[]] - User's roles at denial time
   * @param {string[]} [options.requiredRoleIds=[]] - Required roles from config
   * @param {boolean} [options.wasInformed=false] - Whether user received denial message
   * @returns {Promise<AccessDenialEvent|null>} The created event, or null on error
   * @throws {Error} If input validation fails
   */
  async logDenialEvent({
    guildId,
    userId,
    commandAttempted,
    denialReason,
    userRoleIds = [],
    requiredRoleIds = [],
    wasInformed = false
  }) {
    // Validate required fields
    if (!guildId || !isValidSnowflake(guildId)) {
      throw new Error(`Invalid guildId format. Expected 17-19 digit Discord snowflake, got: ${guildId}`);
    }

    if (!userId || !isValidSnowflake(userId)) {
      throw new Error(`Invalid userId format. Expected 17-19 digit Discord snowflake, got: ${userId}`);
    }

    if (!commandAttempted || typeof commandAttempted !== 'string') {
      throw new Error(`commandAttempted is required and must be a string, got: ${commandAttempted}`);
    }

    // Validate denialReason enum
    const validReasons = ['no_subscription', 'subscription_expired', 'verification_failed'];
    if (!denialReason || !validReasons.includes(denialReason)) {
      throw new Error(
        `Invalid denial reason. Expected one of [${validReasons.join(', ')}], got: ${denialReason}`
      );
    }

    try {
      // Log the denial event to database
      const denialEvent = await AccessDenialEvent.logDenial({
        guildId,
        userId,
        commandAttempted,
        denialReason,
        userRoleIds,
        requiredRoleIds,
        wasInformed
      });

      logger.info('Access denial event logged', {
        guildId,
        userId,
        commandAttempted,
        denialReason,
        wasInformed,
        eventId: denialEvent._id
      });

      return denialEvent;
    } catch (error) {
      // Log error but don't throw - denial logging shouldn't break the flow
      logger.error('Failed to log denial event', {
        error: error.message,
        guildId,
        userId,
        commandAttempted,
        denialReason
      });

      return null;
    }
  }

  /**
   * Invalidate cached access status for a specific user in a guild
   *
   * Feature: 004-subscription-gating
   * Phase: 6 (Real-Time Updates)
   * Task: T049 - Implement cache invalidation for role changes
   *
   * Purpose: When Discord role changes are detected, invalidate the cache
   * so the next access check fetches fresh subscription status from provider.
   *
   * This is called by the guildMemberUpdate event handler when Discord
   * role changes are detected.
   *
   * Performance:
   * - Should complete in <100ms (cache delete is instant)
   * - Ensures next checkAccess() reflects role change within <60s SLA
   *
   * @param {string} guildId - Discord guild (server) ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<boolean>} True if cache was invalidated, false if nothing to invalidate
   * @throws {Error} If guildId or userId are invalid
   *
   * @example
   * // Discord event handler detects role change
   * client.on('guildMemberUpdate', async (oldMember, newMember) => {
   *   const rolesChanged = oldMember.roles.cache.size !== newMember.roles.cache.size;
   *   if (rolesChanged) {
   *     await accessControlService.invalidateUserAccess(
   *       newMember.guild.id,
   *       newMember.user.id
   *     );
   *   }
   * });
   */
  async invalidateUserAccess(guildId, userId) {
    // Validate input
    if (!guildId || !isValidSnowflake(guildId)) {
      throw new Error(
        `Invalid guildId format. Expected 17-19 digit Discord snowflake, got: ${guildId}`
      );
    }

    if (!userId || !isValidSnowflake(userId)) {
      throw new Error(
        `Invalid userId format. Expected 17-19 digit Discord snowflake, got: ${userId}`
      );
    }

    try {
      // Invalidate cache for this specific guild-user pair
      const wasInvalidated = await this.cacheService.invalidate(guildId, userId);

      logger.info('Cache invalidated for user role change', {
        guildId,
        userId,
        wasInvalidated,
        timestamp: new Date().toISOString()
      });

      return wasInvalidated;
    } catch (error) {
      // Log error but don't throw - cache invalidation failure shouldn't break the flow
      logger.error('Failed to invalidate cache for user', {
        error: error.message,
        guildId,
        userId
      });

      return false; // Graceful degradation
    }
  }
}

module.exports = { AccessControlService };
