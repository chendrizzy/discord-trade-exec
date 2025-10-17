/**
 * Polymarket Services Module
 *
 * Centralized exports for all Polymarket-related services and models
 */

// Services
const blockchainProvider = require('./BlockchainProvider');
const eventListener = require('./EventListener');
const transactionProcessor = require('./TransactionProcessor');
const polymarketService = require('./PolymarketService');

// Models
const PolymarketTransaction = require('../../models/PolymarketTransaction');
const PolymarketWallet = require('../../models/PolymarketWallet');
const PolymarketMarket = require('../../models/PolymarketMarket');
const PolymarketAlert = require('../../models/PolymarketAlert');

// Config
const polygonConfig = require('../../config/polygon');

module.exports = {
  // Main service
  polymarketService,

  // Core services
  blockchainProvider,
  eventListener,
  transactionProcessor,

  // Models
  PolymarketTransaction,
  PolymarketWallet,
  PolymarketMarket,
  PolymarketAlert,

  // Config
  polygonConfig
};
