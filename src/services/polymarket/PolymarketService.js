/**
 * Polymarket Service
 *
 * Main orchestration service coordinating all Polymarket components
 */

const eventListener = require('./EventListener');
const transactionProcessor = require('./TransactionProcessor');
const blockchainProvider = require('./BlockchainProvider');
const analysisPipeline = require('./AnalysisPipeline');
const jobOrchestrator = require('../../jobs');
const polygonConfig = require('../../config/polygon');
const logger = require('../../utils/logger');

class PolymarketService {
  constructor() {
    if (PolymarketService.instance) {
      return PolymarketService.instance;
    }

    this.eventListener = null;
    this.isRunning = false;
    this.startTime = null;

    PolymarketService.instance = this;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    logger.info('[PolymarketService] Initializing...');

    // Test blockchain connection
    const connectionTest = await blockchainProvider.testConnection();
    if (!connectionTest.success) {
      throw new Error('Blockchain connection failed: ' + connectionTest.error);
    }

    // Initialize event listener
    this.eventListener = eventListener;

    // Register event handlers
    this._registerEventHandlers();

    // Start provider health checks
    blockchainProvider.startHealthChecks();

    logger.info('[PolymarketService] Initialization complete');
  }

  /**
   * Register event handlers for processing
   */
  _registerEventHandlers() {
    const events = polygonConfig.events.ctfExchange;

    events.forEach(eventName => {
      this.eventListener.on(eventName, async (eventData) => {
        // Phase 1: Process and save transaction
        const transaction = await transactionProcessor.processEvent(eventData);

        // Phase 2: Intelligence analysis (non-blocking)
        if (transaction && !transaction.duplicate) {
          analysisPipeline.processTransaction(transaction).catch(err => {
            logger.error('[PolymarketService] Intelligence analysis error', { error: err.message, stack: err.stack });
          });
        }
      });
    });

    logger.info('[PolymarketService] Registered event handlers', { eventCount: events.length });
  }

  /**
   * Start the service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[PolymarketService] Already running');
      return;
    }

    if (!this.eventListener) {
      await this.initialize();
    }

    logger.info('[PolymarketService] Starting event monitoring...');

    await this.eventListener.startListening();

    // Start background jobs (intelligence workers)
    await jobOrchestrator.start();

    this.isRunning = true;
    this.startTime = new Date();

    logger.info('[PolymarketService] Service started successfully');
    logger.info('[PolymarketService] Monitoring Polymarket CTF Exchange events in real-time');
    logger.info('[PolymarketService] Intelligence analysis active');
  }

  /**
   * Stop the service
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('[PolymarketService] Stopping...');

    await this.eventListener.stopListening();
    blockchainProvider.stopHealthChecks();

    // Stop background jobs
    await jobOrchestrator.stop();

    this.isRunning = false;

    logger.info('[PolymarketService] Service stopped');
  }

  /**
   * Backfill historical data
   */
  async backfillHistory(fromBlock, toBlock = 'latest', eventName = null) {
    logger.info('[PolymarketService] Starting backfill', { fromBlock, toBlock });

    const events = eventName ? [eventName] : polygonConfig.events.ctfExchange;
    const allEvents = [];

    for (const name of events) {
      logger.info('[PolymarketService] Querying events', { eventName: name });

      const historicalEvents = await this.eventListener.queryHistoricalEvents(
        name,
        fromBlock,
        toBlock
      );

      // Parse contract events to match our event data format
      const eventDataArray = historicalEvents.map(event => this._parseContractEvent(event, name));

      allEvents.push(...eventDataArray);
    }

    logger.info('[PolymarketService] Events found', { totalEvents: allEvents.length });

    // Process in batch
    const result = await transactionProcessor.processBatch(allEvents);

    logger.info('[PolymarketService] Backfill complete', {
      total: result.total,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors
    });

    return {
      success: true,
      totalEvents: result.total,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors
    };
  }

  /**
   * Parse contract event to standard format
   */
  _parseContractEvent(event, eventName) {
    const { ethers } = require('ethers');

    // Base event data
    const eventData = {
      eventName,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.index,
      timestamp: new Date() // Will be updated with actual block timestamp if needed
    };

    // Parse args based on event type
    const args = event.args;

    switch (eventName) {
      case 'OrderFilled':
        return {
          ...eventData,
          orderHash: args.orderHash,
          maker: args.maker.toLowerCase(),
          taker: args.taker.toLowerCase(),
          makerAssetId: args.makerAssetId.toString(),
          takerAssetId: args.takerAssetId.toString(),
          makerAmountFilled: ethers.formatUnits(args.makerAmountFilled, 6),
          takerAmountFilled: ethers.formatUnits(args.takerAmountFilled, 6),
          fee: ethers.formatUnits(args.fee, 6)
        };

      case 'OrdersMatched':
        return {
          ...eventData,
          takerOrderHash: args.takerOrderHash,
          takerOrderMaker: args.takerOrderMaker.toLowerCase(),
          makerAssetId: args.makerAssetId.toString(),
          takerAssetId: args.takerAssetId.toString(),
          makerAmountFilled: ethers.formatUnits(args.makerAmountFilled, 6),
          takerAmountFilled: ethers.formatUnits(args.takerAmountFilled, 6)
        };

      case 'OrderCancelled':
        return {
          ...eventData,
          orderHash: args.orderHash
        };

      case 'FeeCharged':
        return {
          ...eventData,
          receiver: args.receiver.toLowerCase(),
          tokenId: args.tokenId.toString(),
          amount: ethers.formatUnits(args.amount, 6)
        };

      case 'TokenRegistered':
        return {
          ...eventData,
          token0: args.token0.toString(),
          token1: args.token1.toString(),
          conditionId: args.conditionId
        };

      default:
        return eventData;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: uptime,
      uptimeFormatted: this._formatUptime(uptime),
      blockchainProvider: blockchainProvider.getStats(),
      eventListener: this.eventListener ? this.eventListener.getStats() : null,
      transactionProcessor: transactionProcessor.getStats()
    };
  }

  /**
   * Format uptime in human-readable format
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Export singleton instance
module.exports = new PolymarketService();
