class RateLimiter {
  constructor() {
    // Configuration
    this.config = {
      // Per-IP limits
      perIpLimits: {
        windowMs: 60000, // 1 minute window
        maxRequests: 60, // 60 requests per minute
        maxBurst: 10 // Allow burst of 10 requests instantly
      },
      // Per-user limits (if authenticated)
      perUserLimits: {
        windowMs: 60000, // 1 minute window
        maxRequests: 100, // 100 requests per minute
        maxBurst: 20 // Allow burst of 20 requests instantly
      },
      // Global limits
      globalLimits: {
        windowMs: 60000, // 1 minute window
        maxRequests: 1000, // 1000 requests per minute across all IPs
        maxBurst: 100
      },
      // Blacklist/whitelist
      ipBlacklist: new Set(),
      ipWhitelist: new Set(),
      // Auto-ban settings
      autoBan: {
        enabled: true,
        threshold: 5, // Number of violations before auto-ban
        banDuration: 15 * 60000, // 15 minutes
        maxBanDuration: 24 * 60 * 60000 // 24 hours max ban
      }
    };

    // Tracking data structures
    this.ipRequests = new Map(); // IP -> { count, firstRequest, violations }
    this.userRequests = new Map(); // UserID -> { count, firstRequest }
    this.globalRequests = {
      count: 0,
      firstRequest: null
    };
    this.bannedIPs = new Map(); // IP -> { bannedUntil, violations }

    // Clean up old data every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 2 * 60000);
  }

  /**
   * Check if request should be allowed
   * @param {string} ip - Client IP address
   * @param {string} userId - User ID (optional)
   * @returns {Object} - { allowed: boolean, reason: string, retryAfter: number }
   */
  checkRequest(ip, userId = null) {
    const now = Date.now();

    // Check if IP is banned
    if (this.isIPBanned(ip)) {
      const banInfo = this.bannedIPs.get(ip);
      const retryAfter = Math.ceil((banInfo.bannedUntil - now) / 1000);
      return {
        allowed: false,
        reason: 'IP_BANNED',
        retryAfter,
        message: `IP banned for ${Math.ceil(retryAfter / 60)} minutes`
      };
    }

    // Check blacklist/whitelist
    if (this.config.ipBlacklist.has(ip)) {
      return {
        allowed: false,
        reason: 'IP_BLACKLISTED',
        retryAfter: 0,
        message: 'IP address is blacklisted'
      };
    }

    if (this.config.ipWhitelist.has(ip)) {
      return {
        allowed: true,
        reason: 'IP_WHITELISTED',
        retryAfter: 0,
        message: 'IP address is whitelisted'
      };
    }

    // Check global rate limit
    const globalCheck = this.checkGlobalLimit(now);
    if (!globalCheck.allowed) {
      return globalCheck;
    }

    // Check per-IP rate limit
    const ipCheck = this.checkIPLimit(ip, now);
    if (!ipCheck.allowed) {
      this.recordViolation(ip);
      return ipCheck;
    }

    // Check per-user rate limit (if user ID provided)
    if (userId) {
      const userCheck = this.checkUserLimit(userId, now);
      if (!userCheck.allowed) {
        return userCheck;
      }
    }

    // All checks passed
    this.recordRequest(ip, userId, now);
    return {
      allowed: true,
      reason: 'ALLOWED',
      retryAfter: 0,
      message: 'Request allowed'
    };
  }

  /**
   * Check if IP is currently banned
   * @private
   */
  isIPBanned(ip) {
    const banInfo = this.bannedIPs.get(ip);
    if (!banInfo) return false;

    const now = Date.now();
    if (now >= banInfo.bannedUntil) {
      // Ban expired, remove it
      this.bannedIPs.delete(ip);
      return false;
    }

    return true;
  }

