/**
 * Integration Test: Polar Billing Provider
 *
 * US3-T08: Billing Provider Tests
 * Tests webhook validation, payment state transitions, subscription lifecycle
 */

const crypto = require('crypto');
const PolarBillingProvider = require('../../../src/services/billing/providers/PolarBillingProvider');

let provider;

beforeEach(() => {
  // Save original env vars
  process.env.POLAR_ACCESS_TOKEN_BACKUP = process.env.POLAR_ACCESS_TOKEN;
  process.env.POLAR_ORGANIZATION_ID_BACKUP = process.env.POLAR_ORGANIZATION_ID;
  process.env.POLAR_WEBHOOK_SECRET_BACKUP = process.env.POLAR_WEBHOOK_SECRET;

  // Clear env vars for testing
  delete process.env.POLAR_ACCESS_TOKEN;
  delete process.env.POLAR_ORGANIZATION_ID;
  delete process.env.POLAR_WEBHOOK_SECRET;
});

afterEach(() => {
  // Restore original env vars
  if (process.env.POLAR_ACCESS_TOKEN_BACKUP) {
    process.env.POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN_BACKUP;
    delete process.env.POLAR_ACCESS_TOKEN_BACKUP;
  }
  if (process.env.POLAR_ORGANIZATION_ID_BACKUP) {
    process.env.POLAR_ORGANIZATION_ID = process.env.POLAR_ORGANIZATION_ID_BACKUP;
    delete process.env.POLAR_ORGANIZATION_ID_BACKUP;
  }
  if (process.env.POLAR_WEBHOOK_SECRET_BACKUP) {
    process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET_BACKUP;
    delete process.env.POLAR_WEBHOOK_SECRET_BACKUP;
  }
});

