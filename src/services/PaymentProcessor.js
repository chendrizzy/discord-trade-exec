// External dependencies
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class PaymentProcessor {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();

    // Pricing plans configuration
    this.plans = {
      basic: {
        name: 'Basic Bot',
        price: 49,
        priceId: process.env.STRIPE_BASIC_PRICE_ID || 'price_basic_monthly',
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
        priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
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
        priceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium_monthly',
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
  }

  setupRoutes() {
    // Checkout page
    this.router.get('/checkout', this.showCheckout.bind(this));

    // Create Stripe checkout session
    this.router.post('/create-checkout-session', this.createCheckoutSession.bind(this));

    // Success page
    this.router.get('/success', this.showSuccess.bind(this));

    // Cancel page
    this.router.get('/cancel', this.showCancel.bind(this));

    // Webhook for Stripe events
    this.router.post('/webhook/stripe', express.raw({ type: 'application/json' }), this.handleStripeWebhook.bind(this));

    // Customer portal
    this.router.post('/create-portal-session', this.createPortalSession.bind(this));
  }

  async showCheckout(req, res) {
    const { plan, price } = req.query;
    const selectedPlan = this.plans[plan];

    if (!selectedPlan) {
      return res.status(400).send('Invalid plan selected');
    }

    // Render checkout page
    const checkoutHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Checkout - ${selectedPlan.name}</title>
            <script src="https://js.stripe.com/v3/"></script>
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
                    <strong>🎉 Start Your FREE 7-Day Trial</strong><br>
                    No charges until ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}.<br>
                    Cancel anytime during trial - no questions asked.
                </div>
                
                <button class="checkout-button" onclick="createCheckoutSession('${plan}')">
                    🚀 Start My FREE Trial
                </button>
                
                <div class="security-badges">
                    🔒 Secure SSL Encryption • 💳 All Major Cards Accepted<br>
                    🎯 30-Day Money-Back Guarantee • ✅ Cancel Anytime
                </div>
            </div>

            <script>
                const stripe = Stripe('${process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here'}');
                
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
                        
                        // Redirect to Stripe Checkout
                        const result = await stripe.redirectToCheckout({
                            sessionId: session.sessionId
                        });
                        
                        if (result.error) {
                            alert(result.error.message);
                        }
                    } catch (error) {
                        console.error('Error:', error);
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

    try {
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: selectedPlan.priceId,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        allow_promotion_codes: true,
        subscription_data: {
          trial_period_days: 7, // 7-day free trial
          metadata: {
            plan: plan,
            source: 'discord-trading-bot'
          }
        },
        metadata: {
          plan: plan,
          price: selectedPlan.price
        }
      });

      res.json({ sessionId: session.id });
    } catch (error) {
      console.error('Stripe session creation error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }

  async showSuccess(req, res) {
    const { session_id } = req.query;

    let customerInfo = {};
    if (session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        customerInfo = {
          customerEmail: session.customer_details?.email,
          plan: session.metadata?.plan
        };
      } catch (error) {
        console.error('Error retrieving session:', error);
      }
    }

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
                <div class="success-title">Welcome to TradeBotAI!</div>
                <div class="success-message">
                    Your 7-day FREE trial has started successfully!<br>
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

  async handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.log(`Webhook signature verification failed.`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await this.handleSuccessfulPayment(session);
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        await this.handleSubscriptionRenewal(invoice);
        break;

      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        await this.handleSubscriptionCancellation(subscription);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }

  async handleSuccessfulPayment(session) {
    console.log('💰 New subscription:', session);

    // Add user to database
    // Send welcome email
    // Add to Discord server
    // Start their trial/subscription

    // TODO: Implement your customer onboarding logic here
  }

  async handleSubscriptionRenewal(invoice) {
    console.log('🔄 Subscription renewed:', invoice);

    // Update user's subscription status
    // Send renewal confirmation email
    // Ensure continued access to bot
  }

  async handleSubscriptionCancellation(subscription) {
    console.log('❌ Subscription cancelled:', subscription);

    // Remove user access
    // Send cancellation confirmation
    // Optionally ask for feedback
  }

  async createPortalSession(req, res) {
    const { customer_id } = req.body;

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer_id,
        return_url: `${req.protocol}://${req.get('host')}/dashboard`
      });

      res.json({ url: portalSession.url });
    } catch (error) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = PaymentProcessor;
