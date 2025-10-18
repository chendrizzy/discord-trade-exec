// External dependencies
const express = require('express');

const router = express.Router();
const { BrokerFactory } = require('../../brokers');
const User = require('../../models/User');
const { getEncryptionService } = require('../../services/encryption');
const {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized
} = require('../../utils/api-response');

// Analytics
const analyticsEventService = require('../../services/analytics/AnalyticsEventService');

// Middleware
const { checkBrokerAccess, requirePremiumBroker, checkBrokerLimit } = require('../../middleware/premiumGating');
const { checkBrokerRateLimit } = require('../../middleware/rateLimiter');

/**
 * Middleware to ensure user is authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return sendUnauthorized(res);
}

/**
 * Helper: Get broker config from brokerConfigs (handles both Map and Object)
 */
function getBrokerConfig(brokerConfigs, brokerKey) {
  if (!brokerConfigs) return null;

  // Handle Mongoose Map
  if (brokerConfigs.get && typeof brokerConfigs.get === 'function') {
    return brokerConfigs.get(brokerKey);
  }

  // Handle plain object
  return brokerConfigs[brokerKey];
}

/**
 * Helper: Set broker config in brokerConfigs (handles both Map and Object)
 */
function setBrokerConfig(brokerConfigs, brokerKey, config) {
  // Handle Mongoose Map
  if (brokerConfigs.set && typeof brokerConfigs.set === 'function') {
    brokerConfigs.set(brokerKey, config);
  } else {
    // Handle plain object
    brokerConfigs[brokerKey] = config;
  }
}

/**
 * Helper: Check if broker exists in brokerConfigs (handles both Map and Object)
 */
function hasBrokerConfig(brokerConfigs, brokerKey) {
  if (!brokerConfigs) return false;

  // Handle Mongoose Map
  if (brokerConfigs.has && typeof brokerConfigs.has === 'function') {
    return brokerConfigs.has(brokerKey);
  }

  // Handle plain object
  return brokerKey in brokerConfigs && brokerConfigs[brokerKey] !== undefined;
}

/**
 * Helper: Delete broker config from brokerConfigs (handles both Map and Object)
 */
function deleteBrokerConfig(brokerConfigs, brokerKey) {
  // Handle Mongoose Map
  if (brokerConfigs.delete && typeof brokerConfigs.delete === 'function') {
    brokerConfigs.delete(brokerKey);
  } else {
    // Handle plain object
    delete brokerConfigs[brokerKey];
  }
}

/**
 * Helper: Get all broker keys from brokerConfigs (handles both Map and Object)
 */
function getBrokerKeys(brokerConfigs) {
  if (!brokerConfigs) return [];

  // Handle Mongoose Map
  if (brokerConfigs.keys && typeof brokerConfigs.keys === 'function') {
    return Array.from(brokerConfigs.keys());
  }

  // Handle plain object
  return Object.keys(brokerConfigs);
}

/**
 * GET /api/brokers
 * List all available brokers with filtering
 */
router.get('/', ensureAuthenticated, (req, res) => {
  try {
    const { type, status, features } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (features) filters.features = features.split(',');

    const brokers = BrokerFactory.getBrokers(filters);

    res.json({
      success: true,
      brokers: brokers.map(broker => ({
        key: broker.key,
        name: broker.name,
        type: broker.type,
        status: broker.status,
        description:
          broker.description ||
          `Trade ${broker.type === 'stock' ? 'stocks and ETFs' : 'cryptocurrencies'} with ${broker.name}`,
        features: broker.features,
        authMethods: broker.authMethods,
        markets: broker.markets,
        accountTypes: broker.accountTypes,
        credentialFields: broker.credentialFields,
        prerequisites: broker.prerequisites
      })),
      stats: BrokerFactory.getStats()
    });
  } catch (error) {
    console.error('[BrokerAPI] Error listing brokers:', error);
    return sendError(res, error.message);
  }
});

