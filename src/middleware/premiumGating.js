/**
 * Premium Tier Gating Middleware
 * Controls access to premium features based on user subscription tier
 *
 * Tier Structure:
 * - Free: 1 broker max (Alpaca and Binance only)
 * - Basic: 2 brokers max (Alpaca + crypto)
 * - Pro: 5 brokers max (All except IBKR/Schwab)
 * - Premium: 10 brokers max (All brokers including IBKR/Schwab)
 */

// Premium-only brokers (require premium tier)
const PREMIUM_ONLY_BROKERS = ['ibkr', 'schwab'];

// Free tier allowed brokers
const FREE_TIER_BROKERS = ['alpaca', 'binance'];

// Tier hierarchy for comparison
const TIER_HIERARCHY = {
  free: 0,
  basic: 1,
  pro: 2,
  premium: 3
};

// Broker limits by tier
const BROKER_LIMITS = {
  free: 1,
  basic: 2,
  pro: 5,
  premium: 10
};

/**
 * Check if user has active premium subscription
 * @param {Object} user - User object from database
 * @returns {boolean} - True if user has premium tier
 */
function hasPremiumTier(user) {
  if (!user || !user.subscription) {
    return false;
  }

  return user.subscription.tier === 'premium' &&
         ['active', 'trial'].includes(user.subscription.status);
}

/**
 * Check if user has minimum required tier
 * @param {Object} user - User object from database
 * @param {string} requiredTier - Minimum tier required (free, basic, pro, premium)
 * @returns {boolean} - True if user meets tier requirement
 */
function hasMinimumTier(user, requiredTier) {
  if (!user || !user.subscription) {
    return false;
  }

  const userTier = TIER_HIERARCHY[user.subscription.tier] || 0;
  const required = TIER_HIERARCHY[requiredTier] || 0;

  return userTier >= required &&
         ['active', 'trial'].includes(user.subscription.status);
}

/**
 * Get current broker count for a user
 * @param {Object} user - User object from database
 * @returns {number} - Number of configured brokers
 */
function getBrokerCount(user) {
  if (!user) {
    return 0;
  }

  // Check both locations for brokerConfigs (direct or nested)
  const brokerConfigs = user.brokerConfigs || user.tradingConfig?.brokerConfigs;

  if (!brokerConfigs) {
    return 0;
  }

  // Handle Mongoose Map object
  if (brokerConfigs.size !== undefined) {
    return brokerConfigs.size;
  }

  // Handle plain object
  return Object.keys(brokerConfigs).length;
}

/**
 * Check if user has access to a specific broker based on tier
 * @param {Object} user - User object from database
 * @param {string} brokerKey - Broker key (ibkr, schwab, alpaca, etc.)
 * @returns {Object} - { allowed: boolean, reason?: string, upgradeRequired?: string }
 */
function checkBrokerTierAccess(user, brokerKey) {
  if (!user || !user.subscription) {
    return {
      allowed: false,
      reason: 'No subscription found',
      upgradeRequired: 'basic'
    };
  }

  const { tier, status } = user.subscription;
  const brokerKeyLower = brokerKey.toLowerCase();

  // Check if subscription is active
  if (!['active', 'trial'].includes(status)) {
    return {
      allowed: false,
      reason: 'Subscription is not active',
      currentStatus: status,
      upgradeRequired: tier === 'free' ? 'basic' : tier
    };
  }

  // Free tier: Only Alpaca and Binance
  if (tier === 'free' && !FREE_TIER_BROKERS.includes(brokerKeyLower)) {
    return {
      allowed: false,
      reason: `${brokerKey.toUpperCase()} requires Premium tier subscription. Free tier only supports Alpaca and Binance.`,
      currentTier: tier,
      upgradeRequired: 'premium',
      freeTierBroker: false
    };
  }

  // Check if broker requires premium tier (IBKR, Schwab)
  if (PREMIUM_ONLY_BROKERS.includes(brokerKeyLower)) {
    if (tier !== 'premium') {
      return {
        allowed: false,
        reason: `${brokerKey.toUpperCase()} requires Premium tier subscription`,
        currentTier: tier,
        upgradeRequired: 'premium',
        premiumBroker: true
      };
    }
  }

  return { allowed: true };
}

