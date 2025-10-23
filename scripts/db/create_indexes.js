#!/usr/bin/env node
'use strict';

/**
 * Database Index Creation Script
 *
 * Creates optimized indexes for all collections
 *
 * Constitutional Principle III: Performance and Scalability
 * FR-065-066: Database performance optimization
 * T014: Create database indexes for performance
 */

const mongoose = require('mongoose');
const { getConfig } = require('../../src/config/env');
const { connect, disconnect } = require('../../src/config/database');

const config = getConfig();

/**
 * Index definitions for all collections
 */
const indexDefinitions = {
  users: [
    // Authentication queries
    { fields: { discordId: 1 }, options: { unique: true, sparse: true } },
    { fields: { 'subscription.polarCustomerId': 1 }, options: { unique: true, sparse: true } },

    // Subscription queries
    { fields: { 'subscription.status': 1 } },
    { fields: { 'subscription.tier': 1 } },
    { fields: { 'subscription.status': 1, 'subscription.tier': 1 } },
    { fields: { 'subscription.status': 1, 'subscription.currentPeriodEnd': 1 } },

    // Activity tracking
    { fields: { 'metadata.lastActiveAt': -1 } },
    { fields: { isAdmin: 1 } },
    { fields: { accountStatus: 1 } },

    // Multi-tenant (if using communityId)
    { fields: { communityId: 1, discordId: 1 }, options: { unique: true, sparse: true } },

    // Analytics performance indexes (ESR rule: Equality, Sort, Range)
    { fields: { 'subscription.status': 1, 'stats.lastTradeAt': -1, createdAt: 1 } },
    { fields: { 'subscription.status': 1, createdAt: 1 } }
  ],

  brokerconnections: [
    // User broker queries
    { fields: { userId: 1, broker: 1 } },
    { fields: { userId: 1, status: 1 } },
    { fields: { userId: 1, isActive: 1 } },

    // Unique broker per user
    { fields: { userId: 1, broker: 1, accountType: 1 }, options: { unique: true } },

    // Status queries
    { fields: { status: 1 } }
  ],

  trades: [
    // User trade queries
    { fields: { userId: 1, createdAt: -1 } },
    { fields: { userId: 1, status: 1 } },
    { fields: { userId: 1, broker: 1, status: 1 } },
    { fields: { userId: 1, symbol: 1, createdAt: -1 } },

    // Signal tracking
    { fields: { signalId: 1 } },

    // Broker queries
    { fields: { broker: 1, status: 1 } },
    { fields: { brokerOrderId: 1 }, options: { unique: true, sparse: true } },

    // Status and execution time
    { fields: { status: 1, executedAt: -1 } },
    { fields: { status: 1, createdAt: -1 } },

    // Symbol queries
    { fields: { symbol: 1, status: 1 } }
  ],

  positions: [
    // User position queries
    { fields: { userId: 1, status: 1, entryDate: -1 } },
    { fields: { userId: 1, symbol: 1, status: 1 } },
    { fields: { userId: 1, broker: 1, status: 1 } },
    { fields: { userId: 1, broker: 1, status: 1, symbol: 1 } },

    // Broker connection queries
    { fields: { brokerConnectionId: 1, status: 1 } },

    // Status queries
    { fields: { status: 1 } },
    { fields: { status: 1, entryDate: -1 } },

    // Symbol queries
    { fields: { symbol: 1, status: 1 } }
  ],

  signals: [
    // User signal queries
    { fields: { userId: 1, createdAt: -1 } },
    { fields: { userId: 1, status: 1 } },
    { fields: { userId: 1, provider: 1, createdAt: -1 } },

    // Provider queries
    { fields: { provider: 1, status: 1 } },
    { fields: { channelId: 1, createdAt: -1 } },

    // Symbol queries
    { fields: { symbol: 1, status: 1 } },
    { fields: { symbol: 1, createdAt: -1 } },

    // Status queries
    { fields: { status: 1, createdAt: -1 } },
    { fields: { status: 1, confidence: -1 } }
  ],

  subscriptions: [
    // User subscription (unique)
    { fields: { userId: 1 }, options: { unique: true } },

    // Polar.sh identifiers
    { fields: { polarCustomerId: 1 }, options: { unique: true, sparse: true } },
    { fields: { polarSubscriptionId: 1 }, options: { unique: true, sparse: true } },

    // Status queries
    { fields: { status: 1 } },
    { fields: { tier: 1, status: 1 } },
    { fields: { status: 1, currentPeriodEnd: 1 } },
    { fields: { status: 1, nextPaymentDate: 1 } },
    { fields: { status: 1, trialEnd: 1 } },

    // MRR calculation
    { fields: { status: 1, interval: 1 } }
  ],

  auditlogs: [
    // User audit queries
    { fields: { userId: 1, timestamp: -1 } },
    { fields: { userId: 1, action: 1, timestamp: -1 } },

    // Action queries
    { fields: { action: 1, timestamp: -1 } },

    // Resource queries
    { fields: { resource: 1, resourceId: 1, timestamp: -1 } },

    // Chain integrity
    { fields: { previousHash: 1 } },
    { fields: { timestamp: 1 } }
  ],

  analyticevents: [
    // User analytics
    { fields: { userId: 1, timestamp: -1 } },
    { fields: { userId: 1, eventType: 1, timestamp: -1 } },

    // Event type queries
    { fields: { eventType: 1, timestamp: -1 } },

    // Session tracking
    { fields: { sessionId: 1, timestamp: -1 } },

    // Time-based queries
    { fields: { timestamp: -1 } }
  ]
};

