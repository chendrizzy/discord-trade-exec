/**
 * StripeBillingProvider - Stripe Implementation (STUB)
 *
 * Placeholder for future Stripe integration when migrating from Polar.sh.
 * Currently returns "Not implemented" errors to maintain interface contract.
 *
 * TODO: Implement Stripe integration (Week 3 - Task 2.6 completion)
 * - Install @stripe/stripe-js SDK
 * - Implement subscription management via Stripe API
 * - Map Stripe data formats to BillingProvider normalized format
 * - Implement webhook signature verification using Stripe's method
 * - Add Stripe-specific error handling
 * - Update environment variables documentation
 *
 * Migration Path:
 * 1. Set BILLING_PROVIDER=stripe in environment
 * 2. Configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * 3. Update product IDs to Stripe product IDs
 * 4. Test checkout and subscription flows
 * 5. Migrate existing Polar customers to Stripe
 * 6. Switch production traffic to Stripe
 */

const BillingProvider = require('../BillingProvider');

class StripeBillingProvider extends BillingProvider {
  constructor() {
    super();

    // Stripe SDK initialization (TODO: uncomment when implementing)
    // const stripe = require('stripe');
    // this.client = stripe(process.env.STRIPE_SECRET_KEY);

    console.warn('[StripeBillingProvider] Stripe integration not yet implemented - stub loaded');
  }

