/**
 * Broker Module - Multi-broker trading abstraction layer
 *
 * This module provides a unified interface for trading across multiple
 * stock and cryptocurrency brokers with consistent API patterns.
 *
 * @example
 * const { BrokerFactory, BrokerAdapter, AlpacaAdapter } = require('./brokers');
 *
 * // Get available brokers
 * const stockBrokers = BrokerFactory.getStockBrokers();
 *
 * // Create a broker instance
 * const alpaca = BrokerFactory.createBroker('alpaca', {
 *   apiKey: 'your-key',
 *   apiSecret: 'your-secret'
 * }, { isTestnet: true });
 *
 * // Authenticate and trade
 * await alpaca.authenticate();
 * const balance = await alpaca.getBalance();
 *
 * // Create an order
 * const order = await alpaca.createOrder({
 *   symbol: 'AAPL',
 *   side: 'BUY',
 *   type: 'MARKET',
 *   quantity: 10,
 *   timeInForce: 'DAY'
 * });
 */

const BrokerFactory = require('./BrokerFactory');
const BrokerAdapter = require('./BrokerAdapter');
const AlpacaAdapter = require('./adapters/AlpacaAdapter');

module.exports = {
  // Factory for creating broker instances
  BrokerFactory,

  // Base adapter interface
  BrokerAdapter,

  // Available broker adapters
  AlpacaAdapter,

  // Convenience methods (direct access to factory methods)
  createBroker: BrokerFactory.createBroker.bind(BrokerFactory),
  getBrokers: BrokerFactory.getBrokers.bind(BrokerFactory),
  getBrokerInfo: BrokerFactory.getBrokerInfo.bind(BrokerFactory),
  getStockBrokers: BrokerFactory.getStockBrokers.bind(BrokerFactory),
  getCryptoBrokers: BrokerFactory.getCryptoBrokers.bind(BrokerFactory),
  compareBrokers: BrokerFactory.compareBrokers.bind(BrokerFactory),
  getRecommendedBroker: BrokerFactory.getRecommendedBroker.bind(BrokerFactory),
  testConnection: BrokerFactory.testConnection.bind(BrokerFactory),
  getStats: BrokerFactory.getStats.bind(BrokerFactory)
};
