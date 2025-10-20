# Polar.sh Setup Guide - Dual Subscription Model

**Date:** October 20, 2025
**Status:** Implementation Guide v1.0

---

## Overview

This guide walks through setting up Polar.sh as the billing provider for the Discord Trade Executor dual-subscription model:
- **Community subscriptions** (for Discord server hosts)
- **Trader subscriptions** (for individual members)

**Total products required:** 8 (4 community + 4 trader)

---

## Prerequisites

- Discord Trade Executor backend deployed and accessible
- Access to create Polar.sh account
- Ability to update environment variables
- Product media assets prepared (1200x630px images)

---

## Phase 1: Account Setup

### Step 1.1: Create Polar.sh Account

1. Navigate to https://polar.sh
2. Click "Sign up" or "Get Started"
3. Complete registration:
   - Email: Your business email
   - Organization name: "Discord Trade Executor" (or your brand name)
   - Organization type: Software as a Service (SaaS)
4. Verify email address
5. Complete business profile:
   - Tax ID (if applicable)
   - Business address
   - Bank account for payouts

### Step 1.2: Organization Configuration

1. Navigate to Settings → Organization
2. Record your **Organization ID** (UUID format):
   ```
   Example: 550e8400-e29b-41d4-a716-446655440000
   ```
3. Save Organization ID for later (needed for `.env`)

### Step 1.3: Generate API Access Token

1. Navigate to Settings → API Keys
2. Click "Create API Key"
3. Configure:
   - Name: "Discord Trade Executor Backend"
   - Permissions:
     - ✅ Read products
     - ✅ Read customers
     - ✅ Read subscriptions
     - ✅ Create checkout sessions
     - ✅ Create customer portal sessions
4. Copy the **Access Token** (shown only once)
5. Store securely - needed for `.env`

---

## Phase 2: Product Creation

### Important: Product Metadata

**CRITICAL:** Each product MUST have metadata configured for webhook routing:

```json
{
  "type": "community",    // or "trader"
  "tier": "professional"  // or "enterprise" or "elite"
}
```

Without metadata, webhooks cannot route subscriptions correctly!

### Step 2.1: Create Community Products

Navigate to Products → Create Product for each:

#### Product 1: Community Professional - Monthly

**Basic Information:**
- Name: `Community Professional - Monthly`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 1)
- Product type: Subscription

**Pricing:**
- Price: `$99.00 USD`
- Billing interval: Monthly (every 1 month)
- Pricing model: Fixed price

**Metadata:** (Settings → Metadata)
```json
{
  "type": "community",
  "tier": "professional"
}
```

**Benefits:**
- Custom: "Professional tier access with 100 member limit"
- Discord Invite: (optional - configure if using Discord integration)

**Save & Copy UUID** → Store as `POLAR_COMMUNITY_PROFESSIONAL_MONTHLY_PRODUCT_ID`

---

#### Product 2: Community Professional - Annual

**Basic Information:**
- Name: `Community Professional - Annual`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 2)
- Product type: Subscription

**Pricing:**
- Price: `$950.00 USD`
- Billing interval: Yearly (every 12 months)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "community",
  "tier": "professional"
}
```

**Benefits:**
- Custom: "Professional tier access with 100 member limit (annual)"
- Discord Invite: (optional)

**Save & Copy UUID** → Store as `POLAR_COMMUNITY_PROFESSIONAL_ANNUAL_PRODUCT_ID`

---

#### Product 3: Community Enterprise - Monthly

**Basic Information:**
- Name: `Community Enterprise - Monthly`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 3)
- Product type: Subscription

**Pricing:**
- Price: `$299.00 USD`
- Billing interval: Monthly (every 1 month)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "community",
  "tier": "enterprise"
}
```

**Benefits:**
- Custom: "Enterprise tier access with 1,000 member limit"
- Discord Invite: (optional)
- File Downloads: (optional - enterprise onboarding guide)

**Save & Copy UUID** → Store as `POLAR_COMMUNITY_ENTERPRISE_MONTHLY_PRODUCT_ID`

---

#### Product 4: Community Enterprise - Annual

**Basic Information:**
- Name: `Community Enterprise - Annual`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 4)
- Product type: Subscription

**Pricing:**
- Price: `$2,870.00 USD`
- Billing interval: Yearly (every 12 months)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "community",
  "tier": "enterprise"
}
```

**Benefits:**
- Custom: "Enterprise tier access with 1,000 member limit (annual)"
- Discord Invite: (optional)
- File Downloads: (optional)

**Save & Copy UUID** → Store as `POLAR_COMMUNITY_ENTERPRISE_ANNUAL_PRODUCT_ID`

---

### Step 2.2: Create Trader Products

#### Product 5: Trader Professional - Monthly

**Basic Information:**
- Name: `Trader Professional - Monthly`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 5)
- Product type: Subscription

**Pricing:**
- Price: `$49.00 USD`
- Billing interval: Monthly (every 1 month)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "trader",
  "tier": "professional"
}
```