/**
 * Middleware: Check if user can configure a specific broker
 * Validates broker access based on user's subscription tier
 *
 * - Free tier: Only Alpaca and Binance
 * - Premium/Pro tier: All brokers (IBKR, Schwab, etc.)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkBrokerAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Extract broker key from request
  const brokerKey = req.body?.brokerKey || req.params?.brokerKey || req.query?.brokerKey;

  if (!brokerKey) {
    // No broker specified, skip check (will be validated elsewhere)
    return next();
  }

  // Check broker access
  const accessCheck = checkBrokerTierAccess(req.user, brokerKey);

  if (!accessCheck.allowed) {
    const response = {
      success: false,
      error: 'BROKER_ACCESS_DENIED',
      message: accessCheck.reason,
      broker: brokerKey,
      currentTier: req.user.subscription?.tier || 'free'
    };

    // Add upgrade information
    if (accessCheck.upgradeRequired) {
      response.upgradeRequired = accessCheck.upgradeRequired;

      if (accessCheck.premiumBroker) {
        response.upgradeCTA = 'Upgrade to Premium for advanced brokers';
      } else if (accessCheck.freeTierBroker === false) {
        response.upgradeCTA = 'Upgrade to Premium for advanced brokers';
      } else {
        response.upgradeCTA = `Upgrade to ${accessCheck.upgradeRequired} to access this broker.`;
      }
    }

    return res.status(403).json(response);
  }

  // User has access, attach broker info to request
  req.brokerAccess = {
    brokerKey,
    tier: req.user.subscription?.tier || 'free',
    isPremiumBroker: PREMIUM_ONLY_BROKERS.includes(brokerKey.toLowerCase())
  };

  next();
};

/**
 * Middleware: Require premium broker access (IBKR or Schwab)
 * Use this specifically for IBKR/Schwab endpoints
 * Extracts brokerKey from req.body.brokerKey
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requirePremiumBroker = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const brokerKey = req.body?.brokerKey || req.params?.brokerKey || req.query?.brokerKey;

  if (!brokerKey) {
    return res.status(400).json({
      success: false,
      error: 'Broker key is required'
    });
  }

  const brokerKeyLower = brokerKey.toLowerCase();

  // Check if this is a premium-only broker
  if (!PREMIUM_ONLY_BROKERS.includes(brokerKeyLower)) {
    // Not a premium broker, allow access
    return next();
  }

  // Get user tier
  const userTier = req.user.subscription?.tier || 'free';
  const userStatus = req.user.subscription?.status;

  // Check premium tier
  if (userTier !== 'premium' || !['active', 'trial'].includes(userStatus)) {
    return res.status(403).json({
      success: false,
      error: 'BROKER_ACCESS_DENIED',
      message: `Premium tier required for ${brokerKey.toUpperCase()}/Schwab`,
      broker: brokerKey,
      currentTier: userTier,
      upgradeRequired: 'premium',
      upgradeCTA: 'Upgrade to Premium for advanced brokers'
    });
  }

  next();
};

/**
 * Middleware: Check if user can add another broker
 * Validates broker count against user's tier limits
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkBrokerLimit = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const userTier = req.user.subscription?.tier || 'free';
  const currentBrokerCount = getBrokerCount(req.user);

  // Get max brokers from user limits or tier defaults
  const maxBrokers = req.user.limits?.maxBrokers || BROKER_LIMITS[userTier] || 1;

  // Check if this is a reconnection (broker already configured)
  const brokerKey = req.body?.brokerKey || req.params?.brokerKey || req.query?.brokerKey;
  const brokerConfigs = req.user.brokerConfigs || req.user.tradingConfig?.brokerConfigs;

  let isReconnection = false;
  if (brokerKey && brokerConfigs) {
    // Handle Mongoose Map
    if (brokerConfigs.has && typeof brokerConfigs.has === 'function') {
      isReconnection = brokerConfigs.has(brokerKey);
    } else {
      // Handle plain object
      isReconnection = brokerKey in brokerConfigs && brokerConfigs[brokerKey] !== undefined;
    }
  }

  // If reconnecting to existing broker, skip limit check
  if (isReconnection) {
    return next();
  }

  // Check if user has reached broker limit
  if (currentBrokerCount >= maxBrokers) {
    // Determine next tier for upgrade
    let nextTier;
    if (userTier === 'free') {
      nextTier = 'basic';
    } else if (userTier === 'basic') {
      nextTier = 'pro';
    } else if (userTier === 'pro') {
      nextTier = 'premium';
    } else {
      nextTier = 'premium';
    }

    return res.status(403).json({
      success: false,
      error: 'BROKER_ACCESS_DENIED',
      message: `Broker limit reached. You have ${currentBrokerCount}/${maxBrokers} brokers`,
      maxBrokers,
      currentBrokerCount,
      currentTier: userTier,
      upgradeRequired: nextTier
    });
  }

  // Attach broker limit info to request for reference
  req.brokerLimit = {
    currentBrokerCount,
    maxBrokers,
    remainingSlots: maxBrokers - currentBrokerCount,
    tier: userTier
  };

  next();
};

/**
 * Middleware: Require premium tier subscription
 * Blocks access if user doesn't have active premium subscription
 */