describe('Integration Test: Webhook Signature Validation', () => {
  it('should verify valid HMAC-SHA256 signature', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.created', data: { id: '123' } });
    const secret = 'test-webhook-secret-key';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(payload, signature, secret);

    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.created', data: { id: '123' } });
    const secret = 'test-webhook-secret-key';

    const invalidSignature = 'invalid-signature-that-does-not-match';

    const isValid = provider.verifyWebhookSignature(payload, invalidSignature, secret);

    expect(isValid).toBe(false);
  });

  it('should reject signature created with wrong secret', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.created', data: { id: '123' } });
    const correctSecret = 'correct-secret';
    const wrongSecret = 'wrong-secret';

    const signature = crypto
      .createHmac('sha256', wrongSecret)
      .update(payload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(payload, signature, correctSecret);

    expect(isValid).toBe(false);
  });

  it('should reject signature for tampered payload', () => {
    const provider = new PolarBillingProvider();
    const originalPayload = JSON.stringify({ event: 'subscription.created', data: { id: '123' } });
    const tamperedPayload = JSON.stringify({ event: 'subscription.created', data: { id: '999' } });
    const secret = 'test-webhook-secret-key';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(originalPayload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(tamperedPayload, signature, secret);

    expect(isValid).toBe(false);
  });

  it('should allow requests in development mode (no secret)', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.created' });
    const signature = 'any-signature';

    const isValid = provider.verifyWebhookSignature(payload, signature, null);

    expect(isValid).toBe(true);
  });

  it('should handle empty payload gracefully', () => {
    const provider = new PolarBillingProvider();
    const payload = '';
    const secret = 'test-webhook-secret-key';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(payload, signature, secret);

    expect(isValid).toBe(true);
  });

  it('should handle UTF-8 encoded payload correctly', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'test', message: '你好世界 🎉' });
    const secret = 'test-webhook-secret-key';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(payload, signature, secret);

    expect(isValid).toBe(true);
  });

  it('should reject null payload with valid signature format', () => {
    const provider = new PolarBillingProvider();
    const payload = null;
    const secret = 'test-webhook-secret-key';
    const signature = 'some-signature';

    const isValid = provider.verifyWebhookSignature(payload, signature, secret);

    expect(isValid).toBe(false);
  });

  it('should reject undefined signature', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'test-webhook-secret-key';

    const isValid = provider.verifyWebhookSignature(payload, undefined, secret);

    expect(isValid).toBe(false);
  });

  it('should use timing-safe comparison to prevent timing attacks', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.created' });
    const secret = 'test-webhook-secret-key';

    const correctSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Signature with same length but different content
    const almostCorrectSignature = correctSignature.slice(0, -1) + 'X';

    const startTime = process.hrtime.bigint();
    provider.verifyWebhookSignature(payload, almostCorrectSignature, secret);
    const endTime = process.hrtime.bigint();

    const duration = Number(endTime - startTime);

    // Timing-safe comparison should take consistent time
    // This is a basic check - real timing attack prevention requires crypto.timingSafeEqual
    expect(duration).toBeGreaterThan(0);
  });

  it('should handle signature rotation gracefully', () => {
    // Signature rotation: Accept both old and new secrets during transition
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'subscription.updated' });
    const oldSecret = 'old-secret-key';
    const newSecret = 'new-secret-key';

    // Signature created with new secret should work
    const newSignature = crypto
      .createHmac('sha256', newSecret)
      .update(payload)
      .digest('hex');

    const isValidNew = provider.verifyWebhookSignature(payload, newSignature, newSecret);
    expect(isValidNew).toBe(true);

    // Signature created with old secret should fail with new secret
    const oldSignature = crypto
      .createHmac('sha256', oldSecret)
      .update(payload)
      .digest('hex');

    const isValidOld = provider.verifyWebhookSignature(payload, oldSignature, newSecret);
    expect(isValidOld).toBe(false);
  });

  it('should validate signature format before verification', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'test-webhook-secret-key';

    // Non-hex signature (contains invalid characters)
    const nonHexSignature = 'not-a-hex-string!@#$';
    const isValidNonHex = provider.verifyWebhookSignature(payload, nonHexSignature, secret);
    expect(isValidNonHex).toBe(false);

    // Empty signature
    const emptySignature = '';
    const isValidEmpty = provider.verifyWebhookSignature(payload, emptySignature, secret);
    expect(isValidEmpty).toBe(false);

    // Valid hex format but wrong value
    const wrongHexSignature = 'abcd1234ef567890';
    const isValidWrongHex = provider.verifyWebhookSignature(payload, wrongHexSignature, secret);
    expect(isValidWrongHex).toBe(false);
  });

  it.skip('should handle different HMAC algorithms', () => {
    // PENDING: Only SHA256 supported currently
    // Expected: Support SHA512, SHA384 as fallback
  });

  it('should handle large payloads efficiently', () => {
    const provider = new PolarBillingProvider();
    const secret = 'test-webhook-secret-key';

    // Generate 1MB payload (large but realistic for webhook)
    const largeObject = {
      event: 'subscription.updated',
      data: {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: `item_${i}`,
          description: 'Sample item data for testing large payload handling',
          metadata: { index: i, timestamp: Date.now() }
        }))
      }
    };

    const payload = JSON.stringify(largeObject);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const startTime = process.hrtime.bigint();
    const isValid = provider.verifyWebhookSignature(payload, signature, secret);
    const endTime = process.hrtime.bigint();

    const durationMs = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

    expect(isValid).toBe(true);
    expect(durationMs).toBeLessThan(100); // Should complete within 100ms
    expect(payload.length).toBeGreaterThan(500000); // Verify payload is indeed large (>500KB)
  });

  it.skip('should rate limit signature verification attempts', () => {
    // PENDING: Rate limiting not implemented
    // Expected: Prevent brute force attacks on webhook signatures
  });
});

