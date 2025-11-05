'use strict';

/**
 * Integration Tests - Audit Log Immutability
 *
 * Tests for US-007: Audit Logging & Compliance Tracking
 *
 * Constitutional Requirements:
 * - Principle I: Security-First (immutable audit trail)
 * - Principle II: Test-First (>95% coverage for critical paths)
 * - Principle VI: Observability (comprehensive logging)
 *
 * Test Coverage:
 * - Audit log creation with hash chaining
 * - Immutability enforcement (no updates/deletes)
 * - Hash chain integrity verification
 * - Query and export functionality
 * - Error handling and graceful degradation
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AuditLog = require('../../src/models/AuditLog');
const AuditLogService = require('../../src/services/AuditLogService');

describe('AuditLog Immutability - Integration Tests', () => {
  let mongoServer;
  let testUserId;

  // Setup: Start in-memory MongoDB
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Create a test user ID
    testUserId = new mongoose.Types.ObjectId();
  });

  // Teardown: Stop in-memory MongoDB
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Clear audit logs between tests
  // Note: AuditLog.deleteMany() will fail due to immutability pre-hook
  // We must use collection.deleteMany() to bypass Mongoose hooks for test cleanup
  afterEach(async () => {
    await AuditLog.collection.deleteMany({});
  });

  describe('Hash Chain Integrity', () => {
    test('should create first log entry with GENESIS previousHash', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        resourceId: testUserId,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        status: 'success'
      });

      expect(log).toBeTruthy();
      expect(log.previousHash).toBeNull();
      expect(log.currentHash).toHaveLength(64); // SHA-256 produces 64-char hex
      expect(log.currentHash).toMatch(/^[a-f0-9]{64}$/); // Valid hex string
    });

    test('should chain subsequent logs with previousHash', async () => {
      // Create first log
      const log1 = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        resourceId: testUserId,
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Create second log
      const log2 = await AuditLogService.write({
        userId: testUserId,
        action: 'TRADE_EXECUTED',
        resourceType: 'Trade',
        resourceId: new mongoose.Types.ObjectId(),
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Verify chain linkage
      expect(log2.previousHash).toBe(log1.currentHash);
      expect(log2.currentHash).not.toBe(log1.currentHash);
    });

    test('should verify hash chain integrity for valid sequence', async () => {
      // Create chain of 5 logs
      const logs = [];
      for (let i = 0; i < 5; i++) {
        const log = await AuditLogService.write({
          userId: testUserId,
          action: 'TRADE_EXECUTED',
          resourceType: 'Trade',
          resourceId: new mongoose.Types.ObjectId(),
          ipAddress: '192.168.1.1',
          status: 'success',
          metadata: { sequenceNumber: i }
        });
        logs.push(log);
      }

      // Verify integrity
      const result = await AuditLogService.verifyIntegrity({ userId: testUserId });

      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeNull();
    });

    test('should detect tampered hash in chain', async () => {
      // Create chain of 3 logs
      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'TRADE_EXECUTED',
        resourceType: 'Trade',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGOUT',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Tamper with middle log's hash (direct MongoDB update, bypassing Mongoose)
      const logs = await AuditLog.find({ userId: testUserId }).sort({ timestamp: 1 });
      await AuditLog.collection.updateOne(
        { _id: logs[1]._id },
        { $set: { currentHash: 'tampered-hash-1234567890abcdef1234567890abcdef12345678' } }
      );

      // Verify integrity (should detect tampering)
      const result = await AuditLogService.verifyIntegrity({ userId: testUserId });

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1); // Second log is tampered
      expect(result.message).toContain('Hash mismatch');
    });

    test('should detect broken chain linkage', async () => {
      // Create chain of 3 logs
      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'TRADE_EXECUTED',
        resourceType: 'Trade',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGOUT',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Break chain linkage (tamper with previousHash)
      const logs = await AuditLog.find({ userId: testUserId }).sort({ timestamp: 1 });
      await AuditLog.collection.updateOne(
        { _id: logs[2]._id },
        { $set: { previousHash: 'broken-chain-hash-' + '0'.repeat(40) } }
      );

      // Verify integrity (should detect broken chain)
      const result = await AuditLogService.verifyIntegrity({ userId: testUserId });

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2); // Third log has broken chain
      expect(result.message).toContain('Chain broken');
    });
  });

  describe('Immutability Enforcement', () => {
    test('should prevent updates via Mongoose findOneAndUpdate', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Attempt to update (should throw)
      await expect(AuditLog.findOneAndUpdate({ _id: log._id }, { $set: { status: 'modified' } })).rejects.toThrow(
        'AuditLog entries are immutable and cannot be updated'
      );
    });

    test('should prevent updates via Mongoose updateOne', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Attempt to update (should throw)
      await expect(AuditLog.updateOne({ _id: log._id }, { $set: { status: 'modified' } })).rejects.toThrow(
        'AuditLog entries are immutable and cannot be updated'
      );
    });

    test('should prevent deletes via Mongoose findOneAndDelete', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Attempt to delete (should throw)
      await expect(AuditLog.findOneAndDelete({ _id: log._id })).rejects.toThrow(
        'AuditLog entries are immutable and cannot be deleted'
      );
    });

    test('should prevent deletes via Mongoose deleteOne', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Attempt to delete (should throw)
      await expect(AuditLog.deleteOne({ _id: log._id })).rejects.toThrow(
        'AuditLog entries are immutable and cannot be deleted'
      );
    });

    test('should allow direct MongoDB updates (for testing tampering scenarios)', async () => {
      // This tests that direct MongoDB operations bypass Mongoose hooks
      // In production, MongoDB RBAC prevents this (tested separately)
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      // Direct MongoDB update (bypasses Mongoose pre-hooks)
      const result = await AuditLog.collection.updateOne({ _id: log._id }, { $set: { status: 'tampered' } });

      expect(result.modifiedCount).toBe(1);

      // Verify tampering detection
      const tampered = await AuditLog.findById(log._id);
      expect(tampered.status).toBe('tampered');
    });
  });

  describe('Audit Log Service - Write Operations', () => {
    test('should write trade execution log with metadata', async () => {
      const tradeId = new mongoose.Types.ObjectId();

      const log = await AuditLogService.logTradeExecution({
        userId: testUserId,
        tradeId,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        symbol: 'AAPL',
        quantity: 100,
        price: 175.5,
        orderType: 'market',
        broker: 'alpaca',
        status: 'success'
      });

      expect(log.action).toBe('TRADE_EXECUTED');
      expect(log.resourceType).toBe('Trade');
      expect(log.resourceId.toString()).toBe(tradeId.toString());
      expect(log.metadata.symbol).toBe('AAPL');
      expect(log.metadata.quantity).toBe(100);
      expect(log.metadata.broker).toBe('alpaca');
    });

    test('should write login success log', async () => {
      const log = await AuditLogService.logLoginSuccess({
        userId: testUserId,
        ipAddress: '192.168.1.50',
        userAgent: 'Chrome/120.0'
      });

      expect(log.action).toBe('LOGIN_SUCCESS');
      expect(log.status).toBe('success');
      expect(log.ipAddress).toBe('192.168.1.50');
    });

    test('should write login failure log with reason', async () => {
      const log = await AuditLogService.logLoginFailure({
        userId: testUserId,
        ipAddress: '10.0.0.5',
        userAgent: 'Firefox/121.0',
        reason: 'Invalid password'
      });

      expect(log.action).toBe('LOGIN_FAILED');
      expect(log.status).toBe('failure');
      expect(log.errorMessage).toBe('Invalid password');
      expect(log.metadata.failureReason).toBe('Invalid password');
    });

    test('should gracefully handle write errors without throwing', async () => {
      // Missing required fields (should return null, not throw)
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'TEST_ACTION'
        // Missing resourceType, ipAddress, status
      });

      expect(log).toBeNull(); // Graceful degradation
    });

    test('should handle invalid status value gracefully', async () => {
      const log = await AuditLogService.write({
        userId: testUserId,
        action: 'TEST_ACTION',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'invalid-status' // Not 'success' or 'failure'
      });

      expect(log).toBeNull(); // Graceful degradation
    });
  });

  describe('Audit Log Service - Query Operations', () => {
    beforeEach(async () => {
      // Create test data: 10 logs for user 1, 5 logs for user 2
      const user2Id = new mongoose.Types.ObjectId();

      for (let i = 0; i < 10; i++) {
        await AuditLogService.write({
          userId: testUserId,
          action: i % 2 === 0 ? 'LOGIN_SUCCESS' : 'TRADE_EXECUTED',
          resourceType: 'User',
          ipAddress: '192.168.1.1',
          status: i % 3 === 0 ? 'failure' : 'success'
        });
      }

      for (let i = 0; i < 5; i++) {
        await AuditLogService.write({
          userId: user2Id,
          action: 'LOGOUT',
          resourceType: 'User',
          ipAddress: '10.0.0.1',
          status: 'success'
        });
      }
    });

    test('should query logs by userId', async () => {
      const logs = await AuditLogService.query({ userId: testUserId });

      expect(logs).toHaveLength(10);
      logs.forEach(log => {
        expect(log.userId.toString()).toBe(testUserId.toString());
      });
    });

    test('should query logs by action', async () => {
      const logs = await AuditLogService.query({ action: 'LOGIN_SUCCESS' });

      expect(logs.length).toBeGreaterThanOrEqual(5); // testUserId has 5 LOGIN_SUCCESS
      logs.forEach(log => {
        expect(log.action).toBe('LOGIN_SUCCESS');
      });
    });

    test('should query logs by status', async () => {
      const logs = await AuditLogService.query({ status: 'failure' });

      expect(logs.length).toBeGreaterThanOrEqual(3); // testUserId has 3-4 failures
      logs.forEach(log => {
        expect(log.status).toBe('failure');
      });
    });

    test('should query logs with date range', async () => {
      const startDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const endDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      const logs = await AuditLogService.query({ startDate, endDate });

      expect(logs.length).toBeGreaterThanOrEqual(15); // All 15 logs
      logs.forEach(log => {
        expect(log.timestamp >= startDate).toBe(true);
        expect(log.timestamp <= endDate).toBe(true);
      });
    });

    test('should query with pagination (limit and skip)', async () => {
      const page1 = await AuditLogService.query({ limit: 5, skip: 0 });
      const page2 = await AuditLogService.query({ limit: 5, skip: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0]._id).not.toEqual(page2[0]._id); // Different logs
    });

    test('should count logs matching filters', async () => {
      const count = await AuditLogService.count({ userId: testUserId });

      expect(count).toBe(10);
    });
  });

  describe('Audit Log Service - Export Operations', () => {
    beforeEach(async () => {
      // Create test data
      for (let i = 0; i < 3; i++) {
        await AuditLogService.write({
          userId: testUserId,
          action: 'LOGIN_SUCCESS',
          resourceType: 'User',
          resourceId: testUserId,
          ipAddress: '192.168.1.1',
          status: 'success'
        });
      }
    });

    test('should export logs to CSV format', async () => {
      const csv = await AuditLogService.exportToCSV({ userId: testUserId });

      expect(csv).toContain('Timestamp,User ID,Action,Resource Type');
      expect(csv).toContain('LOGIN_SUCCESS');
      expect(csv).toContain('192.168.1.1');

      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4); // Header + 3 rows
    });

    test('should escape quotes in CSV export', async () => {
      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_FAILED',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'failure',
        errorMessage: 'Error: "invalid credentials"'
      });

      const csv = await AuditLogService.exportToCSV({ userId: testUserId });

      expect(csv).toContain('""invalid credentials""'); // Escaped quotes
    });
  });

  describe('Audit Log Service - Statistics', () => {
    beforeEach(async () => {
      // Create diverse test data
      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_SUCCESS',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'success'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'LOGIN_FAILED',
        resourceType: 'User',
        ipAddress: '192.168.1.1',
        status: 'failure'
      });

      await AuditLogService.write({
        userId: testUserId,
        action: 'TRADE_EXECUTED',
        resourceType: 'Trade',
        ipAddress: '192.168.1.1',
        status: 'success'
      });
    });

    test('should calculate statistics by action', async () => {
      const startDate = new Date(Date.now() - 1000 * 60 * 60);
      const endDate = new Date(Date.now() + 1000 * 60 * 60);

      const stats = await AuditLogService.getStatistics({ startDate, endDate });

      expect(stats).toBeTruthy();
      expect(Array.isArray(stats)).toBe(true);

      const loginSuccessStats = stats.find(s => s._id === 'LOGIN_SUCCESS');
      expect(loginSuccessStats.count).toBe(2);
      expect(loginSuccessStats.successCount).toBe(2);
      expect(loginSuccessStats.failureCount).toBe(0);

      const loginFailedStats = stats.find(s => s._id === 'LOGIN_FAILED');
      expect(loginFailedStats.count).toBe(1);
      expect(loginFailedStats.failureCount).toBe(1);
    });
  });
});
