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

    // Create unique index on discordId
    await collection.createIndex(
      { discordId: 1 },
      { unique: true, name: 'discordId_unique' }
    );
    console.log('[Migration] Created index: discordId_unique');

    // Create unique index on email
    await collection.createIndex(
      { email: 1 },
      { unique: true, sparse: true, name: 'email_unique' }
    );
    console.log('[Migration] Created index: email_unique');

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