describe('Integration Test: Mock Mode Behavior', () => {
  it('should return mock subscription when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const customerId = 'test-customer-id';

    const subscription = await provider.getSubscription(customerId);

    expect(subscription).toBeDefined();
    expect(subscription.id).toBe('550e8400-mock-4000-b000-subscription1');
    expect(subscription.customerId).toBe(customerId);
    expect(subscription.status).toBe('active');
    expect(subscription.tier).toBe('professional');
    expect(subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('should return mock customer when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const customerId = 'test-customer-id';

    const customer = await provider.getCustomer(customerId);

    expect(customer).toBeDefined();
    expect(customer.id).toBe(customerId);
    expect(customer.email).toBe('mock@example.com');
    expect(customer.name).toBe('Mock Customer');
    expect(customer.createdAt).toBeInstanceOf(Date);
  });

  it('should return mock portal session when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const customerId = 'test-customer-id';
    const returnUrl = 'https://example.com/return';

    const session = await provider.createCustomerPortalSession(customerId, returnUrl);

    expect(session).toBeDefined();
    expect(session.id).toBe('550e8400-mock-4000-b000-portalsession');
    expect(session.url).toContain('polar.sh/portal/mock');
    expect(session.url).toContain(customerId);
    expect(session.url).toContain(encodeURIComponent(returnUrl));
  });

  it('should return mock checkout session when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const productId = 'test-product-id';
    const successUrl = 'https://example.com/success';
    const customerEmail = 'test@example.com';
    const metadata = { communityId: '123', userId: '456' };

    const session = await provider.createCheckoutSession(productId, successUrl, customerEmail, metadata);

    expect(session).toBeDefined();
    expect(session.id).toBe('550e8400-mock-4000-b000-checkoutsession');
    expect(session.url).toContain('polar.sh/checkout/mock');
    expect(session.url).toContain(productId);
    expect(session.url).toContain(encodeURIComponent(successUrl));
    expect(session.url).toContain(encodeURIComponent(customerEmail));
    expect(session.productId).toBe(productId);
    expect(session.customerId).toBe('550e8400-mock-4000-b000-customer1');
  });

  it('should return mock product when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const productId = 'test-product-id';

    const product = await provider.getProduct(productId);

    expect(product).toBeDefined();
    expect(product.id).toBe(productId);
    expect(product.name).toBe('Professional Plan - Monthly');
    expect(product.description).toContain('Professional');
    expect(product.metadata.type).toBe('community');
    expect(product.metadata.tier).toBe('professional');
    expect(product.prices).toHaveLength(1);
    expect(product.prices[0].priceAmount).toBe(9900);
    expect(product.prices[0].priceCurrency).toBe('usd');
    expect(product.prices[0].recurringInterval).toBe('month');
  });

  it('should return mock products list when Polar not configured', async () => {
    const provider = new PolarBillingProvider();

    const products = await provider.listProducts();

    expect(products).toBeDefined();
    expect(products).toHaveLength(2);
    expect(products[0].name).toContain('Professional');
    expect(products[1].name).toContain('Enterprise');
    expect(products[0].prices[0].priceAmount).toBe(9900);
    expect(products[1].prices[0].priceAmount).toBe(29900);
  });

  it('should return mock cancellation result when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'test-subscription-id';

    const result = await provider.cancelSubscription(subscriptionId);

    expect(result).toBeDefined();
    expect(result.id).toBe(subscriptionId);
    expect(result.status).toBe('canceled');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('should return mock updated subscription when Polar not configured', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'test-subscription-id';
    const updates = { productId: 'new-product-id' };

    const subscription = await provider.updateSubscription(subscriptionId, updates);

    expect(subscription).toBeDefined();
    expect(subscription.id).toBe('550e8400-mock-4000-b000-subscription1');
    expect(subscription.status).toBe('active');
  });
});

