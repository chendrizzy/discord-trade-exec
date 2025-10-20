/**
 * Billing Provider Integration Tests
 *
 * Tests the billing provider abstraction layer for:
 * - Factory pattern correctness
 * - Provider interface compliance
 * - Polar provider implementation
 * - Stripe provider stub behavior
 * - Webhook signature verification
 * - Data format normalization
 */

const BillingProviderFactory = require('../../src/services/billing/BillingProviderFactory');
const PolarBillingProvider = require('../../src/services/billing/providers/PolarBillingProvider');
const StripeBillingProvider = require('../../src/services/billing/providers/StripeBillingProvider');
const crypto = require('crypto');

describe('Billing Provider Abstraction', () => {
  describe('BillingProviderFactory', () => {
    it('should create Polar provider by default', () => {
      const originalEnv = process.env.BILLING_PROVIDER;
      delete process.env.BILLING_PROVIDER;

      const provider = BillingProviderFactory.createProvider();
      expect(provider).toBeInstanceOf(PolarBillingProvider);

      process.env.BILLING_PROVIDER = originalEnv;
    });

    it('should create Polar provider when explicitly set', () => {
      const originalEnv = process.env.BILLING_PROVIDER;
      process.env.BILLING_PROVIDER = 'polar';

      const provider = BillingProviderFactory.createProvider();
      expect(provider).toBeInstanceOf(PolarBillingProvider);

      process.env.BILLING_PROVIDER = originalEnv;
    });

    it('should create Stripe provider when set', () => {
      const originalEnv = process.env.BILLING_PROVIDER;
      process.env.BILLING_PROVIDER = 'stripe';

      const provider = BillingProviderFactory.createProvider();
      expect(provider).toBeInstanceOf(StripeBillingProvider);

      process.env.BILLING_PROVIDER = originalEnv;
    });

    it('should throw error for unsupported provider', () => {
      const originalEnv = process.env.BILLING_PROVIDER;
      process.env.BILLING_PROVIDER = 'paypal';

      expect(() => BillingProviderFactory.createProvider()).toThrow(/Unsupported billing provider/);

      process.env.BILLING_PROVIDER = originalEnv;
    });

    it('should return current provider type', () => {
      const originalEnv = process.env.BILLING_PROVIDER;
      process.env.BILLING_PROVIDER = 'stripe';

      expect(BillingProviderFactory.getProviderType()).toBe('stripe');

      process.env.BILLING_PROVIDER = originalEnv;
    });

    it('should check if provider type is supported', () => {
      expect(BillingProviderFactory.isSupported('polar')).toBe(true);
      expect(BillingProviderFactory.isSupported('stripe')).toBe(true);
      expect(BillingProviderFactory.isSupported('paypal')).toBe(false);
      expect(BillingProviderFactory.isSupported('')).toBe(false);
      expect(BillingProviderFactory.isSupported(null)).toBe(false);
    });

    it('should list all supported providers', () => {
      const providers = BillingProviderFactory.getSupportedProviders();
      expect(providers).toEqual(['polar', 'stripe']);
    });
  });

  describe('PolarBillingProvider - Interface Compliance', () => {
    let provider;

    beforeAll(() => {
      provider = new PolarBillingProvider();
    });

    it('should implement getSubscription method', () => {
      expect(typeof provider.getSubscription).toBe('function');
    });

    it('should implement getCustomer method', () => {
      expect(typeof provider.getCustomer).toBe('function');
    });

    it('should implement createCustomerPortalSession method', () => {
      expect(typeof provider.createCustomerPortalSession).toBe('function');
    });

    it('should implement createCheckoutSession method', () => {
      expect(typeof provider.createCheckoutSession).toBe('function');
    });

    it('should implement getProduct method', () => {
      expect(typeof provider.getProduct).toBe('function');
    });

    it('should implement listProducts method', () => {
      expect(typeof provider.listProducts).toBe('function');
    });

    it('should implement cancelSubscription method', () => {
      expect(typeof provider.cancelSubscription).toBe('function');
    });

    it('should implement updateSubscription method', () => {
      expect(typeof provider.updateSubscription).toBe('function');
    });

    it('should implement verifyWebhookSignature method', () => {
      expect(typeof provider.verifyWebhookSignature).toBe('function');
    });
  });

  describe('PolarBillingProvider - Mock Data (No API Key)', () => {
    let provider;

    beforeAll(() => {
      // Ensure no Polar API key is set for mock data tests
      delete process.env.POLAR_ACCESS_TOKEN;
      provider = new PolarBillingProvider();
    });

    it('should return mock subscription when Polar not configured', async () => {
      const customerId = 'test-customer-123';
      const subscription = await provider.getSubscription(customerId);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.customerId).toBe(customerId);
      expect(subscription.status).toBe('active');
      expect(subscription.tier).toBe('professional');
      expect(subscription.pricing).toBeDefined();
      expect(subscription.pricing.amount).toBe(9900);
      expect(subscription.pricing.currency).toBe('usd');
      expect(subscription.pricing.interval).toBe('month');
    });

    it('should return mock customer when Polar not configured', async () => {
      const customerId = 'test-customer-456';
      const customer = await provider.getCustomer(customerId);

      expect(customer).toBeDefined();
      expect(customer.id).toBe(customerId);
      expect(customer.email).toBe('mock@example.com');
      expect(customer.name).toBe('Mock Customer');
      expect(customer.createdAt).toBeInstanceOf(Date);
    });

    it('should return mock portal session when Polar not configured', async () => {
      const customerId = 'test-customer-789';
      const returnUrl = 'https://example.com/dashboard';
      const session = await provider.createCustomerPortalSession(customerId, returnUrl);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.url).toContain('polar.sh');
      expect(session.url).toContain(customerId);
      expect(session.url).toContain(encodeURIComponent(returnUrl));
    });

    it('should return mock checkout session when Polar not configured', async () => {
      const productId = 'test-product-123';
      const successUrl = 'https://example.com/success';
      const customerEmail = 'test@example.com';
      const metadata = { communityId: 'test-community' };

      const session = await provider.createCheckoutSession(
        productId,
        successUrl,
        customerEmail,
        metadata
      );

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.url).toContain('polar.sh');
      expect(session.productId).toBe(productId);
      expect(session.customerId).toBeDefined();
    });

    it('should return mock product when Polar not configured', async () => {
      const productId = 'test-product-456';
      const product = await provider.getProduct(productId);

      expect(product).toBeDefined();
      expect(product.id).toBe(productId);
      expect(product.name).toBeDefined();
      expect(product.description).toBeDefined();
      expect(product.metadata).toBeDefined();
      expect(product.metadata.tier).toBe('professional');
      expect(product.prices).toBeDefined();
      expect(product.prices.length).toBeGreaterThan(0);
    });

    it('should return mock products list when Polar not configured', async () => {
      const products = await provider.listProducts();

      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBe(2); // Professional and Enterprise
      expect(products[0].id).toBeDefined();
      expect(products[0].name).toBeDefined();
      expect(products[0].prices).toBeDefined();
    });

    it('should return mock cancel response when Polar not configured', async () => {
      const subscriptionId = 'test-subscription-123';
      const result = await provider.cancelSubscription(subscriptionId);

      expect(result).toBeDefined();
      expect(result.id).toBe(subscriptionId);
      expect(result.status).toBe('canceled');
      expect(result.cancelAtPeriodEnd).toBe(true);
    });

    it('should return mock update response when Polar not configured', async () => {
      const subscriptionId = 'test-subscription-456';
      const updates = { tier: 'enterprise' };
      const result = await provider.updateSubscription(subscriptionId, updates);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.customerId).toBeDefined();
    });
  });

  describe('PolarBillingProvider - Webhook Verification', () => {
    let provider;

    beforeAll(() => {
      provider = new PolarBillingProvider();
    });

    it('should verify valid webhook signature', () => {
      const payload = JSON.stringify({ event: 'subscription.created' });
      const secret = 'test-webhook-secret';

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = provider.verifyWebhookSignature(payload, expectedSignature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = JSON.stringify({ event: 'subscription.created' });
      const secret = 'test-webhook-secret';
      const wrongSignature = 'invalid-signature-12345';

      const isValid = provider.verifyWebhookSignature(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should allow webhook when no secret configured (development)', () => {
      const payload = JSON.stringify({ event: 'subscription.created' });
      const signature = 'any-signature';

      const isValid = provider.verifyWebhookSignature(payload, signature, null);
      expect(isValid).toBe(true);
    });

    it('should use timing-safe comparison for signature verification', () => {
      const payload = JSON.stringify({ event: 'subscription.created' });
      const secret = 'test-webhook-secret';

      const correctSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Create signature with slightly different value
      const almostCorrectSignature = correctSignature.slice(0, -1) + 'a';

      const isValid = provider.verifyWebhookSignature(payload, almostCorrectSignature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('StripeBillingProvider - Not Implemented', () => {
    let provider;

    beforeAll(() => {
      provider = new StripeBillingProvider();
    });

    it('should throw not implemented error for getSubscription', async () => {
      await expect(provider.getSubscription('customer-123'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for getCustomer', async () => {
      await expect(provider.getCustomer('customer-123'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for createCustomerPortalSession', async () => {
      await expect(provider.createCustomerPortalSession('customer-123', 'https://example.com'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for createCheckoutSession', async () => {
      await expect(provider.createCheckoutSession('product-123', 'https://example.com', 'test@example.com'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for getProduct', async () => {
      await expect(provider.getProduct('product-123'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for listProducts', async () => {
      await expect(provider.listProducts())
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for cancelSubscription', async () => {
      await expect(provider.cancelSubscription('subscription-123'))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for updateSubscription', async () => {
      await expect(provider.updateSubscription('subscription-123', {}))
        .rejects
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });

    it('should throw not implemented error for verifyWebhookSignature', () => {
      expect(() => provider.verifyWebhookSignature('payload', 'signature', 'secret'))
        .toThrow(/not yet implemented.*use BILLING_PROVIDER=polar/);
    });
  });

  describe('Data Format Normalization', () => {
    let provider;

    beforeAll(() => {
      provider = new PolarBillingProvider();
    });

    it('should return normalized subscription format', async () => {
      const subscription = await provider.getSubscription('test-customer');

      // Verify normalized format matches BillingProvider interface
      expect(subscription).toMatchObject({
        id: expect.any(String),
        customerId: expect.any(String),
        status: expect.stringMatching(/^(active|canceled|incomplete|past_due)$/),
        tier: expect.stringMatching(/^(free|professional|enterprise)$/),
        currentPeriodEnd: expect.any(Date),
        cancelAtPeriodEnd: expect.any(Boolean),
        productId: expect.any(String),
        productName: expect.any(String),
        pricing: {
          amount: expect.any(Number),
          currency: expect.any(String),
          interval: expect.stringMatching(/^(month|year)$/)
        }
      });
    });

    it('should return normalized customer format', async () => {
      const customer = await provider.getCustomer('test-customer');

      // Verify normalized format matches BillingProvider interface
      expect(customer).toMatchObject({
        id: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
        createdAt: expect.any(Date)
      });
    });

    it('should return normalized product format', async () => {
      const product = await provider.getProduct('test-product');

      // Verify normalized format matches BillingProvider interface
      expect(product).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        metadata: expect.any(Object),
        prices: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            priceAmount: expect.any(Number),
            priceCurrency: expect.any(String),
            recurringInterval: expect.any(String)
          })
        ])
      });
    });
  });
});
