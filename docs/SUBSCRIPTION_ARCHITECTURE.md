# Subscription Architecture

## Dual-Subscription Model

The system supports **two independent subscription types**:

1. **Community Subscriptions** (Server/Community Owners)
2. **Trader Subscriptions** (Individual Community Members)

---

## Limit Architecture

### Two-Gate System

For a signal to process successfully, it must pass **BOTH gates**:

```
Signal Processing Flow:
┌─────────────────────────────────────┐
│  Signal Received from Provider       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  GATE 1: Community Limit Check      │
│  - Is server under maxSignalsPerDay? │
│  - Has server capacity for signal?   │
└──────────────┬──────────────────────┘
               │
               ├──[BLOCKED]─→ Community limit reached
               │              Notify owner to upgrade
               ▼
┌─────────────────────────────────────┐
│  GATE 2: Trader Limit Check         │
│  - Is trader under signalsPerDay?    │
│  - Account-based (all communities)   │
└──────────────┬──────────────────────┘
               │
               ├──[BLOCKED]─→ Trader limit reached
               │              Notify trader to upgrade
               ▼
┌─────────────────────────────────────┐
│  ✅ PROCESS SIGNAL                   │
│  - Increment community.signalsToday  │
│  - Increment user.signalsUsedToday   │
└─────────────────────────────────────┘
```

### Community Limits (Server-Based)

**Scope**: Per-community (server-wide cap)

**Enforcement**:
```javascript
Community.subscription.tier → Determines:
  - maxMembers: Number          // Server member cap
  - maxSignalProviders: Number  // Server provider cap
  - maxSignalsPerDay: Number    // Server total signals/day
```

**Usage Tracking**:
```javascript
// Real-time query (tenant-scoped)
const signalsToday = await Signal.countDocuments({
  communityId: community._id,
  createdAt: { $gte: todayStart }
});

// Check limit
if (signalsToday >= community.maxSignalsPerDay) {
  throw new Error('Community signal limit reached');
}
```

**Reset**: Daily at midnight UTC

**Upgrade Path**: Community owner upgrades subscription

### Trader Limits (Account-Based)

**Scope**: Global across ALL communities the trader is in

**Enforcement**:
```javascript
User.subscription.tier → Determines:
  - signalsPerDay: Number    // Personal signal limit (global)
  - maxBrokers: Number       // Personal broker connections
  - features: Array          // Premium features access
```

**Usage Tracking**:
```javascript
// User model stores daily usage
User.limits {
  signalsPerDay: 50,           // Limit from subscription tier
  signalsUsedToday: 23,        // Current usage (all communities)
  lastResetDate: Date,         // Last midnight reset
  maxBrokers: 3
}

// Check limit (global, not per-community)
if (user.limits.signalsUsedToday >= user.limits.signalsPerDay) {
  throw new Error('Personal signal limit reached');
}
```

**Reset**: Daily at midnight UTC

**Upgrade Path**: Trader upgrades their own subscription

---

## Subscription Tiers

### Community Tiers

| Tier | Max Members | Max Providers | Signals/Day (Server) | Price Range |
|------|-------------|---------------|----------------------|-------------|
| Free | 10 | 2 | 50 | $0 |
| Professional | 100 | 10 | 1,000 | TBD (research) |
| Enterprise | 1,000 | 50 | 10,000 | TBD (research) |

**Metered Option** (when server limit reached):
- Pay-per-signal beyond tier limit
- Auto-enabled when `maxSignalsPerDay` exceeded
- Rate: TBD (cost-plus pricing research)

### Trader Tiers

| Tier | Signals/Day (Personal) | Max Brokers | Features | Price Range |
|------|------------------------|-------------|----------|-------------|
| Free | 5 | 1 | Basic analytics | $0 |
| Professional | 50 | 3 | Advanced analytics, priority signals | TBD (research) |
| Enterprise | 200 | 10 | All features, priority execution | TBD (research) |

---

## Limit Interaction Examples

### Example 1: Both Limits Satisfied
```
Community: Professional (1,000 signals/day), used 450 today
Trader: Professional (50 signals/day), used 12 today
Signal: ✅ PROCESSES (both gates pass)
```