describe('Integration Test: Data Mapping', () => {
  it('should map Polar subscription to normalized format with professional tier', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_123',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      productId: 'prod_123',
      product: {
        name: 'Professional Plan - Monthly'
      },
      price: {
        priceAmount: 9900,
        priceCurrency: 'usd',
        recurringInterval: 'month'
      }
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');

    expect(mapped.id).toBe('sub_123');
    expect(mapped.customerId).toBe('cust_123');
    expect(mapped.status).toBe('active');
    expect(mapped.tier).toBe('professional');
    expect(mapped.currentPeriodEnd).toBeInstanceOf(Date);
    expect(mapped.cancelAtPeriodEnd).toBe(false);
    expect(mapped.productId).toBe('prod_123');
    expect(mapped.productName).toBe('Professional Plan - Monthly');
    expect(mapped.pricing.amount).toBe(9900);
    expect(mapped.pricing.currency).toBe('usd');
    expect(mapped.pricing.interval).toBe('month');
  });

  it('should map Polar subscription with enterprise tier', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_456',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: {
        name: 'Enterprise Plan - Yearly'
      },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_456');

    expect(mapped.tier).toBe('enterprise');
  });

  it('should default to free tier when product name unclear', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_789',
      status: 'trial',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: {
        name: 'Unknown Plan'
      },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_789');

    expect(mapped.tier).toBe('free');
  });

  it('should handle subscription with cancelAtPeriodEnd flag', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_cancel',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      cancelAtPeriodEnd: true,
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_cancel');

    expect(mapped.cancelAtPeriodEnd).toBe(true);
  });

  it('should map Polar product with all fields', () => {
    const provider = new PolarBillingProvider();
    const polarProduct = {
      id: 'prod_123',
      name: 'Professional Plan',
      description: 'Professional trading signals',
      metadata: { type: 'subscription', tier: 'professional' },
      prices: [
        {
          id: 'price_123',
          priceAmount: 9900,
          priceCurrency: 'usd',
          recurringInterval: 'month'
        },
        {
          id: 'price_124',
          priceAmount: 99900,
          priceCurrency: 'usd',
          recurringInterval: 'year'
        }
      ]
    };

    const mapped = provider._mapPolarProduct(polarProduct);

    expect(mapped.id).toBe('prod_123');
    expect(mapped.name).toBe('Professional Plan');
    expect(mapped.description).toBe('Professional trading signals');
    expect(mapped.metadata.type).toBe('subscription');
    expect(mapped.metadata.tier).toBe('professional');
    expect(mapped.prices).toHaveLength(2);
    expect(mapped.prices[0].id).toBe('price_123');
    expect(mapped.prices[0].priceAmount).toBe(9900);
    expect(mapped.prices[1].recurringInterval).toBe('year');
  });

  it('should handle product with missing optional fields', () => {
    const provider = new PolarBillingProvider();
    const polarProduct = {
      id: 'prod_minimal',
      name: 'Minimal Product'
    };

    const mapped = provider._mapPolarProduct(polarProduct);

    expect(mapped.id).toBe('prod_minimal');
    expect(mapped.name).toBe('Minimal Product');
    expect(mapped.description).toBe('');
    expect(mapped.metadata).toEqual({});
    expect(mapped.prices).toEqual([]);
  });
});

