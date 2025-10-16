// External dependencies
const express = require('express');
const request = require('supertest');

// Internal utilities and services
const TradeExecutor = require('../../src/services/TradeExecutor');
const TradingViewParser = require('../../src/services/TradingViewParser');

// Create test app
const app = express();

// Mock TradeExecutor
jest.mock('../../src/services/TradeExecutor');

// Mock modules
const mockTradeExecutor = {
  executeTrade: jest.fn()
};

const mockTradingViewParser = new TradingViewParser();

// Setup express app similar to main app
// We don't use express.json() for the webhook route since we need raw body for signature verification

// Add TradingView webhook endpoint (uses raw body for signature verification)
app.post('/webhook/tradingview', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('📈 TradingView webhook received');

    // Verify webhook signature if secret is configured
    if (process.env.TRADINGVIEW_WEBHOOK_SECRET) {
      const signature = req.headers['x-webhook-signature'] || req.headers['signature'];
      const isValid = mockTradingViewParser.verifyWebhookSignature(
        req.body, // Pass raw buffer for signature verification
        signature,
        process.env.TRADINGVIEW_WEBHOOK_SECRET
      );

      if (!isValid) {
        console.warn('⚠️ Invalid TradingView webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Parse the TradingView signal
    const signal = mockTradingViewParser.parseWebhook(req.body); // Pass raw buffer for parsing

    if (!signal) {
      console.warn('⚠️ Failed to parse TradingView webhook payload');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    console.log('✅ TradingView signal parsed:', {
      id: signal.id,
      symbol: signal.symbol,
      action: signal.action,
      price: signal.price
    });

    // Execute the trade
    const executionResult = await mockTradeExecutor.executeTrade(signal);

    if (executionResult.success) {
      console.log('🎯 TradingView signal executed successfully:', executionResult.orderId);
      res.json({
        success: true,
        signalId: signal.id,
        orderId: executionResult.orderId,
        message: 'Signal executed successfully'
      });
    } else {
      console.warn('⚠️ TradingView signal execution failed:', executionResult.reason);
      res.status(422).json({
        success: false,
        signalId: signal.id,
        reason: executionResult.reason,
        message: 'Signal execution failed'
      });
    }
  } catch (error) {
    console.error('❌ TradingView webhook error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

describe('TradingView Webhook Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.TRADINGVIEW_WEBHOOK_SECRET;
  });

  describe('Successful Signal Processing', () => {
    test('should process valid TradingView webhook and execute trade', async () => {
      const mockPayload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000,
        stop_loss: 43000,
        take_profit: 48000,
        quantity: 0.001
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456',
        symbol: 'BTCUSDT'
      });

      const response = await request(app).post('/webhook/tradingview').send(mockPayload).expect(200);

      expect(response.body).toEqual({
        success: true,
        signalId: expect.any(String),
        orderId: 'order_123456',
        message: 'Signal executed successfully'
      });

      expect(mockTradeExecutor.executeTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          action: 'buy',
          price: 45000,
          stopLoss: 43000,
          takeProfit: 48000,
          source: 'tradingview'
        })
      );
    });

    test('should handle different TradingView payload formats', async () => {
      const testCases = [
        {
          name: 'Standard format',
          payload: { symbol: 'ETHUSDT', action: 'sell', price: 2800 }
        },
        {
          name: 'Alternative field names',
          payload: { ticker: 'ADAUSDT', side: 'long', close: 0.45 }
        },
        {
          name: 'With metadata',
          payload: {
            symbol: 'SOLUSDT',
            direction: 'short',
            price: 120,
            alert: { name: 'SOL Short', id: 'alert_789' },
            strategy: { name: 'Mean Reversion', id: 'strat_456' }
          }
        }
      ];

      for (const testCase of testCases) {
        mockTradeExecutor.executeTrade.mockResolvedValue({
          success: true,
          orderId: `order_${Date.now()}`
        });

        const response = await request(app).post('/webhook/tradingview').send(testCase.payload).expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    test('should reject invalid webhook payloads', async () => {
      const invalidPayloads = [
        {}, // Empty payload
        { symbol: 'BTCUSDT' }, // Missing action
        { action: 'buy' }, // Missing symbol
        { symbol: 'INVALID', action: 'invalid_action' } // Invalid action
      ];

      for (const payload of invalidPayloads) {
        await request(app).post('/webhook/tradingview').send(payload).expect(400);
      }
    });

    test('should handle trade execution failures', async () => {
      const mockPayload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: false,
        reason: 'Insufficient balance'
      });

      const response = await request(app).post('/webhook/tradingview').send(mockPayload).expect(422);

      expect(response.body).toEqual({
        success: false,
        signalId: expect.any(String),
        reason: 'Insufficient balance',
        message: 'Signal execution failed'
      });
    });

    test('should handle malformed JSON', async () => {
      await request(app)
        .post('/webhook/tradingview')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400); // Express returns 400 for malformed JSON
    });
  });

  describe('Security Features', () => {
    test('should verify webhook signature when secret is configured', async () => {
      process.env.TRADINGVIEW_WEBHOOK_SECRET = 'test_secret_123';

      const payloadObj = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };
      const payloadString = JSON.stringify(payloadObj);

      // Test with invalid signature
      await request(app)
        .post('/webhook/tradingview')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', 'invalid_signature')
        .send(payloadObj) // Send as object, supertest will stringify and express.raw will parse as Buffer
        .expect(401);

      // Test with valid signature
      // The signature needs to be computed against the stringified JSON
      // because that's what express.raw will receive as a Buffer
      const crypto = require('crypto');
      const validSignature = crypto
        .createHmac('sha256', 'test_secret_123')
        .update(payloadString) // This matches what the Buffer.toString() will produce
        .digest('hex');

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456'
      });

      await request(app)
        .post('/webhook/tradingview')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', validSignature)
        .send(payloadObj) // Send as object, supertest will stringify and express.raw will parse as Buffer
        .expect(200);
    });

    test('should process requests without signature verification when secret not configured', async () => {
      // No TRADINGVIEW_WEBHOOK_SECRET set

      const payload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456'
      });

      await request(app).post('/webhook/tradingview').send(payload).expect(200);
    });
  });

  describe('Performance', () => {
    test('should process webhooks quickly', async () => {
      const payload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456'
      });

      const startTime = Date.now();

      await request(app).post('/webhook/tradingview').send(payload).expect(200);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(500); // Should process in less than 500ms
    });

    test('should handle multiple concurrent webhooks', async () => {
      const payload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456'
      });

      // Send 10 concurrent requests
      const requests = Array(10)
        .fill()
        .map(() => request(app).post('/webhook/tradingview').send(payload).expect(200));

      const results = await Promise.all(requests);

      // All requests should succeed
      results.forEach(response => {
        expect(response.body.success).toBe(true);
      });

      // Trade executor should be called for each request
      expect(mockTradeExecutor.executeTrade).toHaveBeenCalledTimes(10);
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log webhook processing steps', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const payload = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 45000
      };

      mockTradeExecutor.executeTrade.mockResolvedValue({
        success: true,
        orderId: 'order_123456'
      });

      await request(app).post('/webhook/tradingview').send(payload).expect(200);

      expect(consoleSpy).toHaveBeenCalledWith('📈 TradingView webhook received');
      expect(consoleSpy).toHaveBeenCalledWith('✅ TradingView signal parsed:', expect.any(Object));
      expect(consoleSpy).toHaveBeenCalledWith('🎯 TradingView signal executed successfully:', 'order_123456');

      consoleSpy.mockRestore();
    });
  });
});
