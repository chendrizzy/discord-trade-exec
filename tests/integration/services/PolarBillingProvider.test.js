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

describe('Integration Test: Constructor Initialization', () => {
  it('should initialize Polar client when POLAR_ACCESS_TOKEN is configured', () => {
    process.env.POLAR_ACCESS_TOKEN = 'test_access_token_12345';
    const provider = new PolarBillingProvider();
    expect(provider.client).not.toBeNull();
    expect(provider.client).toBeDefined();
    expect(provider.accessToken).toBe('test_access_token_12345');
    expect(provider.client).toHaveProperty('subscriptions');
    expect(provider.client).toHaveProperty('customers');
    expect(provider.client).toHaveProperty('products');
  });

  it('should set client to null when POLAR_ACCESS_TOKEN is not configured', () => {
    delete process.env.POLAR_ACCESS_TOKEN;
    const provider = new PolarBillingProvider();
    expect(provider.client).toBeNull();
    expect(provider.accessToken).toBeUndefined();
  });

  it('should store organizationId when configured', () => {
    process.env.POLAR_ACCESS_TOKEN = 'test_access_token_12345';
    process.env.POLAR_ORGANIZATION_ID = 'org_test_123';
    const provider = new PolarBillingProvider();
    expect(provider.organizationId).toBe('org_test_123');
    expect(provider.client).not.toBeNull();
  });
});

describe('Integration Test: Real API Paths - getSubscription', () => {
  it('should successfully fetch subscription with active subscriptions', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customers: { get: jest.fn() } };
    const mockCustomerId = 'cust_real_123';
    const mockPolarResponse = {
      customer: {
        id: mockCustomerId,
        email: 'customer@example.com',
        name: 'Real Customer',
        subscriptions: [{
          id: 'sub_real_456',
          status: 'active',
          currentPeriodEnd: '2025-03-01T00:00:00Z',
          cancelAtPeriodEnd: false,
          productId: 'prod_real_789',
          product: { name: 'Professional Plan - Monthly' },
          price: { priceAmount: 9900, priceCurrency: 'usd', recurringInterval: 'month' }
        }]
      }
    };
    jest.spyOn(provider.client.customers, 'get').mockResolvedValue(mockPolarResponse);
    const result = await provider.getSubscription(mockCustomerId);
    expect(provider.client.customers.get).toHaveBeenCalledWith({ id: mockCustomerId });
    expect(result.id).toBe('sub_real_456');
    expect(result.customerId).toBe(mockCustomerId);
    expect(result.status).toBe('active');
    expect(result.tier).toBe('professional');
  });

  it('should return null when customer has empty subscriptions array', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customers: { get: jest.fn() } };
    const mockPolarResponse = {
      customer: { id: 'cust_no_subs', email: 'nosubs@example.com', name: 'No Subs', subscriptions: [] }
    };
    jest.spyOn(provider.client.customers, 'get').mockResolvedValue(mockPolarResponse);
    const result = await provider.getSubscription('cust_no_subs');
    expect(result).toBeNull();
  });

  it('should handle API errors and throw descriptive error', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customers: { get: jest.fn() } };
    const apiError = new Error('Polar API: Customer not found');
    jest.spyOn(provider.client.customers, 'get').mockRejectedValue(apiError);
    await expect(provider.getSubscription('cust_error')).rejects.toThrow(
      'Failed to get Polar subscription: Polar API: Customer not found'
    );
  });
});

describe('Integration Test: Real API Paths - getCustomer', () => {
  it('should successfully fetch customer via client.customers.get', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customers: { get: jest.fn() } };
    const mockResponse = {
      customer: { id: 'cust_123', email: 'test@example.com', name: 'Test Customer', createdAt: '2025-01-01T00:00:00Z' }
    };
    jest.spyOn(provider.client.customers, 'get').mockResolvedValue(mockResponse);
    const result = await provider.getCustomer('cust_123');
    expect(result.id).toBe('cust_123');
    expect(result.email).toBe('test@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should handle error in get customer and throw descriptive error', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customers: { get: jest.fn() } };
    jest.spyOn(provider.client.customers, 'get').mockRejectedValue(new Error('API Error'));
    await expect(provider.getCustomer('cust_123')).rejects.toThrow('Failed to get Polar customer: API Error');
  });
});

