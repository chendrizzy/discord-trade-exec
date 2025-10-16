// Internal utilities and services
const AlpacaAdapter = require('./adapters/AlpacaAdapter');
const IBKRAdapter = require('./adapters/IBKRAdapter');
// MoomooAdapter uses ES Module (moomoo-api), loaded dynamically when needed
// const MoomooAdapter = require('./adapters/MoomooAdapter');
const SchwabAdapter = require('./adapters/SchwabAdapter');
const CoinbaseProAdapter = require('./adapters/CoinbaseProAdapter');
const KrakenAdapter = require('./adapters/KrakenAdapter');

/**
 * BrokerFactory - Central factory for creating and managing broker adapters
 * Supports multiple stock and crypto brokers with unified interface
 */
class BrokerFactory {
  constructor() {
    // Registry of available broker adapters
    this.brokers = new Map();

    // Register stock brokers
    this.registerBroker('alpaca', {
      name: 'Alpaca',
      type: 'stock',
      class: AlpacaAdapter,
      features: ['stocks', 'etfs', 'commission-free', 'oauth', 'paper-trading'],
      description: 'Commission-free stock & ETF trading with OAuth support',
      authMethods: ['oauth', 'api-key'],
      websiteUrl: 'https://alpaca.markets',
      docsUrl: 'https://docs.alpaca.markets',
      minDeposit: 0,
      accountTypes: ['individual', 'ira', 'margin'],
      markets: ['US'],
      dataFeedOptions: ['IEX', 'SIP']
    });

    // Interactive Brokers (IBKR) - Professional trading platform
    this.registerBroker('ibkr', {
      name: 'Interactive Brokers',
      type: 'stock',
      class: IBKRAdapter,
      features: ['stocks', 'options', 'futures', 'forex', 'bonds', 'global-markets'],
      description: 'Professional trading platform with global market access',
      authMethods: ['api-key'],
      websiteUrl: 'https://www.interactivebrokers.com',
      docsUrl: 'https://interactivebrokers.github.io',
      minDeposit: 0,
      accountTypes: ['individual', 'ira', 'margin', 'joint'],
      markets: ['US', 'Europe', 'Asia', 'Canada']
    });

    this.registerBroker('schwab', {
      name: 'Charles Schwab',
      type: 'stock',
      class: SchwabAdapter,
      features: ['stocks', 'options', 'etfs', 'futures', 'commission-free', 'oauth', 'paper-trading'],
      description: 'Full-service broker with trading API (TD Ameritrade successor)',
      authMethods: ['oauth'],
      websiteUrl: 'https://www.schwab.com',
      docsUrl: 'https://developer.schwab.com',
      minDeposit: 0,
      accountTypes: ['individual', 'ira', 'margin', 'joint'],
      markets: ['US'],
      apiFeatures: ['oauth-refresh-token', '7-day-token-expiry', 'options-trading', 'futures-trading']
    });

    // Moomoo - Modern mobile-first trading platform
    // Note: MoomooAdapter is lazy-loaded due to ES Module dependency
    this.registerBroker('moomoo', {
      name: 'Moomoo',
      type: 'stock',
      class: null, // Loaded dynamically when needed
      features: ['stocks', 'options', 'etfs', 'futures', 'commission-free', 'paper-trading', 'mobile-first'],
      description: 'Modern mobile-first trading platform with comprehensive OpenAPI',
      authMethods: ['api-key'],
      websiteUrl: 'https://www.moomoo.com',
      docsUrl: 'https://openapi.moomoo.com/moomoo-api-doc/en/',
      minDeposit: 0,
      accountTypes: ['individual', 'margin'],
      markets: ['US', 'HK', 'China'],
      apiFeatures: ['gateway-required', 'multi-language-sdk', 'real-time-quotes', 'paper-trading']
    });

    // Coinbase Pro (Advanced Trade)
    this.registerBroker('coinbasepro', {
      name: 'Coinbase Pro',
      type: 'crypto',
      class: CoinbaseProAdapter,
      features: ['crypto', 'advanced-trading', 'api-trading', 'sandbox', 'spot-trading'],
      description: 'Advanced cryptocurrency exchange with API trading (formerly GDAX)',
      authMethods: ['api-key'],
      websiteUrl: 'https://pro.coinbase.com',
      docsUrl: 'https://docs.cloud.coinbase.com/exchange',
      minDeposit: 0,
      accountTypes: ['individual'],
      markets: ['Global'],
      fees: { maker: 0.005, taker: 0.005 },
      minTradeAmount: 10,
      apiFeatures: ['sandbox-environment', 'stop-orders', 'limit-orders', 'market-orders']
    });

    // Kraken
    this.registerBroker('kraken', {
      name: 'Kraken',
      type: 'crypto',
      class: KrakenAdapter,
      features: ['crypto', 'margin-trading', 'futures', 'staking', 'spot-trading', 'advanced-orders'],
      description: 'Secure cryptocurrency exchange with advanced trading features and futures',
      authMethods: ['api-key'],
      websiteUrl: 'https://www.kraken.com',
      docsUrl: 'https://docs.kraken.com/rest/',
      minDeposit: 0,
      accountTypes: ['individual'],
      markets: ['Global'],
      fees: { maker: 0.0016, taker: 0.0026 },
      minTradeAmount: 10,
      apiFeatures: ['advanced-orders', 'stop-loss', 'take-profit', 'futures-trading', 'margin-trading']
    });
  }