  /**
   * Get active subscription for a customer
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Subscription|null>}
   */
  async getSubscription(customerId) {
    // TODO: Implement Stripe subscription retrieval
    // const subscriptions = await this.client.subscriptions.list({
    //   customer: customerId,
    //   status: 'active',
    //   limit: 1
    // });
    // return this._mapStripeSubscription(subscriptions.data[0]);

    throw new Error('StripeBillingProvider.getSubscription() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Get customer details
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Customer>}
   */
  async getCustomer(customerId) {
    // TODO: Implement Stripe customer retrieval
    // const customer = await this.client.customers.retrieve(customerId);
    // return {
    //   id: customer.id,
    //   email: customer.email,
    //   name: customer.name,
    //   createdAt: new Date(customer.created * 1000)
    // };

    throw new Error('StripeBillingProvider.getCustomer() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Create customer portal session for subscription management
   * @param {string} customerId - Stripe customer ID
   * @param {string} returnUrl - URL to redirect after portal session
   * @returns {Promise<{id: string, url: string}>}
   */
  async createCustomerPortalSession(customerId, returnUrl) {
    // TODO: Implement Stripe customer portal
    // const session = await this.client.billingPortal.sessions.create({
    //   customer: customerId,
    //   return_url: returnUrl
    // });
    // return {
    //   id: session.id,
    //   url: session.url
    // };

    throw new Error('StripeBillingProvider.createCustomerPortalSession() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Create checkout session for new subscription purchase
   * @param {string} productId - Stripe price ID (not product ID!)
   * @param {string} successUrl - URL to redirect on successful checkout
   * @param {string} customerEmail - Customer email address
   * @param {object} metadata - Additional metadata (e.g., {communityId, userId})
   * @returns {Promise<{id: string, url: string, productId: string, customerId: string}>}
   */
  async createCheckoutSession(productId, successUrl, customerEmail, metadata = {}) {
    // TODO: Implement Stripe checkout session
    // NOTE: Stripe uses price IDs, not product IDs for checkout
    // const session = await this.client.checkout.sessions.create({
    //   mode: 'subscription',
    //   customer_email: customerEmail,
    //   line_items: [{
    //     price: productId, // Stripe price ID
    //     quantity: 1
    //   }],
    //   success_url: successUrl,
    //   cancel_url: successUrl.replace('success', 'cancel'),
    //   metadata: {
    //     ...metadata,
    //     source: 'discord-trade-exec',
    //     provider: 'stripe'
    //   }
    // });
    // return {
    //   id: session.id,
    //   url: session.url,
    //   productId: session.line_items.data[0].price.product,
    //   customerId: session.customer
    // };

    throw new Error('StripeBillingProvider.createCheckoutSession() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Get single product/plan by ID
   * @param {string} productId - Stripe product ID
   * @returns {Promise<Product>}
   */
  async getProduct(productId) {
    // TODO: Implement Stripe product retrieval with prices
    // const product = await this.client.products.retrieve(productId);
    // const prices = await this.client.prices.list({
    //   product: productId,
    //   active: true
    // });
    // return this._mapStripeProduct(product, prices.data);

    throw new Error('StripeBillingProvider.getProduct() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * List all products/plans in organization
   * @returns {Promise<Product[]>}
   */
  async listProducts() {
    // TODO: Implement Stripe product listing
    // const products = await this.client.products.list({
    //   active: true,
    //   limit: 100
    // });
    // return Promise.all(
    //   products.data.map(async (product) => {
    //     const prices = await this.client.prices.list({
    //       product: product.id,
    //       active: true
    //     });
    //     return this._mapStripeProduct(product, prices.data);
    //   })
    // );

    throw new Error('StripeBillingProvider.listProducts() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Cancel subscription (end at period end)
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {Promise<{id: string, status: string, cancelAtPeriodEnd: boolean}>}
   */
  async cancelSubscription(subscriptionId) {
    // TODO: Implement Stripe subscription cancellation
    // const subscription = await this.client.subscriptions.update(subscriptionId, {
    //   cancel_at_period_end: true
    // });
    // return {
    //   id: subscription.id,
    //   status: subscription.status,
    //   cancelAtPeriodEnd: subscription.cancel_at_period_end
    // };

    throw new Error('StripeBillingProvider.cancelSubscription() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Update subscription (plan change, quantity, etc.)
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {object} updates - Updates to apply (Stripe-specific format)
   * @returns {Promise<Subscription>}
   */
  async updateSubscription(subscriptionId, updates) {
    // TODO: Implement Stripe subscription update
    // const subscription = await this.client.subscriptions.update(
    //   subscriptionId,
    //   updates
    // );
    // return this._mapStripeSubscription(subscription);

    throw new Error('StripeBillingProvider.updateSubscription() not yet implemented - use BILLING_PROVIDER=polar');
  }

  /**
   * Verify webhook signature (prevent webhook spoofing)
   * @param {string} payload - Raw request body
   * @param {string} signature - Webhook signature from headers (stripe-signature)
   * @param {string} secret - Webhook secret from environment
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature, secret) {
    // TODO: Implement Stripe webhook verification
    // try {
    //   const stripe = require('stripe');
    //   stripe.webhooks.constructEvent(payload, signature, secret);
    //   return true;
    // } catch (error) {
    //   console.error('[StripeBillingProvider] Webhook signature verification failed:', error.message);
    //   return false;
    // }

    throw new Error('StripeBillingProvider.verifyWebhookSignature() not yet implemented - use BILLING_PROVIDER=polar');
  }

  // ========== PRIVATE DATA MAPPING METHODS (TODO) ==========

  /**
   * Map Stripe subscription to normalized format
   * @private
   */
  // _mapStripeSubscription(stripeSubscription) {
  //   // Determine tier from product metadata
  //   const tier = stripeSubscription.items.data[0]?.price?.product?.metadata?.tier || 'free';
  //
  //   return {
  //     id: stripeSubscription.id,
  //     customerId: stripeSubscription.customer,
  //     status: stripeSubscription.status, // 'active', 'canceled', 'incomplete', 'past_due', etc.
  //     tier,
  //     currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
  //     cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
  //     productId: stripeSubscription.items.data[0]?.price?.product,
  //     productName: stripeSubscription.items.data[0]?.price?.product?.name,
  //     pricing: {
  //       amount: stripeSubscription.items.data[0]?.price?.unit_amount || 0,
  //       currency: stripeSubscription.items.data[0]?.price?.currency || 'usd',
  //       interval: stripeSubscription.items.data[0]?.price?.recurring?.interval || 'month'
  //     }
  //   };
  // }

  /**
   * Map Stripe product to normalized format
   * @private
   */
  // _mapStripeProduct(stripeProduct, stripePrices) {
  //   return {
  //     id: stripeProduct.id,
  //     name: stripeProduct.name,
  //     description: stripeProduct.description || '',
  //     metadata: stripeProduct.metadata || {},
  //     prices: stripePrices.map(price => ({
  //       id: price.id,
  //       priceAmount: price.unit_amount,
  //       priceCurrency: price.currency,
  //       recurringInterval: price.recurring?.interval || 'month'
  //     }))
  //   };
  // }
}

module.exports = StripeBillingProvider;
