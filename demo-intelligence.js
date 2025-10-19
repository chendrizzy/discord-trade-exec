#!/usr/bin/env node
/**
 * Polymarket Intelligence Demo
 *
 * Demonstrates the intelligence features with mock data
 */

require('dotenv').config();

const analysisPipeline = require('./src/services/polymarket/AnalysisPipeline');
const sentimentAnalyzer = require('./src/services/polymarket/SentimentAnalyzer');
const anomalyDetector = require('./src/services/polymarket/AnomalyDetector');
const whaleDetector = require('./src/services/polymarket/WhaleDetector');

console.log('🎯 Polymarket Intelligence Demo\n');
console.log('='.repeat(60));

// Mock transaction for demonstration
const mockTransaction = {
  _id: 'demo-tx-123',
  maker: '0x1234567890abcdef1234567890abcdef12345678',
  makerAmountFilled: '300000', // $300K bet
  marketId: 'demo-market-001',
  outcome: 'YES',
  txHash: '0xdemo...hash',
  timestamp: new Date(),
  duplicate: false
};

console.log('\n📊 Demo Transaction:');
console.log(`  Wallet: ${mockTransaction.maker}`);
console.log(`  Amount: $${parseInt(mockTransaction.makerAmountFilled).toLocaleString()}`);
console.log(`  Market: ${mockTransaction.marketId}`);
console.log(`  Outcome: ${mockTransaction.outcome}`);

(async () => {
  try {
    console.log('\n🔍 Running Intelligence Analysis...\n');

    // Demo 1: Priority Classification
    console.log('1️⃣ Priority Classification:');
    const priority = analysisPipeline._classifyPriority(mockTransaction, null);
    console.log(`   Priority: ${priority} (>$100K = CRITICAL)`);

    // Demo 2: Anomaly Detection Configuration
    console.log('\n2️⃣ Anomaly Detector Configuration:');
    const anomalyStats = anomalyDetector.getStats();
    console.log(`   Thresholds:`, {
      criticalAmount: `$${anomalyStats.thresholds.criticalAmount.toLocaleString()}`,
      coordinatedWallets: anomalyStats.thresholds.coordinatedMinWallets,
      reversalThreshold: `${anomalyStats.thresholds.reversalThreshold}%`,
      flashWhaleRatio: anomalyStats.thresholds.flashWhaleRatio
    });

    // Demo 3: Sentiment Analyzer Configuration
    console.log('\n3️⃣ Sentiment Analyzer Configuration:');
    const sentimentStats = sentimentAnalyzer.getStats();
    console.log(`   Thresholds:`, sentimentStats.thresholds);
    console.log(`   Cache Hit Rate: ${sentimentStats.cacheHitRate}`);

    // Demo 4: Pipeline Statistics
    console.log('\n4️⃣ Analysis Pipeline Status:');
    const pipelineStats = analysisPipeline.getStats();
    console.log(`   Processed: ${pipelineStats.processed}`);
    console.log(`   Alerts: ${pipelineStats.alerts}`);
    console.log(`   Errors: ${pipelineStats.errors}`);
    console.log(`   Avg Processing Time: ${pipelineStats.avgProcessingTime}`);

    // Demo 5: Show what would happen (without database)
    console.log('\n5️⃣ Analysis Preview (no database required):');
    console.log('   If this transaction were real:');
    console.log('   ✓ Would trigger WHALE_BET alert (>$250K)');
    console.log('   ✓ Would get CRITICAL priority analysis (<1s)');
    console.log('   ✓ Would check for anomaly patterns');
    console.log('   ✓ Would analyze market sentiment');

    // Demo 6: Service Health
    console.log('\n6️⃣ Service Health Check:');
    const services = [
      { name: 'WhaleDetector', obj: whaleDetector },
      { name: 'SentimentAnalyzer', obj: sentimentAnalyzer },
      { name: 'AnomalyDetector', obj: anomalyDetector },
      { name: 'AnalysisPipeline', obj: analysisPipeline }
    ];

    for (const service of services) {
      try {
        const stats = service.obj.getStats();
        console.log(`   ✅ ${service.name}: Ready`);
      } catch (err) {
        console.log(`   ❌ ${service.name}: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Demo Complete!\n');
    console.log('📋 What happens when connected to live data:');
    console.log('  1. EventListener receives blockchain event');
    console.log('  2. TransactionProcessor saves to MongoDB');
    console.log('  3. AnalysisPipeline processes transaction:');
    console.log('     - WhaleDetector updates wallet status');
    console.log('     - SentimentAnalyzer checks market sentiment');
    console.log('     - AnomalyDetector scans for patterns');
    console.log('  4. Alerts generated and sent to Discord');
    console.log('  5. BullMQ jobs run background analysis');
    console.log('\n🚀 Ready to process real Polymarket transactions!');

  } catch (err) {
    console.error('\n❌ Demo error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
})();
