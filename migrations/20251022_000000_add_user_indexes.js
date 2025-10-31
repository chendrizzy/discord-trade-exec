/**
 * Migration: Add User Indexes
 * Created: 2025-10-22
 *
 * Adds performance indexes to the User collection:
 * - discordId (unique)
 * - email (unique)
 * - communityId + subscription.status (compound)
 */

'use strict';

module.exports = {
  /**
   * Apply migration
   * @param {Object} db - MongoDB database instance
   */
  async up(db) {
    const collection = db.collection('users');

    // Check and drop existing discordId index if it exists with different name
    try {
      const existingIndexes = await collection.indexes();
      const discordIdIndex = existingIndexes.find(idx =>
        idx.key && idx.key.discordId === 1 && idx.name !== 'discordId_unique'
      );

      if (discordIdIndex) {
        console.log(`[Migration] Dropping existing index: ${discordIdIndex.name}`);
        await collection.dropIndex(discordIdIndex.name);
      }
    } catch (err) {
      console.log('[Migration] No existing discordId index to drop or error checking:', err.message);
    }

    // Create unique index on discordId
    await collection.createIndex(
      { discordId: 1 },
      { unique: true, name: 'discordId_unique' }
    );
    console.log('[Migration] Created index: discordId_unique');

    // Check and drop existing email index if it exists with different name
    try {
      const existingIndexes = await collection.indexes();
      const emailIndex = existingIndexes.find(idx =>
        idx.key && idx.key.email === 1 && idx.name !== 'email_unique'
      );

      if (emailIndex) {
        console.log(`[Migration] Dropping existing index: ${emailIndex.name}`);
        await collection.dropIndex(emailIndex.name);
      }
    } catch (err) {
      console.log('[Migration] No existing email index to drop or error checking:', err.message);
    }

    // Create unique index on email
    await collection.createIndex(
      { email: 1 },
      { unique: true, sparse: true, name: 'email_unique' }
    );
    console.log('[Migration] Created index: email_unique');

    // Check and drop existing compound index if it exists with different name
    try {
      const existingIndexes = await collection.indexes();
      const compoundIndex = existingIndexes.find(idx =>
        idx.key && idx.key.communityId === 1 && idx.key['subscription.status'] === 1 && idx.name !== 'community_subscription_status'
      );

      if (compoundIndex) {
        console.log(`[Migration] Dropping existing index: ${compoundIndex.name}`);
        await collection.dropIndex(compoundIndex.name);
      }
    } catch (err) {
      console.log('[Migration] No existing compound index to drop or error checking:', err.message);
    }

    // Create compound index for subscription queries
    await collection.createIndex(
      { communityId: 1, 'subscription.status': 1 },
      { name: 'community_subscription_status' }
    );
    console.log('[Migration] Created index: community_subscription_status');

    console.log('[Migration] add_user_indexes: Applied');
  },

  /**
   * Rollback migration
   * @param {Object} db - MongoDB database instance
   */
  async down(db) {
    const collection = db.collection('users');

    // Drop indexes
    await collection.dropIndex('discordId_unique');
    await collection.dropIndex('email_unique');
    await collection.dropIndex('community_subscription_status');

    console.log('[Migration] add_user_indexes: Rolled back');
  }
};
