// Internal utilities and services
const { getTenantContext } = require('../../middleware/tenantAuth');

// Models and types
const Community = require('../../models/Community');
const SecurityAudit = require('../../models/SecurityAudit');
const User = require('../../models/User');
const logger = require('../../utils/logger');

/**
 * SecurityMonitor Service
 *
 * Layer 7 of 7-Layer Security Defense
 *
 * Real-time security monitoring, anomaly detection, and automatic threat response.
 * Analyzes patterns from SecurityAudit logs to detect:
 * - Brute force attacks (failed login attempts)
 * - Cross-tenant access violations
 * - Suspicious activity patterns
 * - Rate limit violations
 * - Unusual access patterns
 *
 * Automatically suspends accounts and alerts security team when threats detected.
 */
class SecurityMonitor {
  constructor() {
    // Thresholds for automatic actions
    this.thresholds = {
      // Failed login attempts before account suspension
      failedLoginAttempts: {
        count: 5,
        windowMinutes: 15
      },

      // Cross-tenant attempts before suspension
      crossTenantAttempts: {
        count: 3,
        windowMinutes: 60
      },

      // High-risk operations in short time
      highRiskOperations: {
        count: 10,
        windowMinutes: 5
      },

      // Unusual access patterns
      unusualAccess: {
        newIpThreshold: 3, // Max new IPs per hour
        windowMinutes: 60
      },

      // Rate limit violations
      rateLimitViolations: {
        count: 10,
        windowMinutes: 5
      }
    };

    // Alert channels (can be extended to Slack, PagerDuty, etc.)
    this.alertChannels = {
      console: true,
      database: true
      // email: false,
      // slack: false,
      // pagerduty: false
    };
  }

  /**
   * Check Failed Login Attempts
   * Monitors authentication failures and suspends accounts after threshold
   */
  async checkFailedLogins(communityId, userId) {
    const { count, windowMinutes } = this.thresholds.failedLoginAttempts;
    const failedAttempts = await SecurityAudit.getFailedAttempts(communityId, userId, windowMinutes / 60);

    if (failedAttempts >= count) {
      await this.suspendUser(communityId, userId, 'BRUTE_FORCE_DETECTED', {
        failedAttempts,
        windowMinutes,
        threshold: count
      });

      await this.alertSecurityTeam({
        severity: 'HIGH',
        type: 'BRUTE_FORCE_ATTACK',
        communityId,
        userId,
        details: {
          failedAttempts,
          windowMinutes,
          action: 'Account suspended automatically'
        }
      });

      return { suspended: true, reason: 'BRUTE_FORCE_DETECTED' };
    }

    // Warn after 3 attempts (60% of threshold)
    if (failedAttempts >= Math.floor(count * 0.6)) {
      await this.alertSecurityTeam({
        severity: 'MEDIUM',
        type: 'FAILED_LOGIN_WARNING',
        communityId,
        userId,
        details: {
          failedAttempts,
          threshold: count,
          remaining: count - failedAttempts
        }
      });
    }

    return { suspended: false, failedAttempts };
  }

  /**
   * Check Cross-Tenant Access Attempts
   * Detects and blocks cross-tenant security violations
   */
  async checkCrossTenantViolations(communityId, userId) {
    const { count, windowMinutes } = this.thresholds.crossTenantAttempts;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const violations = await SecurityAudit.countDocuments({
      communityId,
      userId,
      timestamp: { $gte: since },
      action: 'security.cross_tenant_attempt'
    });

    if (violations >= count) {
      await this.suspendUser(communityId, userId, 'CROSS_TENANT_VIOLATION', {
        violations,
        windowMinutes,
        threshold: count
      });

      await this.alertSecurityTeam({
        severity: 'CRITICAL',
        type: 'CROSS_TENANT_ATTACK',
        communityId,
        userId,
        details: {
          violations,
          windowMinutes,
          action: 'Account suspended automatically'
        }
      });

      return { suspended: true, reason: 'CROSS_TENANT_VIOLATION' };
    }

    return { suspended: false, violations };
  }

  /**
   * Check High-Risk Operation Patterns
   * Detects unusual patterns of sensitive operations
   */
  async checkHighRiskOperations(communityId, userId) {
    const { count, windowMinutes } = this.thresholds.highRiskOperations;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const highRiskOps = await SecurityAudit.countDocuments({
      communityId,
      userId,
      timestamp: { $gte: since },
      riskLevel: { $in: ['high', 'critical'] }
    });

    if (highRiskOps >= count) {
      await this.alertSecurityTeam({
        severity: 'HIGH',
        type: 'HIGH_RISK_OPERATION_SPIKE',
        communityId,
        userId,
        details: {
          operations: highRiskOps,
          windowMinutes,
          threshold: count
        }
      });

      // Flag for manual review but don't auto-suspend
      return { flagged: true, operations: highRiskOps };
    }

    return { flagged: false, operations: highRiskOps };
  }