/**
 * GET /api/brokers/:brokerKey
 * Get detailed information about a specific broker
 */
router.get('/:brokerKey', ensureAuthenticated, (req, res) => {
  try {
    const { brokerKey } = req.params;

    const broker = BrokerFactory.getBrokerInfo(brokerKey);

    if (!broker) {
      return sendNotFound(res, `Broker '${brokerKey}'`);
    }

    res.json({
      success: true,
      broker: {
        key: broker.key,
        name: broker.name,
        type: broker.type,
        status: broker.status,
        description:
          broker.description ||
          `Trade ${broker.type === 'stock' ? 'stocks and ETFs' : 'cryptocurrencies'} with ${broker.name}`,
        features: broker.features,
        authMethods: broker.authMethods,
        markets: broker.markets,
        accountTypes: broker.accountTypes,
        docs: broker.docs,
        credentialFields: broker.credentialFields,
        prerequisites: broker.prerequisites
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error fetching broker info:', error);
    return sendError(res, error.message);
  }
});

/**
 * POST /api/brokers/test
 * Test broker connection with provided credentials
 */
router.post('/test', ensureAuthenticated, async (req, res) => {
  try {
    const { brokerKey, credentials, options = {} } = req.body;

    if (!brokerKey) {
      return sendValidationError(res, 'Broker key is required');
    }

    if (!credentials || Object.keys(credentials).length === 0) {
      return sendValidationError(res, 'Credentials are required');
    }

    // Apply default values for Moomoo credentials
    if (brokerKey === 'moomoo') {
      if (!credentials.host) {
        credentials.host = '127.0.0.1';
      }
      if (!credentials.port) {
        credentials.port = 11111;
      }
    }

    // Validate credentials format
    const validation = BrokerFactory.validateCredentials(brokerKey, credentials);
    if (!validation.valid) {
      return sendValidationError(res, 'Invalid credentials', validation.errors);
    }

    // Test connection
    const result = await BrokerFactory.testConnection(brokerKey, credentials, options);

    res.json({
      success: result.success,
      message: result.message,
      broker: result.broker,
      balance: result.balance
    });
  } catch (error) {
    console.error('[BrokerAPI] Error testing connection:', error);
    return sendError(res, 'Connection test failed. Please check your credentials and try again.', 500, {
      details: error.message
    });
  }
});

/**
 * POST /api/brokers/test/:brokerKey
 * Test connection for an already-configured broker
 * Retrieves stored credentials from database and tests the connection
 */
router.post('/test/:brokerKey', ensureAuthenticated, checkBrokerRateLimit(), async (req, res) => {
  try {
    const { brokerKey } = req.params;
    const userId = req.user.id;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User');
    }

    // Check if broker is configured
    if (!hasBrokerConfig(user.brokerConfigs, brokerKey)) {
      return sendNotFound(res, `Broker '${brokerKey}' configuration`);
    }

    const brokerConfig = getBrokerConfig(user.brokerConfigs, brokerKey);

    // Decrypt credentials
    const encryptionService = getEncryptionService();
    let decryptedCredentials;

    try {
      decryptedCredentials = await encryptionService.decryptCredential(
        user.communityId.toString(),
        brokerConfig.credentials
      );
    } catch (error) {
      console.error('[BrokerAPI] Failed to decrypt credentials:', error);
      return sendError(res, 'Failed to decrypt credentials', 500, {
        message: 'Decryption service error. Please check AWS KMS configuration.'
      });
    }

    // Apply default values for Moomoo credentials (defensive, in case old configs don't have defaults)
    if (brokerKey === 'moomoo') {
      if (!decryptedCredentials.host) {
        decryptedCredentials.host = '127.0.0.1';
      }
      if (!decryptedCredentials.port) {
        decryptedCredentials.port = 11111;
      }
    }

    // Prepare options
    const options = {
      isTestnet: brokerConfig.environment === 'testnet'
    };

    // Test connection
    const result = await BrokerFactory.testConnection(brokerKey, decryptedCredentials, options);

    // Update lastVerified timestamp if successful
    if (result.success) {
      const config = getBrokerConfig(user.brokerConfigs, brokerKey);
      if (config) {
        config.lastVerified = new Date();
        setBrokerConfig(user.brokerConfigs, brokerKey, config);
        await user.save();
      }
    }

    res.json({
      success: result.success,
      message: result.message,
      broker: result.broker,
      balance: result.balance
    });
  } catch (error) {
    console.error('[BrokerAPI] Error testing configured broker:', error);
    return sendError(res, 'Connection test failed. Please try again.', 500, {
      details: error.message
    });
  }
});

/**
 * POST /api/brokers/configure
 * Save broker configuration for the authenticated user
 */
router.post('/configure', ensureAuthenticated, requirePremiumBroker, checkBrokerLimit, async (req, res) => {
  try {
    const { brokerKey, brokerType, authMethod, credentials, environment } = req.body;
    const userId = req.user.id;

    if (!brokerKey || !brokerType || !authMethod || !credentials) {
      return sendValidationError(res, 'Missing required fields: brokerKey, brokerType, authMethod, credentials');
    }

    // Apply default values for Moomoo credentials
    if (brokerKey === 'moomoo') {
      if (!credentials.host) {
        credentials.host = '127.0.0.1';
      }
      if (!credentials.port) {
        credentials.port = 11111;
      }
    }

    // Validate credentials
    const validation = BrokerFactory.validateCredentials(brokerKey, credentials);
    if (!validation.valid) {
      return sendValidationError(res, 'Invalid credentials', validation.errors);
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User');
    }

    // Ensure user has a communityId for encryption
    if (!user.communityId) {
      return sendValidationError(res, 'User must be associated with a community to store broker credentials');
    }

    // Initialize brokerConfigs if not exists
    if (!user.brokerConfigs) {
      user.brokerConfigs = new Map();
    }

    // Check if this is a reconnection (before saving)
    const isReconnection = hasBrokerConfig(user.brokerConfigs, brokerKey);

    // Encrypt credentials before storing
    const encryptionService = getEncryptionService();
    let encryptedCredentials;

    try {
      encryptedCredentials = await encryptionService.encryptCredential(user.communityId.toString(), credentials);
    } catch (error) {
      console.error('[BrokerAPI] Failed to encrypt credentials:', error);
      return sendError(res, 'Failed to encrypt credentials', 500, {
        message: 'Encryption service error. Please check AWS KMS configuration.'
      });
    }

    // Store broker configuration with encrypted credentials
    setBrokerConfig(user.brokerConfigs, brokerKey, {
      brokerKey,
      brokerType,
      authMethod,
      environment: environment || 'testnet',
      credentials: encryptedCredentials, // Encrypted with AWS KMS
      configuredAt: new Date(),
      lastVerified: new Date()
    });

    await user.save();

    // Track broker connection event
    await analyticsEventService.trackBrokerConnected(
      user._id,
      {
        broker: brokerKey,
        accountType: brokerType,
        isReconnection: isReconnection
      },
      req
    );

    // Get broker info for response
    const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

    res.json({
      success: true,
      message: `${brokerInfo?.name || brokerKey} configuration saved successfully`,
      broker: {
        key: brokerKey,
        type: brokerType,
        environment: environment || 'testnet'
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error saving configuration:', error);
    return sendError(res, error.message);
  }
});

/**
 * GET /api/brokers/user/configured
 * Get all configured brokers for the authenticated user
 *
 * NOTE: Credentials are encrypted in database and NOT returned to client.
 * TODO: When implementing user-specific broker execution, decrypt credentials here:
 *   const encryptionService = getEncryptionService();
 *   const decryptedCreds = await encryptionService.decryptCredential(
 *     user.communityId.toString(),
 *     config.credentials
 *   );
 *   Then pass to TradeExecutor.addBroker() or BrokerFactory.createBroker()
 */
router.get('/user/configured', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User');
    }

    const configuredBrokers = user.brokerConfigs || {};

    // Map to include broker info
    const brokerKeys = getBrokerKeys(configuredBrokers);
    const brokersWithInfo = brokerKeys.map(brokerKey => {
      const config = getBrokerConfig(configuredBrokers, brokerKey);
      const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

      return {
        key: brokerKey,
        name: brokerInfo?.name || brokerKey,
        type: config.brokerType,
        environment: config.environment,
        authMethod: config.authMethod,
        configuredAt: config.configuredAt,
        lastVerified: config.lastVerified
      };
    });

    res.json({
      success: true,
      brokers: brokersWithInfo
    });
  } catch (error) {
    console.error('[BrokerAPI] Error fetching configured brokers:', error);
    return sendError(res, error.message);
  }
});

/**
 * DELETE /api/brokers/user/:brokerKey
 * Remove broker configuration for the authenticated user
 */
router.delete('/user/:brokerKey', ensureAuthenticated, async (req, res) => {
  try {
    const { brokerKey } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User');
    }

    if (!hasBrokerConfig(user.brokerConfigs, brokerKey)) {
      return res.status(404).json({
        success: false,
        error: 'BROKER_NOT_CONFIGURED',
        message: `Broker '${brokerKey}' is not configured`
      });
    }

    // Get broker info before removing
    const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

    // Remove broker configuration
    deleteBrokerConfig(user.brokerConfigs, brokerKey);
    await user.save();

    res.json({
      success: true,
      message: `${brokerInfo?.name || brokerKey} disconnected successfully`
    });
  } catch (error) {
    console.error('[BrokerAPI] Error removing broker config:', error);
    return sendError(res, error.message);
  }
});

/**
 * POST /api/brokers/compare
 * Compare broker fees for a specific trade
 * Compares fees across all configured brokers for the user
 */
router.post('/compare', ensureAuthenticated, async (req, res) => {
  try {
    const { symbol, quantity, side } = req.body;
    const userId = req.user.id;

    if (!symbol || !quantity || !side) {
      return sendValidationError(res, 'symbol, quantity, and side are required');
    }

    // Find user to get configured brokers
    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User');
    }

    // Get user's configured broker keys
    const configuredBrokerKeys = getBrokerKeys(user.brokerConfigs);

    if (configuredBrokerKeys.length === 0) {
      return res.json({
        success: true,
        comparison: {
          symbol,
          quantity,
          brokers: [],
          message: 'No brokers configured for comparison'
        }
      });
    }

    // Call BrokerFactory to compare fees
    const comparison = await BrokerFactory.compareFeesForSymbol(
      symbol,
      quantity,
      side,
      configuredBrokerKeys
    );

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    console.error('[BrokerAPI] Error comparing fees:', error);
    return sendError(res, error.message);
  }
});

/**
 * POST /api/brokers/recommend
 * Get broker recommendation based on requirements
 */
router.post('/recommend', ensureAuthenticated, (req, res) => {
  try {
    const { requirements } = req.body;

    if (!requirements || typeof requirements !== 'object') {
      return sendValidationError(res, 'Requirements object is required');
    }

    const recommended = BrokerFactory.getRecommendedBroker(requirements);

    if (!recommended) {
      return res.json({
        success: true,
        recommended: null,
        message: 'No brokers match your requirements'
      });
    }

    res.json({
      success: true,
      recommended: {
        key: recommended.key,
        name: recommended.name,
        type: recommended.type,
        status: recommended.status,
        score: recommended.score,
        reason: recommended.reason,
        features: recommended.features
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error getting recommendation:', error);
    return sendError(res, error.message);
  }
});

module.exports = router;