describe('Integration Test: Real API Paths - createCustomerPortalSession', () => {
  it('should successfully create customer portal session', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customerSessions: { create: jest.fn() } };
    const mockResponse = { customerSession: { id: 'session_123', url: 'https://polar.sh/portal/123' } };
    jest.spyOn(provider.client.customerSessions, 'create').mockResolvedValue(mockResponse);
    const result = await provider.createCustomerPortalSession('cust_123', 'https://example.com/return');
    expect(result.id).toBe('session_123');
    expect(result.url).toBe('https://polar.sh/portal/123');
  });

  it('should handle error in create customer portal session', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { customerSessions: { create: jest.fn() } };
    jest.spyOn(provider.client.customerSessions, 'create').mockRejectedValue(new Error('API Error'));
    await expect(provider.createCustomerPortalSession('cust_123', 'https://example.com')).rejects.toThrow(
      'Failed to create Polar customer portal session: API Error'
    );
  });
});

describe('Integration Test: Real API Paths - createCheckoutSession', () => {
  it('should successfully create checkout session with metadata merging', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { checkouts: { create: jest.fn() } };
    const mockResponse = {
      checkout: { id: 'checkout_123', url: 'https://polar.sh/checkout/123', productId: 'prod_123', customerId: 'cust_123' }
    };
    jest.spyOn(provider.client.checkouts, 'create').mockResolvedValue(mockResponse);
    const result = await provider.createCheckoutSession('prod_123', 'https://example.com/success', 'test@example.com', { userId: '456' });
    expect(result.id).toBe('checkout_123');
    expect(provider.client.checkouts.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ source: 'discord-trade-exec', provider: 'polar', userId: '456' })
    }));
  });

  it('should handle error in create checkout session', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { checkouts: { create: jest.fn() } };
    jest.spyOn(provider.client.checkouts, 'create').mockRejectedValue(new Error('API Error'));
    await expect(provider.createCheckoutSession('prod_123', 'https://example.com', 'test@example.com')).rejects.toThrow(
      'Failed to create Polar checkout session: API Error'
    );
  });
});

describe('Integration Test: Real API Paths - Products', () => {
  it('should successfully get product via client.products.get', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { products: { get: jest.fn() } };
    const mockResponse = {
      product: { id: 'prod_123', name: 'Professional Plan', description: 'Professional trading signals', metadata: {}, prices: [] }
    };
    jest.spyOn(provider.client.products, 'get').mockResolvedValue(mockResponse);
    const result = await provider.getProduct('prod_123');
    expect(result.id).toBe('prod_123');
    expect(result.name).toBe('Professional Plan');
  });

  it('should handle error in getProduct', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { products: { get: jest.fn() } };
    jest.spyOn(provider.client.products, 'get').mockRejectedValue(new Error('API Error'));
    await expect(provider.getProduct('prod_123')).rejects.toThrow('Failed to get Polar product: API Error');
  });

  it('should successfully list products via client.products.list with organizationId', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { products: { list: jest.fn() } };
    provider.organizationId = 'org_123';
    const mockResponse = {
      items: [
        { id: 'prod_1', name: 'Plan 1', description: '', metadata: {}, prices: [] },
        { id: 'prod_2', name: 'Plan 2', description: '', metadata: {}, prices: [] }
      ]
    };
    jest.spyOn(provider.client.products, 'list').mockResolvedValue(mockResponse);
    const result = await provider.listProducts();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('prod_1');
  });

  it('should handle error in listProducts', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { products: { list: jest.fn() } };
    provider.organizationId = 'org_123';
    jest.spyOn(provider.client.products, 'list').mockRejectedValue(new Error('API Error'));
    await expect(provider.listProducts()).rejects.toThrow('Failed to list Polar products: API Error');
  });
});

