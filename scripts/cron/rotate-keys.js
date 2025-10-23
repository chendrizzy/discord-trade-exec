#!/usr/bin/env node
'use strict';

/**
 * Key Rotation Cron Job
 *
 * Runs annually on January 1st to rotate encryption keys
 *
 * Schedule: 0 0 1 1 * (00:00 on January 1st)
 *
 * Usage:
 *   node scripts/cron/rotate-keys.js
 *
 * Or add to crontab:
 *   0 0 1 1 * /usr/bin/node /path/to/discord-trade-exec/scripts/cron/rotate-keys.js >> /var/log/key-rotation.log 2>&1
 */

const { keyRotationService } = require('../../src/services/KeyRotationService');
const { connect, disconnect } = require('../../src/config/database');
const { logger } = require('../../src/middleware/logger');

/**
 * Main execution
 */
async function main() {
  console.log('🔐 Encryption Key Rotation Job');
  console.log('================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await connect();
    console.log('✅ Connected to database\n');

    // Initialize key rotation service
    console.log('🔧 Initializing key rotation service...');
    await keyRotationService.initialize();
    console.log('✅ Key rotation service initialized\n');

    // Check if rotation is due
    const status = keyRotationService.getRotationStatus();
    console.log('📊 Current Status:');
    console.log(`  Current Version: ${status.currentVersion}`);
    console.log(`  Key Count: ${status.keyCount}`);
    console.log(`  Rotation Due: ${status.rotationDue}`);
    console.log(`  Next Rotation: ${status.nextRotationDate}\n`);

    if (!status.rotationDue) {
      console.log('ℹ️  Key rotation not needed - current key is up to date');
      console.log(`   Next rotation scheduled for: ${status.nextRotationDate}`);
      process.exit(0);
    }

    // Perform key rotation
    console.log('🔄 Starting key rotation...');
    const result = await keyRotationService.rotateKey();

    if (result.rotated) {
      console.log('\n✅ Key Rotation Completed Successfully!');
      console.log('=========================================');
      console.log(`  Old Version: ${result.oldVersion}`);
      console.log(`  New Version: ${result.newVersion}`);
      console.log(`  Keys in Rotation: ${result.keysInRotation}`);
      console.log(`  Re-encryption: ${result.reEncryptionScheduled ? 'Scheduled' : 'Not needed'}`);
      console.log('\n⚠️  IMPORTANT: Update ENCRYPTION_KEY environment variable with new key!');
      console.log('   New key should be stored in secure vault (AWS Secrets Manager, etc.)');

      // Log to audit system
      logger.info('Encryption key rotation completed', {
        oldVersion: result.oldVersion,
        newVersion: result.newVersion,
        keysInRotation: result.keysInRotation,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`\nℹ️  Key rotation not performed: ${result.reason}`);
    }
  } catch (error) {
    console.error('\n❌ Key Rotation Failed!');
    console.error('=======================');
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);

    // Log error
    logger.error('Key rotation cron job failed', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    process.exit(1);
  } finally {
    // Disconnect from database
    await disconnect();
    console.log('\n📡 Disconnected from database');
    console.log(`\nFinished at: ${new Date().toISOString()}`);
  }
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled rejection in key rotation cron', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught exception in key rotation cron', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