**Benefits:**
- Custom: "Trader professional tier (100 signals/day, 3 brokers)"
- Discord Invite: (optional)

**Save & Copy UUID** → Store as `POLAR_TRADER_PROFESSIONAL_MONTHLY_PRODUCT_ID`

---

#### Product 6: Trader Professional - Annual

**Basic Information:**
- Name: `Trader Professional - Annual`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 6)
- Product type: Subscription

**Pricing:**
- Price: `$470.00 USD`
- Billing interval: Yearly (every 12 months)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "trader",
  "tier": "professional"
}
```

**Benefits:**
- Custom: "Trader professional tier (100 signals/day, 3 brokers) - Annual"
- Discord Invite: (optional)

**Save & Copy UUID** → Store as `POLAR_TRADER_PROFESSIONAL_ANNUAL_PRODUCT_ID`

---

#### Product 7: Trader Elite - Monthly

**Basic Information:**
- Name: `Trader Elite - Monthly`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 7)
- Product type: Subscription

**Pricing:**
- Price: `$149.00 USD`
- Billing interval: Monthly (every 1 month)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "trader",
  "tier": "elite"
}
```

**Benefits:**
- Custom: "Trader elite tier (unlimited signals, unlimited brokers)"
- Discord Invite: (optional)

**Save & Copy UUID** → Store as `POLAR_TRADER_ELITE_MONTHLY_PRODUCT_ID`

---

#### Product 8: Trader Elite - Annual

**Basic Information:**
- Name: `Trader Elite - Annual`
- Description: Copy from `docs/POLAR_PRODUCTS_CONFIG.md` (Product 8)
- Product type: Subscription

**Pricing:**
- Price: `$1,430.00 USD`
- Billing interval: Yearly (every 12 months)
- Pricing model: Fixed price

**Metadata:**
```json
{
  "type": "trader",
  "tier": "elite"
}
```

**Benefits:**
- Custom: "Trader elite tier (unlimited signals, unlimited brokers) - Annual"
- Discord Invite: (optional)

**Save & Copy UUID** → Store as `POLAR_TRADER_ELITE_ANNUAL_PRODUCT_ID`

---

## Phase 3: Webhook Configuration

### Step 3.1: Create Webhook Endpoint

1. Navigate to Settings → Webhooks
2. Click "Create Webhook"
3. Configure:
   - **Endpoint URL**: `https://your-domain.com/webhook/polar`
   - **Events to send**:
     - ✅ `subscription.created`
     - ✅ `subscription.updated`
     - ✅ `subscription.cancelled`
     - ✅ `checkout.completed`
   - **Status**: Active

### Step 3.2: Generate Webhook Secret

1. Polar.sh will generate a webhook secret automatically
2. Copy the **Webhook Secret** (shown once)
3. Store securely - needed for `.env`

### Step 3.3: Test Webhook

1. Use Polar.sh dashboard "Send Test Event" feature
2. Verify your backend receives and processes the event
3. Check logs for successful signature verification

---

## Phase 4: Environment Configuration

### Step 4.1: Update `.env` File

Add the following environment variables to your `.env` or `.env.staging`:

```bash
# ============================================================================
# POLAR.SH CONFIGURATION
# ============================================================================

# API Access
POLAR_ACCESS_TOKEN=polar_at_YOUR_ACCESS_TOKEN_HERE
POLAR_ORGANIZATION_ID=550e8400-YOUR-ORG-UUID-HERE

# Webhook Security
POLAR_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Application URL (for return URLs)
APP_URL=https://your-production-domain.com

# ============================================================================
# POLAR.SH PRODUCT IDs
# ============================================================================

# Community Products (Server Hosts)
POLAR_COMMUNITY_PROFESSIONAL_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_PROFESSIONAL_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_ENTERPRISE_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_COMMUNITY_ENTERPRISE_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Trader Products (Individual Members)
POLAR_TRADER_PROFESSIONAL_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_PROFESSIONAL_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_ELITE_MONTHLY_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_TRADER_ELITE_ANNUAL_PRODUCT_ID=550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 4.2: Restart Application

After updating environment variables:

```bash
# Stop application
npm stop

# Restart with new environment
npm start

