// External dependencies
const express = require('express');

// Internal services
const BillingProviderFactory = require('./billing/BillingProviderFactory');
const logger = require('../utils/logger');

class PaymentProcessor {
  constructor() {
    this.router = express.Router();
    this.billingProvider = null;
    this.providerType = 'polar';
    this.productCache = null;
    this.productCacheFetchedAt = 0;

    try {
      this.billingProvider = BillingProviderFactory.createProvider();
      this.providerType = BillingProviderFactory.getProviderType();
    } catch (error) {
      logger.error('[PaymentProcessor] Failed to initialize billing provider', {
        error: error.message,
        stack: error.stack
      });
    }

    // Pricing plans configuration (shared across providers)
    this.plans = {
      basic: {
        name: 'Basic Bot',
        price: 49,
        trialDays: 7,
        metadata: { type: 'community', tier: 'professional' },
        polarEnvVar: 'POLAR_PRODUCT_BASIC',
        polarProductId: process.env.POLAR_PRODUCT_BASIC,
        features: [
          '100 trading signals/day',
          'Discord bot integration',
          'Basic analytics dashboard',
          'Email support',
          '7-day free trial'
        ]
      },
      pro: {
        name: 'Pro Trader',
        price: 99,
        trialDays: 7,
        metadata: { type: 'community', tier: 'enterprise' },
        polarEnvVar: 'POLAR_PRODUCT_PRO',
        polarProductId: process.env.POLAR_PRODUCT_PRO,
        features: [
          'Unlimited trading signals',
          'Multiple Discord servers',
          'Advanced analytics & insights',
          'Priority support',
          'Custom risk settings',
          'Mobile app access'
        ]
      },
      premium: {
        name: 'Elite Trader',
        price: 299,
        trialDays: 14,
        metadata: { type: 'community', tier: 'elite' },
        polarEnvVar: 'POLAR_PRODUCT_PREMIUM',
        polarProductId: process.env.POLAR_PRODUCT_PREMIUM,
        features: [
          'Everything in Pro',
          'Multiple broker support',
          'Priority trade execution',
          'Custom indicators',
          'Dedicated account manager',
          'Private Discord channel'
        ]
      }
    };

    this.setupRoutes();
  }

  ensureBillingProvider(res) {
    if (this.billingProvider) {
      return this.billingProvider;
    }

    const message = 'Billing provider not configured';
    logger.error('[PaymentProcessor] Billing provider not configured', {
      billingProvider: process.env.BILLING_PROVIDER,
      hint: 'Verify BILLING_PROVIDER configuration and related environment variables'
    });

    if (res) {
      res.status(503).json({
        error: message,
        hint: 'Verify BILLING_PROVIDER configuration and related environment variables.'
      });
    }

    return null;
  }

  setupRoutes() {
    // Checkout page
    this.router.get('/checkout', this.showCheckout.bind(this));

    // Create checkout session (provider-agnostic)
    this.router.post('/create-checkout-session', this.createCheckoutSession.bind(this));

    // Success page
    this.router.get('/success', this.showSuccess.bind(this));

    // Cancel page
   this.router.get('/cancel', this.showCancel.bind(this));

    // Customer portal
    this.router.post('/create-portal-session', this.createPortalSession.bind(this));
  }

