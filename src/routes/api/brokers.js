const express = require('express');
const router = express.Router();
const { BrokerFactory } = require('../../brokers');
const User = require('../../models/User');

/**
 * Middleware to ensure user is authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: 'Authentication required'
  });
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
        description: broker.description || `Trade ${broker.type === 'stock' ? 'stocks and ETFs' : 'cryptocurrencies'} with ${broker.name}`,
        features: broker.features,
        authMethods: broker.authMethods,
        markets: broker.markets,
        accountTypes: broker.accountTypes,
      })),
      stats: BrokerFactory.getStats()
    });
  } catch (error) {
    console.error('[BrokerAPI] Error listing brokers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(404).json({
        success: false,
        error: `Broker '${brokerKey}' not found`
      });
    }

    res.json({
      success: true,
      broker: {
        key: broker.key,
        name: broker.name,
        type: broker.type,
        status: broker.status,
        description: broker.description || `Trade ${broker.type === 'stock' ? 'stocks and ETFs' : 'cryptocurrencies'} with ${broker.name}`,
        features: broker.features,
        authMethods: broker.authMethods,
        markets: broker.markets,
        accountTypes: broker.accountTypes,
        docs: broker.docs,
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error fetching broker info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(400).json({
        success: false,
        error: 'Broker key is required'
      });
    }

    if (!credentials || Object.keys(credentials).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Credentials are required'
      });
    }

    // Validate credentials format
    const validation = BrokerFactory.validateCredentials(brokerKey, credentials);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials',
        validationErrors: validation.errors
      });
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
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Connection test failed. Please check your credentials and try again.'
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
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: brokerKey, brokerType, authMethod, credentials'
      });
    }

    // Validate credentials
    const validation = BrokerFactory.validateCredentials(brokerKey, credentials);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials',
        validationErrors: validation.errors
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Initialize brokerConfigs if not exists
    if (!user.brokerConfigs) {
      user.brokerConfigs = {};
    }

    // Store broker configuration (encrypt credentials in production)
    user.brokerConfigs[brokerKey] = {
      brokerKey,
      brokerType,
      authMethod,
      environment: environment || 'testnet',
      credentials, // TODO: Encrypt credentials before storing
      configuredAt: new Date(),
      lastVerified: new Date(),
    };

    await user.save();

    res.json({
      success: true,
      message: 'Broker configuration saved successfully',
      broker: {
        key: brokerKey,
        type: brokerType,
        environment: environment || 'testnet',
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error saving configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/brokers/user/configured
 * Get all configured brokers for the authenticated user
 */
router.get('/user/configured', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
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
        lastVerified: config.lastVerified,
      };
    });

    res.json({
      success: true,
      brokers: brokersWithInfo
    });
  } catch (error) {
    console.error('[BrokerAPI] Error fetching configured brokers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.brokerConfigs || !user.brokerConfigs[brokerKey]) {
      return res.status(404).json({
        success: false,
        error: `Broker '${brokerKey}' is not configured`
      });
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
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(400).json({
        success: false,
        error: 'At least 2 broker keys required for comparison'
      });
    }

    const comparison = BrokerFactory.compareBrokers(brokerKeys);

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    console.error('[BrokerAPI] Error comparing brokers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      return res.status(400).json({
        success: false,
        error: 'Requirements object is required'
      });
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
        features: recommended.features,
      }
    });
  } catch (error) {
    console.error('[BrokerAPI] Error getting recommendation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