# Or if using PM2
pm2 restart all --update-env
```

### Step 4.3: Verify Configuration

Check application logs for:

```
[Polar] Initialized with access token: polar_at_ab...
```

If you see `[Polar] POLAR_ACCESS_TOKEN not configured`, check your `.env` file.

---

## Phase 5: Testing

### Step 5.1: Test Community Checkout Flow

1. Navigate to your application's subscription page
2. Click "Upgrade to Professional" (Community tier)
3. Complete checkout with test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
4. Verify:
   - Webhook received (`subscription.created`)
   - Community model updated with `polarCustomerId` and `polarSubscriptionId`
   - `subscription.tier` set to `professional`
   - `subscription.status` set to `active`

### Step 5.2: Test Trader Checkout Flow

1. As a community member, navigate to personal subscription page
2. Click "Upgrade to Professional" (Trader tier)
3. Complete checkout with test card
4. Verify:
   - Webhook received (`subscription.created`)
   - User model updated with `polarCustomerId` and `polarSubscriptionId`
   - `subscription.tier` set to `professional`
   - `limits.signalsPerDay` set to `100`
   - `limits.maxBrokers` set to `3`

### Step 5.3: Test Customer Portal

1. Click "Manage Subscription" in dashboard
2. Verify redirect to Polar.sh customer portal
3. Test actions:
   - View subscription details
   - Update payment method
   - Cancel subscription
4. Verify cancellation webhook received and processed

### Step 5.4: Test Annual Upgrades

1. Create subscription with monthly billing
2. Upgrade to annual billing via customer portal
3. Verify `subscription.updated` webhook processed correctly
4. Check `currentPeriodEnd` updated to 1 year from now

---

## Phase 6: Production Deployment

### Step 6.1: Update Production Environment

1. Deploy latest code to production
2. Update production `.env` with Polar.sh credentials
3. Configure webhook endpoint to production URL
4. Test webhook delivery to production endpoint

### Step 6.2: Create Production Products

**Option A:** Clone from Test/Staging
1. Repeat product creation in production Polar.sh account
2. Update production `.env` with new product UUIDs

**Option B:** Use Same Products (if single account)
1. Products can be shared across environments
2. Use environment detection to handle test vs production

### Step 6.3: Monitor Initial Subscriptions

After launch, monitor:
- Webhook delivery success rate (Settings → Webhooks → Logs)
- Subscription creation success
- Customer portal access
- Payment processing
- SecurityAudit logs for any issues

---

## Troubleshooting

### Issue: Webhook signature verification fails

**Symptoms:**
```
[Polar Webhook] Invalid signature
SecurityAudit: webhook.signature_failed (HIGH risk)
```

**Solutions:**
1. Verify `POLAR_WEBHOOK_SECRET` matches Polar.sh dashboard
2. Check webhook endpoint is receiving raw body (not JSON parsed)
3. Verify `express.raw({ type: 'application/json' })` middleware used

### Issue: Webhook routing to wrong model

**Symptoms:**
- Community subscription updating User model
- Trader subscription updating Community model

**Solutions:**
1. Verify product metadata configured correctly:
   ```json
   {"type": "community", "tier": "professional"}
   ```
2. Check `polar.getProduct(productId)` returns metadata
3. Verify webhook handler checks `product.metadata.type`

### Issue: Subscription tier not updating

**Symptoms:**
- Webhook received successfully
- But `subscription.tier` remains unchanged

**Solutions:**
1. Check `getTierLimits()` function in webhook handler
2. Verify tier name matches enum in schema (`professional`, `enterprise`, `elite`)
3. Check MongoDB update query succeeded (look for errors in logs)

### Issue: Customer portal redirect fails

**Symptoms:**
- "Manage Subscription" button doesn't work
- Portal session creation error

**Solutions:**
1. Verify `polarCustomerId` exists in Community/User document
2. Check `APP_URL` environment variable set correctly
3. Verify return URL format: `${APP_URL}/dashboard/community/subscription`

### Issue: Graceful degradation returning mock data

**Symptoms:**
```
[Polar] Returning mock data (Polar not configured or no customer ID)
```

**Solutions:**
1. Verify `POLAR_ACCESS_TOKEN` set in `.env`
2. Check `.env` file loaded (restart application)
3. Verify access token not expired (regenerate if needed)

---

## Maintenance

### Monthly Tasks

- [ ] Review webhook delivery logs for failures
- [ ] Check for expired subscriptions
- [ ] Monitor churn rate and cancellation reasons
- [ ] Review SecurityAudit logs for anomalies

### Quarterly Tasks

- [ ] Audit product pricing vs costs
- [ ] Review tier limits vs actual usage
- [ ] Update product descriptions if features changed
- [ ] Test checkout flows still working

### Annual Tasks

- [ ] Review Polar.sh contract and pricing
- [ ] Audit all environment variables
- [ ] Update product media assets
- [ ] Review and optimize subscription tiers

---

## Security Checklist

- [ ] Webhook secret rotated and stored securely
- [ ] Access token has minimum required permissions
- [ ] Webhook signature verification enabled
- [ ] HTTPS enforced for webhook endpoint
- [ ] SecurityAudit logging enabled for all subscription changes
- [ ] Product metadata validated on webhook receipt
- [ ] Environment variables not committed to git
- [ ] Webhook endpoint rate limited
- [ ] Failed webhook attempts monitored and alerted

---

## Support Resources

- Polar.sh Documentation: https://docs.polar.sh
- Polar.sh Support: support@polar.sh
- Discord Trade Executor Docs: `docs/SUBSCRIPTION_ARCHITECTURE.md`
- Pricing Research: `docs/PRICING_RECOMMENDATIONS.md`
- Unit Economics: `docs/UNIT_ECONOMICS.md`

---

**Setup Version:** 1.0
**Last Updated:** October 20, 2025
**Next Review:** After first 100 subscriptions