  async showCheckout(req, res) {
    const { plan, price } = req.query;
    const selectedPlan = this.plans[plan];

    if (!selectedPlan) {
      return res.status(400).send('Invalid plan selected');
    }

    const trialDays = selectedPlan.trialDays ?? 0;
    const hasTrial = trialDays > 0;
    const trialHeading = hasTrial ? `🎉 Start Your FREE ${trialDays}-Day Trial` : 'Secure Checkout';
    const trialEndDate = hasTrial
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toLocaleDateString()
      : null;
    const buttonLabel = hasTrial ? '🚀 Start My FREE Trial' : '🚀 Complete Secure Checkout';

    // Render checkout page
    const checkoutHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Checkout - ${selectedPlan.name}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .checkout-container {
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 500px;
                    width: 90%;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                    text-align: center;
                }
                .plan-summary {
                    margin-bottom: 30px;
                    padding: 20px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 15px;
                }
                .plan-name { font-size: 1.8rem; font-weight: bold; margin-bottom: 10px; }
                .plan-price { font-size: 2.5rem; color: #00ff88; font-weight: bold; margin: 20px 0; }
                .trial-info { 
                    background: rgba(0,255,136,0.2); 
                    padding: 15px; 
                    border-radius: 10px; 
                    margin: 20px 0;
                    border-left: 4px solid #00ff88;
                }
                .checkout-button {
                    background: linear-gradient(45deg, #00ff88, #00ccff);
                    color: white;
                    border: none;
                    padding: 20px 40px;
                    border-radius: 50px;
                    font-size: 1.2rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    width: 100%;
                    margin-top: 20px;
                }
                .checkout-button:hover { transform: translateY(-2px); }
                .security-badges {
                    margin-top: 30px;
                    font-size: 0.9rem;
                    color: rgba(255,255,255,0.8);
                }
                .features {
                    list-style: none;
                    text-align: left;
                    margin: 20px 0;
                }
                .features li {
                    padding: 8px 0;
                    padding-left: 25px;
                    position: relative;
                }
                .features li:before {
                    content: '✅';
                    position: absolute;
                    left: 0;
                }
            </style>
        </head>
        <body>
            <div class="checkout-container">
                <div class="plan-summary">
                    <div class="plan-name">${selectedPlan.name}</div>
                    <div class="plan-price">$${selectedPlan.price}<span style="font-size: 1rem;">/month</span></div>
                    
                    <ul class="features">
                        ${selectedPlan.features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="trial-info">
                    <strong>${trialHeading}</strong><br>
                    ${
                      hasTrial
                        ? `No charges until ${trialEndDate}.<br>
                    Cancel anytime during trial - no questions asked.`
                        : 'Complete checkout to unlock full access instantly.'
                    }
                </div>
                
                <button class="checkout-button" onclick="createCheckoutSession('${plan}')">
                    ${buttonLabel}
                </button>
                
                <div class="security-badges">
                    🔒 Secure SSL Encryption • 💳 All Major Cards Accepted<br>
                    🎯 30-Day Money-Back Guarantee • ✅ Cancel Anytime
                </div>
            </div>

            <script>
                async function createCheckoutSession(plan) {
                    try {
                        const response = await fetch('/create-checkout-session', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ plan: plan })
                        });
                        
                        const session = await response.json();
                        
                        if (session.error) {
                            alert('Error: ' + session.error);
                            return;
                        }

                        if (session.checkoutUrl) {
                            window.location.href = session.checkoutUrl;
                            return;
                        }

                        if (session.sessionId) {
                            window.location.href = '/success?session_id=' + encodeURIComponent(session.sessionId);
                            return;
                        }

                        alert('Checkout session created, but no redirect URL was returned.');
                    } catch (error) {
                        logger.error('Error:', { error: error.message, stack: error.stack });
                        alert('Something went wrong. Please try again.');
                    }
                }
            </script>
        </body>
        </html>`;

    res.send(checkoutHtml);
  }

  async createCheckoutSession(req, res) {
    const { plan } = req.body;
    const selectedPlan = this.plans[plan];

    if (!selectedPlan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const billingProvider = this.ensureBillingProvider(res);
    if (!billingProvider) {
      return;
    }

    try {
      const productId = await this.resolveProductId(plan);

      if (!productId) {
        return res.status(500).json({
          error: 'Billing product not configured for selected plan',
          hint: 'Set POLAR_PRODUCT_* environment variables or configure product metadata in Polar.sh'
        });
      }

      const successUrl = `${req.protocol}://${req.get('host')}/success?plan=${plan}&provider=${this.providerType}`;
      const customerEmail =
        req.user?.notifications?.email ||
        req.user?.email ||
        req.body?.email ||
        'demo@tradebotai.com';

      const metadata = {
        plan,
        tier: selectedPlan.metadata?.tier,
        type: selectedPlan.metadata?.type,
        trialDays: selectedPlan.trialDays || 0,
        source: 'discord-trade-exec'
      };

      const session = await billingProvider.createCheckoutSession(
        productId,
        successUrl,
        customerEmail,
        metadata
      );

      res.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        provider: this.providerType
      });
    } catch (error) {
      logger.error('[PaymentProcessor] Billing provider checkout error:', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }

  async resolveProductId(planKey) {
    const plan = this.plans[planKey];
    if (!plan) {
      return null;
    }

    if (this.providerType === 'polar') {
      if (plan.polarProductId) {
        return plan.polarProductId;
      }

      if (plan.polarEnvVar && process.env[plan.polarEnvVar]) {
        return process.env[plan.polarEnvVar];
      }

      const provider = this.ensureBillingProvider();
      if (!provider || typeof provider.listProducts !== 'function') {
        return null;
      }

      try {
        const cacheExpired = Date.now() - this.productCacheFetchedAt > 5 * 60 * 1000;
        if (!this.productCache || cacheExpired) {
          this.productCache = await provider.listProducts();
          this.productCacheFetchedAt = Date.now();
        }

        if (Array.isArray(this.productCache)) {
          const match = this.productCache.find(product => {
            const metadata = product.metadata || {};
            return metadata.type === plan.metadata?.type && metadata.tier === plan.metadata?.tier;
          });

          if (match) {
            return match.id;
          }
        }
      } catch (error) {
        logger.error('[PaymentProcessor] Error loading billing products:', { error: error.message, stack: error.stack });
        return null;
      }

      return null;
    }

    return null;
  }

  async showSuccess(req, res) {
    const { session_id, plan: planQuery } = req.query;

    let customerInfo = {
      customerEmail: null,
      plan: planQuery || null
    };

    if (!customerInfo.plan && planQuery && this.plans[planQuery]) {
      customerInfo.plan = planQuery;
    }

    const planDetails = customerInfo.plan && this.plans[customerInfo.plan]
      ? this.plans[customerInfo.plan]
      : null;
    const trialDays = planDetails?.trialDays ?? 7;
    const planName = planDetails?.name || 'TradeBotAI';

    const successHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to TradeBotAI!</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #00ff88 0%, #00ccff 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .success-container {
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 60px 40px;
                    max-width: 600px;
                    width: 90%;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                    text-align: center;
                }
                .success-icon { font-size: 4rem; margin-bottom: 20px; }
                .success-title { font-size: 2.5rem; font-weight: bold; margin-bottom: 20px; }
                .success-message { font-size: 1.2rem; margin-bottom: 30px; line-height: 1.6; }
                .next-steps {
                    background: rgba(255,255,255,0.1);
                    padding: 30px;
                    border-radius: 15px;
                    margin: 30px 0;
                    text-align: left;
                }
                .step {
                    display: flex;
                    align-items: center;
                    margin: 15px 0;
                    font-size: 1.1rem;
                }
                .step-number {
                    background: #00ff88;
                    color: white;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 15px;
                    font-weight: bold;
                }
                .discord-button {
                    background: #5865F2;
                    color: white;
                    padding: 15px 30px;
                    border-radius: 10px;
                    text-decoration: none;
                    font-weight: bold;
                    display: inline-block;
                    margin: 10px;
                    transition: all 0.3s ease;
                }
                .discord-button:hover { transform: translateY(-2px); }
                .dashboard-button {
                    background: linear-gradient(45deg, #00ff88, #00ccff);
                    color: white;
                    padding: 15px 30px;
                    border-radius: 10px;
                    text-decoration: none;
                    font-weight: bold;
                    display: inline-block;
                    margin: 10px;
                    transition: all 0.3s ease;
                }
                .dashboard-button:hover { transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="success-container">
                <div class="success-icon">🎉</div>
                <div class="success-title">Welcome to ${planName}!</div>
                <div class="success-message">
                    Your ${trialDays}-day FREE trial has started successfully!<br>
                    ${customerInfo.customerEmail ? `Confirmation sent to: ${customerInfo.customerEmail}` : ''}
                </div>
                
                <div class="next-steps">
                    <h3 style="margin-bottom: 20px;">🚀 Next Steps to Start Trading:</h3>
                    <div class="step">
                        <div class="step-number">1</div>
                        <div>Join our exclusive Discord server</div>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <div>Connect your trading account (takes 2 minutes)</div>
                    </div>
                    <div class="step">
                        <div class="step-number">3</div>
                        <div>Watch the bot start generating profits 24/7!</div>
                    </div>
                </div>
                
                <div style="margin: 30px 0;">
                    <a href="https://discord.gg/your-invite-link" class="discord-button">
                        💬 Join Discord Server
                    </a>
                    <a href="/dashboard" class="dashboard-button">
                        📊 Go to Dashboard
                    </a>
                </div>
                
                <div style="font-size: 0.9rem; color: rgba(255,255,255,0.8); margin-top: 30px;">
                    💡 <strong>Pro Tip:</strong> Check your email for setup instructions and trading tips!<br>
                    Questions? Email us at support@tradebotai.com
                </div>
            </div>
            
            <script>
                // Send user to Discord after 10 seconds if they don't click
                setTimeout(() => {
                    if (confirm("Ready to join Discord and start trading?")) {
                        window.open('https://discord.gg/your-invite-link', '_blank');
                    }
                }, 10000);
            </script>
        </body>
        </html>`;

    res.send(successHtml);
  }

  async showCancel(req, res) {
    const cancelHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Checkout Cancelled</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .cancel-container {
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 60px 40px;
                    max-width: 500px;
                    width: 90%;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                    text-align: center;
                }
                .retry-button {
                    background: linear-gradient(45deg, #00ff88, #00ccff);
                    color: white;
                    padding: 15px 30px;
                    border-radius: 10px;
                    text-decoration: none;
                    font-weight: bold;
                    display: inline-block;
                    margin: 20px 10px;
                    transition: all 0.3s ease;
                }
                .retry-button:hover { transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="cancel-container">
                <div style="font-size: 3rem; margin-bottom: 20px;">😢</div>
                <h1 style="margin-bottom: 20px;">Checkout Cancelled</h1>
                <p style="margin-bottom: 30px; font-size: 1.1rem;">
                    No worries! Your FREE trial is still available whenever you're ready.
                </p>
                
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <strong>💡 Remember:</strong><br>
                    • 7-day FREE trial<br>
                    • No credit card required initially<br>
                    • Cancel anytime<br>
                    • 500+ traders earning $2k+/month
                </div>
                
                <a href="/#pricing" class="retry-button">🚀 Try Again</a>
                <a href="/" class="retry-button">🏠 Home</a>
            </div>
        </body>
        </html>`;

    res.send(cancelHtml);
  }

  async createPortalSession(req, res) {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const billingProvider = this.ensureBillingProvider(res);
    if (!billingProvider) {
      return;
    }

    try {
      const portalSession = await billingProvider.createCustomerPortalSession(
        customer_id,
        `${req.protocol}://${req.get('host')}/dashboard`
      );

      res.json({ url: portalSession.url });
    } catch (error) {
      logger.error('[PaymentProcessor] Error creating portal session:', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = PaymentProcessor;