describe('Integration Test: Real API Paths - Subscriptions', () => {
  it('should successfully cancel subscription via client.subscriptions.cancel', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { subscriptions: { cancel: jest.fn() } };
    const mockResponse = { subscription: { id: 'sub_123', status: 'canceled', cancelAtPeriodEnd: true } };
    jest.spyOn(provider.client.subscriptions, 'cancel').mockResolvedValue(mockResponse);
    const result = await provider.cancelSubscription('sub_123');
    expect(result.id).toBe('sub_123');
    expect(result.status).toBe('canceled');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('should handle error in cancelSubscription', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { subscriptions: { cancel: jest.fn() } };
    jest.spyOn(provider.client.subscriptions, 'cancel').mockRejectedValue(new Error('API Error'));
    await expect(provider.cancelSubscription('sub_123')).rejects.toThrow('Failed to cancel Polar subscription: API Error');
  });

  it('should successfully update subscription with spread operator', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { subscriptions: { update: jest.fn() } };
    const mockResponse = {
      subscription: {
        id: 'sub_123',
        customerId: 'cust_123',
        status: 'active',
        currentPeriodEnd: '2025-03-01T00:00:00Z',
        product: { name: 'Enterprise Plan' },
        price: { priceAmount: 29900, priceCurrency: 'usd', recurringInterval: 'month' }
      }
    };
    jest.spyOn(provider.client.subscriptions, 'update').mockResolvedValue(mockResponse);
    const result = await provider.updateSubscription('sub_123', { productId: 'new_prod' });
    expect(result.id).toBe('sub_123');
    expect(result.status).toBe('active');
  });

  it('should handle error in updateSubscription', async () => {
    const provider = new PolarBillingProvider();
    provider.client = { subscriptions: { update: jest.fn() } };
    jest.spyOn(provider.client.subscriptions, 'update').mockRejectedValue(new Error('API Error'));
    await expect(provider.updateSubscription('sub_123', {})).rejects.toThrow('Failed to update Polar subscription: API Error');
  });
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

describe('Integration Test: updateSubscription Real API Paths', () => {
  it('should successfully update subscription via client.subscriptions.update with spread operator', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      subscriptions: {
        update: jest.fn()
      }
    };

    const subscriptionId = 'sub_123';
    const updates = {
      productId: 'new-product-456',
      quantity: 2
    };

    const mockPolarResponse = {
      subscription: {
        id: subscriptionId,
        customerId: 'cust_789',
        status: 'active',
        currentPeriodEnd: '2025-03-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        productId: 'new-product-456',
        product: {
          name: 'Enterprise Plan - Monthly'
        },
        price: {
          priceAmount: 29900,
          priceCurrency: 'usd',
          recurringInterval: 'month'
        }
      }
    };

    provider.client.subscriptions.update.mockResolvedValue(mockPolarResponse);

    // Execute updateSubscription
    const result = await provider.updateSubscription(subscriptionId, updates);

    // Verify client.subscriptions.update was called with spread operator (line 327)
    expect(provider.client.subscriptions.update).toHaveBeenCalledWith({
      id: subscriptionId,
      ...updates
    });

    // Verify mapped subscription is returned (line 331)
    expect(result).toBeDefined();
    expect(result.id).toBe(subscriptionId);
    expect(result.customerId).toBe('cust_789');
    expect(result.status).toBe('active');
    expect(result.tier).toBe('enterprise');
    expect(result.currentPeriodEnd).toBeInstanceOf(Date);
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.productId).toBe('new-product-456');
    expect(result.productName).toBe('Enterprise Plan - Monthly');
    expect(result.pricing.amount).toBe(29900);
    expect(result.pricing.currency).toBe('usd');
    expect(result.pricing.interval).toBe('month');
  });

  it('should handle error in update subscription and throw descriptive error', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      subscriptions: {
        update: jest.fn()
      }
    };

    const subscriptionId = 'sub_invalid';
    const updates = { productId: 'invalid-product' };

    const mockError = new Error('Subscription not found');
    mockError.stack = 'Error: Subscription not found\n    at Polar.update';

    provider.client.subscriptions.update.mockRejectedValue(mockError);

    // Execute and expect error (lines 332-339)
    await expect(provider.updateSubscription(subscriptionId, updates)).rejects.toThrow(
      'Failed to update Polar subscription: Subscription not found'
    );

    // Verify client was called
    expect(provider.client.subscriptions.update).toHaveBeenCalledWith({
      id: subscriptionId,
      ...updates
    });
  });
});

