/**
 * OAuth2Service
 *
 * Centralized OAuth2 authentication service for all broker integrations.
 * Handles authorization URL generation, token exchange, token refresh, and token encryption.
 *
 * Security Features:
 * - AES-256-GCM token encryption at rest
 * - Cryptographically random state parameters for CSRF protection
 * - State validation with 5-minute expiration
 * - Automatic token refresh with exponential backoff retry logic
 */

const crypto = require('crypto');
const axios = require('axios');
const { getProviderConfig, isOAuth2Broker } = require('../config/oauth2Providers');
const SecurityAudit = require('../models/SecurityAudit');
const logger = require('../utils/logger');

// AES-256-GCM encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Retry configuration for token refresh
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

class OAuth2Service {
  constructor() {
    // Validate encryption key exists
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('[OAuth2Service] ENCRYPTION_KEY environment variable is required');
    }

    this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    if (this.encryptionKey.length !== 32) {
      throw new Error('[OAuth2Service] ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  /**
   * Sanitize broker error messages to prevent sensitive data leakage
   * Removes client secrets, API keys, IPs, user IDs, and debug information
   *
   * @param {string} message - Raw error message from broker
   * @returns {string} Sanitized error message
   */
  sanitizeErrorMessage(message) {
    if (!message || typeof message !== 'string') {
      return 'Token exchange failed: Invalid credentials or authorization code';
    }

    // Check if message contains sensitive patterns before sanitizing
    const hasSensitiveData =
      /[A-Za-z0-9]{12,}/.test(message) || // Secrets/keys (12+ alphanumeric)
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(message) || // IP addresses
      /user_id\s*=\s*\d+/i.test(message) || // User IDs
      /debug|trace|stack/i.test(message); // Debug info

    // If sensitive data detected, return generic message
    if (hasSensitiveData) {
      return 'Token exchange failed: Invalid credentials or authorization code';
    }

    // Allow safe, generic broker error messages through
    const safeBrokerErrors = [
      'invalid_grant',
      'invalid_client',
      'invalid_request',
      'unauthorized_client',
      'access_denied',
      'unsupported_grant_type'
    ];

    // If it's a known safe OAuth error, allow it
    const lowerMessage = message.toLowerCase();
    if (safeBrokerErrors.some(err => lowerMessage.includes(err))) {
      return message.trim();
    }

    // Default to generic message for unknown patterns
    return 'Token exchange failed: Invalid credentials or authorization code';
  }

  /**
   * Generate OAuth2 authorization URL for broker
   *
   * @param {string} broker - Broker key (e.g., 'alpaca', 'ibkr')
   * @param {string} userId - User ID for session association
   * @param {Object} session - Express session object for state storage
   * @returns {string} Authorization URL
   * @throws {Error} If broker not supported or not OAuth2-enabled
   */
  generateAuthorizationURL(broker, userId, session, options = {}) {
    if (!isOAuth2Broker(broker)) {
      throw new Error(`Broker '${broker}' does not support OAuth2 or is not enabled`);
    }

    if (!userId) {
      throw new Error('User authentication required for OAuth2 flow');
    }

    const config = getProviderConfig(broker);

    // Generate cryptographically random state parameter (512-bit for enhanced CSRF protection)
    const state = crypto.randomBytes(64).toString('hex');

    // Store state in session with metadata
    session.oauthState = {
      state,
      broker,
      userId,
      communityId: options.communityId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      createdAt: Date.now()
    };

    // Persist request metadata for audit logging
    if (options.ipAddress) {
      session.ipAddress = options.ipAddress;
    }
    if (options.userAgent) {
      session.userAgent = options.userAgent;
    }

    // Build authorization URL
    const authUrl = new URL(config.authorizationURL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', config.scopes.join(' '));

    logger.info('[OAuth2Service] Generated authorization URL', { broker, userId, statePrefix: state.substring(0, 8) });

    return authUrl.toString();
  }

  /**
   * Validate OAuth2 state parameter from callback
   *
   * @param {string} callbackState - State parameter from callback URL
   * @param {Object} session - Express session object
   * @returns {Object} Validation result: { valid: boolean, userId?: string, broker?: string, error?: string }
   */
  validateState(callbackState, session) {
    // Check state exists in session
    if (!session.oauthState) {
      logger.warn('[OAuth2Service] State validation failed: Session state not found');

      // Audit log: CSRF validation failed (CRITICAL)
      SecurityAudit.log({
        action: 'auth.oauth2_csrf_validation_failed',
        resourceType: 'System',
        operation: 'EXECUTE',
        status: 'blocked',
        errorMessage: 'Session state not found',
        riskLevel: 'critical',
        requiresReview: true,
        ipAddress: session.ipAddress || 'unknown',
        userAgent: session.userAgent
      }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));

      return { valid: false, error: 'Session state not found' };
    }

    const { state, userId, broker, createdAt } = session.oauthState;

    // Validate state equality
    if (state !== callbackState) {
      logger.warn('[OAuth2Service] State validation failed: State mismatch (possible CSRF attack)');

      // Audit log: CSRF validation failed (CRITICAL)
      SecurityAudit.log({
        action: 'auth.oauth2_csrf_validation_failed',
        resourceType: 'User',
        resourceId: userId,
        operation: 'EXECUTE',
        status: 'blocked',
        errorMessage: 'State mismatch - possible CSRF attack',
        riskLevel: 'critical',
        requiresReview: true,
        ipAddress: session.ipAddress || 'unknown',
        userAgent: session.userAgent,
        dataBefore: { broker, expectedState: state.substring(0, 8) + '...', receivedState: callbackState.substring(0, 8) + '...' }
      }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));

      return { valid: false, error: 'State mismatch - possible CSRF attack' };
    }

    // Check state expiration (5-minute TTL)
    const age = Date.now() - createdAt;
    if (age > STATE_TTL_MS) {
      logger.warn('[OAuth2Service] State validation failed: State expired', { age, maxAge: STATE_TTL_MS });

      // Audit log: CSRF validation failed (CRITICAL)
      SecurityAudit.log({
        action: 'auth.oauth2_csrf_validation_failed',
        resourceType: 'User',
        resourceId: userId,
        operation: 'EXECUTE',
        status: 'blocked',
        errorMessage: `State expired (age: ${age}ms)`,
        riskLevel: 'critical',
        requiresReview: true,
        ipAddress: session.ipAddress || 'unknown',
        userAgent: session.userAgent,
        dataBefore: { broker, stateAge: age, maxAge: STATE_TTL_MS }
      }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));

      return { valid: false, error: 'State expired' };
    }

    logger.info('[OAuth2Service] State validated successfully', { broker, userId, age });

    return { valid: true, userId, broker };
  }