const requirePremium = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!hasPremiumTier(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'PREMIUM_REQUIRED',
      message: 'This feature requires a Premium subscription',
      currentTier: req.user.subscription?.tier || 'free',
      upgradeUrl: '/dashboard/subscription/upgrade?tier=premium',
      upgradeCTA: 'Upgrade to Premium to unlock all brokers and features'
    });
  }

  next();
};

/**
 * Middleware: Require minimum tier subscription
 * @param {string} minimumTier - Minimum tier required (basic, pro, or premium)
 */
const requireTier = (minimumTier) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!hasMinimumTier(req.user, minimumTier)) {
      const tierNames = {
        basic: 'Basic',
        pro: 'Pro',
        premium: 'Premium'
      };

      return res.status(403).json({
        success: false,
        error: 'TIER_UPGRADE_REQUIRED',
        message: `This feature requires a ${tierNames[minimumTier]} subscription or higher`,
        currentTier: req.user.subscription?.tier || 'free',
        requiredTier: minimumTier,
        upgradeUrl: `/dashboard/subscription/upgrade?tier=${minimumTier}`,
        upgradeCTA: `Upgrade to ${tierNames[minimumTier]} to unlock this feature`
      });
    }

    next();
  };
};

/**
 * Get user's broker access summary
 * @param {Object} user - User object from database
 * @returns {Object} - Access summary with allowed brokers and limits
 */
function getBrokerAccessSummary(user) {
  if (!user || !user.subscription) {
    return {
      tier: 'free',
      maxBrokers: 1,
      currentBrokers: 0,
      allowedBrokers: FREE_TIER_BROKERS,
      premiumBrokersAllowed: false
    };
  }

  const { tier } = user.subscription;
  const allBrokers = ['alpaca', 'binance', 'coinbase', 'kraken', 'bybit', 'okx', 'ibkr', 'schwab'];
  const currentBrokerCount = getBrokerCount(user);
  const maxBrokers = BROKER_LIMITS[tier] || 1;

  // Determine allowed brokers based on tier
  let allowedBrokers;
  if (tier === 'free') {
    allowedBrokers = FREE_TIER_BROKERS;
  } else if (tier === 'premium') {
    allowedBrokers = allBrokers;
  } else {
    // basic, pro - all except premium brokers
    allowedBrokers = allBrokers.filter(broker => !PREMIUM_ONLY_BROKERS.includes(broker));
  }

  return {
    tier,
    maxBrokers,
    currentBrokers: currentBrokerCount,
    availableSlots: Math.max(0, maxBrokers - currentBrokerCount),
    allowedBrokers,
    premiumBrokersAllowed: tier === 'premium',
    premiumBrokers: PREMIUM_ONLY_BROKERS,
    freeTierBrokers: FREE_TIER_BROKERS,
    canAddMoreBrokers: currentBrokerCount < maxBrokers
  };
}

module.exports = {
  // Primary middleware functions (as requested)
  checkBrokerAccess,
  requirePremiumBroker,
  checkBrokerLimit,

  // Additional middleware
  requirePremium,
  requireTier,

  // Helper functions
  checkBrokerTierAccess,
  getBrokerAccessSummary,
  getBrokerCount,
  hasPremiumTier,
  hasMinimumTier,

  // Constants
  PREMIUM_ONLY_BROKERS,
  FREE_TIER_BROKERS,
  TIER_HIERARCHY,
  BROKER_LIMITS
};
