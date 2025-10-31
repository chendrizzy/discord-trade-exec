// Internal utilities and services
const { getTenantContext } = require('./tenantAuth');

// Models and types
const SecurityAudit = require('../models/SecurityAudit');
const logger = require('../utils/logger');

// Risk level classification
const RISK_LEVELS = {
  'credential.create': 'critical',
  'credential.view': 'high',
  'credential.update': 'critical',
  'credential.delete': 'critical',
  'credential.decrypt': 'high',
  'user.delete': 'high',
  'user.role_change': 'high',
  'community.delete': 'critical',
  'security.cross_tenant_attempt': 'critical',
  'security.unauthorized_access': 'high',
  'admin.data_access': 'high',
  'admin.settings_override': 'critical'
};

// Actions requiring manual review
const REVIEW_REQUIRED = [
  'credential.delete',
  'community.delete',
  'security.cross_tenant_attempt',
  'admin.settings_override'
];

/**
 * Audit Logger Middleware
 *
 * Layer 6 of 7-Layer Security Defense
 *
 * Logs all security-relevant operations to SecurityAudit collection.
 * Non-blocking (fire-and-forget) to avoid impacting response times.
 *
 * Usage:
 *   router.post('/credential',
 *     extractTenantMiddleware,
 *     auditLog('credential.create', 'Credential'),
 *     createCredentialController
 *   );
 */
const auditLog = (action, resourceType, options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();

    // Capture original methods
    const originalSend = res.send;
    const originalJson = res.json;

    // Store data before operation
    const dataBefore = options.captureBefore ? { ...req.body } : undefined;

    // Intercept response to capture result
    const captureResponse = function (body) {
      const duration = Date.now() - startTime;

      // Get tenant context
      let context;
      try {
        context = getTenantContext();
      } catch (error) {
        context = { communityId: null, userId: null, userRole: 'system' };
      }

      // Determine status
      const statusCode = res.statusCode;
      const status =
        statusCode >= 200 && statusCode < 300
          ? 'success'
          : statusCode === 403 || statusCode === 401
            ? 'blocked'
            : 'failure';

      // Calculate risk level
      const riskLevel = RISK_LEVELS[action] || (status === 'blocked' ? 'medium' : 'low');

      // Check if requires review
      const requiresReview = REVIEW_REQUIRED.includes(action) || riskLevel === 'critical';

      // Build audit log entry
      const auditData = {
        communityId: context.communityId,
        userId: context.userId,
        userRole: context.userRole,
        username: req.user?.discordUsername,

        action,
        resourceType,
        resourceId: req.params.id || req.body?.id || req.body?._id,
        operation: getOperation(req.method),

        status,
        statusCode,

        requestId: context.requestId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        endpoint: req.originalUrl || req.url,
        httpMethod: req.method,

        dataBefore,
        dataAfter: options.captureAfter ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined,

        riskLevel,
        requiresReview,
        duration,
        timestamp: new Date()
      };

      // Parse error details if failure
      if (status === 'failure' || status === 'blocked') {
        const errorBody = typeof body === 'string' ? JSON.parse(body) : body;
        auditData.errorMessage = errorBody.error || errorBody.message;
        auditData.errorCode = errorBody.code;
      }

      // Log asynchronously (non-blocking)
      SecurityAudit.log(auditData).catch(error => {
        logger.error('[AuditLogger] Failed to log audit event:', { error: error.message, stack: error.stack });
      });

      // Call original method
      return originalSend.call(this, body);
    };

    // Override response methods
    res.send = captureResponse;
    res.json = function (body) {
      res.setHeader('Content-Type', 'application/json');
      return captureResponse.call(this, JSON.stringify(body));
    };

    next();
  };
};

/**
 * Get Operation from HTTP Method
 */
const getOperation = method => {
  const operationMap = {
    POST: 'CREATE',
    GET: 'READ',
    PUT: 'UPDATE',
    PATCH: 'UPDATE',
    DELETE: 'DELETE'
  };
  return operationMap[method] || 'EXECUTE';
};

/**
 * Audit Failed Auth Attempt
 *
 * Logs failed authentication attempts (called from auth middleware).
 */
const auditFailedAuth = async (req, error) => {
  try {
    await SecurityAudit.log({
      communityId: null,
      userId: null,
      userRole: 'system',

      action: 'auth.failed_login',
      resourceType: 'System',
      operation: 'EXECUTE',

      status: 'failure',
      statusCode: 401,
      errorMessage: error.message,
      errorCode: error.code,

      requestId: req.id,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: req.originalUrl || req.url,
      httpMethod: req.method,

      riskLevel: 'medium',
      requiresReview: false,
      timestamp: new Date()
    });
  } catch (auditError) {
    logger.error('[AuditLogger] Failed to log auth failure', {
      error: auditError.message,
      stack: auditError.stack,
      action: 'auth.failed_login',
      authError: error?.message,
      endpoint: req.originalUrl || req.url
    });
  }
};

/**
 * Audit Cross-Tenant Attempt
 *
 * Logs cross-tenant access attempts (security violation).
 */
const auditCrossTenantAttempt = async (req, attemptedCommunityId) => {
  let context;
  try {
    context = getTenantContext();

    await SecurityAudit.log({
      communityId: context.communityId,
      userId: context.userId,
      userRole: context.userRole,

      action: 'security.cross_tenant_attempt',
      resourceType: 'System',
      resourceId: attemptedCommunityId,
      operation: 'READ',

      status: 'blocked',
      statusCode: 403,
      errorMessage: `Attempted to access resources from community ${attemptedCommunityId}`,
      errorCode: 'CROSS_TENANT_ACCESS',

      requestId: context.requestId,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: req.originalUrl || req.url,
      httpMethod: req.method,

      riskLevel: 'critical',
      requiresReview: true,
      timestamp: new Date()
    });
  } catch (auditError) {
    logger.error('[AuditLogger] Failed to log cross-tenant attempt', {
      error: auditError.message,
      stack: auditError.stack,
      action: 'security.cross_tenant_attempt',
      attemptedCommunityId,
      currentCommunityId: context?.communityId,
      userId: context?.userId
    });
  }
};

/**
 * Audit Credential Operation
 *
 * Special logging for credential operations (high risk).
 */
const auditCredentialOperation = async (action, credentialType, resourceId, success = true) => {
  let context;
  try {
    context = getTenantContext();

    await SecurityAudit.log({
      communityId: context.communityId,
      userId: context.userId,
      userRole: context.userRole,

      action,
      resourceType: 'Credential',
      resourceId,
      operation: action.includes('decrypt') ? 'READ' : 'UPDATE',

      status: success ? 'success' : 'failure',
      statusCode: success ? 200 : 500,

      requestId: context.requestId,
      ipAddress: 'system',
      endpoint: 'credential-operation',

      dataAfter: { credentialType },

      riskLevel: RISK_LEVELS[action],
      requiresReview: REVIEW_REQUIRED.includes(action),
      timestamp: new Date()
    });
  } catch (auditError) {
    logger.error('[AuditLogger] Failed to log credential operation', {
      error: auditError.message,
      stack: auditError.stack,
      action,
      credentialType,
      resourceId,
      success,
      communityId: context?.communityId
    });
  }
};

module.exports = {
  auditLog,
  auditFailedAuth,
  auditCrossTenantAttempt,
  auditCredentialOperation
};