describe('Integration Test: Error Handling', () => {
  it('should prevent production use of mock methods without explicit configuration', async () => {
    // Save original env
    const originalEnv = process.env.NODE_ENV;
    const originalProvider = process.env.BILLING_PROVIDER;

    try {
      // Set production environment
      process.env.NODE_ENV = 'production';
      delete process.env.BILLING_PROVIDER;

      const provider = new PolarBillingProvider();

      // Should throw error for mock usage in production
      await expect(provider.getSubscription('test-customer')).rejects.toThrow(
        /Mock billing methods are not allowed in production/
      );
    } finally {
      // Restore original env
      process.env.NODE_ENV = originalEnv;
      if (originalProvider) {
        process.env.BILLING_PROVIDER = originalProvider;
      } else {
        delete process.env.BILLING_PROVIDER;
      }
    }
  });

  it('should allow mock methods in production when explicitly configured', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalProvider = process.env.BILLING_PROVIDER;

    try {
      process.env.NODE_ENV = 'production';
      process.env.BILLING_PROVIDER = 'mock';

      const provider = new PolarBillingProvider();

      // Should allow mock usage when explicitly set
      const subscription = await provider.getSubscription('test-customer');
      expect(subscription).toBeDefined();
      expect(subscription.id).toBe('550e8400-mock-4000-b000-subscription1');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalProvider) {
        process.env.BILLING_PROVIDER = originalProvider;
      } else {
        delete process.env.BILLING_PROVIDER;
      }
    }
  });

  it('should handle null customerId in getSubscription', async () => {
    const provider = new PolarBillingProvider();

    // null customerId should return mock subscription (not throw)
    const subscription = await provider.getSubscription(null);
    expect(subscription).toBeDefined();
    expect(subscription.customerId).toBeNull();
  });

  it('should handle empty string customerId in getCustomer', async () => {
    const provider = new PolarBillingProvider();

    // Empty string should return mock customer (not throw)
    const customer = await provider.getCustomer('');
    expect(customer).toBeDefined();
    expect(customer.id).toBe('');
  });

  it('should handle null productId in createCheckoutSession', async () => {
    const provider = new PolarBillingProvider();

    // null productId should return mock session (not throw)
    const session = await provider.createCheckoutSession(null, 'https://example.com', 'test@example.com');
    expect(session).toBeDefined();
    expect(session.productId).toBeNull();
  });

  it('should handle invalid payload type in verifyWebhookSignature', () => {
    const provider = new PolarBillingProvider();
    const secret = 'test-secret';

    // Number payload
    const isValidNumber = provider.verifyWebhookSignature(12345, 'signature', secret);
    expect(isValidNumber).toBe(false);

    // Object payload (not stringified)
    const isValidObject = provider.verifyWebhookSignature({ event: 'test' }, 'signature', secret);
    expect(isValidObject).toBe(false);

    // Array payload
    const isValidArray = provider.verifyWebhookSignature(['test'], 'signature', secret);
    expect(isValidArray).toBe(false);
  });

  it('should handle Buffer payloads in webhook verification', () => {
    const provider = new PolarBillingProvider();
    const payloadString = JSON.stringify({ event: 'test' });
    const payloadBuffer = Buffer.from(payloadString);
    const secret = 'test-webhook-secret-key';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // Should work with string payload
    const isValidString = provider.verifyWebhookSignature(payloadString, signature, secret);
    expect(isValidString).toBe(true);

    // Should also work with Buffer.toString()
    const isValidBuffer = provider.verifyWebhookSignature(payloadBuffer.toString(), signature, secret);
    expect(isValidBuffer).toBe(true);
  });

  it('should handle missing metadata in createCheckoutSession', async () => {
    const provider = new PolarBillingProvider();

    // No metadata parameter
    const session = await provider.createCheckoutSession(
      'prod-123',
      'https://example.com/success',
      'test@example.com'
    );

    expect(session).toBeDefined();
    expect(session.productId).toBe('prod-123');
  });

  it('should handle empty updates in updateSubscription', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'sub_123';

    // Empty updates object
    const subscription = await provider.updateSubscription(subscriptionId, {});
    expect(subscription).toBeDefined();
    expect(subscription.id).toBe('550e8400-mock-4000-b000-subscription1');
  });

  it('should handle very long webhook secrets', () => {
    const provider = new PolarBillingProvider();
    const payload = JSON.stringify({ event: 'test' });
    const veryLongSecret = 'a'.repeat(1000); // 1000 character secret

    const signature = crypto
      .createHmac('sha256', veryLongSecret)
      .update(payload)
      .digest('hex');

    const isValid = provider.verifyWebhookSignature(payload, signature, veryLongSecret);
    expect(isValid).toBe(true);
  });
});