  /**
   * Check global rate limit
   * @private
   */
  checkGlobalLimit(now) {
    const { windowMs, maxRequests } = this.config.globalLimits;

    if (!this.globalRequests.firstRequest || now - this.globalRequests.firstRequest >= windowMs) {
      // Reset window
      this.globalRequests = {
        count: 0,
        firstRequest: now
      };
    }

    if (this.globalRequests.count >= maxRequests) {
      const resetTime = this.globalRequests.firstRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      return {
        allowed: false,
        reason: 'GLOBAL_RATE_LIMIT',
        retryAfter,
        message: 'Global rate limit exceeded'
      };
    }

    return { allowed: true };
  }

  /**
   * Check per-IP rate limit
   * @private
   */
  checkIPLimit(ip, now) {
    const { windowMs, maxRequests } = this.config.perIpLimits;
    const ipData = this.ipRequests.get(ip);

    if (!ipData || now - ipData.firstRequest >= windowMs) {
      // Reset window for this IP
      this.ipRequests.set(ip, {
        count: 0,
        firstRequest: now,
        violations: ipData ? ipData.violations : 0
      });
      return { allowed: true };
    }

    if (ipData.count >= maxRequests) {
      const resetTime = ipData.firstRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      return {
        allowed: false,
        reason: 'IP_RATE_LIMIT',
        retryAfter,
        message: `Too many requests from IP. Retry after ${retryAfter} seconds`
      };
    }

    return { allowed: true };
  }