  /**
   * Exchange authorization code for access/refresh tokens
   *
   * @param {string} broker - Broker key
   * @param {string} code - Authorization code from callback
   * @param {string} state - State parameter for validation
   * @param {Object} session - Express session for state validation
   * @returns {Promise<Object>} Token data: { accessToken, refreshToken, expiresAt, scopes, tokenType }
   * @throws {Error} If token exchange fails
   */
  async exchangeCodeForToken(broker, code, state, session) {
    // Validate state parameter
    const validation = this.validateState(state, session);
    if (!validation.valid) {
      throw new Error(`OAuth2 state validation failed: ${validation.error}`);
    }

    // 🚨 SECURITY: Multi-tenant validation
    // Ensure user can only connect brokers to their own community
    const User = require('../models/User');
    const user = await User.findById(validation.userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.communityId) {
      throw new Error('User must be associated with a community to connect brokers');
    }

    // Verify communityId hasn't changed since OAuth flow started
    if (session.oauthState && session.oauthState.communityId) {
      const sessionCommunityId = session.oauthState.communityId;
      const userCommunityId = user.communityId.toString();

      if (sessionCommunityId !== userCommunityId) {
        throw new Error('Community mismatch detected - possible cross-tenant attack attempt');
      }
    }

    const config = getProviderConfig(broker);
    if (!config) {
      throw new Error(`Broker '${broker}' OAuth2 configuration not found`);
    }

    try {
      // Build token request payload
      const tokenRequest = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      };

      logger.info('[OAuth2Service] Exchanging code for tokens', { broker });

      // Send token request
      const response = await axios.post(
        config.tokenURL,
        new URLSearchParams(tokenRequest).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokenData = response.data;

      // Calculate expiration timestamp
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      // Clear session state after successful exchange
      delete session.oauthState;

      logger.info('[OAuth2Service] Token exchange successful', { broker, expiresAt: expiresAt.toISOString() });

      // Audit log: Successful token exchange (MEDIUM risk)
      const User = require('../models/User');
      User.findById(validation.userId)
        .then(user => {
          if (user) {
            SecurityAudit.log({
              communityId: user.tradingConfig.communityId,
              userId: validation.userId,
              userRole: 'trader',
              action: 'auth.oauth2_token_exchange',
              resourceType: 'User',
              resourceId: validation.userId,
              operation: 'CREATE',
              status: 'success',
              riskLevel: 'medium',
              ipAddress: session.ipAddress || 'unknown',
              userAgent: session.userAgent,
              dataAfter: { broker, expiresAt, scopes: tokenData.scope ? tokenData.scope.split(' ') : config.scopes }
            }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));
          }
        })
        .catch(err => logger.error('[OAuth2Service] User lookup for audit failed', { error: err.message, stack: err.stack }));

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : config.scopes,
        tokenType: tokenData.token_type || 'Bearer'
      };
    } catch (error) {
      logger.error('[OAuth2Service] Token exchange failed', { broker, error: error.message, responseData: error.response?.data, stack: error.stack });

      // Audit log: Token exchange failed (HIGH risk)
      const User = require('../models/User');
      User.findById(validation.userId)
        .then(user => {
          if (user) {
            SecurityAudit.log({
              communityId: user.tradingConfig.communityId,
              userId: validation.userId,
              userRole: 'trader',
              action: 'auth.oauth2_connection_failed',
              resourceType: 'User',
              resourceId: validation.userId,
              operation: 'CREATE',
              status: 'failure',
              errorMessage: error.response?.data?.error_description || error.message,
              errorCode: error.response?.data?.error,
              riskLevel: 'high',
              requiresReview: true,
              ipAddress: session.ipAddress || 'unknown',
              userAgent: session.userAgent,
              dataBefore: { broker, operation: 'token_exchange' }
            }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));
          }
        })
        .catch(err => logger.error('[OAuth2Service] User lookup for audit failed', { error: err.message, stack: err.stack }));

      // Sanitize error message to prevent sensitive data leakage
      const rawMessage = error.response?.data?.error_description || error.message;
      const sanitizedMessage = this.sanitizeErrorMessage(rawMessage);
      throw new Error(sanitizedMessage);
    }
  }

  /**
   * Refresh OAuth2 access token using refresh token
   *
   * @param {string} broker - Broker key
   * @param {string} userId - User ID
   * @param {number} retryCount - Current retry attempt (internal)
   * @returns {Promise<Object>} New token data: { accessToken, refreshToken, expiresAt, scopes, tokenType }
   * @throws {Error} If token refresh fails
   */
  async refreshAccessToken(broker, userId, retryCount = 0) {
    const config = getProviderConfig(broker);
    if (!config) {
      throw new Error(`Broker '${broker}' OAuth2 configuration not found`);
    }

    try {
      // Retrieve user and encrypted tokens
      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        throw new Error(`User '${userId}' not found`);
      }

      const encryptedTokens = user.tradingConfig.oauthTokens.get(broker);
      if (!encryptedTokens || !encryptedTokens.refreshToken) {
        throw new Error(`No OAuth2 refresh token found for broker '${broker}'`);
      }

      // Decrypt refresh token
      const refreshToken = this.decryptToken(encryptedTokens.refreshToken);

      logger.info('[OAuth2Service] Refreshing access token', { broker, userId, attempt: retryCount + 1 });

      // Build refresh request
      const refreshRequest = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret
      };

      // Send refresh request
      const response = await axios.post(
        config.tokenURL,
        new URLSearchParams(refreshRequest).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokenData = response.data;

      // Calculate new expiration
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      // Handle token rotation (if broker supports it)
      const newRefreshToken = config.supportsRefreshTokenRotation && tokenData.refresh_token
        ? tokenData.refresh_token
        : refreshToken; // Reuse old refresh token if no rotation

      logger.info('[OAuth2Service] Token refresh successful', { broker, expiresAt: expiresAt.toISOString(), tokenRotated: !!tokenData.refresh_token });

      // Encrypt and update tokens
      const updatedTokens = this.encryptTokens({
        accessToken: tokenData.access_token,
        refreshToken: newRefreshToken,
        expiresAt,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : encryptedTokens.scopes,
        tokenType: tokenData.token_type || 'Bearer'
      });

      // Update user document
      user.tradingConfig.oauthTokens.set(broker, {
        ...updatedTokens,
        connectedAt: encryptedTokens.connectedAt || new Date(),
        isValid: true,
        lastRefreshError: null,
        lastRefreshAttempt: new Date()
      });
      await user.save();

      // Audit log: Successful token refresh (MEDIUM risk)
      SecurityAudit.log({
        communityId: user.tradingConfig.communityId,
        userId,
        userRole: 'trader',
        action: 'auth.oauth2_refresh_token',
        resourceType: 'User',
        resourceId: userId,
        operation: 'UPDATE',
        status: 'success',
        riskLevel: 'medium',
        ipAddress: 'system',
        dataAfter: { broker, expiresAt, tokenRotated: !!tokenData.refresh_token }
      }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));

      // Clear decrypted tokens from memory
      refreshToken.replace(/./g, '0');

      return {
        accessToken: tokenData.access_token,
        refreshToken: newRefreshToken,
        expiresAt,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : encryptedTokens.scopes,
        tokenType: tokenData.token_type || 'Bearer'
      };
    } catch (error) {
      const statusCode = error.response?.status;
      const errorCode = error.response?.data?.error;

      // Permanent error (4xx) - do not retry, mark tokens invalid
      if (statusCode >= 400 && statusCode < 500) {
        logger.error('[OAuth2Service] Token refresh failed (permanent)', { broker, errorCode, responseData: error.response?.data, error: error.message, stack: error.stack });

        // Audit log: Token refresh failed permanently (HIGH risk)
        const User = require('../models/User');
        const user = await User.findById(userId);
        if (user) {
          SecurityAudit.log({
            communityId: user.tradingConfig.communityId,
            userId,
            userRole: 'trader',
            action: 'auth.oauth2_connection_failed',
            resourceType: 'User',
            resourceId: userId,
            operation: 'UPDATE',
            status: 'failure',
            errorMessage: error.response?.data?.error_description || error.message,
            errorCode,
            statusCode,
            riskLevel: 'high',
            requiresReview: true,
            ipAddress: 'system',
            dataBefore: { broker, operation: 'token_refresh', failureType: 'permanent', retryAttempt: retryCount }
          }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));
        }

        // Mark tokens as invalid in user document
        await this.markTokensInvalid(broker, userId, errorCode || error.message);

        throw new Error(`Token refresh failed (${errorCode || 'invalid_grant'}): ${error.response?.data?.error_description || error.message}`);
      }

      // Transient error (5xx) - retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount];
        logger.warn('[OAuth2Service] Token refresh failed (transient)', { broker, retryDelay: delay, nextAttempt: retryCount + 2 });

        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.refreshAccessToken(broker, userId, retryCount + 1);
      }

      // Max retries exceeded
      logger.error('[OAuth2Service] Token refresh failed (max retries)', { broker, error: error.message, stack: error.stack, retriesAttempted: MAX_RETRIES });

      // Audit log: Token refresh failed after max retries (HIGH risk)
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (user) {
        SecurityAudit.log({
          communityId: user.tradingConfig.communityId,
          userId,
          userRole: 'trader',
          action: 'auth.oauth2_connection_failed',
          resourceType: 'User',
          resourceId: userId,
          operation: 'UPDATE',
          status: 'failure',
          errorMessage: `Token refresh failed after ${MAX_RETRIES} retries: ${error.message}`,
          riskLevel: 'high',
          requiresReview: true,
          ipAddress: 'system',
          dataBefore: { broker, operation: 'token_refresh', failureType: 'max_retries', retryAttempt: MAX_RETRIES }
        }).catch(err => logger.error('[OAuth2Service] Audit log failed', { error: err.message, stack: err.stack }));
      }

      throw new Error(`Token refresh failed after ${MAX_RETRIES} retries: ${error.message}`);
    }
  }

  /**
   * Mark OAuth2 tokens as invalid after refresh failure
   *
   * @param {string} broker - Broker key
   * @param {string} userId - User ID
   * @param {string} errorMessage - Error message
   */
  async markTokensInvalid(broker, userId, errorMessage) {
    try {
      const User = require('../models/User');
      const user = await User.findById(userId);

      if (user && user.tradingConfig.oauthTokens.has(broker)) {
        const tokens = user.tradingConfig.oauthTokens.get(broker);

        // Explicitly preserve all token fields and update error fields
        // Using spread operator on Mongoose Map values doesn't always work correctly
        user.tradingConfig.oauthTokens.set(broker, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          tokenType: tokens.tokenType,
          connectedAt: tokens.connectedAt || new Date(),
          isValid: false,
          lastRefreshError: errorMessage,
          lastRefreshAttempt: new Date()
        });

        // Mark the path as modified for Mongoose to detect the change
        user.markModified('tradingConfig.oauthTokens');
        await user.save();

        logger.info('[OAuth2Service] Marked tokens invalid', { broker, userId, errorMessage });
      }
    } catch (error) {
      logger.error('[OAuth2Service] Failed to mark tokens invalid', { broker, userId, error: error.message, stack: error.stack });
    }
  }

  /**
   * Encrypt OAuth2 tokens using AES-256-GCM
   *
   * @param {Object} tokens - Token data to encrypt
   * @param {string} tokens.accessToken - Access token
   * @param {string} tokens.refreshToken - Refresh token
   * @param {Date} tokens.expiresAt - Expiration timestamp
   * @param {Array<string>} tokens.scopes - OAuth2 scopes
   * @param {string} tokens.tokenType - Token type (e.g., 'Bearer')
   * @returns {Object} Encrypted tokens with IVs and authTags
   */
  encryptTokens(tokens) {
    return {
      accessToken: this.encryptToken(tokens.accessToken),
      refreshToken: this.encryptToken(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      tokenType: tokens.tokenType
    };
  }

  /**
   * Encrypt a single token string
   *
   * @param {string} token - Token to encrypt
   * @returns {Object} { encrypted, iv, authTag }
   */
  encryptToken(token) {
    // Generate random IV (initialization vector)
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    // Encrypt token
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt OAuth2 tokens
   *
   * @param {Object} encryptedTokens - Encrypted token data
   * @returns {Object} Plaintext tokens
   */
  decryptTokens(encryptedTokens) {
    return {
      accessToken: this.decryptToken(encryptedTokens.accessToken),
      refreshToken: this.decryptToken(encryptedTokens.refreshToken),
      expiresAt: encryptedTokens.expiresAt,
      scopes: encryptedTokens.scopes,
      tokenType: encryptedTokens.tokenType
    };
  }

  /**
   * Decrypt a single token
   *
   * @param {Object} tokenData - { encrypted, iv, authTag }
   * @returns {string} Decrypted token
   * @throws {Error} If decryption fails (authentication tag mismatch)
   */
  decryptToken(tokenData) {
    try {
      // Create decipher
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.encryptionKey,
        Buffer.from(tokenData.iv, 'hex')
      );

      // Set authentication tag
      decipher.setAuthTag(Buffer.from(tokenData.authTag, 'hex'));

      // Decrypt token
      let decrypted = decipher.update(tokenData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('[OAuth2Service] Token decryption failed', { error: error.message, stack: error.stack });
      throw new Error('Token decryption failed - possible tampering or corruption');
    }
  }
}

// Singleton instance
const oauth2Service = new OAuth2Service();

// Export singleton by default for production use
module.exports = oauth2Service;

// Also export class for testing
module.exports.OAuth2Service = OAuth2Service;
