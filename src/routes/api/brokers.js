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
        accountTypes: broker.accountTypes
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
        docs: broker.docs
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
 * POST /api/brokers/configure
 * Save broker configuration for the authenticated user
 */
router.post('/configure', ensureAuthenticated, async (req, res) => {
  try {
    const { brokerKey, brokerType, authMethod, credentials, environment } = req.body;
    const userId = req.user.id;

    if (!brokerKey || !brokerType || !authMethod || !credentials) {
      return sendValidationError(res, 'Missing required fields: brokerKey, brokerType, authMethod, credentials');
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
      user.brokerConfigs = {};
    }

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
    user.brokerConfigs[brokerKey] = {
      brokerKey,
      brokerType,
      authMethod,
      environment: environment || 'testnet',
      credentials: encryptedCredentials, // Encrypted with AWS KMS
      configuredAt: new Date(),
      lastVerified: new Date()
    };

    await user.save();

    // Track broker connection event
    await analyticsEventService.trackBrokerConnected(
      user._id,
      {
        broker: brokerKey,
        accountType: brokerType,
        isReconnection: !!user.brokerConfigs[brokerKey]?.lastVerified
      },
      req
    );

    res.json({
      success: true,
      message: 'Broker configuration saved successfully',
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
    const brokersWithInfo = Object.keys(configuredBrokers).map(brokerKey => {
      const config = configuredBrokers[brokerKey];
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

    if (!user.brokerConfigs || !user.brokerConfigs[brokerKey]) {
      return sendNotFound(res, `Broker '${brokerKey}' configuration`);
    }

    // Remove broker configuration
    delete user.brokerConfigs[brokerKey];
    await user.save();

    res.json({
      success: true,
      message: 'Broker configuration removed successfully'
    });
  } catch (error) {
    console.error('[BrokerAPI] Error removing broker config:', error);
    return sendError(res, error.message);
  }
});

/**
 * POST /api/brokers/compare
 * Compare multiple brokers side-by-side
 */
router.post('/compare', ensureAuthenticated, (req, res) => {
  try {
    const { brokerKeys } = req.body;

    if (!brokerKeys || !Array.isArray(brokerKeys) || brokerKeys.length < 2) {
      return sendValidationError(res, 'At least 2 broker keys required for comparison');
    }

    const comparison = BrokerFactory.compareBrokers(brokerKeys);

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    console.error('[BrokerAPI] Error comparing brokers:', error);
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
