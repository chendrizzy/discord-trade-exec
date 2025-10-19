/**
 * Polymarket Services Module
 *
 * Centralized exports for all Polymarket-related services and models
 */

// Core Services
const blockchainProvider = require('./BlockchainProvider');
const eventListener = require('./EventListener');
const transactionProcessor = require('./TransactionProcessor');
const polymarketService = require('./PolymarketService');

// Intelligence Services (Phase 2)
const whaleDetector = require('./WhaleDetector');
const sentimentAnalyzer = require('./SentimentAnalyzer');
const anomalyDetector = require('./AnomalyDetector');
const analysisPipeline = require('./AnalysisPipeline');
const cacheManager = require('./CacheManager');
const alertFormatter = require('./AlertFormatter');
const discordAlertService = require('./DiscordAlertService');

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

  // Intelligence services
  whaleDetector,
  sentimentAnalyzer,
  anomalyDetector,
  analysisPipeline,
  cacheManager,
  alertFormatter,
  discordAlertService,

  // Models
  PolymarketTransaction,
  PolymarketWallet,
  PolymarketMarket,
  PolymarketAlert,

  // Config
  polygonConfig
};
