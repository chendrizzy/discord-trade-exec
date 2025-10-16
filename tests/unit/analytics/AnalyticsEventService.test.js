/**
 * Unit Tests for AnalyticsEventService
 * Tests event tracking, batching, validation, and convenience methods
 */

const mongoose = require('mongoose');
const AnalyticsEvent = require('../../../src/models/AnalyticsEvent');
const analyticsEventService = require('../../../src/services/analytics/AnalyticsEventService');

// Mock AnalyticsEvent model
jest.mock('../../../src/models/AnalyticsEvent');

describe('AnalyticsEventService', () => {
  let mockUserId;
  let mockReq;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();
    mockReq = {
      headers: {
        'user-agent': 'Mozilla/5.0 Test Browser',
        referer: 'https://example.com',
        origin: 'https://example.com'
      },
      ip: '192.168.1.1',
      connection: {
        remoteAddress: '192.168.1.1'
      }
    };

    // Clear event buffer
    analyticsEventService.eventBuffer = [];
  });

  afterEach(() => {
    // Clean up timers
    if (analyticsEventService.flushTimer) {
      clearInterval(analyticsEventService.flushTimer);
    }
  });

  describe('extractMetadata', () => {
    test('should extract metadata from Express request object', () => {
      const metadata = analyticsEventService.extractMetadata(mockReq);

      expect(metadata).toEqual({
        source: 'https://example.com',
        userAgent: 'Mozilla/5.0 Test Browser',
        ipAddress: '192.168.1.1'
      });
    });

    test('should handle missing headers gracefully', () => {
      const minimalReq = { headers: {}, ip: '10.0.0.1' };
      const metadata = analyticsEventService.extractMetadata(minimalReq);

      expect(metadata.source).toBe('direct');
      expect(metadata.userAgent).toBeUndefined();
      expect(metadata.ipAddress).toBe('10.0.0.1');
    });

    test('should return empty object when req is null', () => {
      const metadata = analyticsEventService.extractMetadata(null);
      expect(metadata).toEqual({});
    });

    test('should fall back to connection.remoteAddress for IP', () => {
      const reqWithoutIp = {
        headers: {},
        connection: { remoteAddress: '172.16.0.1' }
      };
      const metadata = analyticsEventService.extractMetadata(reqWithoutIp);
      expect(metadata.ipAddress).toBe('172.16.0.1');
    });
  });

  describe('validateEvent', () => {
    test('should accept valid event types', () => {
      const validTypes = [
        'signup',
        'subscription_created',
        'subscription_canceled',
        'subscription_renewed',
        'trade_executed',
        'login',
        'broker_connected',
        'signal_subscribed'
      ];

      validTypes.forEach(type => {
        expect(() => {
          analyticsEventService.validateEvent(type, mockUserId);
        }).not.toThrow();
      });
    });

    test('should reject invalid event types', () => {
      expect(() => {
        analyticsEventService.validateEvent('invalid_event', mockUserId);
      }).toThrow('Invalid event type: invalid_event');
    });

    test('should require userId', () => {
      expect(() => {
        analyticsEventService.validateEvent('login', null);
      }).toThrow('userId is required for analytics events');

      expect(() => {
        analyticsEventService.validateEvent('login', undefined);
      }).toThrow('userId is required for analytics events');
    });
  });

  describe('trackEvent (batched)', () => {
    test('should buffer events when immediate is false', async () => {
      const result = await analyticsEventService.trackEvent('login', mockUserId, { method: 'discord' }, mockReq, false);

      expect(result.success).toBe(true);
      expect(result.buffered).toBe(true);
      expect(result.bufferSize).toBe(1);
      expect(analyticsEventService.eventBuffer).toHaveLength(1);

      const bufferedEvent = analyticsEventService.eventBuffer[0];
      expect(bufferedEvent.userId).toEqual(mockUserId);
      expect(bufferedEvent.eventType).toBe('login');
      expect(bufferedEvent.eventData).toEqual({ method: 'discord' });
      expect(bufferedEvent.metadata.source).toBe('https://example.com');
    });

    test('should auto-flush when batch size reached', async () => {
      AnalyticsEvent.insertMany.mockResolvedValue([]);

      // Fill buffer to batch size
      for (let i = 0; i < 50; i++) {
        await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);
      }

      expect(AnalyticsEvent.insertMany).toHaveBeenCalledTimes(1);
      expect(analyticsEventService.eventBuffer).toHaveLength(0);
    });

    test('should handle validation errors gracefully', async () => {
      const result = await analyticsEventService.trackEvent('invalid_type', mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid event type');
      expect(analyticsEventService.eventBuffer).toHaveLength(0);
    });
  });

  describe('trackEvent (immediate)', () => {
    test('should save immediately when immediate is true', async () => {
      AnalyticsEvent.create.mockResolvedValue({});

      const result = await analyticsEventService.trackEvent(
        'signup',
        mockUserId,
        { method: 'email' },
        mockReq,
        true
      );

      expect(result.success).toBe(true);
      expect(result.immediate).toBe(true);
      expect(AnalyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          eventType: 'signup',
          eventData: { method: 'email' },
          metadata: expect.objectContaining({
            source: 'https://example.com'
          })
        })
      );
      expect(analyticsEventService.eventBuffer).toHaveLength(0);
    });

    test('should handle database errors gracefully', async () => {
      AnalyticsEvent.create.mockRejectedValue(new Error('Database error'));

      const result = await analyticsEventService.trackEvent('signup', mockUserId, {}, null, true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('flush', () => {
    test('should flush all buffered events', async () => {
      AnalyticsEvent.insertMany.mockResolvedValue([]);

      // Add multiple events to buffer
      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);
      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);
      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);

      expect(analyticsEventService.eventBuffer).toHaveLength(3);

      const result = await analyticsEventService.flush();

      expect(result.flushed).toBe(3);
      expect(AnalyticsEvent.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'login' })
        ]),
        { ordered: false }
      );
      expect(analyticsEventService.eventBuffer).toHaveLength(0);
    });

    test('should return 0 when buffer is empty', async () => {
      const result = await analyticsEventService.flush();
      expect(result.flushed).toBe(0);
      expect(AnalyticsEvent.insertMany).not.toHaveBeenCalled();
    });

    test('should re-buffer events on flush failure', async () => {
      AnalyticsEvent.insertMany.mockRejectedValue(new Error('Database error'));

      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);
      const initialBufferSize = analyticsEventService.eventBuffer.length;

      await expect(analyticsEventService.flush()).rejects.toThrow('Database error');

      // Events should be back in buffer
      expect(analyticsEventService.eventBuffer).toHaveLength(initialBufferSize);
    });
  });

  describe('Convenience Methods', () => {
    describe('trackSignup', () => {
      test('should track signup with default method', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        const result = await analyticsEventService.trackSignup(mockUserId, {}, mockReq);

        expect(result.success).toBe(true);
        expect(result.immediate).toBe(true);
        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'signup',
            eventData: expect.objectContaining({
              method: 'email'
            })
          })
        );
      });

      test('should include referral code if provided', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        await analyticsEventService.trackSignup(
          mockUserId,
          { method: 'discord', referralCode: 'ABC123' },
          mockReq
        );

        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventData: expect.objectContaining({
              method: 'discord',
              referralCode: 'ABC123'
            })
          })
        );
      });
    });

    describe('trackSubscriptionCreated', () => {
      test('should track subscription creation immediately', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        const subscriptionData = {
          tier: 'premium',
          amount: 99.99,
          billingPeriod: 'monthly',
          trialDays: 7
        };

        const result = await analyticsEventService.trackSubscriptionCreated(
          mockUserId,
          subscriptionData,
          mockReq
        );

        expect(result.success).toBe(true);
        expect(result.immediate).toBe(true);
        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'subscription_created',
            eventData: subscriptionData
          })
        );
      });
    });

    describe('trackSubscriptionCanceled', () => {
      test('should track subscription cancellation immediately', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        const cancellationData = {
          tier: 'pro',
          reason: 'too_expensive',
          feedback: 'Found a cheaper alternative'
        };

        const result = await analyticsEventService.trackSubscriptionCanceled(
          mockUserId,
          cancellationData,
          mockReq
        );

        expect(result.success).toBe(true);
        expect(result.immediate).toBe(true);
        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'subscription_canceled',
            eventData: cancellationData
          })
        );
      });
    });

    describe('trackTradeExecuted', () => {
      test('should track trade execution with batching', async () => {
        const tradeData = {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 100,
          price: 150.25,
          broker: 'alpaca',
          profit: 50.0,
          signalId: new mongoose.Types.ObjectId()
        };

        const result = await analyticsEventService.trackTradeExecuted(mockUserId, tradeData, mockReq);

        expect(result.success).toBe(true);
        expect(result.buffered).toBe(true);
        expect(analyticsEventService.eventBuffer[0]).toMatchObject({
          eventType: 'trade_executed',
          eventData: tradeData
        });
      });
    });

    describe('trackLogin', () => {
      test('should track login with default method', async () => {
        const result = await analyticsEventService.trackLogin(mockUserId, {}, mockReq);

        expect(result.success).toBe(true);
        expect(result.buffered).toBe(true);
        expect(analyticsEventService.eventBuffer[0]).toMatchObject({
          eventType: 'login',
          eventData: {
            method: 'password',
            twoFactorUsed: false
          }
        });
      });

      test('should track 2FA usage', async () => {
        await analyticsEventService.trackLogin(
          mockUserId,
          { method: 'email', twoFactorUsed: true },
          mockReq
        );

        expect(analyticsEventService.eventBuffer[0].eventData).toMatchObject({
          method: 'email',
          twoFactorUsed: true
        });
      });
    });

    describe('trackBrokerConnected', () => {
      test('should track broker connection immediately', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        const brokerData = {
          broker: 'alpaca',
          accountType: 'paper',
          isReconnection: false
        };

        const result = await analyticsEventService.trackBrokerConnected(mockUserId, brokerData, mockReq);

        expect(result.success).toBe(true);
        expect(result.immediate).toBe(true);
        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'broker_connected',
            eventData: brokerData
          })
        );
      });
    });

    describe('trackSignalSubscribed', () => {
      test('should track signal subscription immediately', async () => {
        AnalyticsEvent.create.mockResolvedValue({});

        const signalData = {
          providerId: new mongoose.Types.ObjectId(),
          providerName: 'Elite Trader',
          subscriptionType: 'premium'
        };

        const result = await analyticsEventService.trackSignalSubscribed(mockUserId, signalData, mockReq);

        expect(result.success).toBe(true);
        expect(result.immediate).toBe(true);
        expect(AnalyticsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'signal_subscribed',
            eventData: signalData
          })
        );
      });
    });
  });

  describe('getBufferStatus', () => {
    test('should return current buffer status', () => {
      // Add some events to buffer
      analyticsEventService.eventBuffer = [{}, {}, {}];

      const status = analyticsEventService.getBufferStatus();

      expect(status).toEqual({
        bufferedEvents: 3,
        batchSize: 50,
        flushInterval: 30000
      });
    });
  });

  describe('shutdown', () => {
    test('should flush remaining events on shutdown', async () => {
      AnalyticsEvent.insertMany.mockResolvedValue([]);

      // Add events to buffer
      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);
      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);

      expect(analyticsEventService.eventBuffer).toHaveLength(2);

      await analyticsEventService.shutdown();

      expect(AnalyticsEvent.insertMany).toHaveBeenCalled();
      expect(analyticsEventService.eventBuffer).toHaveLength(0);
      expect(analyticsEventService.isShuttingDown).toBe(true);
    });

    test('should handle shutdown gracefully when buffer is empty', async () => {
      await expect(analyticsEventService.shutdown()).resolves.not.toThrow();
    });

    test('should not flush multiple times during shutdown', async () => {
      AnalyticsEvent.insertMany.mockResolvedValue([]);

      await analyticsEventService.trackEvent('login', mockUserId, {}, null, false);

      await analyticsEventService.shutdown();
      await analyticsEventService.shutdown(); // Second call

      // Should only flush once
      expect(AnalyticsEvent.insertMany).toHaveBeenCalledTimes(1);
    });
  });
});
