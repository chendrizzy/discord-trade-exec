/**
 * BillingProvider Abstract Interface
 *
 * Defines contract for all billing provider implementations (Polar.sh today, extensible for future providers)
 * Achieves Constitution Principle VIII: Modular architecture with clear separation of concerns
 *
 * Purpose:
 * - Vendor independence: Switch billing providers via configuration, not code rewrite
 * - Testability: Mock billing operations without external API calls
 * - Maintainability: Isolate provider-specific logic to single file
 * - Future-proofing: Vendor migrations become days (not months)
 *
 * Implementation:
 * - PolarBillingProvider: Current Polar.sh integration
 *
 * Usage:
 *   const provider = BillingProviderFactory.createProvider();
 *   const subscription = await provider.getSubscription(userId);
 */

/**
 * Abstract BillingProvider class
 * All billing providers must extend this class and implement all methods
 */
class BillingProvider {
  /**
   * Get active subscription for a customer
   * @param {string} customerId - Customer UUID (Polar customer ID)
   * @returns {Promise<Subscription|null>} Subscription object or null if no active subscription
   * @throws {Error} If API call fails
   *
   * Subscription format (normalized across providers):
   * {
   *   id: string,              // Subscription ID
   *   customerId: string,      // Customer ID
   *   status: string,          // 'active', 'canceled', 'incomplete', 'past_due'
   *   tier: string,            // 'free', 'professional', 'enterprise'
   *   currentPeriodEnd: Date,  // Subscription renewal date
   *   cancelAtPeriodEnd: boolean,
   *   productId: string,       // Product identifier
   *   productName: string,     // Human-readable product name
   *   pricing: {
   *     amount: number,        // Price in cents (e.g., 9900 = $99.00)
   *     currency: string,      // ISO currency code (e.g., 'usd')
   *     interval: string       // 'month' or 'year'
   *   }
   * }
   */
  async getSubscription(customerId) {
    throw new Error('getSubscription() must be implemented by provider');
  }

  /**
   * Get customer details
   * @param {string} customerId - Customer UUID
   * @returns {Promise<Customer>} Customer object
   * @throws {Error} If customer not found or API call fails
   *
   * Customer format (normalized):
   * {
   *   id: string,
   *   email: string,
   *   name: string,
   *   createdAt: Date
   * }
   */
  async getCustomer(customerId) {
    throw new Error('getCustomer() must be implemented by provider');
  }

  /**
   * Create customer portal session for subscription management
   * Allows customers to update payment methods, cancel subscriptions, etc.
   *
   * @param {string} customerId - Customer UUID
   * @param {string} returnUrl - URL to redirect after portal session
   * @returns {Promise<{id: string, url: string}>} Portal session with redirect URL
   * @throws {Error} If customer not found or API call fails
   */
  async createCustomerPortalSession(customerId, returnUrl) {
    throw new Error('createCustomerPortalSession() must be implemented by provider');
  }

  /**
   * Create checkout session for new subscription purchase
   * @param {string} productId - Product/plan identifier
   * @param {string} successUrl - URL to redirect on successful checkout
   * @param {string} customerEmail - Customer email address
   * @param {object} metadata - Additional metadata (e.g., {communityId, userId})
   * @returns {Promise<{id: string, url: string, productId: string, customerId: string}>} Checkout session
   * @throws {Error} If product not found or API call fails
   */
  async createCheckoutSession(productId, successUrl, customerEmail, metadata = {}) {
    throw new Error('createCheckoutSession() must be implemented by provider');
  }

  /**
   * Get single product/plan by ID
   * @param {string} productId - Product UUID
   * @returns {Promise<Product>} Product details
   * @throws {Error} If product not found or API call fails
   *
   * Product format (normalized):
   * {
   *   id: string,
   *   name: string,
   *   description: string,
   *   metadata: {
   *     type: string,    // 'community' or 'trader'
   *     tier: string     // 'professional' or 'enterprise'
   *   },
   *   prices: [{
   *     id: string,
   *     priceAmount: number,     // Price in cents
   *     priceCurrency: string,   // ISO currency code
   *     recurringInterval: string // 'month' or 'year'
   *   }]
   * }
   */
  async getProduct(productId) {
    throw new Error('getProduct() must be implemented by provider');
  }

  /**
   * List all products/plans in organization
   * @returns {Promise<Product[]>} Array of products
   * @throws {Error} If API call fails
   */
  async listProducts() {
    throw new Error('listProducts() must be implemented by provider');
  }

  /**
   * Cancel subscription (end at period end)
   * @param {string} subscriptionId - Subscription UUID
   * @returns {Promise<{id: string, status: string, cancelAtPeriodEnd: boolean}>} Updated subscription
   * @throws {Error} If subscription not found or API call fails
   */
  async cancelSubscription(subscriptionId) {
    throw new Error('cancelSubscription() must be implemented by provider');
  }

  /**
   * Update subscription (plan change, quantity, etc.)
   * @param {string} subscriptionId - Subscription UUID
   * @param {object} updates - Updates to apply (provider-specific)
   * @returns {Promise<Subscription>} Updated subscription
   * @throws {Error} If subscription not found or API call fails
   */
  async updateSubscription(subscriptionId, updates) {
    throw new Error('updateSubscription() must be implemented by provider');
  }

  /**
   * Verify webhook signature (prevent webhook spoofing)
   * @param {string} payload - Raw request body
   * @param {string} signature - Webhook signature from headers
   * @param {string} secret - Webhook secret from environment
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature, secret) {
    throw new Error('verifyWebhookSignature() must be implemented by provider');
  }
}

module.exports = BillingProvider;
