/**
 * Centralized Order Status Mapping Utility
 *
 * Provides consistent order status mapping across all broker adapters.
 * Eliminates duplication of status mapping logic (~80-100 lines saved).
 *
 * Architecture:
 * - Standard status constants (PENDING, FILLED, CANCELLED, etc.)
 * - Broker-specific mapping registries
 * - Centralized mapping method with fallback
 *
 * Usage:
 *   const OrderStatusMapper = require('../utils/orderStatusMapper');
 *   const status = OrderStatusMapper.mapStatus(brokerStatus, 'alpaca');
 */
class OrderStatusMapper {
  /**
   * Standard order statuses used across all adapters
   */
  static STANDARD_STATUSES = {
    PENDING: 'PENDING',
    PARTIAL: 'PARTIAL',
    FILLED: 'FILLED',
    CANCELLED: 'CANCELLED',
    REJECTED: 'REJECTED',
    ACCEPTED: 'ACCEPTED',
    EXPIRED: 'EXPIRED',
    REPLACED: 'REPLACED',
    PENDING_CANCEL: 'PENDING_CANCEL',
    PENDING_REPLACE: 'PENDING_REPLACE',
    WORKING: 'WORKING',
    SUSPENDED: 'SUSPENDED',
    STOPPED: 'STOPPED',
    DONE: 'DONE',
    UNKNOWN: 'UNKNOWN'
  };

  /**
   * Broker-specific status mappings
   * Each broker maps its native statuses to standard statuses
   */
  static BROKER_MAPPINGS = {
    /**
     * CCXT library (unified crypto exchange API)
     * Used by: BinanceAdapter, KrakenAdapter, CoinbaseProAdapter
     */
    ccxt: {
      open: 'PENDING',
      closed: 'FILLED',
      canceled: 'CANCELLED',
      expired: 'CANCELLED',
      rejected: 'CANCELLED'
    },

    /**
     * Alpaca Stock Broker
     */
    alpaca: {
      new: 'PENDING',
      partially_filled: 'PARTIAL',
      filled: 'FILLED',
      done_for_day: 'DONE',
      canceled: 'CANCELLED',
      expired: 'EXPIRED',
      replaced: 'REPLACED',
      pending_cancel: 'PENDING_CANCEL',
      pending_replace: 'PENDING_REPLACE',
      accepted: 'ACCEPTED',
      pending_new: 'PENDING',
      accepted_for_bidding: 'ACCEPTED',
      stopped: 'STOPPED',
      rejected: 'REJECTED',
      suspended: 'SUSPENDED',
      calculated: 'PENDING',
      held: 'PENDING'
    },

    /**
     * E*TRADE Stock Broker
     */
    etrade: {
      OPEN: 'PENDING',
      EXECUTED: 'FILLED',
      CANCELLED: 'CANCELLED',
      INDIVIDUAL_FILLS: 'PARTIAL',
      CANCEL_REQUESTED: 'PENDING_CANCEL',
      EXPIRED: 'EXPIRED',
      REJECTED: 'REJECTED',
      PARTIAL: 'PARTIAL',
      DO_NOT_EXERCISE: 'DONE',
      DONE_TRADE_EXECUTED: 'FILLED'
    },

    /**
     * Interactive Brokers (IBKR)
     */
    ibkr: {
      PendingSubmit: 'PENDING',
      PendingCancel: 'PENDING',
      PreSubmitted: 'PENDING',
      Submitted: 'PENDING',
      Filled: 'FILLED',
      Cancelled: 'CANCELLED',
      Inactive: 'CANCELLED'
    },

    /**
     * Charles Schwab (successor to TD Ameritrade API)
     */
    schwab: {
      AWAITING_PARENT_ORDER: 'PENDING',
      AWAITING_CONDITION: 'PENDING',
      AWAITING_MANUAL_REVIEW: 'PENDING',
      ACCEPTED: 'ACCEPTED',
      AWAITING_UR_OUT: 'PENDING',
      PENDING_ACTIVATION: 'PENDING',
      QUEUED: 'PENDING',
      WORKING: 'WORKING',
      REJECTED: 'REJECTED',
      PENDING_CANCEL: 'PENDING_CANCEL',
      CANCELED: 'CANCELLED',
      PENDING_REPLACE: 'PENDING_REPLACE',
      REPLACED: 'REPLACED',
      FILLED: 'FILLED',
      EXPIRED: 'EXPIRED'
    },

    /**
     * TD Ameritrade
     */
    tdameritrade: {
      AWAITING_PARENT_ORDER: 'PENDING',
      AWAITING_CONDITION: 'PENDING',
      AWAITING_MANUAL_REVIEW: 'PENDING',
      ACCEPTED: 'ACCEPTED',
      AWAITING_UR_OUT: 'PENDING',
      PENDING_ACTIVATION: 'PENDING',
      QUEUED: 'PENDING',
      WORKING: 'PENDING',
      REJECTED: 'REJECTED',
      PENDING_CANCEL: 'PENDING_CANCEL',
      CANCELED: 'CANCELLED',
      PENDING_REPLACE: 'PENDING_REPLACE',
      REPLACED: 'REPLACED',
      FILLED: 'FILLED',
      EXPIRED: 'EXPIRED'
    },

    /**
     * WeBull
     */
    webull: {
      working: 'PENDING',
      pending: 'PENDING',
      submitted: 'PENDING',
      partial_filled: 'PARTIAL',
      partially_filled: 'PARTIAL',
      filled: 'FILLED',
      cancelled: 'CANCELLED',
      canceled: 'CANCELLED',
      expired: 'EXPIRED',
      rejected: 'REJECTED',
      failed: 'REJECTED',
      suspended: 'SUSPENDED',
      pending_cancel: 'PENDING_CANCEL',
      pending_replace: 'PENDING_REPLACE'
    }
  };