  /**
   * Register a broker adapter
   * @param {string} brokerKey - Unique identifier for the broker
   * @param {Object} brokerInfo - Broker metadata and class
   */
  registerBroker(brokerKey, brokerInfo) {
    this.brokers.set(brokerKey, {
      key: brokerKey,
      ...brokerInfo,
      status: brokerInfo.status || (brokerInfo.class ? 'available' : 'planned')
    });
  }

  /**
   * Create a broker adapter instance
   * @param {string} brokerKey - Broker identifier (e.g., 'alpaca', 'ibkr')
   * @param {Object} credentials - Authentication credentials
   * @param {Object} options - Additional options (e.g., { isTestnet: true })
   * @returns {BrokerAdapter} - Initialized broker adapter instance
   */
  createBroker(brokerKey, credentials, options = {}) {
    const brokerInfo = this.brokers.get(brokerKey);

    if (!brokerInfo) {
      throw new Error(`Unknown broker: ${brokerKey}. Available brokers: ${this.getAvailableBrokerKeys().join(', ')}`);
    }

    // Lazy-load MoomooAdapter if needed (ES Module compatibility)
    if (brokerKey === 'moomoo' && !brokerInfo.class) {
      brokerInfo.class = require('./adapters/MoomooAdapter');
    }

    if (!brokerInfo.class) {
      throw new Error(`Broker ${brokerKey} (${brokerInfo.name}) is not yet implemented. Status: ${brokerInfo.status}`);
    }

    // Create instance of the broker adapter
    const BrokerClass = brokerInfo.class;
    return new BrokerClass(credentials, options);
  }

  /**
   * Get list of all registered brokers
   * @param {Object} filters - Optional filters
   * @param {string} filters.type - Filter by type ('stock' or 'crypto')
   * @param {string} filters.status - Filter by status ('available' or 'planned')
   * @param {Array<string>} filters.features - Filter by features (e.g., ['oauth', 'options'])
   * @returns {Array<Object>} - Array of broker information objects
   */
  getBrokers(filters = {}) {
    let brokers = Array.from(this.brokers.values());

    // Filter by type
    if (filters.type) {
      brokers = brokers.filter(b => b.type === filters.type);
    }

    // Filter by status
    if (filters.status) {
      brokers = brokers.filter(b => b.status === filters.status);
    }

    // Filter by features
    if (filters.features && Array.isArray(filters.features)) {
      brokers = brokers.filter(b => filters.features.every(feature => b.features.includes(feature)));
    }

    return brokers;
  }

  /**
   * Get available broker keys (only implemented brokers)
   * @returns {Array<string>} - Array of broker keys
   */
  getAvailableBrokerKeys() {
    return this.getBrokers({ status: 'available' }).map(b => b.key);
  }

  /**
   * Get planned broker keys (not yet implemented)
   * @returns {Array<string>} - Array of broker keys
   */
  getPlannedBrokerKeys() {
    return this.getBrokers({ status: 'planned' }).map(b => b.key);
  }

  /**
   * Get broker information
   * @param {string} brokerKey - Broker identifier
   * @returns {Object} - Broker information
   */
  getBrokerInfo(brokerKey) {
    const info = this.brokers.get(brokerKey);
    if (!info) {
      throw new Error(`Unknown broker: ${brokerKey}`);
    }
    return info;
  }

