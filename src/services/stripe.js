/**
 * Stripe Integration Service
 *
 * Handles Stripe API integration for subscription management.
 *
 * Environment Variables Required:
 * - STRIPE_SECRET_KEY: Stripe secret API key (sk_test_* or sk_live_*)
 *
 * Stripe SDK: npm install stripe (already installed)
 */

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Only initialize Stripe if API key is provided
let stripe = null;
if (stripeSecretKey) {
  const Stripe = require('stripe');
  stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16', // Use stable API version
    typescript: false
  });
  console.log('[Stripe] Initialized with API key:', stripeSecretKey.substring(0, 12) + '...');
} else {
  console.warn('[Stripe] STRIPE_SECRET_KEY not configured - using mock data');
}

/**
 * Get subscription details from Stripe
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Subscription details
 */
const getSubscription = async (subscriptionId) => {
  if (!stripe) {
    throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['customer', 'default_payment_method']
    });

    return subscription;
  } catch (error) {
    console.error('[Stripe] Error retrieving subscription:', error.message);
    throw error;
  }
};

/**
 * Get customer details from Stripe
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} Customer details
 */
const getCustomer = async (customerId) => {
  if (!stripe) {
    throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer;
  } catch (error) {
    console.error('[Stripe] Error retrieving customer:', error.message);
    throw error;
  }
};

/**
 * Get subscription details for a community
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} Subscription details or mock data
 */
const getCommunitySubscription = async (customerId) => {
  // If Stripe not configured, return mock data
  if (!stripe || !customerId) {
    console.log('[Stripe] Returning mock data (Stripe not configured or no customer ID)');
    return {
      id: 'sub_mock_123',
      customerId,
      status: 'active',
      tier: 'professional',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      limits: {
        maxMembers: 100,
        maxSignalProviders: 10,
        maxSignalsPerDay: 1000
      },
      usage: {
        members: 45,
        signalProviders: 3,
        signalsToday: 234
      },
      pricing: {
        amount: 9900, // $99.00
        currency: 'usd',
        interval: 'month'
      }
    };
  }

  try {
    // Get customer to find active subscription
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['subscriptions']
    });

    if (!customer.subscriptions || customer.subscriptions.data.length === 0) {
      return null; // No active subscription
    }

    // Get the first active subscription
    const subscription = customer.subscriptions.data[0];

    return {
      id: subscription.id,
      customerId: customer.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: subscription.items.data.map(item => ({
        id: item.id,
        priceId: item.price.id,
        productId: item.price.product,
        amount: item.price.unit_amount,
        currency: item.price.currency,
        interval: item.price.recurring?.interval
      }))
    };
  } catch (error) {
    console.error('[Stripe] Error getting community subscription:', error.message);
    throw error;
  }
};

/**
 * Get subscription details for a user
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} Subscription details
 *
 * TODO: Replace with actual Stripe API call
 */
const getUserSubscription = async (customerId) => {
  // Mock data - replace with actual Stripe API call
  return {
    id: 'sub_mock_456',
    customerId,
    status: 'active',
    tier: 'basic',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    limits: {
      maxSignalsPerDay: 50,
      maxActiveBrokers: 2
    },
    usage: {
      signalsToday: 12,
      activeBrokers: 1
    },
    pricing: {
      amount: 2900, // $29.00
      currency: 'usd',
      interval: 'month'
    }
  };
};

/**
 * Create a Stripe customer portal session
 * @param {string} customerId - Stripe customer ID
 * @param {string} returnUrl - URL to return to after portal session
 * @returns {Promise<Object>} Portal session with URL
 */
const createCustomerPortalSession = async (customerId, returnUrl) => {
  if (!stripe) {
    // Return mock URL if Stripe not configured
    return {
      id: 'bps_mock_789',
      url: `https://billing.stripe.com/session/${customerId}?return_url=${encodeURIComponent(returnUrl)}`
    };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return {
      id: session.id,
      url: session.url
    };
  } catch (error) {
    console.error('[Stripe] Error creating customer portal session:', error.message);
    throw error;
  }
};

/**
 * Create a checkout session for subscription upgrade
 * @param {string} customerId - Stripe customer ID (optional for new customers)
 * @param {string} priceId - Stripe price ID for new tier
 * @param {string} successUrl - URL to redirect on success
 * @param {string} cancelUrl - URL to redirect on cancel
 * @returns {Promise<Object>} Checkout session with URL
 */
const createCheckoutSession = async (customerId, priceId, successUrl, cancelUrl) => {
  if (!stripe) {
    // Return mock URL if Stripe not configured
    return {
      id: 'cs_mock_101',
      url: `https://checkout.stripe.com/c/pay/${priceId}?success_url=${encodeURIComponent(successUrl)}`
    };
  }

  try {
    const sessionParams = {
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl
    };

    // Add customer if provided (for existing customers)
    if (customerId) {
      sessionParams.customer = customerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      id: session.id,
      url: session.url
    };
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error.message);
    throw error;
  }
};

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe webhook event
 * @returns {Promise<void>}
 *
 * TODO: Implement webhook handling:
 * - Verify webhook signature
 * - Handle subscription.created, subscription.updated, subscription.deleted
 * - Update database records accordingly
 */
const handleWebhook = async (event) => {
  console.log('[Stripe Webhook] Received event:', event.type);

  switch (event.type) {
    case 'customer.subscription.created':
      // TODO: Update database with new subscription
      break;
    case 'customer.subscription.updated':
      // TODO: Update subscription status in database
      break;
    case 'customer.subscription.deleted':
      // TODO: Mark subscription as cancelled in database
      break;
    case 'invoice.payment_succeeded':
      // TODO: Record successful payment
      break;
    case 'invoice.payment_failed':
      // TODO: Handle failed payment (notify user, suspend service)
      break;
    default:
      console.log('[Stripe Webhook] Unhandled event type:', event.type);
  }
};

module.exports = {
  // Core Stripe functions
  getSubscription,
  getCustomer,

  // Application-specific functions
  getCommunitySubscription,
  getUserSubscription,
  createCustomerPortalSession,
  createCheckoutSession,
  handleWebhook
};
