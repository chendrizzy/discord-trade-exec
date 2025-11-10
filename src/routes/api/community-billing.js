/**
 * Community Billing API Routes
 *
 * Polar.sh billing integration for community subscription management.
 * Constitution Principle I: All routes are community-scoped (tenantId filtering)
 * Constitution Principle III: SecurityAudit logging for sensitive operations
 * Constitution Principle V: Rate limiting applied
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { authenticateToken, requireCommunityAccess, requireRole } = require('../../middleware/auth-middleware');
const User = require('../../models/User');
const SecurityAudit = require('../../models/SecurityAudit');
const { debugLog, debugWarn, debugError } = require('../../utils/debug-logger');
const polarService = require('../../services/polar');

// Rate limiters
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many billing requests, please try again later'
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many checkout requests, please try again later'
});

// Validation schemas
const UpgradeSchema = z.object({
  tier: z.enum(['free', 'professional', 'enterprise'])
});

/**
 * GET /api/community/billing
 * Get complete billing information including subscription, usage, pricing, and invoices
 */
router.get('/',
  billingLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;

      // Get community admin user
      const user = await User.findOne({
        tenantId,
        roles: 'admin'
      }).select('subscription usage');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Community admin not found'
        });
      }

      // Get subscription from Polar if customer ID exists
      let polarSubscription = null;
      if (user.subscription?.polarCustomerId) {
        try {
          polarSubscription = await polarService.getCommunitySubscription(user.subscription.polarCustomerId);
        } catch (polarError) {
          debugWarn('[Billing API] Failed to fetch Polar subscription:', polarError.message);
        }
      }

      // Determine subscription details
      const subscription = {
        tier: user.subscription?.tier || 'free',
        status: user.subscription?.status || 'active',
        price: getPriceForTier(user.subscription?.tier || 'free'),
        billingCycle: 'Monthly',
        renewalDate: user.subscription?.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        polarCustomerId: user.subscription?.polarCustomerId,
        polarSubscriptionId: user.subscription?.polarSubscriptionId
      };

      // Get usage metrics
      const usage = {
        members: {
          current: user.usage?.totalMembers || 0,
          limit: getLimitForTier(user.subscription?.tier || 'free', 'members')
        },
        signalProviders: {
          current: user.usage?.activeSignalProviders || 0,
          limit: getLimitForTier(user.subscription?.tier || 'free', 'signalProviders')
        },
        signalsPerDay: {
          current: user.usage?.signalsToday || 0,
          limit: getLimitForTier(user.subscription?.tier || 'free', 'signalsPerDay')
        },
        apiCalls: {
          current: user.usage?.apiCallsThisMonth || 0,
          limit: getLimitForTier(user.subscription?.tier || 'free', 'apiCalls')
        }
      };

      // Get available pricing tiers
      const pricing = {
        tiers: [
          {
            name: 'free',
            description: 'Perfect for getting started',
            price: 0,
            limits: {
              members: 10,
              signalProviders: 1,
              signalsPerDay: 10,
              apiCalls: 1000
            },
            features: [
              'Up to 10 community members',
              '1 signal provider',
              '10 signals per day',
              'Basic analytics',
              'Email support'
            ]
          },
          {
            name: 'professional',
            description: 'For growing trading communities',
            price: 99,
            limits: {
              members: 100,
              signalProviders: 10,
              signalsPerDay: 1000,
              apiCalls: 100000
            },
            features: [
              'Up to 100 community members',
              '10 signal providers',
              '1,000 signals per day',
              'Advanced analytics',
              'Priority support',
              'Custom Discord webhooks',
              'Real-time notifications'
            ]
          },
          {
            name: 'enterprise',
            description: 'For large-scale operations',
            price: 299,
            limits: {
              members: 1000,
              signalProviders: 50,
              signalsPerDay: 10000,
              apiCalls: 1000000
            },
            features: [
              'Up to 1,000 community members',
              '50 signal providers',
              '10,000 signals per day',
              'Enterprise analytics',
              'Dedicated support',
              'Custom integrations',
              'API access',
              'White-label options',
              'SLA guarantee'
            ]
          }
        ]
      };

      // Get invoice history (mock for now - Polar SDK invoice retrieval not in scope)
      const invoices = generateMockInvoices(subscription);

      res.json({
        success: true,
        data: {
          subscription,
          usage,
          pricing,
          invoices
        }
      });

    } catch (error) {
      debugError('[Billing API] Error fetching billing info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch billing information'
      });
    }
  }
);

/**
 * POST /api/community/billing/portal
 * Create Polar customer portal session for subscription management
 */
router.post('/portal',
  billingLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Get community admin user
      const user = await User.findOne({
        tenantId,
        roles: 'admin'
      }).select('subscription');

      if (!user?.subscription?.polarCustomerId) {
        return res.status(400).json({
          success: false,
          error: 'No Polar customer ID found. Please contact support.'
        });
      }

      // Create customer portal session
      const returnUrl = `${req.protocol}://${req.get('host')}/dashboard/settings?tab=billing`;
      const portalSession = await polarService.createCustomerPortalSession(
        user.subscription.polarCustomerId,
        returnUrl
      );

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'customer_portal_accessed',
        resourceType: 'billing',
        resourceId: user.subscription.polarCustomerId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: {
          url: portalSession.url,
          sessionId: portalSession.id
        }
      });

    } catch (error) {
      debugError('[Billing API] Error creating portal session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create customer portal session'
      });
    }
  }
);

