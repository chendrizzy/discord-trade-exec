#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Manages schema migrations for MongoDB using a file-based migration system.
 * Tracks applied migrations in a `migrations` collection.
 *
 * Usage:
 *   npm run migrate          # Run all pending migrations
 *   npm run migrate:create <name>  # Create new migration file
 *   npm run migrate:rollback      # Rollback last migration
 *   npm run migrate:status        # Show migration status
 *
 * Migration File Format:
 *   migrations/YYYYMMDD_HHMMSS_migration_name.js
 *
 * Each migration exports:
 *   - up(db): Apply migration
 *   - down(db): Rollback migration
 *
 * Example:
 *   module.exports = {
 *     async up(db) {
 *       await db.collection('users').createIndex({ email: 1 }, { unique: true });
 *     },
 *     async down(db) {
 *       await db.collection('users').dropIndex('email_1');
 *     }
 *   };
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Configuration
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const MIGRATIONS_COLLECTION = 'migrations';

// Ensure migrations directory exists
if (!fs.existsSync(MIGRATIONS_DIR)) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  console.log(`[Migrate] Created migrations directory: ${MIGRATIONS_DIR}`);
}

/**
 * Connect to MongoDB
 */
async function connect() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('[Migrate] Connected to MongoDB');
    return mongoose.connection.db;
  } catch (error) {
    console.error('[Migrate] MongoDB connection failed:', error);
    throw error;
  }
}

/**
 * Get all migration files sorted by timestamp
 *
 * @returns {Array<string>} Migration filenames
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort(); // Chronological order

  return files;
}

/**
 * Get applied migrations from database
 *
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<Set<string>>} Set of applied migration names
 */
async function getAppliedMigrations(db) {
  const collection = db.collection(MIGRATIONS_COLLECTION);
  const docs = await collection.find({}, { projection: { name: 1 } }).toArray();
  return new Set(docs.map(doc => doc.name));
}

/**
 * Mark migration as applied
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} name - Migration name
 * @param {number} duration - Execution duration in ms
 */
async function markMigrationApplied(db, name, duration) {
  const collection = db.collection(MIGRATIONS_COLLECTION);
  await collection.insertOne({
    name,
    appliedAt: new Date(),
    duration
  });
}

/**
 * Remove migration record (for rollback)
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} name - Migration name
 */
async function removeMigrationRecord(db, name) {
  const collection = db.collection(MIGRATIONS_COLLECTION);
  await collection.deleteOne({ name });
}

/**
 * Run all pending migrations
 *
 * @param {Object} db - MongoDB database instance
 */
async function runMigrations(db) {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(db);

  const pendingMigrations = migrationFiles.filter(f => !appliedMigrations.has(f));

  if (pendingMigrations.length === 0) {
    console.log('[Migrate] No pending migrations');
    return;
  }

  console.log(`[Migrate] Found ${pendingMigrations.length} pending migration(s)`);

  for (const filename of pendingMigrations) {
    const migrationPath = path.join(MIGRATIONS_DIR, filename);
    const migration = require(migrationPath);

    if (typeof migration.up !== 'function') {
      console.error(`[Migrate] ❌ ${filename}: Missing 'up' function`);
      throw new Error(`Invalid migration: ${filename}`);
    }

    console.log(`[Migrate] Running: ${filename}`);
    const startTime = Date.now();

    try {
      await migration.up(db);
      const duration = Date.now() - startTime;
      await markMigrationApplied(db, filename, duration);
      console.log(`[Migrate] ✓ ${filename} (${duration}ms)`);
    } catch (error) {
      console.error(`[Migrate] ❌ ${filename} failed:`, error);
      throw error;
    }
  }

  console.log('[Migrate] All migrations completed successfully');
}

/**
 * Rollback last migration
 *
 * @param {Object} db - MongoDB database instance
 */
