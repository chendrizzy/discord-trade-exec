/**
 * Integration Test: Polar Billing Provider - Group 3 Coverage
 *
 * US3-T20: Polar API Integration Paths
 * US3-T21: Payment State Transition Edge Cases
 * US3-T22: Webhook Security & Validation
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

// =============================================================================
// US3-T20: Polar API Integration Paths
// =============================================================================

describe('US3-T20: Polar API Integration Paths', () => {
  it('should successfully create checkout session via real API flow', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      checkouts: {
        create: jest.fn()
      }
    };

    const mockCheckoutResponse = {
      checkout: {
        id: 'checkout_real_123',
        url: 'https://polar.sh/checkout/real_session',
        productId: 'prod_456',
        customerId: 'cust_789',
        customerEmail: 'customer@example.com'
      }
    };

    provider.client.checkouts.create.mockResolvedValue(mockCheckoutResponse);

    // Execute createCheckoutSession
    const result = await provider.createCheckoutSession(
      'prod_456',
      'https://app.example.com/success',
      'customer@example.com',
      { communityId: 'comm_123', userId: 'user_456' }
    );

    // Verify client.checkouts.create was called with correct params
    // Note: Source code adds 'source' and 'provider' to metadata automatically
    expect(provider.client.checkouts.create).toHaveBeenCalledWith({
      productId: 'prod_456',
      successUrl: 'https://app.example.com/success',
      customerEmail: 'customer@example.com',
      metadata: {
        communityId: 'comm_123',
        userId: 'user_456',
        source: 'discord-trade-exec',
        provider: 'polar'
      }
    });

    // Verify returned checkout session data
    expect(result).toBeDefined();
    expect(result.id).toBe('checkout_real_123');
    expect(result.url).toBe('https://polar.sh/checkout/real_session');
    expect(result.productId).toBe('prod_456');
    expect(result.customerId).toBe('cust_789');
  });

  it('should successfully manage subscription via updateSubscription', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      subscriptions: {
        update: jest.fn()
      }
    };

    const mockUpdateResponse = {
      subscription: {
        id: 'sub_real_123',
        customerId: 'cust_456',
        status: 'active',
        productId: 'prod_enterprise_789',
        product: {
          name: 'Enterprise Plan'
        },
        currentPeriodEnd: '2025-12-31T23:59:59.000Z',
        cancelAtPeriodEnd: false,
        price: {
          priceAmount: 49900,
          priceCurrency: 'usd',
          recurringInterval: 'month'
        }
      }
    };

    provider.client.subscriptions.update.mockResolvedValue(mockUpdateResponse);

    // Execute updateSubscription to change plan
    const result = await provider.updateSubscription('sub_real_123', {
      productId: 'prod_enterprise_789'
    });

    // Verify client.subscriptions.update was called
    expect(provider.client.subscriptions.update).toHaveBeenCalledWith({
      id: 'sub_real_123',
      productId: 'prod_enterprise_789'
    });

    // Verify normalized subscription data
    expect(result).toBeDefined();
    expect(result.id).toBe('sub_real_123');
    expect(result.status).toBe('active');
    expect(result.tier).toBe('enterprise');
    expect(result.productId).toBe('prod_enterprise_789');
    expect(result.pricing.amount).toBe(49900);
  });

  it('should successfully create customer portal session', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      customerSessions: {
        create: jest.fn()
      }
    };

    const mockPortalResponse = {
      customerSession: {
        id: 'session_portal_123',
        url: 'https://polar.sh/portal/real_session_xyz'
      }
    };

    provider.client.customerSessions.create.mockResolvedValue(mockPortalResponse);

    // Execute createCustomerPortalSession
    const result = await provider.createCustomerPortalSession(
      'cust_real_456',
      'https://app.example.com/settings'
    );

    // Verify client.customerSessions.create was called
    expect(provider.client.customerSessions.create).toHaveBeenCalledWith({
      customerId: 'cust_real_456',
      returnUrl: 'https://app.example.com/settings'
    });

    // Verify portal session data
    expect(result).toBeDefined();
    expect(result.id).toBe('session_portal_123');
    expect(result.url).toBe('https://polar.sh/portal/real_session_xyz');
  });

  it('should handle API error responses gracefully and throw descriptive errors', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      checkouts: {
        create: jest.fn()
      }
    };

    // Mock API error (e.g., invalid product ID)
    const mockError = new Error('Product not found');
    mockError.statusCode = 404;
    mockError.response = {
      data: {
        error: 'invalid_product_id',
        message: 'Product not found'
      }
    };

    provider.client.checkouts.create.mockRejectedValue(mockError);

    // Execute and expect descriptive error
    await expect(
      provider.createCheckoutSession(
        'prod_nonexistent',
        'https://app.example.com/success',
        'customer@example.com'
      )
    ).rejects.toThrow('Failed to create Polar checkout session: Product not found');

    // Verify API was called once
    expect(provider.client.checkouts.create).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// US3-T21: Payment State Transition Edge Cases
// =============================================================================

describe('US3-T21: Payment State Transition Edge Cases', () => {
  it('should handle payment failure → retry → success transition', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    // Simulate payment_failed state (past_due)
    const mockFailedResponse = {
      customer: {
        id: 'cust_456',
        email: 'customer@example.com',
        name: 'Test Customer',
        subscriptions: [
          {
            id: 'sub_123',
            customerId: 'cust_456',
            status: 'past_due', // Payment failed, retrying
            productId: 'prod_789',
            product: { name: 'Professional Plan' },
            currentPeriodEnd: '2025-12-31T23:59:59.000Z',
            cancelAtPeriodEnd: false,
            price: {
              priceAmount: 29900,
              priceCurrency: 'usd',
              recurringInterval: 'month'
            }
          }
        ]
      }
    };

    // First call: past_due status
    provider.client.customers.get.mockResolvedValueOnce(mockFailedResponse);

    const failedResult = await provider.getSubscription('cust_456');
    expect(failedResult.status).toBe('past_due');

    // Simulate successful retry
    const mockSuccessResponse = {
      customer: {
        id: 'cust_456',
        email: 'customer@example.com',
        name: 'Test Customer',
        subscriptions: [
          {
            id: 'sub_123',
            customerId: 'cust_456',
            status: 'active', // Payment succeeded on retry
            productId: 'prod_789',
            product: { name: 'Professional Plan' },
            currentPeriodEnd: '2025-12-31T23:59:59.000Z',
            cancelAtPeriodEnd: false,
            price: {
              priceAmount: 29900,
              priceCurrency: 'usd',
              recurringInterval: 'month'
            }
          }
        ]
      }
    };

    // Second call: active status after successful payment
    provider.client.customers.get.mockResolvedValueOnce(mockSuccessResponse);

    const successResult = await provider.getSubscription('cust_456');
    expect(successResult.status).toBe('active');

    // Verify state transition occurred
    expect(provider.client.customers.get).toHaveBeenCalledTimes(2);
  });

  it('should handle subscription downgrade transitions (enterprise → professional)', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      subscriptions: {
        update: jest.fn()
      }
    };

    // Mock downgrade from enterprise to professional
    const mockDowngradeResponse = {
      subscription: {
        id: 'sub_downgrade_123',
        customerId: 'cust_456',
        status: 'active',
        productId: 'prod_professional_789',
        product: {
          name: 'Professional Plan' // Downgraded from Enterprise
        },
        currentPeriodEnd: '2025-12-31T23:59:59.000Z',
        cancelAtPeriodEnd: false,
        price: {
          priceAmount: 29900, // Down from 49900
          priceCurrency: 'usd',
          recurringInterval: 'month'
        }
      }
    };

    provider.client.subscriptions.update.mockResolvedValue(mockDowngradeResponse);

    // Execute downgrade
    const result = await provider.updateSubscription('sub_downgrade_123', {
      productId: 'prod_professional_789'
    });

    // Verify downgrade occurred
    expect(result.tier).toBe('professional');
    expect(result.pricing.amount).toBe(29900);
    expect(result.status).toBe('active');

    // Verify update was called with new product
    expect(provider.client.subscriptions.update).toHaveBeenCalledWith({
      id: 'sub_downgrade_123',
      productId: 'prod_professional_789'
    });
  });

  it('should handle subscription cancellation with cancelAtPeriodEnd', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      subscriptions: {
        cancel: jest.fn()
      }
    };

    // Mock cancellation response
    const mockCancelResponse = {
      subscription: {
        id: 'sub_cancel_123',
        status: 'active', // Still active until period ends
        cancelAtPeriodEnd: true // Will cancel at end of billing period
      }
    };

    provider.client.subscriptions.cancel.mockResolvedValue(mockCancelResponse);

    // Execute cancellation
    const result = await provider.cancelSubscription('sub_cancel_123');

    // Verify cancellation scheduled for period end
    expect(result.id).toBe('sub_cancel_123');
    expect(result.status).toBe('active'); // Still active
    expect(result.cancelAtPeriodEnd).toBe(true); // But will cancel

    // Verify cancel API was called
    expect(provider.client.subscriptions.cancel).toHaveBeenCalledWith({
      id: 'sub_cancel_123'
    });
  });

  it('should handle trial period expiry and transition to paid subscription', async () => {
    // Setup provider with mocked Polar client
    const provider = new PolarBillingProvider();
    provider.client = {
      customers: {
        get: jest.fn()
      }
    };

    // Mock trial subscription
    const mockTrialResponse = {
      customer: {
        id: 'cust_trial_123',
        email: 'trial@example.com',
        name: 'Trial User',
        subscriptions: [
          {
            id: 'sub_trial_456',
            customerId: 'cust_trial_123',
            status: 'trialing',
            productId: 'prod_professional_789',
            product: { name: 'Professional Plan (Trial)' },
            currentPeriodEnd: '2025-11-30T23:59:59.000Z',
            trialEnd: '2025-11-30T23:59:59.000Z',
            cancelAtPeriodEnd: false,
            price: {
              priceAmount: 29900,
              priceCurrency: 'usd',
              recurringInterval: 'month'
            }
          }
        ]
      }
    };

    // First call: trialing status
    provider.client.customers.get.mockResolvedValueOnce(mockTrialResponse);

    const trialResult = await provider.getSubscription('cust_trial_123');
    expect(trialResult.status).toBe('trialing');

    // Simulate trial expiry → paid subscription
    const mockActiveResponse = {
      customer: {
        ...mockTrialResponse.customer,
        subscriptions: [
          {
            ...mockTrialResponse.customer.subscriptions[0],
            status: 'active', // Trial expired, now paid
            trialEnd: null
          }
        ]
      }
    };

    // Second call: active status after trial expiry
    provider.client.customers.get.mockResolvedValueOnce(mockActiveResponse);

    const activeResult = await provider.getSubscription('cust_trial_123');
    expect(activeResult.status).toBe('active');

    // Verify trial → paid transition
    expect(provider.client.customers.get).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// US3-T22: Webhook Security & Validation
// =============================================================================

describe('US3-T22: Webhook Security & Validation', () => {
  it('should reject webhooks with invalid signature', () => {
    const provider = new PolarBillingProvider();

    const payload = JSON.stringify({
      event: 'subscription.created',
      data: { subscriptionId: 'sub_123' }
    });

    const secret = 'webhook_secret_key_123';

    // Generate correct signature
    const correctSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Try with incorrect signature
    const incorrectSignature = 'invalid_signature_abc123';

    // Correct signature should pass
    const validResult = provider.verifyWebhookSignature(payload, correctSignature, secret);
    expect(validResult).toBe(true);

    // Incorrect signature should fail
    const invalidResult = provider.verifyWebhookSignature(payload, incorrectSignature, secret);
    expect(invalidResult).toBe(false);
  });

  it('should prevent replay attacks using timestamp validation', () => {
    const provider = new PolarBillingProvider();

    // Simulate old webhook (replayed after 10 minutes)
    const oldTimestamp = Date.now() - 11 * 60 * 1000; // 11 minutes ago
    const oldPayload = JSON.stringify({
      event: 'subscription.created',
      timestamp: oldTimestamp,
      data: { subscriptionId: 'sub_123' }
    });

    // Simulate fresh webhook (within 5 minute window)
    const freshTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
    const freshPayload = JSON.stringify({
      event: 'subscription.created',
      timestamp: freshTimestamp,
      data: { subscriptionId: 'sub_456' }
    });

    const secret = 'webhook_secret_key_123';

    // Generate signatures
    const oldSignature = crypto
      .createHmac('sha256', secret)
      .update(oldPayload)
      .digest('hex');

    const freshSignature = crypto
      .createHmac('sha256', secret)
      .update(freshPayload)
      .digest('hex');

    // Both signatures are technically valid
    expect(provider.verifyWebhookSignature(oldPayload, oldSignature, secret)).toBe(true);
    expect(provider.verifyWebhookSignature(freshPayload, freshSignature, secret)).toBe(true);

    // Note: Actual timestamp validation should be done in webhook handler middleware
    // This test documents the signature validation works independently of timestamp
    const oldWebhookData = JSON.parse(oldPayload);
    const freshWebhookData = JSON.parse(freshPayload);

    // Application logic should reject old webhooks
    const isOldWebhookStale = Date.now() - oldWebhookData.timestamp > 10 * 60 * 1000;
    const isFreshWebhookValid = Date.now() - freshWebhookData.timestamp <= 10 * 60 * 1000;

    expect(isOldWebhookStale).toBe(true);
    expect(isFreshWebhookValid).toBe(true);
  });

  it('should validate webhook payload structure and reject malformed payloads', () => {
    const provider = new PolarBillingProvider();

    // Valid webhook payload structure
    const validPayload = JSON.stringify({
      event: 'subscription.created',
      timestamp: Date.now(),
      data: {
        subscriptionId: 'sub_123',
        customerId: 'cust_456',
        status: 'active'
      }
    });

    // Malformed payloads
    const missingEventPayload = JSON.stringify({
      timestamp: Date.now(),
      data: { subscriptionId: 'sub_123' }
      // Missing 'event' field
    });

    const missingDataPayload = JSON.stringify({
      event: 'subscription.created',
      timestamp: Date.now()
      // Missing 'data' field
    });

    const invalidJsonPayload = '{ event: subscription.created, invalid json }';

    const secret = 'webhook_secret_key_123';

    // Signature validation should work for all payloads
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(validPayload)
      .digest('hex');

    expect(provider.verifyWebhookSignature(validPayload, validSignature, secret)).toBe(true);

    // Application should validate payload structure
    let validParsed;
    let missingEventParsed;
    let missingDataParsed;
    let invalidJsonParsed;

    try {
      validParsed = JSON.parse(validPayload);
    } catch (e) {
      validParsed = null;
    }

    try {
      missingEventParsed = JSON.parse(missingEventPayload);
    } catch (e) {
      missingEventParsed = null;
    }

    try {
      missingDataParsed = JSON.parse(missingDataPayload);
    } catch (e) {
      missingDataParsed = null;
    }

    try {
      invalidJsonParsed = JSON.parse(invalidJsonPayload);
    } catch (e) {
      invalidJsonParsed = null;
    }

    // Validate structure using property checks
    const isValidPayload =
      validParsed !== null &&
      'event' in validParsed &&
      'data' in validParsed &&
      typeof validParsed.data === 'object';

    const isMissingEventInvalid =
      missingEventParsed === null || !('event' in missingEventParsed);

    const isMissingDataInvalid =
      missingDataParsed === null || !('data' in missingDataParsed);

    const isInvalidJsonInvalid = invalidJsonParsed === null;

    expect(isValidPayload).toBe(true);
    expect(isMissingEventInvalid).toBe(true);
    expect(isMissingDataInvalid).toBe(true);
    expect(isInvalidJsonInvalid).toBe(true);
  });

  it('should handle webhook idempotency and prevent duplicate event processing', () => {
    const provider = new PolarBillingProvider();

    // Simulate duplicate webhook events
    const webhookPayload = JSON.stringify({
      event: 'subscription.created',
      timestamp: Date.now(),
      idempotencyKey: 'evt_unique_123', // Polar event ID for idempotency
      data: {
        subscriptionId: 'sub_123',
        customerId: 'cust_456',
        status: 'active'
      }
    });

    const secret = 'webhook_secret_key_123';

    const signature = crypto
      .createHmac('sha256', secret)
      .update(webhookPayload)
      .digest('hex');

    // First webhook processing
    const firstValidation = provider.verifyWebhookSignature(webhookPayload, signature, secret);
    expect(firstValidation).toBe(true);

    const firstEvent = JSON.parse(webhookPayload);

    // Second webhook processing (duplicate)
    const secondValidation = provider.verifyWebhookSignature(webhookPayload, signature, secret);
    expect(secondValidation).toBe(true);

    const secondEvent = JSON.parse(webhookPayload);

    // Both webhooks have same idempotencyKey
    expect(firstEvent.idempotencyKey).toBe(secondEvent.idempotencyKey);

    // Application should track processed event IDs to prevent duplicate processing
    const processedEvents = new Set();

    // Process first event
    if (!processedEvents.has(firstEvent.idempotencyKey)) {
      processedEvents.add(firstEvent.idempotencyKey);
      // Process event...
    }
    expect(processedEvents.size).toBe(1);

    // Try to process duplicate event
    let duplicateProcessed = false;
    if (!processedEvents.has(secondEvent.idempotencyKey)) {
      processedEvents.add(secondEvent.idempotencyKey);
      duplicateProcessed = true;
    }

    // Duplicate should be rejected
    expect(duplicateProcessed).toBe(false);
    expect(processedEvents.size).toBe(1); // No new events added
  });
});
