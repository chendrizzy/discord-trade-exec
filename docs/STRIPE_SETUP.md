# Stripe Integration Setup Guide

This guide explains how to set up Stripe for billing and subscription management in the Discord Trade Exec platform.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Access to Stripe Dashboard

## Step 1: Get Your Stripe API Keys

1. Go to https://dashboard.stripe.com/apikeys
2. You'll see two types of keys:
   - **Test keys** (sk_test_...) - for development/staging
   - **Live keys** (sk_live_...) - for production

3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

## Step 2: Configure Environment Variables

Add to your `.env.staging` or `.env` file:

```bash
# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
APP_URL=http://localhost:5001  # Or your production URL
```

**Security Note**: Never commit your actual Stripe keys to git!

## Step 3: Create Products and Prices in Stripe

1. Go to https://dashboard.stripe.com/products
2. Click "Add product"
3. Create your subscription tiers:

### Free Tier (No Stripe Product Needed)
- Handled automatically by the application
- Limits: 10 members, 2 signal providers, 50 signals/day

### Professional Tier
- **Product Name**: "Professional Plan"
- **Price**: $99/month (or your pricing)
- **Metadata** (optional):
  - `tier`: `professional`
  - `maxMembers`: `100`
  - `maxSignalProviders`: `10`
  - `maxSignalsPerDay`: `1000`

### Enterprise Tier
- **Product Name**: "Enterprise Plan"
- **Price**: $299/month (or your pricing)
- **Metadata** (optional):
  - `tier`: `enterprise`
  - `maxMembers`: `1000`
  - `maxSignalProviders`: `50`
  - `maxSignalsPerDay`: `10000`

## Step 4: Enable Billing Portal

1. Go to https://dashboard.stripe.com/settings/billing/portal
2. Enable the Customer Portal
3. Configure allowed actions:
   - ✅ Update payment method
   - ✅ Cancel subscription
   - ✅ Update subscription (optional)

## Step 5: Set Up Webhooks (Optional - For Production)

Webhooks keep your database in sync with Stripe subscription changes.

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter your webhook URL:
   ```
   https://yourdomain.com/api/webhooks/stripe
   ```

4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to your environment:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_ACTUAL_WEBHOOK_SECRET
   ```

## How It Works

### Subscription Endpoint

**GET** `/api/community/subscription`

Returns:
```json
{
  "tier": "professional",
  "status": "active",
  "subscription": {
    "id": "sub_xxx",
    "currentPeriodEnd": "2025-11-20T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "items": [...]
  },
  "limits": {
    "maxMembers": 100,
    "maxSignalProviders": 10,
    "maxSignalsPerDay": 1000
  },
  "usage": {
    "members": 45,
    "signalProviders": 3,
    "signalsToday": 234
  },
  "billing": {
    "hasStripeCustomer": true,
    "portalUrl": "https://billing.stripe.com/session/..."
  }
}
```

### Graceful Degradation

If Stripe is not configured (`STRIPE_SECRET_KEY` not set):
- The service falls back to **mock data**
- Free tier limits are enforced
- Billing portal is unavailable
- No actual Stripe API calls are made

This allows development without Stripe credentials.

## Testing in Development

### With Stripe Test Keys

1. Use test keys (`sk_test_...`)
2. Create test subscriptions in Stripe Dashboard
3. Use test credit cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - CVV: any 3 digits
   - Expiry: any future date

### Without Stripe Keys

1. Leave `STRIPE_SECRET_KEY` unset or empty
2. Service returns mock data automatically
3. Useful for testing UI without Stripe account

## Production Deployment

1. Switch to **live keys** (`sk_live_...`)
2. Update `APP_URL` to your production domain
3. Configure webhooks for production URL
4. Test thoroughly before going live
5. Monitor https://dashboard.stripe.com/events

## Troubleshooting

### "Stripe not configured" warning

**Cause**: `STRIPE_SECRET_KEY` is not set or invalid

**Solution**: Check `.env.staging` has correct key format `sk_test_...` or `sk_live_...`

### "Customer not found" error

**Cause**: Community doesn't have `stripeCustomerId` in database

**Solution**: Communities without Stripe customers automatically get free tier. To upgrade, create a Stripe customer and subscription, then update the Community document:

```javascript
await Community.findByIdAndUpdate(communityId, {
  'subscription.stripeCustomerId': 'cus_xxx',
  'subscription.stripeSubscriptionId': 'sub_xxx',
  'subscription.tier': 'professional',
  'subscription.status': 'active'
});
```

### Billing portal URL not generated

**Cause**: Billing portal not enabled in Stripe Dashboard

**Solution**: Enable at https://dashboard.stripe.com/settings/billing/portal

## Security Best Practices

1. **Never commit API keys** - Add `.env` and `.env.staging` to `.gitignore`
2. **Use environment variables** - Never hardcode keys
3. **Rotate keys regularly** - Generate new keys periodically
4. **Restrict API key permissions** - Use restricted keys when possible
5. **Verify webhook signatures** - Validate webhooks are from Stripe
6. **Use HTTPS in production** - Required for webhooks

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Discord Trade Exec Docs: `/docs/STRIPE_SETUP.md`
