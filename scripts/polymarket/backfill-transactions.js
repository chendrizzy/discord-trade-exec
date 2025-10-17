#!/usr/bin/env node

/**
 * Polymarket Historical Data Backfill Script
 *
 * Usage:
 *   node scripts/polymarket/backfill-transactions.js [blocks]
 *
 * Examples:
 *   node scripts/polymarket/backfill-transactions.js          # Last 24 hours (~43,200 blocks)
 *   node scripts/polymarket/backfill-transactions.js 1000     # Last 1,000 blocks
 *   node scripts/polymarket/backfill-transactions.js 100000   # Last 100,000 blocks
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { polymarketService, blockchainProvider } = require('../../src/services/polymarket');

async function backfillTransactions() {
  console.log('='.repeat(80));
  console.log('POLYMARKET HISTORICAL DATA BACKFILL');
  console.log('='.repeat(80));

  try {
    // Connect to MongoDB
    console.log('\n[1/4] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ Connected to MongoDB');

    // Initialize Polymarket service
    console.log('\n[2/4] Initializing Polymarket service...');
    await polymarketService.initialize();
    console.log('✓ Polymarket service initialized');

    // Get current block number
    console.log('\n[3/4] Getting current block number...');
    const currentBlock = await blockchainProvider.getCurrentBlock();
    console.log(`✓ Current block: ${currentBlock}`);

    // Calculate block range
    const blocksToBackfill = parseInt(process.argv[2]) || 43200; // Default: 24 hours
    const fromBlock = currentBlock - blocksToBackfill;

    console.log(`\nBackfilling ${blocksToBackfill} blocks (${(blocksToBackfill / 43200 * 24).toFixed(1)} hours)`);
    console.log(`From block: ${fromBlock}`);
    console.log(`To block: ${currentBlock}`);
    console.log(`Block range: ${blocksToBackfill.toLocaleString()} blocks\n`);

    // Start backfill
    console.log('[4/4] Starting backfill...\n');
    const startTime = Date.now();

    const result = await polymarketService.backfillHistory(fromBlock, currentBlock);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration}s`);
    console.log(`Total events found: ${result.totalEvents}`);
    console.log(`Events saved: ${result.saved}`);
    console.log(`Duplicates skipped: ${result.duplicates}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Processing rate: ${(result.totalEvents / parseFloat(duration)).toFixed(2)} events/sec`);
    console.log('='.repeat(80));

    // Get service status
    console.log('\nService Status:');
    const status = polymarketService.getStatus();
    console.log(`Provider: ${status.blockchainProvider.activeProvider}`);
    console.log(`Total requests: ${status.blockchainProvider.requests}`);
    console.log(`Failovers: ${status.blockchainProvider.failovers}`);
    console.log(`Processor stats: ${status.transactionProcessor.saved} saved, ${status.transactionProcessor.duplicates} duplicates`);

    // Success
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n✓ MongoDB connection closed');
    }
  }
}

// Run backfill
backfillTransactions();