  /**
   * Check if a broker is available (implemented)
   * @param {string} brokerKey - Broker identifier
   * @returns {boolean} - True if broker is available
   */
  isBrokerAvailable(brokerKey) {
    const info = this.brokers.get(brokerKey);
    return info && info.status === 'available';
  }

  /**
   * Get stock brokers
   * @param {boolean} availableOnly - Return only available brokers (default: true)
   * @returns {Array<Object>} - Array of stock broker information
   */
  getStockBrokers(availableOnly = true) {
    const filters = { type: 'stock' };
    if (availableOnly) {
      filters.status = 'available';
    }
    return this.getBrokers(filters);
  }

  /**
   * Get crypto brokers
   * @param {boolean} availableOnly - Return only available brokers (default: true)
   * @returns {Array<Object>} - Array of crypto broker information
   */
  getCryptoBrokers(availableOnly = true) {
    const filters = { type: 'crypto' };
    if (availableOnly) {
      filters.status = 'available';
    }
    return this.getBrokers(filters);
  }

  /**
   * Get brokers supporting specific features
   * @param {Array<string>} features - Required features
   * @returns {Array<Object>} - Array of matching broker information
   */
  getBrokersByFeatures(features) {
    return this.getBrokers({ features, status: 'available' });
  }

  /**
   * Compare brokers side-by-side
   * @param {Array<string>} brokerKeys - Array of broker keys to compare
   * @returns {Object} - Comparison matrix
   */
  compareBrokers(brokerKeys) {
    const comparison = {
      brokers: [],
      comparison: {
        features: new Set(),
        markets: new Set(),
        accountTypes: new Set(),
        authMethods: new Set()
      }
    };

    brokerKeys.forEach(key => {
      const info = this.getBrokerInfo(key);
      comparison.brokers.push(info);

      // Collect all unique features, markets, etc.
      info.features?.forEach(f => comparison.comparison.features.add(f));
      info.markets?.forEach(m => comparison.comparison.markets.add(m));
      info.accountTypes?.forEach(a => comparison.comparison.accountTypes.add(a));
      info.authMethods?.forEach(m => comparison.comparison.authMethods.add(m));
    });

    // Convert Sets to Arrays for easier consumption
    comparison.comparison.features = Array.from(comparison.comparison.features);
    comparison.comparison.markets = Array.from(comparison.comparison.markets);
    comparison.comparison.accountTypes = Array.from(comparison.comparison.accountTypes);
    comparison.comparison.authMethods = Array.from(comparison.comparison.authMethods);

    return comparison;
  }