  /**
   * Broker-specific fallback statuses for unknown status codes
   * CCXT uses 'PENDING' as fallback to match original behavior
   */
  static BROKER_DEFAULTS = {
    ccxt: 'PENDING',
    alpaca: 'UNKNOWN',
    etrade: 'UNKNOWN',
    ibkr: 'UNKNOWN',
    schwab: 'UNKNOWN',
    tdameritrade: 'UNKNOWN',
    webull: 'UNKNOWN'
  };

  /**
   * Map broker-specific order status to standard status
   *
   * @param {string} brokerStatus - Native broker order status
   * @param {string} brokerName - Broker identifier (ccxt, alpaca, etrade, etc.)
   * @returns {string} Standardized order status or broker-specific default
   *
   * @example
   *   OrderStatusMapper.mapStatus('open', 'ccxt') // returns 'PENDING'
   *   OrderStatusMapper.mapStatus('filled', 'alpaca') // returns 'FILLED'
   *   OrderStatusMapper.mapStatus('unknown', 'ccxt') // returns 'PENDING' (default)
   *   OrderStatusMapper.mapStatus('unknown', 'alpaca') // returns 'UNKNOWN' (default)
   */
  static mapStatus(brokerStatus, brokerName) {
    const mapping = this.BROKER_MAPPINGS[brokerName];

    if (!mapping) {
      return this.STANDARD_STATUSES.UNKNOWN;
    }

    // Use mapped status or broker-specific default
    return mapping[brokerStatus] || this.BROKER_DEFAULTS[brokerName] || this.STANDARD_STATUSES.UNKNOWN;
  }

  /**
   * Check if a broker has status mappings registered
   * @param {string} brokerName - Broker identifier
   * @returns {boolean} True if broker is registered
   */
  static hasBrokerMapping(brokerName) {
    return !!this.BROKER_MAPPINGS[brokerName];
  }

  /**
   * Get all registered broker names
   * @returns {string[]} Array of broker identifiers
   */
  static getRegisteredBrokers() {
    return Object.keys(this.BROKER_MAPPINGS);
  }
}

module.exports = OrderStatusMapper;