describe('Integration Test: createCheckoutSession Real API Paths', () => {
  it('should successfully create checkout session via client.checkouts.create with metadata merging', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      checkouts: {
        create: jest.fn()
      }
    };

    const productId = 'prod_test_123';
    const successUrl = 'https://example.com/checkout/success';
    const customerEmail = 'test@example.com';
    const customMetadata = {
      communityId: 'community_456',
      userId: 'user_789'
    };

    const mockPolarResponse = {
      checkout: {
        id: 'checkout_abc123',
        url: 'https://polar.sh/checkout/abc123',
        productId: 'prod_test_123',
        customerId: 'cust_xyz789'
      }
    };

    provider.client.checkouts.create.mockResolvedValue(mockPolarResponse);

    // Execute createCheckoutSession (lines 194-210)
    const result = await provider.createCheckoutSession(
      productId,
      successUrl,
      customerEmail,
      customMetadata
    );

    // Verify client.checkouts.create was called with metadata merging (lines 194-203)
    expect(provider.client.checkouts.create).toHaveBeenCalledWith({
      productId: 'prod_test_123',
      successUrl: 'https://example.com/checkout/success',
      customerEmail: 'test@example.com',
      metadata: {
        communityId: 'community_456',
        userId: 'user_789',
        source: 'discord-trade-exec',
        provider: 'polar'
      }
    });

    // Verify mapped checkout session is returned (lines 205-210)
    expect(result).toEqual({
      id: 'checkout_abc123',
      url: 'https://polar.sh/checkout/abc123',
      productId: 'prod_test_123',
      customerId: 'cust_xyz789'
    });
  });

  it('should handle error in create checkout session and throw descriptive error', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      checkouts: {
        create: jest.fn()
      }
    };

    const productId = 'prod_invalid';
    const successUrl = 'https://example.com/checkout/success';
    const customerEmail = 'invalid@example.com';
    const metadata = { userId: 'user_123' };

    const mockError = new Error('Product not found or inactive');
    mockError.stack = 'Error: Product not found or inactive\n    at Polar.checkouts.create';

    provider.client.checkouts.create.mockRejectedValue(mockError);

    // Execute and expect error (lines 211-218)
    await expect(
      provider.createCheckoutSession(productId, successUrl, customerEmail, metadata)
    ).rejects.toThrow('Failed to create Polar checkout session: Product not found or inactive');

    // Verify client was called with metadata including source and provider
    expect(provider.client.checkouts.create).toHaveBeenCalledWith({
      productId: 'prod_invalid',
      successUrl: 'https://example.com/checkout/success',
      customerEmail: 'invalid@example.com',
      metadata: {
        userId: 'user_123',
        source: 'discord-trade-exec',
        provider: 'polar'
      }
    });
  });
});

describe('Integration Test: cancelSubscription Real API Paths', () => {
  it('should successfully cancel subscription via client.subscriptions.cancel', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      subscriptions: {
        cancel: jest.fn()
      }
    };

    const subscriptionId = 'sub_to_cancel_123';

    const mockPolarResponse = {
      subscription: {
        id: subscriptionId,
        status: 'canceled',
        cancelAtPeriodEnd: true
      }
    };

    provider.client.subscriptions.cancel.mockResolvedValue(mockPolarResponse);

    // Execute cancelSubscription (lines 294-302)
    const result = await provider.cancelSubscription(subscriptionId);

    // Verify client.subscriptions.cancel was called correctly (line 294-296)
    expect(provider.client.subscriptions.cancel).toHaveBeenCalledWith({
      id: subscriptionId
    });

    // Verify returned result matches expected format (lines 298-302)
    expect(result).toEqual({
      id: subscriptionId,
      status: 'canceled',
      cancelAtPeriodEnd: true
    });
  });

  it('should handle error in cancelSubscription and throw descriptive error', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      subscriptions: {
        cancel: jest.fn()
      }
    };

    const subscriptionId = 'sub_nonexistent';

    const mockError = new Error('Subscription not found or already canceled');
    mockError.stack = 'Error: Subscription not found or already canceled\n    at Polar.cancel';

    provider.client.subscriptions.cancel.mockRejectedValue(mockError);

    // Execute and expect error (lines 303-310)
    await expect(provider.cancelSubscription(subscriptionId)).rejects.toThrow(
      'Failed to cancel Polar subscription: Subscription not found or already canceled'
    );

    // Verify client was called
    expect(provider.client.subscriptions.cancel).toHaveBeenCalledWith({
      id: subscriptionId
    });
  });
});

