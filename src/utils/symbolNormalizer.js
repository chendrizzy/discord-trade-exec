/**
 * Centralized Symbol Normalization Utility
 *
 * Provides consistent symbol normalization across all broker adapters.
 * Eliminates duplication of symbol formatting logic (~24-32 lines saved).
 *
 * Architecture:
 * - Broker-specific normalization strategies
 * - Centralized normalization method
 * - Support for stock and crypto symbol formats
 *
 * Usage:
 *   const SymbolNormalizer = require('../utils/symbolNormalizer');
 *   const normalizedSymbol = SymbolNormalizer.normalize(symbol, 'alpaca');
 */
class SymbolNormalizer {
  /**
   * Broker-specific normalization strategies
   */
  static STRATEGIES = {
    /**
     * Alpaca Stock Broker
     * Simple symbols: AAPL, TSLA, etc.
     * Removes slashes, converts to uppercase
     */
    alpaca: (symbol) => {
      return symbol.replace('/', '').toUpperCase();
    },

    /**
     * Charles Schwab Stock Broker
     * Simple symbols: AAPL, TSLA, etc.
     * Removes slashes, converts to uppercase
     */
    schwab: (symbol) => {
      return symbol.replace('/', '').toUpperCase();
    },

    /**
     * TD Ameritrade Stock Broker
     * Simple symbols: AAPL, TSLA, etc.
     * Removes slashes, converts to uppercase
     */
    tdameritrade: (symbol) => {
      return symbol.replace('/', '').toUpperCase();
    },

    /**
     * E*TRADE Stock Broker
     * Simple symbols: AAPL, TSLA, etc.
     * Removes slashes, converts to uppercase
     */
    etrade: (symbol) => {
      return symbol.replace('/', '').toUpperCase();
    },

    /**
     * WeBull Stock Broker
     * Strict alphanumeric symbols: AAPL, TSLA, etc.
     * Removes all non-alphanumeric characters, converts to uppercase
     */
    webull: (symbol) => {
      return symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    },

    /**
     * Binance Crypto Exchange
     * Crypto pair symbols: BTC/USDT, ETH/USDT, etc.
     * Simple uppercase conversion
     */
    binance: (symbol) => {
      return symbol.toUpperCase();
    },

    /**
     * Kraken Crypto Exchange
     * Uses BTC/USD format (no USDT pairs, use USD instead)
     * Converts USDT to USD for Kraken compatibility
     * Also converts BTCUSDT format to BTC/USD format
     */
    kraken: (symbol) => {
      if (symbol.includes('/')) {
        // Replace USDT with USD for Kraken
        return symbol.replace('/USDT', '/USD');
      }

      // Convert BTCUSDT -> BTC/USD
      const match = symbol.match(/^([A-Z]{3,5})(USDT?|USD)$/);
      if (match) {
        return `${match[1]}/USD`;
      }

      return symbol;
    },

    /**
     * Coinbase Pro Crypto Exchange
     * Uses BTC/USD format
     * Converts USDT to USD for Coinbase Pro compatibility
     * Also converts BTCUSDT format to BTC/USD format
     */
    coinbasepro: (symbol) => {
      if (symbol.includes('/')) {
        // Replace USDT with USD for Coinbase Pro
        return symbol.replace('/USDT', '/USD');
      }

      // Convert BTCUSDT -> BTC/USD
      const match = symbol.match(/^([A-Z]{3,5})(USDT?|USD)$/);
      if (match) {
        return `${match[1]}/USD`;
      }

      return symbol;
    }
  };

  /**
   * Normalize symbol to broker-specific format
   *
   * @param {string} symbol - Raw symbol to normalize
   * @param {string} brokerName - Broker identifier (alpaca, schwab, binance, etc.)
   * @returns {string} Broker-specific normalized symbol
   *
   * @example
   * SymbolNormalizer.normalize('AAPL/USD', 'alpaca');    // Returns: 'AAPL'
   * SymbolNormalizer.normalize('btc/usdt', 'binance');   // Returns: 'BTC/USDT'
   * SymbolNormalizer.normalize('BTC/USDT', 'kraken');    // Returns: 'BTC/USD'
   */
  static normalize(symbol, brokerName) {
    const strategy = this.STRATEGIES[brokerName];

    if (!strategy) {
      throw new Error(`Unknown broker: ${brokerName}. Cannot normalize symbol.`);
    }

    return strategy(symbol);
  }

  /**
   * Check if a broker is supported
   *
   * @param {string} brokerName - Broker identifier to check
   * @returns {boolean} True if broker is supported
   *
   * @example
   * SymbolNormalizer.isSupported('alpaca');  // Returns: true
   * SymbolNormalizer.isSupported('invalid'); // Returns: false
   */
  static isSupported(brokerName) {
    return brokerName in this.STRATEGIES;
  }

  /**
   * Get all supported broker names
   *
   * @returns {string[]} Array of supported broker identifiers
   *
   * @example
   * SymbolNormalizer.getSupportedBrokers();
   * // Returns: ['alpaca', 'schwab', 'tdameritrade', 'etrade', 'webull', 'binance', 'kraken', 'coinbasepro']
   */
  static getSupportedBrokers() {
    return Object.keys(this.STRATEGIES);
  }
}

module.exports = SymbolNormalizer;
