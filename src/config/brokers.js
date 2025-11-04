/**
 * Broker Configuration
 * Defines broker capabilities, deployment modes, and compatibility
 */

const BROKER_METADATA = {
  // ========================================
  // MULTI-USER COMPATIBLE BROKERS
  // ========================================

  alpaca: {
    name: 'Alpaca',
    type: 'stock',
    apiType: 'REST',
    authMethod: 'API Key / OAuth 2.0',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://docs.alpaca.markets',
    features: ['stocks', 'options', 'crypto', 'paper-trading'],
    approvalRequired: false,
    approvalTimeline: 'Instant (sandbox), 1-3 days (live KYC)'
  },

  schwab: {
    name: 'Charles Schwab',
    type: 'stock',
    apiType: 'REST',
    authMethod: 'OAuth 2.0',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://developer.schwab.com',
    features: ['stocks', 'options', 'mutual-funds'],
    approvalRequired: true,
    approvalTimeline: '3-7 business days'
  },

  binance: {
    name: 'Binance',
    type: 'crypto',
    apiType: 'REST',
    authMethod: 'API Key',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://binance-docs.github.io/apidocs/spot/en/',
    features: ['crypto-spot', 'crypto-futures', 'margin'],
    approvalRequired: false,
    approvalTimeline: 'Instant'
  },

  kraken: {
    name: 'Kraken',
    type: 'crypto',
    apiType: 'REST',
    authMethod: 'API Key',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://docs.kraken.com/rest/',
    features: ['crypto-spot', 'margin', 'futures'],
    approvalRequired: false,
    approvalTimeline: 'Instant'
  },

  coinbase: {
    name: 'Coinbase Advanced Trade',
    type: 'crypto',
    apiType: 'REST',
    authMethod: 'JWT (API Key)',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://docs.cdp.coinbase.com/advanced-trade/docs/welcome',
    features: ['crypto-spot'],
    approvalRequired: false,
    approvalTimeline: 'Instant'
  },

  etrade: {
    name: 'E*TRADE',
    type: 'stock',
    apiType: 'REST',
    authMethod: 'OAuth 1.0a',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://developer.etrade.com',
    features: ['stocks', 'options', 'mutual-funds'],
    approvalRequired: true,
    approvalTimeline: '2-3 days (sandbox), 5-10 days (production)',
    notes: 'Production requires vendor demo with E*TRADE legal team'
  },

  webull: {
    name: 'WeBull',
    type: 'stock',
    apiType: 'REST',
    authMethod: 'OAuth 2.0',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://developer.webull.com',
    features: ['stocks', 'options', 'crypto'],
    approvalRequired: true,
    approvalTimeline: '1-2 business days'
  },

  tdameritrade: {
    name: 'TD Ameritrade',
    type: 'stock',
    apiType: 'REST',
    authMethod: 'OAuth 2.0',
    deploymentMode: 'multi-user',
    requiresLocalGateway: false,
    documentation: 'https://developer.tdameritrade.com',
    features: ['stocks', 'options', 'futures'],
    approvalRequired: true,
    approvalTimeline: 'N/A - Merged into Schwab',
    notes: 'New registrations disabled. Existing users can continue using.'
  },

  // ========================================
  // SINGLE-USER ONLY BROKERS
  // ========================================

  ibkr: {
    name: 'Interactive Brokers',
    type: 'stock',
    apiType: 'Socket (TWS API)',
    authMethod: 'Manual Login (TWS/IB Gateway)',
    deploymentMode: 'single-user-only',
    requiresLocalGateway: true,
    gatewayProcess: 'TWS or IB Gateway',
    gatewayPort: 7496,
    gatewayPortPaper: 7497,
    documentation: 'https://interactivebrokers.github.io/tws-api/',
    features: ['stocks', 'options', 'futures', 'forex', 'bonds', 'global-markets'],
    approvalRequired: false,
    approvalTimeline: 'Instant (enable in TWS settings)',
    warning: '⚠️ IBKR requires IB Gateway running locally. Only suitable for single-user deployments where the bot runs on the same machine as the Gateway.',
    multiUserAlternative: 'OAuth 2.0 available for institutional accounts only'
  },

  moomoo: {
    name: 'Moomoo',
    type: 'stock',
    apiType: 'WebSocket (OpenD Gateway)',
    authMethod: 'Manual Login (OpenD Gateway)',
    deploymentMode: 'single-user-only',
    requiresLocalGateway: true,
    gatewayProcess: 'moomoo OpenD',
    gatewayPort: 33333,
    documentation: 'https://openapi.moomoo.com/moomoo-api-doc/en/',
    features: ['stocks', 'options', 'us-markets', 'hk-markets'],
    approvalRequired: true,
    approvalTimeline: 'Requires API questionnaire completion',
    warning: '⚠️ Moomoo requires OpenD Gateway running locally. Only suitable for single-user deployments where the bot runs on the same machine as OpenD.',
    multiUserAlternative: 'None available'
  }
};