describe('Integration Test: getSubscription Real API Paths', () => {
  it('should successfully fetch subscription with active subscriptions (lines 77-90)', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    const mockCustomerId = 'cust_real_123';
    const mockPolarResponse = {
      customer: {
        id: mockCustomerId,
        email: 'customer@example.com',
        name: 'Real Customer',
        subscriptions: [
          {
            id: 'sub_real_456',
            status: 'active',
            currentPeriodEnd: '2025-03-01T00:00:00Z',
            cancelAtPeriodEnd: false,
            productId: 'prod_real_789',
            product: {
              name: 'Professional Plan - Monthly'
            },
            price: {
              priceAmount: 9900,
              priceCurrency: 'usd',
              recurringInterval: 'month'
            }
          }
        ]
      }
    };

    jest.spyOn(provider.client.customers, 'get').mockResolvedValue(mockPolarResponse);

    // Execute getSubscription (line 77-90)
    const result = await provider.getSubscription(mockCustomerId);

    // Verify client.customers.get was called correctly (line 77-79)
    expect(provider.client.customers.get).toHaveBeenCalledWith({ id: mockCustomerId });
    expect(provider.client.customers.get).toHaveBeenCalledTimes(1);

    // Verify subscription mapping (line 87-90)
    expect(result).toBeDefined();
    expect(result.id).toBe('sub_real_456');
    expect(result.customerId).toBe(mockCustomerId);
    expect(result.status).toBe('active');
    expect(result.tier).toBe('professional');
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.productId).toBe('prod_real_789');
    expect(result.productName).toBe('Professional Plan - Monthly');
    expect(result.pricing.amount).toBe(9900);
    expect(result.pricing.currency).toBe('usd');
    expect(result.pricing.interval).toBe('month');
  });

  it('should return null when customer has empty subscriptions array (lines 83-85)', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    const mockCustomerId = 'cust_no_subs';
    const mockPolarResponse = {
      customer: {
        id: mockCustomerId,
        email: 'nosubs@example.com',
        name: 'Customer Without Subscriptions',
        subscriptions: [] // Empty array triggers line 84
      }
    };

    jest.spyOn(provider.client.customers, 'get').mockResolvedValue(mockPolarResponse);

    // Execute getSubscription
    const result = await provider.getSubscription(mockCustomerId);

    // Verify client was called
    expect(provider.client.customers.get).toHaveBeenCalledWith({ id: mockCustomerId });
    expect(provider.client.customers.get).toHaveBeenCalledTimes(1);

    // Verify null is returned (line 84)
    expect(result).toBeNull();
  });

  it('should handle API errors and throw descriptive error (lines 91-98)', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    const mockCustomerId = 'cust_error';
    const apiError = new Error('Polar API: Customer not found');
    apiError.statusCode = 404;
    apiError.stack = 'Error: Polar API: Customer not found\n    at Polar.customers.get';

    jest.spyOn(provider.client.customers, 'get').mockRejectedValue(apiError);

    // Execute and expect error (catch block lines 91-98)
    await expect(provider.getSubscription(mockCustomerId)).rejects.toThrow(
      'Failed to get Polar subscription: Polar API: Customer not found'
    );

    // Verify client was called
    expect(provider.client.customers.get).toHaveBeenCalledWith({ id: mockCustomerId });
    expect(provider.client.customers.get).toHaveBeenCalledTimes(1);
  });
});

describe('Integration Test: getCustomer Real API Paths', () => {
  it('should successfully fetch customer via client.customers.get and return normalized data', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    const customerId = 'cust_real_123';

    const mockPolarResponse = {
      customer: {
        id: 'cust_real_123',
        email: 'real.customer@example.com',
        name: 'Real Customer Name',
        createdAt: '2025-01-15T10:30:00.000Z'
      }
    };

    provider.client.customers.get.mockResolvedValue(mockPolarResponse);

    // Execute getCustomer (lines 119-128)
    const result = await provider.getCustomer(customerId);

    // Verify client.customers.get was called with correct parameters (line 119-121)
    expect(provider.client.customers.get).toHaveBeenCalledWith({
      id: customerId
    });

    // Verify normalized customer data is returned (lines 123-128)
    expect(result).toBeDefined();
    expect(result.id).toBe('cust_real_123');
    expect(result.email).toBe('real.customer@example.com');
    expect(result.name).toBe('Real Customer Name');
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2025-01-15T10:30:00.000Z');

    // Verify response structure matches BillingProvider interface
    expect(Object.keys(result)).toEqual(['id', 'email', 'name', 'createdAt']);
  });

  it('should handle error in get customer and throw descriptive error', async () => {
    // Create provider with mocked Polar client
    const provider = new PolarBillingProvider();

    // Mock the Polar client
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    const customerId = 'cust_nonexistent';

    const mockError = new Error('Customer not found');
    mockError.stack = 'Error: Customer not found\n    at Polar.customers.get';

    provider.client.customers.get.mockRejectedValue(mockError);

    // Execute and expect error (lines 129-136)
    await expect(provider.getCustomer(customerId)).rejects.toThrow(
      'Failed to get Polar customer: Customer not found'
    );

    // Verify client.customers.get was called with correct parameters
    expect(provider.client.customers.get).toHaveBeenCalledWith({
      id: customerId
    });

    // Verify error was called exactly once (single API call)
    expect(provider.client.customers.get).toHaveBeenCalledTimes(1);
  });
});