### Example 2: Community Limit Reached
```
Community: Free (50 signals/day), used 50 today ❌
Trader: Professional (50 signals/day), used 12 today ✅
Signal: ❌ BLOCKED by community limit

Resolution: Community owner must upgrade or enable metered pricing
```

### Example 3: Trader Limit Reached
```
Community: Professional (1,000 signals/day), used 450 today ✅
Trader: Free (5 signals/day), used 5 today ❌
Signal: ❌ BLOCKED by trader limit

Resolution: Trader must upgrade their subscription
```

### Example 4: Both Limits Reached
```
Community: Free (50 signals/day), used 50 today ❌
Trader: Free (5 signals/day), used 5 today ❌
Signal: ❌ BLOCKED by both limits

Resolution: Both parties need to upgrade
```

---

## Metered Pricing (Community Overage)

### Trigger
When `community.signalsToday >= community.maxSignalsPerDay`

### Behavior
```javascript
if (community.subscription.allowMeteredOverage) {
  // Charge per-signal overage
  const overageRate = getOverageRate(community.subscription.tier);

  // Process signal and log charge
  await processSignalWithOverageCharge(signal, overageRate);

  // Track for billing
  await logMeteredUsage({
    communityId: community._id,
    date: new Date(),
    overageCount: 1,
    rate: overageRate,
    charge: overageRate
  });
} else {
  // Block signal and notify owner
  throw new Error('Community signal limit reached. Enable metered pricing or upgrade.');
}
```

### Pricing Formula (TBD - Research Phase)
```javascript
// Cost-plus model
const overageRate = (
  brokerAPICost +           // Actual API call cost
  infrastructureCost +      // Server/database usage
  marginMultiplier          // Profit margin (e.g., 3x)
);

// Example (placeholder):
// - Broker API: $0.001/signal
// - Infrastructure: $0.0005/signal
// - Margin: 3x
// = $0.001 + $0.0005 = $0.0015 * 3 = $0.0045/signal
```

### Monthly Billing
```javascript
// End of month:
const totalOverageCharges = await MeteredUsage.aggregate([
  { $match: { communityId, billingPeriod } },
  { $group: { _id: null, total: { $sum: '$charge' } } }
]);

// Create invoice via Polar.sh
await polar.invoices.create({
  customerId: community.subscription.polarCustomerId,
  amount: totalOverageCharges.total,
  description: `Metered signal overage - ${billingPeriod}`
});
```

---

## Subscription Independence

**Key Principle**: Community and Trader subscriptions are **completely independent**

### Database Schema
```javascript
// Community model
Community {
  subscription: {
    tier: 'professional',
    polarCustomerId: 'uuid-1',
    polarSubscriptionId: 'uuid-2',
    // ... community subscription data
  }
}

// User model
User {
  communityId: ObjectId,  // Reference to community
  subscription: {
    tier: 'professional',
    polarCustomerId: 'uuid-3',    // DIFFERENT customer
    polarSubscriptionId: 'uuid-4', // DIFFERENT subscription
    // ... trader subscription data
  }
}
```

### Polar.sh Products (8 Total)

**Community Products (4)**:
- `professional-community-monthly`
- `professional-community-annual`
- `enterprise-community-monthly`
- `enterprise-community-annual`

**Trader Products (4)**:
- `professional-trader-monthly`
- `professional-trader-annual`
- `enterprise-trader-monthly`
- `enterprise-trader-annual`

### Webhook Routing
```javascript
// Polar.sh webhook: subscription.created
const event = req.body;
const product = await polar.products.get(event.data.productId);

if (product.metadata.type === 'community') {
  // Update Community model
  await Community.updateOne(
    { 'subscription.polarCustomerId': event.data.customerId },
    {
      'subscription.polarSubscriptionId': event.data.id,
      'subscription.tier': product.metadata.tier,
      'subscription.status': 'active'
    }
  );
} else if (product.metadata.type === 'trader') {
  // Update User model
  await User.updateOne(
    { 'subscription.polarCustomerId': event.data.customerId },
    {
      'subscription.polarSubscriptionId': event.data.id,
      'subscription.tier': product.metadata.tier,
      'subscription.status': 'active'
    }
  );
}
```

---

## Trial Periods

### Community Trial
- **Duration**: 14 days
- **Tier**: Professional features
- **Limits**: Same as Professional tier
- **After Trial**: Downgrade to Free if no payment