  /**
   * Get recommended broker based on user requirements
   * @param {Object} requirements - User requirements
   * @param {string} requirements.type - 'stock' or 'crypto'
   * @param {Array<string>} requirements.features - Required features
   * @param {Array<string>} requirements.markets - Required markets
   * @returns {Object} - Recommended broker info
   */
  getRecommendedBroker(requirements) {
    let candidates = this.getBrokers({
      type: requirements.type,
      status: 'available'
    });

    // Filter by required features
    if (requirements.features && requirements.features.length > 0) {
      candidates = candidates.filter(broker => requirements.features.every(f => broker.features.includes(f)));
    }

    // Filter by required markets
    if (requirements.markets && requirements.markets.length > 0) {
      candidates = candidates.filter(broker => requirements.markets.every(m => broker.markets?.includes(m)));
    }

    if (candidates.length === 0) {
      return null;
    }

    // Score brokers based on feature match
    const scoredCandidates = candidates.map(broker => {
      let score = 0;

      // More features = higher score
      score += broker.features.length;

      // Prefer zero/low minimum deposit
      if (broker.minDeposit === 0) score += 5;

      // Prefer OAuth support
      if (broker.authMethods?.includes('oauth')) score += 3;

      // Prefer commission-free
      if (broker.features.includes('commission-free')) score += 5;

      return { ...broker, score };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates[0];
  }

  /**
   * Validate credentials format for a broker
   * @param {string} brokerKey - Broker identifier
   * @param {Object} credentials - Credentials to validate
   * @returns {Object} - Validation result
   */
  validateCredentials(brokerKey, credentials) {
    const brokerInfo = this.getBrokerInfo(brokerKey);
    const result = {
      valid: true,
      errors: []
    };

    // Broker-specific validation
    switch (brokerKey) {
      case 'alpaca':
        if (!credentials.accessToken && (!credentials.apiKey || !credentials.apiSecret)) {
          result.valid = false;
          result.errors.push('Either accessToken (OAuth) or apiKey + apiSecret required');
        }
        break;

      case 'ibkr':
        if (!credentials.clientId && !process.env.IBKR_CLIENT_ID) {
          result.valid = false;
          result.errors.push('clientId required for IBKR connection');
        }
        if (!credentials.host && !process.env.IBKR_HOST) {
          result.valid = false;
          result.errors.push('host required for IBKR connection');
        }
        if (!credentials.port && !process.env.IBKR_PORT) {
          result.valid = false;
          result.errors.push('port required for IBKR connection');
        }
        break;

      case 'moomoo':
        if (!credentials.accountId && !process.env.MOOMOO_ID) {
          result.valid = false;
          result.errors.push('accountId required for Moomoo connection');
        }
        if (!credentials.password && !process.env.MOOMOO_PASSWORD) {
          result.valid = false;
          result.errors.push('password required for Moomoo connection');
        }
        if (!credentials.host && !process.env.MOOMOO_HOST) {
          result.valid = false;
          result.errors.push('host required for Moomoo OpenD gateway connection (default: 127.0.0.1)');
        }
        if (!credentials.port && !process.env.MOOMOO_PORT) {
          result.valid = false;
          result.errors.push('port required for Moomoo OpenD gateway connection (default: 11111)');
        }
        break;

      case 'schwab':
        if (!credentials.appKey && !credentials.clientId) {
          result.valid = false;
          result.errors.push('appKey (or clientId) required for Schwab OAuth');
        }
        if (!credentials.appSecret && !credentials.clientSecret) {
          result.valid = false;
          result.errors.push('appSecret (or clientSecret) required for Schwab OAuth');
        }
        if (!credentials.refreshToken) {
          result.valid = false;
          result.errors.push('refreshToken required for Schwab (complete OAuth flow first)');
        }
        break;

      case 'coinbasepro':
        if (!credentials.apiKey) {
          result.valid = false;
          result.errors.push('apiKey required for Coinbase Pro');
        }
        if (!credentials.apiSecret) {
          result.valid = false;
          result.errors.push('apiSecret required for Coinbase Pro');
        }
        if (!credentials.password) {
          result.valid = false;
          result.errors.push('password (API passphrase) required for Coinbase Pro');
        }
        break;

      case 'kraken':
        if (!credentials.apiKey) {
          result.valid = false;
          result.errors.push('apiKey required for Kraken');
        }
        if (!credentials.apiSecret) {
          result.valid = false;
          result.errors.push('apiSecret required for Kraken');
        }
        break;

      default:
        result.valid = false;
        result.errors.push('Unknown broker');
    }

    return result;
  }

  /**
   * Test broker connection with provided credentials
   * @param {string} brokerKey - Broker identifier
   * @param {Object} credentials - Authentication credentials
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Connection test result
   */
  async testConnection(brokerKey, credentials, options = {}) {
    const result = {
      success: false,
      broker: brokerKey,
      message: '',
      details: {}
    };

    try {
      // Create broker instance
      const broker = this.createBroker(brokerKey, credentials, options);

      // Attempt authentication
      const authenticated = await broker.authenticate();

      if (authenticated) {
        // Get account info to verify connection
        const balance = await broker.getBalance();

        result.success = true;
        result.message = `Successfully connected to ${broker.brokerName}`;
        result.details = {
          brokerName: broker.brokerName,
          brokerType: broker.brokerType,
          isTestnet: broker.isTestnet,
          balance: balance
        };
      } else {
        result.message = 'Authentication failed';
      }
    } catch (error) {
      result.success = false;
      result.message = error.message;
      result.error = error;
    }

    return result;
  }

  /**
   * Get factory statistics
   * @returns {Object} - Factory statistics
   */
  getStats() {
    const allBrokers = Array.from(this.brokers.values());

    return {
      total: allBrokers.length,
      available: allBrokers.filter(b => b.status === 'available').length,
      planned: allBrokers.filter(b => b.status === 'planned').length,
      stock: allBrokers.filter(b => b.type === 'stock').length,
      crypto: allBrokers.filter(b => b.type === 'crypto').length,
      brokers: {
        available: this.getAvailableBrokerKeys(),
        planned: this.getPlannedBrokerKeys()
      }
    };
  }
}

// Export singleton instance
module.exports = new BrokerFactory();
