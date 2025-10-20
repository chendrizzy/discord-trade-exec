/**
 * Create Database Indexes for Dual Dashboard System
 *
 * Creates all required indexes for optimal performance of the dual dashboard system.
 * Run this script during deployment to ensure all indexes exist.
 *
 * Usage:
 *   node create-dual-dashboard-indexes.js [environment]
 *
 * Examples:
 *   node create-dual-dashboard-indexes.js staging
 *   node create-dual-dashboard-indexes.js production
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment-specific config
const environment = process.argv[2] || 'staging';
require('dotenv').config({ path: path.join(__dirname, '../../.env.' + environment) });

// Import models (will automatically create indexes via schema definitions)
const User = require('../../src/models/User');
const Community = require('../../src/models/Community');
const Trade = require('../../src/models/Trade');
const Signal = require('../../src/models/Signal');
const SignalProvider = require('../../src/models/SignalProvider');
const UserSignalSubscription = require('../../src/models/UserSignalSubscription');
const SecurityAudit = require('../../src/models/SecurityAudit');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function createIndexes() {
  try {
    log('\n===== Creating Dual Dashboard Indexes =====', 'blue');
    log(`Environment: ${environment}`, 'blue');

    // Connect to MongoDB
    log('\nConnecting to MongoDB...', 'blue');
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URI or MONGO_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    log('✓ Connected to MongoDB', 'green');

    // Create indexes for each model
    const models = [
      { name: 'User', model: User },
      { name: 'Community', model: Community },
      { name: 'Trade', model: Trade },
      { name: 'Signal', model: Signal },
      { name: 'SignalProvider', model: SignalProvider },
      { name: 'UserSignalSubscription', model: UserSignalSubscription },
      { name: 'SecurityAudit', model: SecurityAudit }
    ];

    log('\nCreating indexes...', 'blue');
    const results = [];

    for (const { name, model } of models) {
      try {
        log(`\nProcessing ${name} model...`, 'yellow');

        // Ensure all indexes defined in schema are created
        await model.createIndexes();

        // Get index information
        const indexes = await model.collection.getIndexes();
        const indexCount = Object.keys(indexes).length;

        log(`  ✓ ${name}: ${indexCount} indexes created`, 'green');

        // Log index details
        for (const [indexName, indexDef] of Object.entries(indexes)) {
          const keys = Object.keys(indexDef.key).join(', ');
          log(`    - ${indexName}: {${keys}}`, 'reset');
        }

        results.push({ model: name, status: 'success', indexCount });
      } catch (error) {
        log(`  ✗ ${name}: ${error.message}`, 'red');
        results.push({ model: name, status: 'error', error: error.message });
      }
    }

    // Performance optimization: Analyze collections
    log('\nAnalyzing collections for optimization...', 'blue');
    for (const { name, model } of models) {
      try {
        const stats = await model.collection.stats();
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const avgObjSize = stats.avgObjSize || 0;

        log(`  ${name}:`, 'yellow');
        log(`    - Documents: ${stats.count}`, 'reset');
        log(`    - Size: ${sizeMB} MB`, 'reset');
        log(`    - Avg Object Size: ${avgObjSize} bytes`, 'reset');
      } catch (error) {
        log(`  ${name}: Unable to get stats`, 'yellow');
      }
    }

    // Summary
    log('\n===== Index Creation Summary =====', 'blue');
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const totalIndexes = results
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.indexCount, 0);

    log(`Total Models: ${models.length}`, 'reset');
    log(`Successful: ${successCount}`, 'green');
    log(`Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'reset');
    log(`Total Indexes: ${totalIndexes}`, 'green');

    if (errorCount > 0) {
      log('\nErrors encountered:', 'red');
      results
        .filter(r => r.status === 'error')
        .forEach(r => {
          log(`  - ${r.model}: ${r.error}`, 'red');
        });
    }

    // Recommendations
    log('\n===== Recommendations =====', 'blue');
    log('1. Monitor slow queries in MongoDB Atlas/Compass', 'reset');
    log('2. Review query patterns in APPLICATION_LOGS', 'reset');
    log('3. Consider compound indexes for frequently filtered queries', 'reset');
    log('4. Run this script after major schema changes', 'reset');

    log('\n✓ Index creation completed successfully', 'green');
    process.exit(0);
  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
  }
}

// Run the script
createIndexes();