async function rollbackMigration(db) {
  const collection = db.collection(MIGRATIONS_COLLECTION);
  const lastMigration = await collection.findOne({}, { sort: { appliedAt: -1 } });

  if (!lastMigration) {
    console.log('[Migrate] No migrations to rollback');
    return;
  }

  const migrationPath = path.join(MIGRATIONS_DIR, lastMigration.name);

  if (!fs.existsSync(migrationPath)) {
    console.error(`[Migrate] Migration file not found: ${lastMigration.name}`);
    throw new Error(`Migration file missing: ${lastMigration.name}`);
  }

  const migration = require(migrationPath);

  if (typeof migration.down !== 'function') {
    console.error(`[Migrate] Migration ${lastMigration.name} has no 'down' function`);
    throw new Error(`Cannot rollback migration: ${lastMigration.name}`);
  }

  console.log(`[Migrate] Rolling back: ${lastMigration.name}`);

  try {
    await migration.down(db);
    await removeMigrationRecord(db, lastMigration.name);
    console.log(`[Migrate] ✓ Rolled back: ${lastMigration.name}`);
  } catch (error) {
    console.error(`[Migrate] ❌ Rollback failed:`, error);
    throw error;
  }
}

/**
 * Create new migration file
 *
 * @param {string} name - Migration name (e.g., "add_user_indexes")
 */
function createMigration(name) {
  if (!name) {
    throw new Error('Migration name is required');
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name}.js`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

'use strict';

module.exports = {
  /**
   * Apply migration
   * @param {Object} db - MongoDB database instance
   */
  async up(db) {
    // Example: Create index
    // await db.collection('users').createIndex({ email: 1 }, { unique: true });

    // Example: Add field to all documents
    // await db.collection('users').updateMany({}, { $set: { newField: null } });

    console.log('[Migration] ${name}: Applied');
  },

  /**
   * Rollback migration
   * @param {Object} db - MongoDB database instance
   */
  async down(db) {
    // Example: Drop index
    // await db.collection('users').dropIndex('email_1');

    // Example: Remove field from all documents
    // await db.collection('users').updateMany({}, { $unset: { newField: '' } });

    console.log('[Migration] ${name}: Rolled back');
  }
};
`;

  fs.writeFileSync(filepath, template);
  console.log(`[Migrate] Created migration: ${filename}`);
  console.log(`[Migrate] Path: ${filepath}`);
}

/**
 * Show migration status
 *
 * @param {Object} db - MongoDB database instance
 */
async function showStatus(db) {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(db);

  console.log('\n=== Migration Status ===\n');

  if (migrationFiles.length === 0) {
    console.log('No migrations found');
    return;
  }

  const collection = db.collection(MIGRATIONS_COLLECTION);

  for (const filename of migrationFiles) {
    const isApplied = appliedMigrations.has(filename);
    const status = isApplied ? '✓ Applied' : '✗ Pending';

    if (isApplied) {
      const record = await collection.findOne({ name: filename });
      console.log(`${status} - ${filename} (${record.appliedAt.toISOString()}, ${record.duration}ms)`);
    } else {
      console.log(`${status} - ${filename}`);
    }
  }

  const pendingCount = migrationFiles.length - appliedMigrations.size;
  console.log(`\nTotal: ${migrationFiles.length} | Applied: ${appliedMigrations.size} | Pending: ${pendingCount}`);
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2] || 'up';
  const arg = process.argv[3];

  try {
    const db = await connect();

    switch (command) {
      case 'up':
        await runMigrations(db);
        break;

      case 'down':
      case 'rollback':
        await rollbackMigration(db);
        break;

      case 'create':
        if (!arg) {
          console.error('[Migrate] Error: Migration name is required');
          console.error('Usage: npm run migrate:create <migration_name>');
          process.exit(1);
        }
        createMigration(arg);
        break;

      case 'status':
        await showStatus(db);
        break;

      default:
        console.error(`[Migrate] Unknown command: ${command}`);
        console.error('Available commands: up, down, create <name>, status');
        process.exit(1);
    }

    await mongoose.disconnect();
    console.log('[Migrate] Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('[Migrate] Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  connect,
  runMigrations,
  rollbackMigration,
  createMigration,
  showStatus,
  getMigrationFiles,
  getAppliedMigrations
};
