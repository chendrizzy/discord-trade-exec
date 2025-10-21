/**
 * PolarBillingProvider - Polar.sh Implementation
 *
 * Wraps Polar.sh API calls with BillingProvider interface for vendor independence.
 * Enables future migration to other billing providers without code changes.
 *
 * Data Mapping:
 * - Polar.sh subscription format → BillingProvider normalized format
 * - Polar.sh customer format → BillingProvider normalized format
 * - Polar.sh product format → BillingProvider normalized format
 *
 * Key Features:
 * - Graceful degradation (mock data if Polar not configured)
 * - Comprehensive error handling with descriptive messages
 * - Logging for debugging and monitoring
 */

const BillingProvider = require('../BillingProvider');
const { Polar } = require('@polar-sh/sdk');

class PolarBillingProvider extends BillingProvider {
  constructor() {
    super();

    // Initialize Polar SDK client
    this.accessToken = process.env.POLAR_ACCESS_TOKEN;
    this.organizationId = process.env.POLAR_ORGANIZATION_ID;

    if (this.accessToken) {
      this.client = new Polar({
        accessToken: this.accessToken
      });
      console.log('[PolarBillingProvider] Initialized with access token');
    } else {
      this.client = null;
      console.warn('[PolarBillingProvider] POLAR_ACCESS_TOKEN not configured - using mock data');
    }
  }

  /**
   * Get active subscription for a customer
   * @param {string} customerId - Polar customer UUID
   * @returns {Promise<Subscription|null>}
   */
  async getSubscription(customerId) {
    if (!this.client || !customerId) {
      console.log('[PolarBillingProvider] Returning mock subscription (Polar not configured)');
      return this._getMockSubscription(customerId);
    }

    try {
      // Get customer with subscriptions from Polar
      const result = await this.client.customers.get({
        id: customerId
      });

      const customer = result.customer;

      if (!customer.subscriptions || customer.subscriptions.length === 0) {
        return null; // No active subscription
      }

      const subscription = customer.subscriptions[0]; // Get first active subscription

      // Map Polar subscription to normalized format
      return this._mapPolarSubscription(subscription, customer.id);
    } catch (error) {
      console.error('[PolarBillingProvider] Error getting subscription:', error.message);
      throw new Error(`Failed to get Polar subscription: ${error.message}`);
    }
  }

  /**
   * Get customer details
   * @param {string} customerId - Polar customer UUID
   * @returns {Promise<Customer>}
   */
  async getCustomer(customerId) {
    if (!this.client || !customerId) {
      console.log('[PolarBillingProvider] Returning mock customer');
      return {
        id: customerId,
        email: 'mock@example.com',
        name: 'Mock Customer',
        createdAt: new Date()
      };
    }

    try {
      const result = await this.client.customers.get({
        id: customerId
      });

      return {
        id: result.customer.id,
        email: result.customer.email,
        name: result.customer.name,
        createdAt: new Date(result.customer.createdAt)
      };
    } catch (error) {
      console.error('[PolarBillingProvider] Error getting customer:', error.message);
      throw new Error(`Failed to get Polar customer: ${error.message}`);
    }
  }

  /**
   * Create customer portal session for subscription management
   * @param {string} customerId - Polar customer UUID
   * @param {string} returnUrl - URL to redirect after portal session
   * @returns {Promise<{id: string, url: string}>}
   */
  async createCustomerPortalSession(customerId, returnUrl) {
    if (!this.client) {
      return {
        id: '550e8400-mock-4000-b000-portalsession',
        url: `https://polar.sh/portal/mock?customer=${customerId}&return_url=${encodeURIComponent(returnUrl)}`
      };
    }

    try {
      const result = await this.client.customerSessions.create({
        customerId,
        returnUrl
      });

      return {
        id: result.customerSession.id,
        url: result.customerSession.url
      };
    } catch (error) {
      console.error('[PolarBillingProvider] Error creating customer portal session:', error.message);
      throw new Error(`Failed to create Polar customer portal session: ${error.message}`);
    }
  }

  /**
   * Create checkout session for new subscription purchase
   * @param {string} productId - Polar product UUID
   * @param {string} successUrl - URL to redirect on successful checkout
   * @param {string} customerEmail - Customer email address
   * @param {object} metadata - Additional metadata (e.g., {communityId, userId})
   * @returns {Promise<{id: string, url: string, productId: string, customerId: string}>}
   */
  async createCheckoutSession(productId, successUrl, customerEmail, metadata = {}) {
    if (!this.client || !productId) {
      return {
        id: '550e8400-mock-4000-b000-checkoutsession',
        url: `https://polar.sh/checkout/mock?product=${productId}&success_url=${encodeURIComponent(successUrl)}&email=${encodeURIComponent(customerEmail)}`,
        productId,
        customerId: '550e8400-mock-4000-b000-customer1'
      };
    }

    try {
      const result = await this.client.checkouts.create({
        productId,
        successUrl,
        customerEmail,
        metadata: {
          ...metadata,
          source: 'discord-trade-exec',
          provider: 'polar'
        }
      });

      return {
        id: result.checkout.id,
        url: result.checkout.url,
        productId: result.checkout.productId,
        customerId: result.checkout.customerId
      };
    } catch (error) {
      console.error('[PolarBillingProvider] Error creating checkout session:', error.message);
      throw new Error(`Failed to create Polar checkout session: ${error.message}`);
    }
  }