  /**
   * Check Unusual Access Patterns
   * Detects access from multiple new IPs in short time
   */
  async checkUnusualAccess(communityId, userId) {
    const { newIpThreshold, windowMinutes } = this.thresholds.unusualAccess;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Get unique IPs in time window
    const recentActivity = await SecurityAudit.aggregate([
      {
        $match: {
          communityId,
          userId,
          timestamp: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$ipAddress',
          count: { $sum: 1 },
          firstSeen: { $min: '$timestamp' }
        }
      },
      { $sort: { firstSeen: 1 } }
    ]);

    const uniqueIPs = recentActivity.length;

    if (uniqueIPs >= newIpThreshold) {
      await this.alertSecurityTeam({
        severity: 'MEDIUM',
        type: 'UNUSUAL_ACCESS_PATTERN',
        communityId,
        userId,
        details: {
          uniqueIPs,
          windowMinutes,
          threshold: newIpThreshold,
          ips: recentActivity.map(r => ({
            ip: r._id,
            count: r.count,
            firstSeen: r.firstSeen
          }))
        }
      });

      return { suspicious: true, uniqueIPs, ips: recentActivity };
    }

    return { suspicious: false, uniqueIPs };
  }

  /**
   * Check Rate Limit Violations
   * Monitors rate limit exceeded events
   */
  async checkRateLimitViolations(communityId, userId) {
    const { count, windowMinutes } = this.thresholds.rateLimitViolations;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const violations = await SecurityAudit.countDocuments({
      communityId,
      userId,
      timestamp: { $gte: since },
      action: 'security.rate_limit_exceeded'
    });

    if (violations >= count) {
      // Temporary account cooldown (30 minutes)
      await this.cooldownUser(communityId, userId, 30, 'RATE_LIMIT_ABUSE');

      await this.alertSecurityTeam({
        severity: 'MEDIUM',
        type: 'RATE_LIMIT_ABUSE',
        communityId,
        userId,
        details: {
          violations,
          windowMinutes,
          threshold: count,
          action: '30-minute cooldown applied'
        }
      });

      return { cooledDown: true, violations };
    }

    return { cooledDown: false, violations };
  }

