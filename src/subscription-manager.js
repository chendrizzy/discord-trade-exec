const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('./models/User');

class SubscriptionManager {
    constructor() {
        this.plans = {
            basic: {
                tier: 'basic',
                price: 4900, // $49 in cents
                signals: 100,
                name: 'Basic Plan',
                features: ['100 signals/day', 'Multi-broker support', 'Basic analytics']
            },
            pro: {
                tier: 'pro',
                price: 9900, // $99 in cents
                signals: Infinity,
                name: 'Pro Plan',
                features: ['Unlimited signals', 'Advanced risk management', 'Priority support', 'Performance analytics']
            },
            premium: {
                tier: 'premium',
                price: 29900, // $299 in cents
                signals: Infinity,
                name: 'Premium Plan',
                features: ['Everything in Pro', 'Multiple brokers', 'Custom strategies', 'Dedicated support', 'API access']
            }
        };
    }

    async createCustomer(discordId, email) {
        try {
            const customer = await stripe.customers.create({
                email,
                metadata: {
                    discordId
                }
            });
            return customer;
        } catch (error) {
            console.error('Customer creation error:', error);
            throw error;
        }
    }

    async createCheckoutSession(discordId, planId, successUrl, cancelUrl) {
        try {
            const plan = this.plans[planId];
            if (!plan) {
                throw new Error('Invalid plan ID');
            }

            // Find or create customer
            let user = await User.findByDiscordId(discordId);
            let customerId = user?.subscription?.stripeCustomerId;

            if (!customerId) {
                const customer = await this.createCustomer(discordId, user?.notifications?.email);
                customerId = customer.id;

                if (user) {
                    user.subscription.stripeCustomerId = customerId;
                    await user.save();
                }
            }

            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: plan.name,
                            description: plan.features.join(', ')
                        },
                        recurring: {
                            interval: 'month'
                        },
                        unit_amount: plan.price
                    },
                    quantity: 1
                }],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    discordId,
                    planId
                }
            });

            return session;
        } catch (error) {
            console.error('Checkout session creation error:', error);
            throw error;
        }
    }

    async handleStripeWebhook(req, res) {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.log(`📥 Stripe webhook received: ${event.type}`);

        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await this.handleCheckoutCompleted(event.data.object);
                    break;

                case 'customer.subscription.created':
                    await this.handleSubscriptionCreated(event.data.object);
                    break;

                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;

                case 'invoice.payment_succeeded':
                    await this.handlePaymentSuccess(event.data.object);
                    break;

                case 'invoice.payment_failed':
                    await this.handlePaymentFailed(event.data.object);
                    break;

                case 'customer.subscription.deleted':
                    await this.handleSubscriptionCancelled(event.data.object);
                    break;

                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });
        } catch (error) {
            console.error('Webhook handling error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }

    async handleCheckoutCompleted(session) {
        console.log('✅ Checkout completed:', session.id);

        const discordId = session.metadata?.discordId;
        if (!discordId) {
            console.error('No discordId in checkout session metadata');
            return;
        }

        const user = await User.findByDiscordId(discordId);
        if (!user) {
            console.error('User not found for discordId:', discordId);
            return;
        }

        // Update user with subscription details
        user.subscription.stripeCustomerId = session.customer;
        user.subscription.stripeSubscriptionId = session.subscription;
        await user.save();

        console.log(`User ${user.discordUsername} subscription activated`);
    }

    async handleSubscriptionCreated(subscription) {
        console.log('🆕 New subscription created:', subscription.id);

        const customer = await stripe.customers.retrieve(subscription.customer);
        const discordId = customer.metadata?.discordId;

        if (!discordId) {
            console.error('No discordId in customer metadata');
            return;
        }

        const user = await User.findByDiscordId(discordId);
        if (!user) {
            console.error('User not found for subscription:', subscription.id);
            return;
        }

        // Determine plan tier from price
        const priceAmount = subscription.items.data[0]?.price?.unit_amount;
        const planTier = this.getPlanTierFromPrice(priceAmount);

        // Update user subscription
        user.subscription.tier = planTier;
        user.subscription.status = subscription.status;
        user.subscription.stripeSubscriptionId = subscription.id;
        user.subscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
        user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        // Update signal limits based on tier
        const plan = this.plans[planTier];
        if (plan) {
            user.limits.signalsPerDay = plan.signals === Infinity ? 999999 : plan.signals;
        }

        await user.save();
        console.log(`✅ Subscription activated for ${user.discordUsername} - ${planTier} tier`);
    }

    async handleSubscriptionUpdated(subscription) {
        console.log('🔄 Subscription updated:', subscription.id);

        const customer = await stripe.customers.retrieve(subscription.customer);
        const discordId = customer.metadata?.discordId;

        if (!discordId) return;

        const user = await User.findByDiscordId(discordId);
        if (!user) return;

        // Update subscription details
        user.subscription.status = subscription.status;
        user.subscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
        user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        // Check if plan changed
        const priceAmount = subscription.items.data[0]?.price?.unit_amount;
        const newPlanTier = this.getPlanTierFromPrice(priceAmount);

        if (newPlanTier !== user.subscription.tier) {
            user.subscription.tier = newPlanTier;
            const plan = this.plans[newPlanTier];
            if (plan) {
                user.limits.signalsPerDay = plan.signals === Infinity ? 999999 : plan.signals;
            }
            console.log(`📊 Plan changed for ${user.discordUsername}: ${newPlanTier}`);
        }

        await user.save();
    }

    async handlePaymentSuccess(invoice) {
        console.log('💳 Payment successful:', invoice.id);

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(subscription.customer);
        const discordId = customer.metadata?.discordId;

        if (!discordId) return;

        const user = await User.findByDiscordId(discordId);
        if (!user) return;

        // Ensure subscription is active
        user.subscription.status = 'active';
        user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        await user.save();

        console.log(`✅ Payment processed for ${user.discordUsername}`);
    }

    async handlePaymentFailed(invoice) {
        console.log('❌ Payment failed:', invoice.id);

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(subscription.customer);
        const discordId = customer.metadata?.discordId;

        if (!discordId) return;

        const user = await User.findByDiscordId(discordId);
        if (!user) return;

        // Mark subscription as past_due
        user.subscription.status = 'past_due';
        await user.save();

        console.log(`⚠️ Payment failed for ${user.discordUsername}`);
    }

    async handleSubscriptionCancelled(subscription) {
        console.log('🚫 Subscription cancelled:', subscription.id);

        const customer = await stripe.customers.retrieve(subscription.customer);
        const discordId = customer.metadata?.discordId;

        if (!discordId) return;

        const user = await User.findByDiscordId(discordId);
        if (!user) return;

        // Update subscription status
        user.subscription.status = 'cancelled';
        user.subscription.cancelledAt = new Date();

        // Revert to free tier
        user.subscription.tier = 'free';
        user.limits.signalsPerDay = 10;

        await user.save();
        console.log(`❌ Subscription cancelled for ${user.discordUsername}`);
    }

    getPlanTierFromPrice(priceAmount) {
        for (const [tier, plan] of Object.entries(this.plans)) {
            if (plan.price === priceAmount) {
                return tier;
            }
        }
        return 'basic'; // Default fallback
    }

    async cancelSubscription(discordId) {
        try {
            const user = await User.findByDiscordId(discordId);
            if (!user || !user.subscription.stripeSubscriptionId) {
                throw new Error('No active subscription found');
            }

            await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
            return { success: true };
        } catch (error) {
            console.error('Subscription cancellation error:', error);
            throw error;
        }
    }

    async getSubscriptionInfo(discordId) {
        try {
            const user = await User.findByDiscordId(discordId);
            if (!user) {
                return null;
            }

            const info = {
                tier: user.subscription.tier,
                status: user.subscription.status,
                currentPeriodEnd: user.subscription.currentPeriodEnd,
                signalsUsed: user.limits.signalsUsedToday,
                signalsLimit: user.limits.signalsPerDay,
                isActive: user.isSubscriptionActive()
            };

            // Get Stripe subscription details if available
            if (user.subscription.stripeSubscriptionId) {
                const stripeSubscription = await stripe.subscriptions.retrieve(
                    user.subscription.stripeSubscriptionId
                );
                info.stripeStatus = stripeSubscription.status;
                info.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
            }

            return info;
        } catch (error) {
            console.error('Get subscription info error:', error);
            throw error;
        }
    }
}

module.exports = SubscriptionManager;
