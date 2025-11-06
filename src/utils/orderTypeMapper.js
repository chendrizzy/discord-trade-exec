/**
 * Centralized Order Type Mapping Utility
 *
 * Provides consistent order type mapping across all broker adapters.
 * Eliminates duplication of type mapping logic (~100-120 lines saved).
 *
 * Architecture:
 * - Standard order type constants (MARKET, LIMIT, STOP, etc.)
 * - Broker-specific mapping registries
 * - Centralized mapping method with fallback
 *
 * Usage:
 *   const OrderTypeMapper = require('../utils/orderTypeMapper');
 *   const brokerType = OrderTypeMapper.mapType(standardType, 'alpaca');
 */
class OrderTypeMapper {
  /**
   * Standard order types used across all adapters
   */
  static STANDARD_TYPES = {
    MARKET: 'MARKET',
    LIMIT: 'LIMIT',
    STOP: 'STOP',
    STOP_LIMIT: 'STOP_LIMIT',
    TRAILING_STOP: 'TRAILING_STOP'
  };

  /**
   * Broker-specific order type mappings
   * Maps standard types to broker-native formats
   */
  static BROKER_MAPPINGS = {
    /**
     * Alpaca Stock Broker
     * Uses lowercase format
     */
    alpaca: {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP: 'stop',
      STOP_LIMIT: 'stop_limit',
      TRAILING_STOP: 'trailing_stop'
    },

    /**
     * Charles Schwab Stock Broker
     * Uses uppercase format
     */
    schwab: {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP'
    },

    /**
     * TD Ameritrade Stock Broker
     * Uses uppercase format
     */
    tdameritrade: {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP'
    },

    /**
     * E*TRADE Stock Broker
     * Uses uppercase format with special TRAILING_STOP_CNST
     */
    etrade: {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'TRAILING_STOP_CNST'
    },

    /**
     * WeBull Stock Broker
     * Uses uppercase format (no native trailing stops)
     */
    webull: {
      MARKET: 'MARKET',
      LIMIT: 'LIMIT',
      STOP: 'STOP',
      STOP_LIMIT: 'STOP_LIMIT',
      TRAILING_STOP: 'STOP' // WeBull doesn't have native trailing stops
    },

    /**
     * Interactive Brokers (IBKR)
     * Uses abbreviated format
     */
    ibkr: {
      MARKET: 'MKT',
      LIMIT: 'LMT',
      STOP: 'STP',
      STOP_LIMIT: 'STP LMT',
      TRAILING_STOP: 'TRAIL'
    },

    /**
     * Moomoo Stock Broker
     * Uses numeric format
     */
    moomoo: {
      MARKET: 1,
      LIMIT: 2,
      STOP: 3,
      STOP_LIMIT: 4,
      TRAILING_STOP: 7
    },

    /**
     * Binance Crypto Exchange
     * Uses lowercase format with special stop_loss variants
     */
    binance: {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP: 'stop_loss',
      STOP_LIMIT: 'stop_loss_limit',
      TRAILING_STOP: 'trailing_stop_market'
    }
  };

  /**
   * Default fallback values per broker
   * Used when order type is not in mapping
   */
  static BROKER_DEFAULTS = {
    alpaca: 'market',
    schwab: 'MARKET',
    tdameritrade: 'MARKET',
    etrade: 'MARKET',
    webull: 'MARKET',
    ibkr: 'MKT',
    moomoo: 1,
    binance: 'market'
  };

  /**
   * Map standard order type to broker-specific format
   *
   * @param {string} standardType - Standard order type (MARKET, LIMIT, STOP, etc.)
   * @param {string} brokerName - Broker identifier (alpaca, schwab, etc.)
   * @returns {string|number} Broker-specific order type format
   *
   * @example
   * OrderTypeMapper.mapType('MARKET', 'alpaca');  // Returns: 'market'
   * OrderTypeMapper.mapType('LIMIT', 'ibkr');     // Returns: 'LMT'
   * OrderTypeMapper.mapType('STOP', 'moomoo');    // Returns: 3
   */
  static mapType(standardType, brokerName) {
    const brokerMapping = this.BROKER_MAPPINGS[brokerName];

    if (!brokerMapping) {
      throw new Error(`Unknown broker: ${brokerName}. Cannot map order type.`);
    }

    // Return mapped type or default for this broker
    return brokerMapping[standardType] || this.BROKER_DEFAULTS[brokerName];
  }

  /**
   * Validate if a standard order type is recognized
   *
   * @param {string} type - Order type to validate
   * @returns {boolean} True if type is valid standard type
   *
   * @example
   * OrderTypeMapper.isValidType('MARKET');  // Returns: true
   * OrderTypeMapper.isValidType('INVALID'); // Returns: false
   */
  static isValidType(type) {
    return Object.keys(this.STANDARD_TYPES).includes(type);
  }

  /**
   * Get all supported order types for a specific broker
   *
   * @param {string} brokerName - Broker identifier
   * @returns {Object} Object mapping standard types to broker-specific formats
   *
   * @example
   * OrderTypeMapper.getBrokerTypes('alpaca');
   * // Returns: { MARKET: 'market', LIMIT: 'limit', ... }
   */
  static getBrokerTypes(brokerName) {
    const brokerMapping = this.BROKER_MAPPINGS[brokerName];

    if (!brokerMapping) {
      throw new Error(`Unknown broker: ${brokerName}`);
    }

    return { ...brokerMapping };
  }
}

module.exports = OrderTypeMapper;