/**
 * POST /api/community/billing/upgrade
 * Create Polar checkout session for tier upgrade/downgrade
 */
router.post('/upgrade',
  checkoutLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Validate request body
      const validation = UpgradeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid tier specified',
          details: validation.error.errors
        });
      }

      const { tier } = validation.data;

      // Get community admin user
      const user = await User.findOne({
        tenantId,
        roles: 'admin'
      }).select('subscription discord');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Community admin not found'
        });
      }

      // Check if already on this tier
      if (user.subscription?.tier === tier) {
        return res.status(400).json({
          success: false,
          error: `You are already on the ${tier} plan`
        });
      }

      // Get product ID for the tier (in production, map tier to Polar product IDs)
      const productId = getProductIdForTier(tier);

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid tier or product not found'
        });
      }

      // Create checkout session
      const successUrl = `${req.protocol}://${req.get('host')}/dashboard/settings?tab=billing&checkout=success`;
      const customerEmail = user.discord?.email || 'noemail@example.com';

      const checkoutSession = await polarService.createCheckoutSession(
        productId,
        successUrl,
        customerEmail,
        {
          tenantId,
          userId,
          previousTier: user.subscription?.tier || 'free',
          newTier: tier
        }
      );

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'subscription_upgrade_initiated',
        resourceType: 'billing',
        resourceId: productId,
        changes: {
          previousTier: user.subscription?.tier || 'free',
          newTier: tier
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: {
          url: checkoutSession.url,
          checkoutId: checkoutSession.id
        }
      });

    } catch (error) {
      debugError('[Billing API] Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  }
);

/**
 * POST /api/community/billing/cancel
 * Cancel subscription (sets cancel at period end)
 */
router.post('/cancel',
  billingLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Get community admin user
      const user = await User.findOne({
        tenantId,
        roles: 'admin'
      }).select('subscription');

      if (!user?.subscription?.polarSubscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'No active subscription found'
        });
      }

      // Cancel subscription in Polar (sets cancelAtPeriodEnd = true)
      const canceledSubscription = await polarService.cancelSubscription(
        user.subscription.polarSubscriptionId
      );

      // Update user subscription status
      await User.updateOne(
        { tenantId, roles: 'admin' },
        {
          $set: {
            'subscription.status': 'cancelled',
            'subscription.cancelAtPeriodEnd': true
          }
        }
      );

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'subscription_cancelled',
        resourceType: 'billing',
        resourceId: user.subscription.polarSubscriptionId,
        changes: {
          tier: user.subscription.tier,
          status: 'cancelled'
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: 'Subscription will be cancelled at the end of the billing period',
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: user.subscription.currentPeriodEnd
        }
      });

    } catch (error) {
      debugError('[Billing API] Error cancelling subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription'
      });
    }
  }
);

// Helper Functions

/**
 * Get monthly price for tier
 */
function getPriceForTier(tier) {
  const prices = {
    free: 0,
    professional: 99,
    enterprise: 299
  };
  return prices[tier] || 0;
}

/**
 * Get limit for tier and metric
 */
function getLimitForTier(tier, metric) {
  const limits = {
    free: {
      members: 10,
      signalProviders: 1,
      signalsPerDay: 10,
      apiCalls: 1000
    },
    professional: {
      members: 100,
      signalProviders: 10,
      signalsPerDay: 1000,
      apiCalls: 100000
    },
    enterprise: {
      members: 1000,
      signalProviders: 50,
      signalsPerDay: 10000,
      apiCalls: 1000000
    }
  };

  return limits[tier]?.[metric] || limits.free[metric];
}

/**
 * Get Polar product ID for tier (mock - should be env vars in production)
 */
function getProductIdForTier(tier) {
  // In production, these should be environment variables
  // POLAR_PRODUCT_ID_PROFESSIONAL, POLAR_PRODUCT_ID_ENTERPRISE
  const productIds = {
    professional: process.env.POLAR_PRODUCT_ID_PROFESSIONAL || '550e8400-mock-4000-b000-product1',
    enterprise: process.env.POLAR_PRODUCT_ID_ENTERPRISE || '550e8400-mock-4000-b000-product2'
  };

  return productIds[tier] || null;
}

/**
 * Generate mock invoice history
 */
function generateMockInvoices(subscription) {
  const invoices = [];
  const currentDate = new Date();

  // Generate 3 months of mock invoices
  for (let i = 0; i < 3; i++) {
    const invoiceDate = new Date(currentDate);
    invoiceDate.setMonth(invoiceDate.getMonth() - i);

    invoices.push({
      id: `inv_${Date.now()}_${i}`,
      number: `INV-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(1000 + i).padStart(4, '0')}`,
      date: invoiceDate.toISOString(),
      description: `${subscription.tier} Plan - Monthly`,
      amount: subscription.price,
      status: 'paid'
    });
  }

  return invoices;
}

module.exports = router;