### Trader Trial
- **Duration**: 7 days
- **Tier**: Professional features
- **Limits**: Same as Professional tier
- **After Trial**: Downgrade to Free if no payment

---

## Free Tier Strategy (Research Phase)

### Goals
1. **High Conversion**: Free tier valuable enough to attract users
2. **Upgrade Incentive**: Limitations that encourage paid upgrades
3. **Cost Sustainability**: Free tier doesn't drain resources
4. **Network Effects**: Free users add value to paid communities

### Research Questions
1. What % of signals do free traders consume? (cost analysis)
2. At what signal volume do users upgrade? (conversion funnel)
3. What broker API costs per signal? (cost per user)
4. What infrastructure cost per signal? (server/DB overhead)
5. Competitor free tier offerings? (market positioning)

### Pricing Research Deliverables
- [ ] **Cost Analysis**: Infrastructure + API costs per signal/user
- [ ] **Competitor Analysis**: What do similar platforms offer/charge?
- [ ] **Value Metrics**: What features drive conversions?
- [ ] **Price Sensitivity**: Survey potential users on willingness to pay
- [ ] **LTV Calculations**: Customer lifetime value by tier
- [ ] **Churn Analysis**: At what price points do users churn?

---

## Revenue Model Validation

### Required Profitability
```
Monthly Revenue > Monthly Costs + Margin

Monthly Costs:
  - Infrastructure (servers, DB, CDN)
  - Broker API calls (per signal)
  - Polar.sh fees (4%)
  - Development/support
  - Marketing/acquisition

Revenue Streams:
  1. Community subscriptions (recurring)
  2. Trader subscriptions (recurring)
  3. Metered overage charges (variable)

Margin Target: 60%+ after costs
```

### Break-Even Analysis (TBD)
```
Questions to answer:
- How many paid communities needed to break even?
- How many paid traders needed to break even?
- What metered rate ensures profitability?
- What free tier limits keep costs manageable?
```

---

## Implementation Checkpoints

### Before Launch
- [ ] Complete pricing research document
- [ ] Validate cost structure ensures profitability
- [ ] Define exact tier limits based on research
- [ ] Set metered pricing rates based on costs
- [ ] Configure 8 products in Polar.sh with final pricing
- [ ] Test limit enforcement (both gates)
- [ ] Test metered billing flow
- [ ] Monitor free tier usage patterns in beta

### Post-Launch Monitoring
- [ ] Track conversion rates (free → paid)
- [ ] Monitor average signals per user/community
- [ ] Calculate actual costs per signal
- [ ] Adjust pricing based on real data
- [ ] Optimize free tier limits for conversions

---

## Technical Implementation Notes

### Limit Enforcement Order
```javascript
async function canProcessSignal(signal, user, community) {
  // Gate 1: Community limit (fail fast)
  const communitySignalsToday = await getSignalsToday(community._id);
  if (communitySignalsToday >= community.maxSignalsPerDay) {
    if (!community.subscription.allowMeteredOverage) {
      throw new CommunityLimitError('Community signal limit reached');
    }
    // Log metered usage
    await logMeteredSignal(community, signal);
  }

  // Gate 2: Trader limit (account-based)
  if (user.limits.signalsUsedToday >= user.limits.signalsPerDay) {
    throw new TraderLimitError('Personal signal limit reached');
  }

  return true;
}
```

### Daily Reset Job
```javascript
// Cron: Every day at 00:00 UTC
async function resetDailyLimits() {
  // Reset trader limits (all users)
  await User.updateMany(
    {},
    {
      'limits.signalsUsedToday': 0,
      'limits.lastResetDate': new Date()
    }
  );

  // Community limits reset via real-time query (no stored counter)
  console.log('[Limits] Daily reset complete');
}
```

### Product Metadata (Polar.sh)
```javascript
// Store in product.metadata for routing
{
  "type": "community",          // or "trader"
  "tier": "professional",       // or "enterprise"
  "billing": "monthly",         // or "annual"
  "maxMembers": 100,            // community-specific
  "maxSignalProviders": 10,     // community-specific
  "maxSignalsPerDay": 1000,     // community OR trader limit
  "maxBrokers": 3               // trader-specific
}
```

---

**Status**: Architecture defined, awaiting pricing research completion

**Next Steps**: Complete pricing research → Update product configuration → Launch