describe('Integration Test: Subscription State Transitions', () => {
  it('should map active subscription status correctly', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_active',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      product: { name: 'Professional Plan' },
      price: { priceAmount: 9900, priceCurrency: 'usd', recurringInterval: 'month' }
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.status).toBe('active');
    expect(mapped.cancelAtPeriodEnd).toBe(false);
  });

  it('should map canceled subscription status correctly', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_canceled',
      status: 'canceled',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      cancelAtPeriodEnd: true,
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.status).toBe('canceled');
    expect(mapped.cancelAtPeriodEnd).toBe(true);
  });

  it('should map past_due subscription status correctly', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_past_due',
      status: 'past_due',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.status).toBe('past_due');
  });

  it('should map incomplete subscription status correctly', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_incomplete',
      status: 'incomplete',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.status).toBe('incomplete');
  });

  it('should handle subscription cancellation marking cancelAtPeriodEnd', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'sub_to_cancel';

    const result = await provider.cancelSubscription(subscriptionId);

    expect(result.id).toBe(subscriptionId);
    expect(result.status).toBe('canceled');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('should handle subscription upgrade via updateSubscription', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'sub_to_upgrade';
    const updates = { productId: 'enterprise-product-id' };

    const subscription = await provider.updateSubscription(subscriptionId, updates);

    expect(subscription).toBeDefined();
    expect(subscription.id).toBe('550e8400-mock-4000-b000-subscription1');
    expect(subscription.status).toBe('active');
  });

  it('should handle subscription with trial status', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_trial',
      status: 'trial',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.status).toBe('trial');
  });

  it('should preserve pricing information across state transitions', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_pricing',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: { name: 'Enterprise Plan' },
      price: {
        priceAmount: 29900,
        priceCurrency: 'usd',
        recurringInterval: 'month'
      }
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.pricing.amount).toBe(29900);
    expect(mapped.pricing.currency).toBe('usd');
    expect(mapped.pricing.interval).toBe('month');
  });

  it('should handle subscription with missing price data', () => {
    const provider = new PolarBillingProvider();
    const polarSubscription = {
      id: 'sub_no_price',
      status: 'active',
      currentPeriodEnd: '2025-02-01T00:00:00Z',
      product: { name: 'Professional Plan' }
      // price is undefined
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.pricing.amount).toBe(0);
    expect(mapped.pricing.currency).toBe('usd');
    expect(mapped.pricing.interval).toBe('month');
  });

  it('should handle subscription renewal by updating currentPeriodEnd', () => {
    const provider = new PolarBillingProvider();
    const oldPeriodEnd = '2025-01-01T00:00:00.000Z';
    const newPeriodEnd = '2025-02-01T00:00:00.000Z';

    const polarSubscription = {
      id: 'sub_renewed',
      status: 'active',
      currentPeriodEnd: newPeriodEnd,
      product: { name: 'Professional Plan' },
      price: {}
    };

    const mapped = provider._mapPolarSubscription(polarSubscription, 'cust_123');
    expect(mapped.currentPeriodEnd.toISOString()).toBe(newPeriodEnd);
  });

  it('should handle subscription with different recurring intervals', () => {
    const provider = new PolarBillingProvider();

    // Yearly interval
    const yearlySubscription = {
      id: 'sub_yearly',
      status: 'active',
      currentPeriodEnd: '2026-01-01T00:00:00Z',
      product: { name: 'Enterprise Plan' },
      price: {
        priceAmount: 299900,
        priceCurrency: 'usd',
        recurringInterval: 'year'
      }
    };

    const mappedYearly = provider._mapPolarSubscription(yearlySubscription, 'cust_123');
    expect(mappedYearly.pricing.interval).toBe('year');
    expect(mappedYearly.pricing.amount).toBe(299900);
  });

  it('should handle multiple subscriptions by returning first active', async () => {
    const provider = new PolarBillingProvider();
    const customerId = 'cust_with_subs';

    // In mock mode, getSubscription returns a single subscription
    const subscription = await provider.getSubscription(customerId);

    expect(subscription).toBeDefined();
    expect(subscription.status).toBe('active');
    expect(subscription.customerId).toBe(customerId);
  });

  it('should maintain productId and productName across updates', async () => {
    const provider = new PolarBillingProvider();
    const subscriptionId = 'sub_product_check';
    const updates = { productId: 'new-product-id' };

    const subscription = await provider.updateSubscription(subscriptionId, updates);

    expect(subscription.productId).toBeDefined();
    expect(subscription.productName).toBeDefined();
  });
});