/**
 * Get brokers compatible with deployment mode
 * @param {string} mode - 'multi-user' or 'single-user'
 * @returns {string[]} Array of compatible broker IDs
 */
function getBrokersForDeploymentMode(mode) {
  return Object.entries(BROKER_METADATA)
    .filter(([_, config]) => {
      if (mode === 'multi-user') {
        return config.deploymentMode === 'multi-user';
      }
      return true; // single-user mode supports all brokers
    })
    .map(([id]) => id);
}

/**
 * Get brokers by type
 * @param {string} type - 'stock' or 'crypto'
 * @param {string} mode - Optional deployment mode filter
 * @returns {string[]} Array of broker IDs
 */
function getBrokersByType(type, mode = null) {
  return Object.entries(BROKER_METADATA)
    .filter(([_, config]) => {
      const typeMatch = config.type === type;
      const modeMatch = mode ? (mode === 'multi-user' ? config.deploymentMode === 'multi-user' : true) : true;
      return typeMatch && modeMatch;
    })
    .map(([id]) => id);
}

/**
 * Validate broker selection for deployment mode
 * @param {string} brokerId - Broker identifier
 * @param {string} mode - Deployment mode
 * @throws {Error} If broker incompatible with mode
 */
function validateBrokerDeploymentMode(brokerId, mode) {
  const config = BROKER_METADATA[brokerId];

  if (!config) {
    throw new Error(`Unknown broker: ${brokerId}`);
  }

  if (mode === 'multi-user' && config.deploymentMode === 'single-user-only') {
    throw new Error(
      `${config.name} (${brokerId}) requires local ${config.gatewayProcess} and only supports single-user deployments.\n\n` +
      `Problem: ${config.name} API connects to localhost:${config.gatewayPort}, expecting a Gateway process running on the same machine. ` +
      `In a multi-user Discord bot architecture, the Gateway would need to run on the bot server with manual login for each user, which is not scalable.\n\n` +
      `For multi-user Discord bots, use one of these brokers instead:\n` +
      getBrokersForDeploymentMode('multi-user').map(id => `  - ${BROKER_METADATA[id].name} (${id})`).join('\n') +
      `\n\nIf you need ${config.name} specifically, deploy as a single-user bot on your own machine with ${config.gatewayProcess} running locally.`
    );
  }
}

/**
 * Check if broker requires local gateway
 * @param {string} brokerId - Broker identifier
 * @returns {boolean}
 */
function requiresLocalGateway(brokerId) {
  const config = BROKER_METADATA[brokerId];
  return config ? config.requiresLocalGateway : false;
}

/**
 * Get broker configuration
 * @param {string} brokerId - Broker identifier
 * @returns {Object|null} Broker configuration
 */
function getBrokerConfig(brokerId) {
  return BROKER_METADATA[brokerId] || null;
}

/**
 * Get all broker IDs
 * @returns {string[]} Array of all broker IDs
 */
function getAllBrokers() {
  return Object.keys(BROKER_METADATA);
}

/**
 * Get multi-user compatible brokers (default for Discord bots)
 * @returns {string[]} Array of multi-user compatible broker IDs
 */
function getMultiUserBrokers() {
  return getBrokersForDeploymentMode('multi-user');
}

/**
 * Get single-user only brokers
 * @returns {string[]} Array of single-user only broker IDs
 */
function getSingleUserOnlyBrokers() {
  return Object.entries(BROKER_METADATA)
    .filter(([_, config]) => config.deploymentMode === 'single-user-only')
    .map(([id]) => id);
}

module.exports = {
  BROKER_METADATA,
  getBrokersForDeploymentMode,
  getBrokersByType,
  validateBrokerDeploymentMode,
  requiresLocalGateway,
  getBrokerConfig,
  getAllBrokers,
  getMultiUserBrokers,
  getSingleUserOnlyBrokers
};
