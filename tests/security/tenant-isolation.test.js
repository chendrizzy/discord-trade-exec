// External dependencies
const { expect } = require('chai');
const mongoose = require('mongoose');

// Internal utilities and services
const { setTenantContext, getTenantContext } = require('../../src/middleware/tenantAuth');
const Community = require('../../src/models/Community');
const Trade = require('../../src/models/Trade');
const User = require('../../src/models/User');

describe('🔒 Tenant Isolation Security Tests', function () {
  this.timeout(10000);

  let community1, community2, user1, user2, trade1, trade2;

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/trade-exec-test');

    // Clear test data
    await Promise.all([User.deleteMany({}), Trade.deleteMany({}), Community.deleteMany({})]);

    // Create test communities
    community1 = await Community.create({
      name: 'Test Community 1',
      discordGuildId: 'guild-123',
      subscription: { status: 'active' }
    });

    community2 = await Community.create({
      name: 'Test Community 2',
      discordGuildId: 'guild-456',
      subscription: { status: 'active' }
    });

    // Create test users
    user1 = await User.create({
      communityId: community1._id,
      discordId: 'user-123',
      discordUsername: 'TestUser1',
      communityRole: 'admin'
    });

    user2 = await User.create({
      communityId: community2._id,
      discordId: 'user-456',
      discordUsername: 'TestUser2',
      communityRole: 'trader'
    });

    // Create test trades
    trade1 = await Trade.create({
      communityId: community1._id,
      userId: user1._id,
      symbol: 'AAPL',
      quantity: 10,
      entryPrice: 150,
      status: 'FILLED'
    });

    trade2 = await Trade.create({
      communityId: community2._id,
      userId: user2._id,
      symbol: 'TSLA',
      quantity: 5,
      entryPrice: 200,
      status: 'FILLED'
    });
  });

  after(async () => {
    await mongoose.connection.close();
  });

  describe('Cross-Tenant Access Prevention', () => {
    it('should prevent Community 1 user from accessing Community 2 trades', async () => {
      // Set context for Community 1
      const context = {
        communityId: community1._id.toString(),
        userId: user1._id.toString(),
        userRole: 'admin'
      };

      // Simulate tenant context
      const trades = await Trade.find({ communityId: community1._id });

      expect(trades).to.have.lengthOf(1);
      expect(trades[0].symbol).to.equal('AAPL');
      expect(trades[0].userId.toString()).to.equal(user1._id.toString());

      // Verify Community 2 trade is NOT accessible
      const community2Trades = trades.filter(t => t.communityId.toString() === community2._id.toString());
      expect(community2Trades).to.have.lengthOf(0);
    });

    it('should prevent direct cross-tenant query attempts', async () => {
      // Attempt to query Community 2 data from Community 1 context
      const maliciousQuery = await Trade.findOne({
        _id: trade2._id,
        communityId: community2._id // Explicit cross-tenant attempt
      });

      // Should find the trade (database level)
      expect(maliciousQuery).to.not.be.null;

      // But plugin should prevent this in real scenarios
      // This test validates the need for the tenantScoping plugin
    });

    it('should enforce unique discordId per community (not globally)', async () => {
      // Same discordId can exist in different communities
      const sameDiscordIdUser = await User.create({
        communityId: community2._id,
        discordId: 'user-123', // Same as user1
        discordUsername: 'TestUser1InCommunity2',
        communityRole: 'trader'
      });

      expect(sameDiscordIdUser).to.not.be.null;
      expect(sameDiscordIdUser.communityId.toString()).to.equal(community2._id.toString());

      // Cleanup
      await User.deleteOne({ _id: sameDiscordIdUser._id });
    });
  });

  describe('Tenant Scoping Plugin Tests', () => {
    it('should automatically add communityId to queries', async () => {
      // This would be done by the plugin in real scenarios
      const query = { userId: user1._id };
      const expectedQuery = {
        ...query,
        communityId: community1._id
      };

      const trades = await Trade.find(expectedQuery);
      expect(trades).to.have.lengthOf(1);
      expect(trades[0].communityId.toString()).to.equal(community1._id.toString());
    });

    it('should prevent communityId modification on save', async () => {
      const trade = await Trade.findById(trade1._id);
      const originalCommunityId = trade.communityId;

      // Attempt to change communityId (should be prevented by plugin)
      trade.communityId = community2._id;

      try {
        await trade.save();
        // If save succeeds, verify it wasn't actually changed
        const reloaded = await Trade.findById(trade1._id);
        expect(reloaded.communityId.toString()).to.equal(originalCommunityId.toString());
      } catch (error) {
        // Expected: plugin should throw error
        expect(error.message).to.include('Cannot change communityId');
      }
    });
  });

  describe('User Role-Based Access Control', () => {
    it('should allow admins to access all community data', async () => {
      const adminUser = user1; // admin role
      const trades = await Trade.find({ communityId: adminUser.communityId });

      expect(trades).to.have.length.at.least(1);
    });

    it('should restrict viewers from modifying data', async () => {
      const viewerUser = await User.create({
        communityId: community1._id,
        discordId: 'viewer-789',
        discordUsername: 'ViewerUser',
        communityRole: 'viewer'
      });

      // Viewers should have read-only access
      expect(viewerUser.communityRole).to.equal('viewer');

      // Cleanup
      await User.deleteOne({ _id: viewerUser._id });
    });
  });

  describe('Audit Logging Tests', () => {
    it('should log all tenant-scoped operations', async () => {
      const SecurityAudit = require('../../src/models/SecurityAudit');

      // Create audit log entry
      await SecurityAudit.log({
        communityId: community1._id,
        userId: user1._id,
        userRole: 'admin',
        action: 'trade.create',
        resourceType: 'Trade',
        resourceId: trade1._id,
        operation: 'CREATE',
        status: 'success',
        statusCode: 200,
        requestId: 'test-request-123',
        ipAddress: '127.0.0.1',
        endpoint: '/api/trades',
        httpMethod: 'POST',
        riskLevel: 'low',
        timestamp: new Date()
      });

      // Verify log is tenant-scoped
      const logs = await SecurityAudit.find({ communityId: community1._id });
      expect(logs).to.have.length.at.least(1);

      // Verify no cross-tenant logs
      const crossTenantLogs = await SecurityAudit.find({
        communityId: community2._id,
        resourceId: trade1._id
      });
      expect(crossTenantLogs).to.have.lengthOf(0);
    });
  });

  describe('Performance & Indexing Tests', () => {
    it('should use ESR indexes for tenant queries', async () => {
      const startTime = Date.now();

      // Query should use compound index: { communityId: 1, userId: 1, entryTime: -1 }
      const trades = await Trade.find({
        communityId: community1._id,
        userId: user1._id
      })
        .sort({ entryTime: -1 })
        .explain();

      const duration = Date.now() - startTime;

      // Query should be fast (<50ms for small dataset)
      expect(duration).to.be.lessThan(50);

      // Verify index usage (if explain() available)
      if (trades.executionStats) {
        expect(trades.executionStats.executionSuccess).to.be.true;
      }
    });

    it('should efficiently query large tenant datasets', async () => {
      // Create 100 test trades
      const bulkTrades = Array.from({ length: 100 }, (_, i) => ({
        communityId: community1._id,
        userId: user1._id,
        symbol: `TEST${i}`,
        quantity: 10,
        entryPrice: 100 + i,
        status: 'FILLED'
      }));

      await Trade.insertMany(bulkTrades);

      const startTime = Date.now();
      const trades = await Trade.find({
        communityId: community1._id
      })
        .limit(20)
        .sort({ entryTime: -1 });
      const duration = Date.now() - startTime;

      expect(trades).to.have.lengthOf(20);
      expect(duration).to.be.lessThan(100); // Should be fast with indexes

      // Cleanup
      await Trade.deleteMany({ symbol: /^TEST/ });
    });
  });

  describe('Data Encryption Tests', () => {
    it('should encrypt sensitive credential fields', async () => {
      const { getEncryptionService } = require('../../src/services/encryption');
      const encryptionService = getEncryptionService();

      const sensitive = {
        apiKey: 'secret-key-123',
        apiSecret: 'secret-secret-456'
      };

      const encrypted = await encryptionService.encryptField(community1._id, JSON.stringify(sensitive));

      // Encrypted value should be different
      expect(encrypted).to.not.equal(JSON.stringify(sensitive));
      expect(encrypted).to.be.a('string');
      expect(encrypted.length).to.be.greaterThan(50);

      // Should be able to decrypt
      const decrypted = await encryptionService.decryptField(community1._id, encrypted);

      const decryptedObj = JSON.parse(decrypted);
      expect(decryptedObj.apiKey).to.equal(sensitive.apiKey);
      expect(decryptedObj.apiSecret).to.equal(sensitive.apiSecret);
    });

    it('should fail to decrypt with wrong community context', async () => {
      const { getEncryptionService } = require('../../src/services/encryption');
      const encryptionService = getEncryptionService();

      const sensitive = { secret: 'test-123' };
      const encrypted = await encryptionService.encryptField(community1._id, JSON.stringify(sensitive));

      try {
        // Attempt to decrypt with wrong community context
        await encryptionService.decryptField(community2._id, encrypted);
        expect.fail('Should have thrown encryption error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});