/**
 * Create indexes for a collection
 * @param {string} collectionName - Collection name
 * @param {Array} indexes - Array of index definitions
 */
async function createIndexesForCollection(collectionName, indexes) {
  console.log(`\n📊 Creating indexes for ${collectionName}...`);

  try {
    const collection = mongoose.connection.collection(collectionName);

    for (const indexDef of indexes) {
      try {
        const indexName = Object.keys(indexDef.fields)
          .map(key => `${key}_${indexDef.fields[key]}`)
          .join('_');

        await collection.createIndex(indexDef.fields, {
          ...indexDef.options,
          name: indexName,
          background: true // Don't block other operations
        });

        console.log(`  ✅ Created index: ${indexName}`);
      } catch (error) {
        if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
          console.log(`  ⚠️  Index already exists (skipped): ${JSON.stringify(indexDef.fields)}`);
        } else if (error.code === 86 || error.codeName === 'IndexKeySpecsConflict') {
          console.log(`  ⚠️  Index key conflict (skipped): ${JSON.stringify(indexDef.fields)}`);
        } else {
          console.error(`  ❌ Failed to create index: ${JSON.stringify(indexDef.fields)}`);
          console.error(`     Error: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error processing collection ${collectionName}:`, error.message);
  }
}

/**
 * List existing indexes for verification
 * @param {string} collectionName - Collection name
 */
async function listExistingIndexes(collectionName) {
  try {
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();

    console.log(`\n📋 Existing indexes for ${collectionName}:`);
    indexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    console.log(`  ⚠️  Collection ${collectionName} does not exist yet`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Database Index Creation Script\n');
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Database: ${config.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}\n`);

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await connect();
    console.log('✅ Connected to database\n');

    // Create indexes for all collections
    for (const [collectionName, indexes] of Object.entries(indexDefinitions)) {
      await createIndexesForCollection(collectionName, indexes);
    }

    // Verify indexes
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION - Listing all indexes');
    console.log('='.repeat(60));

    for (const collectionName of Object.keys(indexDefinitions)) {
      await listExistingIndexes(collectionName);
    }

    console.log('\n✅ Index creation completed successfully!');
    console.log('\n💡 Tips:');
    console.log('  - Run this script after any schema changes');
    console.log('  - Monitor index usage with db.collection.aggregate([{$indexStats:{}}])');
    console.log('  - Drop unused indexes to improve write performance');
  } catch (error) {
    console.error('\n❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    // Disconnect from database
    await disconnect();
    console.log('\n📡 Disconnected from database');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { createIndexesForCollection, indexDefinitions };
