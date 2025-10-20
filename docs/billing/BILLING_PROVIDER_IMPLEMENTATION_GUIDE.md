# Billing Provider Implementation Guide

This guide explains how to implement and integrate billing providers into the application using the abstract BillingProvider interface.

## Table of Contents

- [Overview](#overview)
- [BillingProvider Interface](#billingprovider-interface)
- [Implementing a New Provider](#implementing-a-new-provider)
- [Stripe Implementation Guide](#stripe-implementation-guide)
- [Testing Your Provider](#testing-your-provider)
- [Migration Process](#migration-process)
- [Production Deployment](#production-deployment)

---

## Overview

The billing provider abstraction layer enables seamless switching between different billing platforms (Polar.sh, Stripe, etc.) without modifying application code. All billing operations are accessed through a unified interface defined in `BillingProvider.js`.

### Architecture

```
┌──────────────────────────────────────────────────┐
│         Application Routes & Services            │
│  (community.js, trader.js, polar.js webhook)     │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│         BillingProviderFactory                    │
│  Creates provider based on BILLING_PROVIDER env   │
└────────────────┬─────────────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ PolarBilling │  │ StripeBilling│
│   Provider   │  │   Provider   │
└──────────────┘  └──────────────┘
        │                 │
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  Polar.sh    │  │   Stripe     │
│     API      │  │    API       │
└──────────────┘  └──────────────┘
```

### Configuration

Provider selection is controlled by a single environment variable:

```bash
# Use Polar.sh (default)
BILLING_PROVIDER=polar

# Use Stripe
BILLING_PROVIDER=stripe
```

---

## BillingProvider Interface

All billing providers must extend the abstract `BillingProvider` class and implement these 9 methods:

### 1. getSubscription(customerId)

Retrieve the active subscription for a customer.

**Signature:**
```javascript
/**
 * @param {string} customerId - Customer UUID
 * @returns {Promise<Subscription|null>} Normalized subscription object or null
 */
async getSubscription(customerId)
```

**Normalized Return Format:**
```javascript
{
  id: string,                    // Subscription ID
  customerId: string,            // Customer UUID
  status: 'active' | 'canceled' | 'incomplete' | 'past_due',
  tier: 'free' | 'professional' | 'enterprise',
  currentPeriodEnd: Date,        // Billing cycle end date
  cancelAtPeriodEnd: boolean,    // Whether subscription will cancel
  productId: string,             // Product/plan identifier
  productName: string,           // Human-readable product name
  pricing: {
    amount: number,              // Price in cents (9900 = $99.00)
    currency: string,            // ISO currency code ('usd', 'eur')
    interval: 'month' | 'year'   // Billing frequency
  }
}
```

**Error Handling:**
- Return `null` if customer has no active subscription
- Throw error for invalid customerId or API failures

---

### 2. getCustomer(customerId)

Retrieve customer details.

**Signature:**
```javascript
/**
 * @param {string} customerId - Customer UUID
 * @returns {Promise<Customer>} Normalized customer object
 */
async getCustomer(customerId)
```

**Normalized Return Format:**
```javascript
{
  id: string,           // Customer UUID
  email: string,        // Customer email address
  name: string,         // Customer full name
  createdAt: Date       // Account creation timestamp
}
```

---

### 3. createCustomerPortalSession(customerId, returnUrl)

Generate a session URL for customer self-service portal (manage subscriptions, billing, etc.).

**Signature:**
```javascript
/**
 * @param {string} customerId - Customer UUID
 * @param {string} returnUrl - URL to redirect after portal session
 * @returns {Promise<PortalSession>} Portal session with URL
 */
async createCustomerPortalSession(customerId, returnUrl)
```

**Normalized Return Format:**
```javascript
{
  id: string,    // Session UUID
  url: string    // Portal URL to redirect customer to
}
```

---

### 4. createCheckoutSession(productId, successUrl, customerEmail, metadata)

Create a checkout session for new subscription purchase.

**Signature:**
```javascript
/**
 * @param {string} productId - Product/plan ID to subscribe to
 * @param {string} successUrl - Redirect URL after successful checkout
 * @param {string} customerEmail - Pre-fill email in checkout
 * @param {Object} metadata - Custom metadata to attach (communityId, userId, etc.)
 * @returns {Promise<CheckoutSession>} Checkout session with URL
 */
async createCheckoutSession(productId, successUrl, customerEmail, metadata)
```

**Normalized Return Format:**
```javascript
{
  id: string,           // Session UUID
  url: string,          // Checkout URL to redirect customer to
  productId: string,    // Product being purchased
  customerId: string    // Customer ID (created or existing)
}
```

**Metadata Usage:**
```javascript
// Example: Link checkout to community or user
const metadata = {
  communityId: 'community-uuid-123',
  entityType: 'community'
};
```

---

### 5. getProduct(productId)

Retrieve product/plan details.

**Signature:**
```javascript
/**
 * @param {string} productId - Product UUID
 * @returns {Promise<Product>} Normalized product object
 */
async getProduct(productId)
```

**Normalized Return Format:**
```javascript
{
  id: string,              // Product UUID
  name: string,            // Product name ('Professional Plan')
  description: string,     // Product description
  metadata: {              // Custom metadata
    tier: string,          // 'professional', 'enterprise'
    type: string           // 'community', 'trader'
  },
  prices: [                // Available price points
    {
      id: string,                      // Price UUID
      priceAmount: number,             // Amount in cents
      priceCurrency: string,           // ISO currency code
      recurringInterval: 'month' | 'year'
    }
  ]
}
```

---

### 6. listProducts()

List all available products/plans.

**Signature:**
```javascript
/**
 * @returns {Promise<Product[]>} Array of products
 */
async listProducts()
```

**Returns:** Array of `Product` objects (same format as `getProduct`)

---

### 7. cancelSubscription(subscriptionId)

Cancel a subscription (typically at period end to avoid prorated refunds).

**Signature:**
```javascript
/**
 * @param {string} subscriptionId - Subscription UUID
 * @returns {Promise<Object>} Cancellation result
 */
async cancelSubscription(subscriptionId)
```

**Normalized Return Format:**
```javascript
{
  id: string,                  // Subscription UUID
  status: 'canceled',          // New status
  cancelAtPeriodEnd: boolean   // When cancellation takes effect
}
```

---

### 8. updateSubscription(subscriptionId, updates)

Update subscription details (change tier, proration, etc.).

**Signature:**
```javascript
/**
 * @param {string} subscriptionId - Subscription UUID
 * @param {Object} updates - Properties to update
 * @returns {Promise<Subscription>} Updated subscription
 */
async updateSubscription(subscriptionId, updates)
```

**Updates Object:**
```javascript
{
  tier: 'professional' | 'enterprise',  // New subscription tier
  prorationBehavior: 'create_prorations' | 'none'  // Stripe-specific
}
```

**Returns:** Full `Subscription` object (same format as `getSubscription`)

---

### 9. verifyWebhookSignature(payload, signature, secret)

Verify webhook request authenticity using HMAC-SHA256.

**Signature:**
```javascript
/**
 * @param {string} payload - Raw webhook request body (JSON string)
 * @param {string} signature - HMAC signature from webhook header
 * @param {string} secret - Webhook signing secret
 * @returns {boolean} True if signature is valid
 */
verifyWebhookSignature(payload, signature, secret)
```

**Security Requirements:**
- Use `crypto.timingSafeEqual()` to prevent timing attacks
- Compare HMAC-SHA256 hex digests
- Return `true` in development if `secret` is null/undefined

**Example Implementation:**
```javascript
verifyWebhookSignature(payload, signature, secret) {
  if (!secret) {
    console.warn('[BillingProvider] No webhook secret - allowing in development');
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
```

---

## Implementing a New Provider

### Step 1: Create Provider Class

Create a new file in `src/services/billing/providers/`:

```javascript
// src/services/billing/providers/MyProviderBillingProvider.js
const BillingProvider = require('../BillingProvider');
const crypto = require('crypto');

class MyProviderBillingProvider extends BillingProvider {
  constructor() {
    super();

    // Initialize SDK
    const apiKey = process.env.MYPROVIDER_API_KEY;

    if (!apiKey) {
      console.warn('[MyProviderBillingProvider] No API key configured');
      this.client = null;
      return;
    }

    const MyProviderSDK = require('@myprovider/sdk');
    this.client = new MyProviderSDK({ apiKey });
  }

  async getSubscription(customerId) {
    // Graceful degradation for missing API key
    if (!this.client) {
      return this._getMockSubscription(customerId);
    }

    try {
      // Call provider API
      const subscription = await this.client.subscriptions.retrieve(customerId);

      // Map to normalized format
      return this._mapSubscription(subscription, customerId);
    } catch (error) {
      console.error('[MyProviderBillingProvider] Error fetching subscription:', error);
      throw error;
    }
  }

  // Implement remaining 8 methods...

  /**
   * Map provider-specific format to normalized format
   * @private
   */
  _mapSubscription(providerSub, customerId) {
    return {
      id: providerSub.id,
      customerId: customerId,
      status: this._normalizeStatus(providerSub.status),
      tier: this._determineTier(providerSub),
      currentPeriodEnd: new Date(providerSub.current_period_end * 1000),
      cancelAtPeriodEnd: providerSub.cancel_at_period_end || false,
      productId: providerSub.items.data[0].price.product,
      productName: providerSub.product_name || 'Unknown',
      pricing: {
        amount: providerSub.items.data[0].price.unit_amount,
        currency: providerSub.currency,
        interval: providerSub.items.data[0].price.recurring.interval
      }
    };
  }

  _normalizeStatus(providerStatus) {
    const statusMap = {
      'active': 'active',
      'cancelled': 'canceled',
      'incomplete': 'incomplete',
      'past_due': 'past_due',
      'trialing': 'active'
    };
    return statusMap[providerStatus] || 'incomplete';
  }

  _determineTier(subscription) {
    // Extract tier from product metadata or name
    const metadata = subscription.metadata || {};
    if (metadata.tier) return metadata.tier;

    const productName = subscription.product_name?.toLowerCase() || '';
    if (productName.includes('enterprise')) return 'enterprise';
    if (productName.includes('professional')) return 'professional';
    return 'free';
  }

  /**
   * Mock data for development/testing
   * @private
   */
  _getMockSubscription(customerId) {
    return {
      id: `mock-sub-${Date.now()}`,
      customerId: customerId,
      status: 'active',
      tier: 'professional',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      productId: 'mock-product-professional',
      productName: 'Professional Plan (Mock)',
      pricing: {
        amount: 9900,
        currency: 'usd',
        interval: 'month'
      }
    };
  }
}

module.exports = MyProviderBillingProvider;
```

### Step 2: Register in Factory

Update `BillingProviderFactory.js`:

```javascript
const MyProviderBillingProvider = require('./providers/MyProviderBillingProvider');

class BillingProviderFactory {
  static createProvider() {
    const providerType = (process.env.BILLING_PROVIDER || 'polar').toLowerCase();

    switch (providerType) {
      case 'polar':
        return new PolarBillingProvider();
      case 'stripe':
        return new StripeBillingProvider();
      case 'myprovider':  // Add new provider
        return new MyProviderBillingProvider();
      default:
        throw new Error(`Unsupported billing provider: "${providerType}"`);
    }
  }

  static getSupportedProviders() {
    return ['polar', 'stripe', 'myprovider'];  // Add to list
  }

  static isSupported(providerType) {
    return ['polar', 'stripe', 'myprovider'].includes(
      (providerType || '').toLowerCase()
    );
  }
}
```

### Step 3: Add Environment Variables

Update `.env.example`:

```bash
# Billing Provider Selection
BILLING_PROVIDER=polar  # Options: polar, stripe, myprovider

# MyProvider Configuration
MYPROVIDER_API_KEY=your_api_key_here
MYPROVIDER_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## Stripe Implementation Guide

Detailed mapping of Stripe API to BillingProvider interface:

### 1. getSubscription(customerId)

**Stripe API:**
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async getSubscription(customerId) {
  // List active subscriptions for customer
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
    expand: ['data.default_payment_method']
  });

  if (subscriptions.data.length === 0) {
    return null;
  }

  const subscription = subscriptions.data[0];

  // Map to normalized format
  return {
    id: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    tier: this._extractTier(subscription),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    productId: subscription.items.data[0].price.product,
    productName: await this._getProductName(subscription.items.data[0].price.product),
    pricing: {
      amount: subscription.items.data[0].price.unit_amount,
      currency: subscription.currency,
      interval: subscription.items.data[0].price.recurring.interval
    }
  };
}

_extractTier(subscription) {
  // Check metadata first
  if (subscription.metadata.tier) {
    return subscription.metadata.tier;
  }

  // Fallback to product lookup
  const productId = subscription.items.data[0].price.product;
  // Cache product details to avoid repeated API calls
  return this._productTierCache[productId] || 'free';
}

async _getProductName(productId) {
  const product = await stripe.products.retrieve(productId);
  return product.name;
}
```

**Key Differences from Polar:**
- Stripe uses `customer` objects; Polar uses raw user IDs
- Stripe timestamps are Unix epoch (seconds); Polar uses ISO 8601 strings
- Stripe nests pricing under `items.data[0].price`; Polar has flat structure

---

### 2. getCustomer(customerId)

**Stripe API:**
```javascript
async getCustomer(customerId) {
  const customer = await stripe.customers.retrieve(customerId);

  return {
    id: customer.id,
    email: customer.email,
    name: customer.name || customer.email.split('@')[0],
    createdAt: new Date(customer.created * 1000)
  };
}
```

---

### 3. createCustomerPortalSession(customerId, returnUrl)

**Stripe API:**
```javascript
async createCustomerPortalSession(customerId, returnUrl) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });

  return {
    id: session.id,
    url: session.url
  };
}
```

**Prerequisites:**
- Configure Stripe Customer Portal in Stripe Dashboard → Settings → Billing → Customer portal
- Enable features: subscription cancellation, plan changes, payment method updates

---

### 4. createCheckoutSession(productId, successUrl, customerEmail, metadata)

**Stripe API:**
```javascript
async createCheckoutSession(productId, successUrl, customerEmail, metadata) {
  // First, get the price ID for the product
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 1
  });

  if (prices.data.length === 0) {
    throw new Error(`No active prices found for product ${productId}`);
  }

  const priceId = prices.data[0].id;

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    success_url: successUrl,
    cancel_url: successUrl.replace('/success', '/cancel'),
    customer_email: customerEmail,
    metadata: metadata,
    subscription_data: {
      metadata: metadata  // Also attach to subscription
    }
  });

  return {
    id: session.id,
    url: session.url,
    productId: productId,
    customerId: session.customer || 'pending'
  };
}
```

**Key Differences:**
- Stripe requires `price` ID, not `product` ID for checkout
- Metadata must be duplicated (`metadata` AND `subscription_data.metadata`)
- Stripe creates customer during checkout; Polar requires pre-existing customer

---

### 5. getProduct(productId)

**Stripe API:**
```javascript
async getProduct(productId) {
  const product = await stripe.products.retrieve(productId);
  const prices = await stripe.prices.list({
    product: productId,
    active: true
  });

  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    metadata: product.metadata,
    prices: prices.data.map(price => ({
      id: price.id,
      priceAmount: price.unit_amount,
      priceCurrency: price.currency,
      recurringInterval: price.recurring.interval
    }))
  };
}
```

---

### 6. listProducts()

**Stripe API:**
```javascript
async listProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  const productDetails = await Promise.all(
    products.data.map(product => this.getProduct(product.id))
  );

  return productDetails;
}
```

---

### 7. cancelSubscription(subscriptionId)

**Stripe API:**
```javascript
async cancelSubscription(subscriptionId) {
  // Cancel at period end (default behavior)
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  });

  return {
    id: subscription.id,
    status: 'canceled',
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  };
}
```

**For Immediate Cancellation:**
```javascript
// Cancel immediately with proration
const subscription = await stripe.subscriptions.cancel(subscriptionId, {
  prorate: true
});
```

---

### 8. updateSubscription(subscriptionId, updates)

**Stripe API:**
```javascript
async updateSubscription(subscriptionId, updates) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Change plan/tier
  if (updates.tier) {
    const newProductId = await this._tierToProductId(updates.tier);
    const newPrice = await this._getDefaultPrice(newProductId);

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPrice.id
        }
      ],
      proration_behavior: updates.prorationBehavior || 'create_prorations'
    });

    return this._mapSubscription(updated, subscription.customer);
  }

  return this._mapSubscription(subscription, subscription.customer);
}

async _tierToProductId(tier) {
  // Map tier names to Stripe product IDs
  const tierMap = {
    'professional': process.env.STRIPE_PRODUCT_PROFESSIONAL,
    'enterprise': process.env.STRIPE_PRODUCT_ENTERPRISE
  };
  return tierMap[tier];
}
```

**Proration Behavior:**
- `create_prorations` - Charge/credit difference immediately
- `none` - No proration (change takes effect at period end)
- `always_invoice` - Generate invoice regardless of amount

---

### 9. verifyWebhookSignature(payload, signature, secret)

**Stripe API:**
```javascript
verifyWebhookSignature(payload, signature, secret) {
  if (!secret) {
    console.warn('[StripeBillingProvider] No webhook secret - allowing in development');
    return true;
  }

  try {
    // Stripe SDK handles verification
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    stripe.webhooks.constructEvent(payload, signature, secret);
    return true;
  } catch (error) {
    console.error('[StripeBillingProvider] Webhook signature verification failed:', error);
    return false;
  }
}
```

**Alternative (Manual Verification):**
```javascript
verifyWebhookSignature(payload, signature, secret) {
  if (!secret) return true;

  // Stripe signature format: t=timestamp,v1=signature
  const sigHeader = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = sigHeader.t;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (sigHeader.v1.length !== expectedSignature.length) {
    return false;
  }

  const signatureBuffer = Buffer.from(sigHeader.v1, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
```

---

## Testing Your Provider

### Unit Tests

Test provider methods using mocked SDK responses:

```javascript
// tests/billing/my-provider.test.js
const MyProviderBillingProvider = require('../../src/services/billing/providers/MyProviderBillingProvider');

jest.mock('@myprovider/sdk');

describe('MyProviderBillingProvider', () => {
  let provider;

  beforeEach(() => {
    process.env.MYPROVIDER_API_KEY = 'test-api-key';
    provider = new MyProviderBillingProvider();
  });

  describe('getSubscription', () => {
    it('should return normalized subscription format', async () => {
      // Mock SDK response
      provider.client.subscriptions.retrieve = jest.fn().mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_end: 1735689600,
        // ... provider-specific format
      });

      const subscription = await provider.getSubscription('cust_123');

      // Verify normalized format
      expect(subscription).toMatchObject({
        id: expect.any(String),
        customerId: 'cust_123',
        status: expect.stringMatching(/^(active|canceled|incomplete|past_due)$/),
        tier: expect.stringMatching(/^(free|professional|enterprise)$/),
        currentPeriodEnd: expect.any(Date),
        pricing: {
          amount: expect.any(Number),
          currency: expect.any(String),
          interval: expect.stringMatching(/^(month|year)$/)
        }
      });
    });

    it('should return null for non-existent customer', async () => {
      provider.client.subscriptions.retrieve = jest.fn().mockRejectedValue(
        new Error('Customer not found')
      );

      await expect(provider.getSubscription('invalid')).rejects.toThrow();
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid HMAC signature', () => {
      const payload = JSON.stringify({ event: 'subscription.created' });
      const secret = 'test-webhook-secret';

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = provider.verifyWebhookSignature(payload, expectedSignature, secret);
      expect(isValid).toBe(true);
    });

    it('should use timing-safe comparison', () => {
      const payload = JSON.stringify({ event: 'test' });
      const secret = 'secret';
      const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const invalidSig = validSig.slice(0, -1) + 'a';

      const isValid = provider.verifyWebhookSignature(payload, invalidSig, secret);
      expect(isValid).toBe(false);
    });
  });
});
```

### Integration Tests

Test with real API calls in staging environment:

```javascript
// tests/integration/billing-provider.integration.test.js
describe('Billing Provider Integration Tests', () => {
  let provider;

  beforeAll(() => {
    // Use staging API keys
    process.env.BILLING_PROVIDER = 'stripe';
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_TEST_SECRET_KEY;
    provider = BillingProviderFactory.createProvider();
  });

  it('should create and retrieve subscription', async () => {
    // Create test customer
    const customerEmail = `test-${Date.now()}@example.com`;
    const productId = process.env.STRIPE_TEST_PRODUCT_ID;

    // Create checkout session
    const checkout = await provider.createCheckoutSession(
      productId,
      'https://example.com/success',
      customerEmail,
      { test: true }
    );

    expect(checkout.url).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // Note: Manual checkout completion required in Stripe Dashboard
    // or use Stripe CLI webhook forwarding for automation
  });
});
```

### Mock Provider Interface Tests

Verify all routes work with mock provider (development mode):

```javascript
// tests/billing/billing-provider-mock.test.js
describe('BillingProvider Mock Mode', () => {
  beforeAll(() => {
    // Remove API keys to trigger mock mode
    delete process.env.POLAR_ACCESS_TOKEN;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('should return mock subscription without API key', async () => {
    const provider = BillingProviderFactory.createProvider();
    const subscription = await provider.getSubscription('test-customer');

    expect(subscription).toBeDefined();
    expect(subscription.status).toBe('active');
    expect(subscription.pricing.amount).toBeGreaterThan(0);
  });
});
```

---

## Migration Process

### Polar → Stripe Migration

**Phase 1: Preparation (1 week)**

1. **Install Stripe SDK:**
   ```bash
   npm install stripe
   ```

2. **Configure Stripe Products:**
   - Create products in Stripe Dashboard matching Polar tiers
   - Set metadata: `tier=professional`, `type=community`
   - Create monthly/yearly price points
   - Note product IDs for environment variables

3. **Set Environment Variables:**
   ```bash
   STRIPE_SECRET_KEY=sk_live_xxxxx
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   STRIPE_PRODUCT_PROFESSIONAL=prod_xxxxx
   STRIPE_PRODUCT_ENTERPRISE=prod_xxxxx
   ```

4. **Update `.env.example`:**
   ```bash
   # Stripe Configuration (for BILLING_PROVIDER=stripe)
   STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
   STRIPE_PRODUCT_PROFESSIONAL=prod_professional_product_id
   STRIPE_PRODUCT_ENTERPRISE=prod_enterprise_product_id
   ```

**Phase 2: Implementation (2 days)**

5. **Complete StripeBillingProvider.js:**
   - Replace `throw new Error('not implemented')` with Stripe API calls
   - Map Stripe data to normalized formats
   - Add error handling and logging

6. **Test in Staging:**
   ```bash
   BILLING_PROVIDER=stripe npm test
   ```

7. **Manual Testing:**
   - Create test subscription via checkout
   - Verify customer portal access
   - Test subscription upgrades/downgrades
   - Trigger webhook events (use Stripe CLI)

**Phase 3: Data Migration (1 week)**

8. **Customer Mapping:**
   ```javascript
   // Migration script: scripts/migrate-polar-to-stripe.js
   const polar = new PolarBillingProvider();
   const stripe = new StripeBillingProvider();

   for (const community of allCommunities) {
     if (!community.subscription.polarCustomerId) continue;

     // Get Polar subscription details
     const polarSub = await polar.getSubscription(
       community.subscription.polarCustomerId
     );

     // Create Stripe customer
     const stripeCustomer = await stripe.client.customers.create({
       email: community.ownerEmail,
       name: community.name,
       metadata: {
         communityId: community._id.toString(),
         migratedFrom: 'polar',
         polarCustomerId: community.subscription.polarCustomerId
       }
     });

     // Create Stripe subscription
     const stripeProductId = tierToProductId(polarSub.tier);
     const stripePrice = await getDefaultPrice(stripeProductId);

     const stripeSub = await stripe.client.subscriptions.create({
       customer: stripeCustomer.id,
       items: [{ price: stripePrice.id }],
       metadata: {
         communityId: community._id.toString(),
         tier: polarSub.tier
       },
       trial_end: Math.floor(polarSub.currentPeriodEnd.getTime() / 1000)
     });

     // Update database
     community.subscription.stripeCustomerId = stripeCustomer.id;
     community.subscription.stripeSubscriptionId = stripeSub.id;
     await community.save();

     console.log(`Migrated community ${community.name} to Stripe`);
   }
   ```

**Phase 4: Cutover (Zero Downtime)**

9. **Blue-Green Deployment:**
   ```bash
   # Deploy with Stripe enabled but Polar still active
   BILLING_PROVIDER=polar  # Keep old provider initially

   # Verify all routes still work
   curl https://api.example.com/api/community/subscription

   # Switch provider (zero-downtime)
   BILLING_PROVIDER=stripe
   pm2 reload all

   # Monitor for errors
   tail -f logs/production.log | grep -i billing
   ```

10. **Webhook Migration:**
    - Configure Stripe webhook endpoint: `POST /webhook/stripe`
    - Keep Polar webhook active until all subscriptions migrated
    - Monitor both webhook endpoints for 30 days

**Phase 5: Validation (1 week)**

11. **Verify No Regressions:**
    - [ ] All existing subscriptions visible in dashboards
    - [ ] Customer portal access works
    - [ ] New subscriptions can be created
    - [ ] Subscription upgrades/downgrades work
    - [ ] Webhooks trigger correctly
    - [ ] Cancellations process correctly

12. **Performance Testing:**
    ```bash
    # Load test with 1000 concurrent requests
    artillery run loadtest-billing.yml
    ```

13. **Rollback Plan:**
    ```bash
    # If issues detected, instant rollback:
    BILLING_PROVIDER=polar
    pm2 reload all
    ```

**Phase 6: Decommission Polar (After 60 days)**

14. **Remove Polar Dependencies:**
    ```bash
    npm uninstall @polar-sh/sdk
    git rm src/services/billing/providers/PolarBillingProvider.js
    ```

15. **Archive Migration Data:**
    - Export all Polar customer IDs for records
    - Document migration completion date
    - Update CHANGELOG.md

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All 9 BillingProvider methods implemented
- [ ] Unit tests passing (100% coverage)
- [ ] Integration tests passing (staging environment)
- [ ] Webhook signature verification tested
- [ ] Error handling for all API failures
- [ ] Logging added for all operations
- [ ] Environment variables documented in `.env.example`
- [ ] Provider registered in BillingProviderFactory
- [ ] Data format normalization validated
- [ ] Graceful degradation for missing API keys (development)

### Environment Configuration

**Production `.env`:**
```bash
# Billing Provider
BILLING_PROVIDER=stripe

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_PRODUCT_PROFESSIONAL=prod_xxxxxxxxxxxxx
STRIPE_PRODUCT_ENTERPRISE=prod_xxxxxxxxxxxxx

# Fallback to Polar (if dual-provider setup)
POLAR_ACCESS_TOKEN=polar_xxxxxxxxxxxxx
POLAR_WEBHOOK_SECRET=polar_wh_xxxxxxxxxxxxx
```

### Monitoring

**Key Metrics to Track:**

1. **API Success Rate:**
   ```javascript
   // Add to logging middleware
   console.log('[BillingProvider] API call:', {
     method: 'getSubscription',
     provider: BillingProviderFactory.getProviderType(),
     duration: Date.now() - startTime,
     success: true
   });
   ```

2. **Webhook Processing:**
   ```javascript
   // Track in webhook handler
   await SecurityAudit.log({
     action: 'webhook.received',
     resourceType: 'Webhook',
     details: {
       provider: 'stripe',
       eventType: event.type,
       processingTime: Date.now() - receivedAt
     }
   });
   ```

3. **Error Rates:**
   - Monitor provider API errors vs. application errors
   - Alert on >5% error rate
   - Automatic rollback on >20% error rate

### Performance Benchmarks

**Expected Latency:**
- `getSubscription`: <200ms (p95)
- `createCheckoutSession`: <500ms (p95)
- `verifyWebhookSignature`: <10ms (p99)

**Throughput:**
- 100 requests/second per provider instance
- Horizontal scaling via multiple app instances

### Security Considerations

1. **API Key Rotation:**
   - Rotate every 90 days
   - Use separate keys for staging/production
   - Never commit keys to git

2. **Webhook Security:**
   - Always verify signatures in production
   - Use HTTPS-only endpoints
   - Rate limit webhook endpoints (10 req/sec per IP)

3. **Customer Data:**
   - Never log full customer emails/names
   - Redact sensitive data in logs
   - Comply with PCI DSS for payment data

---

## Troubleshooting

### Common Issues

**Issue: `verifyWebhookSignature` always returns false**

**Diagnosis:**
```bash
# Check webhook secret is set
echo $STRIPE_WEBHOOK_SECRET

# Verify payload is raw body (not parsed JSON)
# In Express: Use express.raw({ type: 'application/json' })
```

**Solution:**
```javascript
// Correct: Raw body for signature verification
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['stripe-signature'];

  const isValid = billingProvider.verifyWebhookSignature(rawBody, signature, secret);
  // ...
});

// Incorrect: Parsed JSON body
router.post('/webhook/stripe', express.json(), async (req, res) => {
  // req.body is already parsed - signature verification will fail
});
```

---

**Issue: Subscription status shows "active" but user can't access features**

**Diagnosis:**
```javascript
// Check tier mapping
const subscription = await billingProvider.getSubscription(customerId);
console.log('Subscription tier:', subscription.tier);
console.log('User limits:', user.limits);
```

**Solution:**
Verify tier detection logic in `_determineTier()` method matches product metadata.

---

**Issue: Performance degradation after migration**

**Diagnosis:**
```bash
# Measure API latency
time curl -H "Authorization: Bearer $TOKEN" https://api.example.com/api/trader/subscription
```

**Solution:**
- Add Redis caching for product lookups
- Batch subscription retrievals
- Use provider webhook events to update local cache

---

## Additional Resources

- **Stripe API Reference:** https://stripe.com/docs/api
- **Polar.sh SDK Docs:** https://docs.polar.sh/api/
- **BillingProvider Source:** `src/services/billing/BillingProvider.js`
- **Test Examples:** `tests/billing/billing-provider.test.js`
- **Constitution Principle VIII:** `openspec/project.md` (modular architecture)

---

**Last Updated:** 2025-10-20
**Version:** 1.0.0
**Author:** Discord Trade Exec Team
