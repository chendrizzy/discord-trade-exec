/**
 * Transaction Processor
 *
 * Processes blockchain events and saves to database with deduplication
 */

const PolymarketTransaction = require('../../models/PolymarketTransaction');
const PolymarketWallet = require('../../models/PolymarketWallet');
const PolymarketMarket = require('../../models/PolymarketMarket');
const logger = require('../../utils/logger');

class TransactionProcessor {
  constructor() {
    if (TransactionProcessor.instance) {
      return TransactionProcessor.instance;
    }

    this.stats = {
      processed: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      lastProcessedAt: null
    };

    TransactionProcessor.instance = this;
  }

  /**
   * Process a single event
   */
  async processEvent(eventData) {
    try {
      // Check for duplicates
      const existing = await PolymarketTransaction.findOne({
        txHash: eventData.transactionHash
      });

      if (existing) {
        this.stats.duplicates++;
        return {
          success: true,
          duplicate: true,
          transaction: existing
        };
      }

      // Process based on event type
      let transaction;

      switch (eventData.eventName) {
        case 'OrderFilled':
          transaction = await this._processOrderFilled(eventData);
          break;

        case 'OrdersMatched':
          transaction = await this._processOrdersMatched(eventData);
          break;

        case 'OrderCancelled':
          transaction = await this._processOrderCancelled(eventData);
          break;

        case 'FeeCharged':
          transaction = await this._processFeeCharged(eventData);
          break;

        case 'TokenRegistered':
          transaction = await this._processTokenRegistered(eventData);
          break;

        default:
          console.warn(`[TransactionProcessor] Unknown event type: ${eventData.eventName}`);
          return {
            success: false,
            error: `Unknown event type: ${eventData.eventName}`
          };
      }

      this.stats.processed++;
      this.stats.saved++;
      this.stats.lastProcessedAt = new Date();

      // Update wallet statistics asynchronously (non-blocking)
      if (eventData.maker) {
        this._updateWalletStats(eventData.maker, transaction).catch(err => {
          console.error('[TransactionProcessor] Error updating maker wallet:', err);
        });
      }

      if (eventData.taker) {
        this._updateWalletStats(eventData.taker, transaction).catch(err => {
          console.error('[TransactionProcessor] Error updating taker wallet:', err);
        });
      }

      return {
        success: true,
        transaction
      };
    } catch (error) {
      logger.error('[TransactionProcessor] Error processing event:', { error: error.message, stack: error.stack });
      this.stats.errors++;
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process OrderFilled event
   */
  async _processOrderFilled(eventData) {
    const transaction = new PolymarketTransaction({
      txHash: eventData.transactionHash,
      eventName: eventData.eventName,
      blockNumber: eventData.blockNumber,
      logIndex: eventData.logIndex,
      timestamp: eventData.timestamp,
      maker: eventData.maker,
      taker: eventData.taker,
      makerAssetId: eventData.makerAssetId,
      takerAssetId: eventData.takerAssetId,
      makerAmountFilled: eventData.makerAmountFilled,
      takerAmountFilled: eventData.takerAmountFilled,
      fee: eventData.fee,
      orderHash: eventData.orderHash
    });

    await transaction.save();

    console.log(`[TransactionProcessor] Saved OrderFilled: ${eventData.maker.slice(0, 8)}... → $${eventData.makerAmountFilled}`);

    return transaction;
  }

  /**
   * Process OrdersMatched event
   */
  async _processOrdersMatched(eventData) {
    const transaction = new PolymarketTransaction({
      txHash: eventData.transactionHash,
      eventName: eventData.eventName,
      blockNumber: eventData.blockNumber,
      logIndex: eventData.logIndex,
      timestamp: eventData.timestamp,
      maker: eventData.takerOrderMaker,
      makerAssetId: eventData.makerAssetId,
      takerAssetId: eventData.takerAssetId,
      makerAmountFilled: eventData.makerAmountFilled,
      takerAmountFilled: eventData.takerAmountFilled,
      takerOrderHash: eventData.takerOrderHash
    });

    await transaction.save();

    console.log(`[TransactionProcessor] Saved OrdersMatched: $${eventData.makerAmountFilled}`);

    return transaction;
  }

  /**
   * Process OrderCancelled event
   */
  async _processOrderCancelled(eventData) {
    const transaction = new PolymarketTransaction({
      txHash: eventData.transactionHash,
      eventName: eventData.eventName,
      blockNumber: eventData.blockNumber,
      logIndex: eventData.logIndex,
      timestamp: eventData.timestamp,
      orderHash: eventData.orderHash
    });

    await transaction.save();

    console.log(`[TransactionProcessor] Saved OrderCancelled: ${eventData.orderHash}`);

    return transaction;
  }

  /**
   * Process FeeCharged event
   */
  async _processFeeCharged(eventData) {
    const transaction = new PolymarketTransaction({
      txHash: eventData.transactionHash,
      eventName: eventData.eventName,
      blockNumber: eventData.blockNumber,
      logIndex: eventData.logIndex,
      timestamp: eventData.timestamp,
      receiver: eventData.receiver,
      tokenId: eventData.tokenId,
      fee: eventData.amount
    });

    await transaction.save();

    console.log(`[TransactionProcessor] Saved FeeCharged: $${eventData.amount}`);

    return transaction;
  }

  /**
   * Process TokenRegistered event
   */
  async _processTokenRegistered(eventData) {
    const transaction = new PolymarketTransaction({
      txHash: eventData.transactionHash,
      eventName: eventData.eventName,
      blockNumber: eventData.blockNumber,
      logIndex: eventData.logIndex,
      timestamp: eventData.timestamp,
      conditionId: eventData.conditionId,
      makerAssetId: eventData.token0,
      takerAssetId: eventData.token1
    });

    await transaction.save();

    console.log(`[TransactionProcessor] Saved TokenRegistered: ${eventData.conditionId}`);

    return transaction;
  }

  /**
   * Update wallet statistics
   */
  async _updateWalletStats(walletAddress, transaction) {
    try {
      // Get or create wallet
      const wallet = await PolymarketWallet.getOrCreate(walletAddress);

      // Get all transactions for this wallet
      const transactions = await PolymarketTransaction.findByWallet(walletAddress);

      // Update metrics
      await wallet.updateMetrics(transactions);
      await wallet.save();

      console.log(`[TransactionProcessor] Updated wallet ${walletAddress.slice(0, 8)}... ` +
        `(volume: $${wallet.totalVolume.toFixed(0)}, whale: ${wallet.isWhale})`);
    } catch (error) {
      console.error(`[TransactionProcessor] Error updating wallet ${walletAddress}:`, error);
    }
  }

  /**
   * Process multiple events in batch
   */
  async processBatch(eventsArray) {
    const results = {
      total: eventsArray.length,
      processed: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      details: []
    };

    console.log(`[TransactionProcessor] Processing batch of ${eventsArray.length} events...`);

    for (const eventData of eventsArray) {
      const result = await this.processEvent(eventData);

      if (result.success) {
        results.processed++;

        if (result.duplicate) {
          results.duplicates++;
        } else {
          results.saved++;
        }
      } else {
        results.errors++;
      }

      results.details.push(result);
    }

    console.log(`[TransactionProcessor] Batch complete: ${results.saved} saved, ` +
      `${results.duplicates} duplicates, ${results.errors} errors`);

    return results;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.processed > 0 ?
        ((this.stats.saved / this.stats.processed) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      processed: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      lastProcessedAt: null
    };
  }
}

// Export singleton instance
module.exports = new TransactionProcessor();