  /**
   * Get single product/plan by ID
   * @param {string} productId - Polar product UUID
   * @returns {Promise<Product>}
   */
  async getProduct(productId) {
    if (!this.client) {
      return this._getMockProduct(productId);
    }

    try {
      const result = await this.client.products.get({
        id: productId
      });

      return this._mapPolarProduct(result.product);
    } catch (error) {
      console.error('[PolarBillingProvider] Error getting product:', error.message);
      throw new Error(`Failed to get Polar product: ${error.message}`);
    }
  }

  /**
   * List all products/plans in organization
   * @returns {Promise<Product[]>}
   */
  async listProducts() {
    if (!this.client || !this.organizationId) {
      console.log('[PolarBillingProvider] Returning mock products');
      return [
        this._getMockProduct('550e8400-mock-4000-b000-product1', 'Professional Plan - Monthly', 'professional', 9900),
        this._getMockProduct('550e8400-mock-4000-b000-product2', 'Enterprise Plan - Monthly', 'enterprise', 29900)
      ];
    }

    try {
      const result = await this.client.products.list({
        organizationId: this.organizationId
      });

      return (result.items || []).map(product => this._mapPolarProduct(product));
    } catch (error) {
      console.error('[PolarBillingProvider] Error listing products:', error.message);
      throw new Error(`Failed to list Polar products: ${error.message}`);
    }
  }

  /**
   * Cancel subscription (end at period end)
   * @param {string} subscriptionId - Polar subscription UUID
   * @returns {Promise<{id: string, status: string, cancelAtPeriodEnd: boolean}>}
   */
  async cancelSubscription(subscriptionId) {
    if (!this.client) {
      return {
        id: subscriptionId,
        status: 'canceled',
        cancelAtPeriodEnd: true
      };
    }

    try {
      const result = await this.client.subscriptions.cancel({
        id: subscriptionId
      });

      return {
        id: result.subscription.id,
        status: result.subscription.status,
        cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd
      };
    } catch (error) {
      console.error('[PolarBillingProvider] Error canceling subscription:', error.message);
      throw new Error(`Failed to cancel Polar subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription (plan change, quantity, etc.)
   * @param {string} subscriptionId - Polar subscription UUID
   * @param {object} updates - Updates to apply (Polar-specific format)
   * @returns {Promise<Subscription>}
   */
  async updateSubscription(subscriptionId, updates) {
    if (!this.client) {
      return this._getMockSubscription(subscriptionId);
    }

    try {
      const result = await this.client.subscriptions.update({
        id: subscriptionId,
        ...updates
      });

      return this._mapPolarSubscription(result.subscription, result.subscription.customerId);
    } catch (error) {
      console.error('[PolarBillingProvider] Error updating subscription:', error.message);
      throw new Error(`Failed to update Polar subscription: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature (prevent webhook spoofing)
   * @param {string} payload - Raw request body
   * @param {string} signature - Webhook signature from headers
   * @param {string} secret - Webhook secret from environment
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature, secret) {
    if (!secret) {
      console.warn('[PolarBillingProvider] POLAR_WEBHOOK_SECRET not configured - skipping signature verification');
      return true; // Allow in development
    }

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('[PolarBillingProvider] Error verifying webhook signature:', error.message);
      return false;
    }
  }

  // ========== PRIVATE DATA MAPPING METHODS ==========

  /**
   * Map Polar subscription to normalized format
   * @private
   */
  _mapPolarSubscription(polarSubscription, customerId) {
    // Determine tier from product metadata or name
    let tier = 'free';
    if (polarSubscription.product) {
      const productName = polarSubscription.product.name.toLowerCase();
      if (productName.includes('professional')) tier = 'professional';
      else if (productName.includes('enterprise')) tier = 'enterprise';
    }

    return {
      id: polarSubscription.id,
      customerId: customerId,
      status: polarSubscription.status, // 'active', 'canceled', 'incomplete', 'past_due'
      tier,
      currentPeriodEnd: new Date(polarSubscription.currentPeriodEnd),
      cancelAtPeriodEnd: polarSubscription.cancelAtPeriodEnd || false,
      productId: polarSubscription.productId,
      productName: polarSubscription.product?.name,
      pricing: {
        amount: polarSubscription.price?.priceAmount || 0,
        currency: polarSubscription.price?.priceCurrency || 'usd',
        interval: polarSubscription.price?.recurringInterval || 'month'
      }
    };
  }

  /**
   * Map Polar product to normalized format
   * @private
   */
  _mapPolarProduct(polarProduct) {
    return {
      id: polarProduct.id,
      name: polarProduct.name,
      description: polarProduct.description || '',
      metadata: polarProduct.metadata || {},
      prices: (polarProduct.prices || []).map(price => ({
        id: price.id,
        priceAmount: price.priceAmount,
        priceCurrency: price.priceCurrency,
        recurringInterval: price.recurringInterval
      }))
    };
  }

  /**
   * Generate mock subscription for development
   * @private
   */
  _getMockSubscription(customerId) {
    return {
      id: '550e8400-mock-4000-b000-subscription1',
      customerId,
      status: 'active',
      tier: 'professional',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      productId: '550e8400-mock-4000-b000-product1',
      productName: 'Professional Plan - Monthly',
      pricing: {
        amount: 9900,
        currency: 'usd',
        interval: 'month'
      }
    };
  }

  /**
   * Generate mock product for development
   * @private
   */
  _getMockProduct(productId, name = 'Professional Plan - Monthly', tier = 'professional', amount = 9900) {
    return {
      id: productId,
      name,
      description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} trading signals platform`,
      metadata: {
        type: 'community',
        tier
      },
      prices: [
        {
          id: `${productId}-price`,
          priceAmount: amount,
          priceCurrency: 'usd',
          recurringInterval: 'month'
        }
      ]
    };
  }
}

module.exports = PolarBillingProvider;