  /**
   * Comprehensive Security Scan
   * Runs all security checks and returns aggregated results
   */
  async performSecurityScan(communityId, userId) {
    const results = {
      timestamp: new Date(),
      communityId,
      userId,
      checks: {}
    };

    try {
      // Run all checks in parallel
      const [failedLogins, crossTenant, highRisk, unusualAccess, rateLimit] = await Promise.all([
        this.checkFailedLogins(communityId, userId),
        this.checkCrossTenantViolations(communityId, userId),
        this.checkHighRiskOperations(communityId, userId),
        this.checkUnusualAccess(communityId, userId),
        this.checkRateLimitViolations(communityId, userId)
      ]);

      results.checks = {
        failedLogins,
        crossTenant,
        highRisk,
        unusualAccess,
        rateLimit
      };

      // Overall threat level
      results.threatLevel = this.calculateThreatLevel(results.checks);

      // Determine if account is suspended
      results.accountStatus =
        failedLogins.suspended || crossTenant.suspended ? 'SUSPENDED' : rateLimit.cooledDown ? 'COOLDOWN' : 'ACTIVE';

      return results;
    } catch (error) {
      logger.error('[SecurityMonitor] Security scan failed:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Calculate Overall Threat Level
   */
  calculateThreatLevel(checks) {
    let score = 0;

    // Weight different violations
    if (checks.failedLogins?.suspended) score += 100;
    if (checks.crossTenant?.suspended) score += 100;
    if (checks.highRisk?.flagged) score += 50;
    if (checks.unusualAccess?.suspicious) score += 30;
    if (checks.rateLimit?.cooledDown) score += 20;

    if (score >= 100) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    if (score > 0) return 'LOW';
    return 'NONE';
  }

  /**
   * Suspend User Account
   * Marks user as suspended and logs the action
   */
  async suspendUser(communityId, userId, reason, metadata = {}) {
    try {
      const user = await User.findOne({ _id: userId, communityId });
      if (!user) {
        logger.error('[SecurityMonitor] User not found for suspension', {
          userId,
          communityId
        });
        return;
      }

      // Update user status
      user.accountStatus = 'suspended';
      user.suspendedAt = new Date();
      user.suspensionReason = reason;
      user.suspensionMetadata = metadata;
      await user.save();

      // Log suspension to audit trail
      await SecurityAudit.log({
        communityId,
        userId,
        userRole: 'system',
        action: 'admin.user_suspend',
        resourceType: 'User',
        resourceId: userId,
        operation: 'UPDATE',
        status: 'success',
        statusCode: 200,
        requestId: 'security-monitor',
        ipAddress: 'system',
        endpoint: 'security-monitor',
        httpMethod: 'SYSTEM',
        dataAfter: { reason, metadata },
        riskLevel: 'critical',
        requiresReview: true,
        timestamp: new Date()
      });

      logger.info('[SecurityMonitor] User suspended', {
        userId,
        communityId,
        reason,
        metadata
      });
    } catch (error) {
      logger.error('[SecurityMonitor] Failed to suspend user:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Apply Temporary Cooldown
   * Temporarily restricts account activity
   */
  async cooldownUser(communityId, userId, durationMinutes, reason) {
    try {
      const user = await User.findOne({ _id: userId, communityId });
      if (!user) return;

      const cooldownUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

      user.cooldownUntil = cooldownUntil;
      user.cooldownReason = reason;
      await user.save();

      await SecurityAudit.log({
        communityId,
        userId,
        userRole: 'system',
        action: 'security.cooldown_applied',
        resourceType: 'User',
        resourceId: userId,
        operation: 'UPDATE',
        status: 'success',
        statusCode: 200,
        requestId: 'security-monitor',
        ipAddress: 'system',
        endpoint: 'security-monitor',
        dataAfter: { durationMinutes, cooldownUntil, reason },
        riskLevel: 'medium',
        timestamp: new Date()
      });

      logger.info('[SecurityMonitor] User cooldown applied', {
        userId,
        communityId,
        durationMinutes,
        reason
      });
    } catch (error) {
      logger.error('[SecurityMonitor] Failed to apply cooldown:', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Alert Security Team
   * Sends alerts through configured channels
   */
  async alertSecurityTeam(alert) {
    const formattedAlert = {
      ...alert,
      timestamp: new Date(),
      alertId: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Console logging
    if (this.alertChannels.console) {
      logger.info('[SecurityMonitor] Security alert', {
        alertType: alert.type,
        severity: alert.severity,
        communityId: alert.communityId,
        userId: alert.userId,
        details: alert.details
      });
    }

    // Database logging
    if (this.alertChannels.database) {
      try {
        await SecurityAudit.log({
          communityId: alert.communityId,
          userId: alert.userId || null,
          userRole: 'system',
          action: 'security.alert_generated',
          resourceType: 'System',
          operation: 'EXECUTE',
          status: 'success',
          statusCode: 200,
          requestId: formattedAlert.alertId,
          ipAddress: 'system',
          endpoint: 'security-monitor',
          dataAfter: formattedAlert,
          riskLevel: alert.severity.toLowerCase(),
          requiresReview: alert.severity === 'CRITICAL' || alert.severity === 'HIGH',
          timestamp: new Date()
        });
      } catch (error) {
        logger.error('[SecurityMonitor] Failed to log alert to database:', { error: error.message, stack: error.stack });
      }
    }

    // TODO: Implement additional alert channels (email, Slack, PagerDuty)

    return formattedAlert;
  }

  /**
   * Get Community Security Dashboard
   * Returns security overview for a community
   */
  async getCommunitySecurityDashboard(communityId, hours = 24) {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const [
        totalEvents,
        suspiciousEvents,
        failedLogins,
        crossTenantAttempts,
        highRiskOps,
        blockedRequests,
        activeAlerts
      ] = await Promise.all([
        SecurityAudit.countDocuments({ communityId, timestamp: { $gte: since } }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          $or: [{ status: 'blocked' }, { riskLevel: { $in: ['high', 'critical'] } }]
        }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          action: 'auth.failed_login'
        }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          action: 'security.cross_tenant_attempt'
        }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          riskLevel: { $in: ['high', 'critical'] }
        }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          status: 'blocked'
        }),
        SecurityAudit.countDocuments({
          communityId,
          timestamp: { $gte: since },
          requiresReview: true,
          reviewedAt: { $exists: false }
        })
      ]);

      // Get suspended users
      const suspendedUsers = await User.countDocuments({
        communityId,
        accountStatus: 'suspended'
      });

      return {
        communityId,
        timeWindow: { hours, since },
        metrics: {
          totalEvents,
          suspiciousEvents,
          failedLogins,
          crossTenantAttempts,
          highRiskOps,
          blockedRequests,
          activeAlerts,
          suspendedUsers
        },
        healthScore: this.calculateHealthScore({
          totalEvents,
          suspiciousEvents,
          crossTenantAttempts,
          highRiskOps
        }),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('[SecurityMonitor] Failed to generate dashboard:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Calculate Community Security Health Score (0-100)
   */
  calculateHealthScore(metrics) {
    let score = 100;

    // Deduct points for security issues
    if (metrics.crossTenantAttempts > 0) score -= 30;
    if (metrics.highRiskOps > 10) score -= 20;
    if (metrics.suspiciousEvents > 50) score -= 20;

    const suspiciousRatio = metrics.totalEvents > 0 ? (metrics.suspiciousEvents / metrics.totalEvents) * 100 : 0;

    if (suspiciousRatio > 10) score -= 20;
    if (suspiciousRatio > 5) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}

// Singleton instance
let securityMonitorInstance = null;

/**
 * Get SecurityMonitor Singleton
 */
function getSecurityMonitor() {
  if (!securityMonitorInstance) {
    securityMonitorInstance = new SecurityMonitor();
  }
  return securityMonitorInstance;
}

module.exports = {
  SecurityMonitor,
  getSecurityMonitor
};