  /**
   * Check per-user rate limit
   * @private
   */
  checkUserLimit(userId, now) {
    const { windowMs, maxRequests } = this.config.perUserLimits;
    const userData = this.userRequests.get(userId);

    if (!userData || now - userData.firstRequest >= windowMs) {
      // Reset window for this user
      this.userRequests.set(userId, {
        count: 0,
        firstRequest: now
      });
      return { allowed: true };
    }

    if (userData.count >= maxRequests) {
      const resetTime = userData.firstRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      return {
        allowed: false,
        reason: 'USER_RATE_LIMIT',
        retryAfter,
        message: `User rate limit exceeded. Retry after ${retryAfter} seconds`
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful request
   * @private
   */
  recordRequest(ip, userId, now) {
    // Global
    this.globalRequests.count++;

    // IP
    const ipData = this.ipRequests.get(ip);
    if (ipData) {
      ipData.count++;
    } else {
      this.ipRequests.set(ip, {
        count: 1,
        firstRequest: now,
        violations: 0
      });
    }

    // User (if provided)
    if (userId) {
      const userData = this.userRequests.get(userId);
      if (userData) {
        userData.count++;
      } else {
        this.userRequests.set(userId, {
          count: 1,
          firstRequest: now
        });
      }
    }
  }

  /**
   * Record a rate limit violation
   * @private
   */
  recordViolation(ip) {
    if (!this.config.autoBan.enabled) return;

    const ipData = this.ipRequests.get(ip);
    if (ipData) {
      ipData.violations = (ipData.violations || 0) + 1;

      // Check if we should auto-ban this IP
      if (ipData.violations >= this.config.autoBan.threshold) {
        this.banIP(ip, ipData.violations);
      }
    }
  }

  /**
   * Ban an IP address
   * @param {string} ip - IP to ban
   * @param {number} violations - Number of violations
   */
  banIP(ip, violations = 1) {
    const { banDuration, maxBanDuration } = this.config.autoBan;

    // Escalating ban duration based on violations
    const duration = Math.min(banDuration * Math.pow(2, violations - this.config.autoBan.threshold), maxBanDuration);

    const bannedUntil = Date.now() + duration;

    this.bannedIPs.set(ip, {
      bannedUntil,
      violations
    });

    console.warn(`⚠️ IP ${ip} banned for ${Math.ceil(duration / 60000)} minutes (${violations} violations)`);
  }

  /**
   * Unban an IP address
   * @param {string} ip - IP to unban
   */
  unbanIP(ip) {
    this.bannedIPs.delete(ip);

    // Reset violations for this IP
    const ipData = this.ipRequests.get(ip);
    if (ipData) {
      ipData.violations = 0;
    }

    console.log(`✓ IP ${ip} unbanned`);
  }

  /**
   * Add IP to blacklist
   * @param {string} ip - IP to blacklist
   */
  blacklistIP(ip) {
    this.config.ipBlacklist.add(ip);
    console.warn(`🚫 IP ${ip} added to blacklist`);
  }

  /**
   * Add IP to whitelist
   * @param {string} ip - IP to whitelist
   */
  whitelistIP(ip) {
    this.config.ipWhitelist.add(ip);
    console.log(`✓ IP ${ip} added to whitelist`);
  }

  /**
   * Remove IP from blacklist
   * @param {string} ip - IP to remove from blacklist
   */
  removeFromBlacklist(ip) {
    this.config.ipBlacklist.delete(ip);
    console.log(`✓ IP ${ip} removed from blacklist`);
  }

  /**
   * Remove IP from whitelist
   * @param {string} ip - IP to remove from whitelist
   */
  removeFromWhitelist(ip) {
    this.config.ipWhitelist.delete(ip);
    console.log(`✓ IP ${ip} removed from whitelist`);
  }

  /**
   * Get current statistics
   * @returns {Object} - Rate limiting statistics
   */
  getStats() {
    const now = Date.now();
    const activeIPs = Array.from(this.ipRequests.keys()).filter(ip => {
      const ipData = this.ipRequests.get(ip);
      return ipData && now - ipData.firstRequest < this.config.perIpLimits.windowMs;
    });

    const bannedIPsList = Array.from(this.bannedIPs.entries()).map(([ip, data]) => ({
      ip,
      bannedUntil: new Date(data.bannedUntil).toISOString(),
      violations: data.violations,
      timeRemaining: Math.max(0, Math.ceil((data.bannedUntil - now) / 1000))
    }));

    return {
      activeIPs: activeIPs.length,
      bannedIPs: this.bannedIPs.size,
      blacklistedIPs: this.config.ipBlacklist.size,
      whitelistedIPs: this.config.ipWhitelist.size,
      globalRequests: this.globalRequests,
      config: {
        perIpLimit: this.config.perIpLimits.maxRequests,
        perUserLimit: this.config.perUserLimits.maxRequests,
        globalLimit: this.config.globalLimits.maxRequests,
        windowMs: this.config.perIpLimits.windowMs,
        autoBanEnabled: this.config.autoBan.enabled
      },
      bannedIPsList,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean up old data to prevent memory leaks
   * @private
   */
  cleanup() {
    const now = Date.now();
    const { windowMs } = this.config.perIpLimits;

    // Clean up old IP data
    for (const [ip, data] of this.ipRequests.entries()) {
      if (now - data.firstRequest >= windowMs * 2) {
        // Keep data for 2 windows
        this.ipRequests.delete(ip);
      }
    }

    // Clean up old user data
    for (const [userId, data] of this.userRequests.entries()) {
      if (now - data.firstRequest >= windowMs * 2) {
        this.userRequests.delete(userId);
      }
    }

    // Clean up expired bans
    for (const [ip, banData] of this.bannedIPs.entries()) {
      if (now >= banData.bannedUntil) {
        this.bannedIPs.delete(ip);
        console.log(`✓ Ban expired for IP ${ip}`);
      }
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('✓ Rate limiter configuration updated');
  }

  /**
   * Reset all data (useful for testing)
   */
  reset() {
    this.ipRequests.clear();
    this.userRequests.clear();
    this.bannedIPs.clear();
    this.config.ipBlacklist.clear();
    this.config.ipWhitelist.clear();
    this.globalRequests = {
      count: 0,
      firstRequest: null
    };
    console.log('✓ Rate limiter data reset');
  }

  /**
   * Cleanup resources on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export singleton instance
module.exports = new RateLimiter();
