# Design: Migrate to Polar.sh Billing

## Architecture Overview

This migration replaces Stripe with Polar.sh as the payment provider while maintaining the same subscription management patterns and API contracts. The key architectural change is the shift from a traditional payment processor to a Merchant of Record (MoR) model.

## Key Architectural Decisions

### 1. Payment Provider Model: MoR vs Traditional Processor

**Decision**: Use Polar.sh as Merchant of Record (MoR)

**Rationale**:
- **Tax Automation**: Polar.sh handles all tax collection, reporting, and remittance
- **Global Compliance**: Works from day 1 in all jurisdictions (EU, UK, US, etc.)
- **Administrative Savings**: Eliminates 2-4 hours/month of manual tax work
- **Cost Effective**: 4% all-inclusive vs Stripe 2.9% + $90/mo Tax Complete

**Trade-offs**:
- Slightly higher base fee (1.1% more)
- Vendor lock-in to MoR model
- Product-price 1:1 mapping (vs Stripe's flexibility)

### 2. Customer ID Strategy: UUID vs Object IDs

**Decision**: Migrate to UUID-based customer identifiers

**Stripe Approach**:
```javascript
stripeCustomerId: "cus_abc123xyz"  // Prefixed object ID
```

**Polar.sh Approach**:
```javascript
polarCustomerId: "550e8400-e29b-41d4-a716-446655440000"  // RFC 4122 UUID
```

**Rationale**:
- Polar.sh uses UUIDs for all entities (industry standard)
- Enables external ID mapping for easier lookups
- No migration complexity (pre-launch, no existing data)

**Implementation**:
```javascript
// Polar.sh supports external ID for easy reference
await polar.customers.create({
  email: user.email,
  external_id: user._id.toString()  // Link to internal user ID
});
```

### 3. Product-Price Mapping: 1:1 vs 1:Many

**Decision**: Create separate products for each tier + billing cycle combination

**Stripe Model** (1 product → many prices):
```javascript
Product: "Professional Plan"
├─ Price: $99/month
└─ Price: $990/year

Product: "Enterprise Plan"
├─ Price: $299/month
└─ Price: $2990/year
```

**Polar.sh Model** (1 product → 1 price):
```javascript
Product: "Professional Plan Monthly" → $99/month
Product: "Professional Plan Yearly" → $990/year
Product: "Enterprise Plan Monthly" → $299/month
Product: "Enterprise Plan Yearly" → $2990/year
```

**Rationale**:
- Polar.sh enforces 1:1 mapping for pricing clarity
- Simplifies benefit management (Discord roles, file access, etc.)
- Each product can have distinct benefits configuration

**Impact**:
- 4 products instead of 2
- Clearer product naming
- Simpler webhook handling

### 4. Service Layer Pattern: Adapter with Graceful Degradation

**Decision**: Maintain existing service layer pattern with Polar.sh adapter

**Pattern**:
```javascript
// src/services/polar.js
class PolarService {
  constructor() {
    this.client = process.env.POLAR_ACCESS_TOKEN
      ? new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN })
      : null;
  }

  async getCommunitySubscription(customerId) {
    if (!this.client || !customerId) {
      // Return mock data for development
      return this.getMockSubscription();
    }

    // Real Polar.sh API call
    return await this.client.subscriptions.get(customerId);
  }

  getMockSubscription() {
    return {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'active',
      // ... mock data
    };
  }
}
```

**Rationale**:
- Allows development without Polar.sh credentials
- Matches existing Stripe service pattern
- Simplifies testing with mock data
- No runtime crashes if unconfigured

### 5. Webhook Strategy: Dedicated Handler

**Decision**: Create separate webhook endpoint for Polar.sh

**Endpoints**:
```
POST /webhook/stripe     → REMOVE (delete file)
POST /webhook/polar      → ADD (new file)
```

**Rationale**:
- Clean separation of concerns
- Easier to validate webhook signatures
- Simpler to remove Stripe code completely

**Webhook Events to Handle**:
```javascript
// src/routes/webhook/polar.js
switch (event.type) {
  case 'subscription.created':
    // Link subscription to community
    break;
  case 'subscription.updated':
    // Update subscription status
    break;
  case 'subscription.cancelled':
    // Mark subscription as cancelled
    break;
  case 'checkout.completed':
    // Process successful checkout
    break;
}
```

### 6. Schema Migration Strategy: Direct Replacement

**Decision**: Replace Stripe fields with Polar fields (no dual mode)

**Migration Steps**:
1. Remove `stripeCustomerId`, `stripeSubscriptionId`
2. Add `polarCustomerId`, `polarSubscriptionId`, `polarOrganizationId`
3. Update all queries to use new field names

**Rationale**:
- Pre-launch = no customer data to migrate
- Clean codebase with no legacy fields
- Simpler to maintain and test

**Schema Definition**:
```javascript
// src/models/Community.js
subscription: {
  tier: {
    type: String,
    enum: ['free', 'professional', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['trial', 'active', 'past_due', 'canceled'],
    default: 'trial'
  },
  // Polar.sh identifiers (UUID format)
  polarCustomerId: {
    type: String,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  },
  polarSubscriptionId: {
    type: String,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  },
  polarOrganizationId: {
    type: String,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  },
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  trialEndsAt: {
    type: Date,
    default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  }
}
```

## Data Flow

### Subscription Creation Flow

```
1. User clicks "Upgrade to Professional"
   ↓
2. Frontend: POST /api/community/subscription/checkout
   ↓
3. Backend: polar.checkouts.create({
     product_id: PROFESSIONAL_MONTHLY_UUID,
     success_url: APP_URL/dashboard/community/subscription?success=true,
     customer_email: community.ownerEmail
   })
   ↓
4. Backend: Return checkout URL
   ↓
5. Frontend: Redirect to Polar.sh checkout page
   ↓
6. User completes payment on Polar.sh
   ↓
7. Polar.sh: POST /webhook/polar (checkout.completed event)
   ↓
8. Backend: Update Community.subscription with Polar IDs
   ↓
9. Polar.sh: Redirect to success_url
   ↓
10. Frontend: Display success message
```

### Subscription Status Check Flow

```
1. User visits /dashboard/community/subscription
   ↓
2. Frontend: GET /api/community/subscription
   ↓
3. Backend: Check community.subscription.polarCustomerId
   ↓
4. If null → Return free tier info
   ↓
5. If present → polar.subscriptions.get(polarCustomerId)
   ↓
6. Backend: Merge Polar.sh data with local usage metrics
   ↓
7. Backend: Generate customer portal URL
   ↓
8. Frontend: Display subscription details + portal link
```

## Testing Strategy

### Unit Tests
```javascript
// tests/unit/polar.service.test.js
describe('PolarService', () => {
  describe('getCommunitySubscription()', () => {
    it('returns mock data when Polar not configured');
    it('returns subscription data from Polar API');
    it('handles Polar API errors gracefully');
  });
});
```

### Integration Tests
```javascript
// tests/integration/subscription.test.js
describe('Subscription Endpoints', () => {
  it('GET /api/community/subscription returns free tier when no customer');
  it('GET /api/community/subscription returns Polar data when customer exists');
  it('POST /api/community/subscription/checkout creates Polar checkout');
});
```

### Webhook Tests
```javascript
// tests/integration/webhook.test.js
describe('Polar Webhooks', () => {
  it('handles subscription.created event');
  it('handles subscription.updated event');
  it('handles subscription.cancelled event');
  it('validates webhook signature');
  it('rejects invalid signatures');
});
```

## Security Considerations

### 1. Webhook Signature Verification
```javascript
const crypto = require('crypto');

function verifyPolarWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
```

### 2. Access Token Storage
- Store `POLAR_ACCESS_TOKEN` in environment variables
- Never commit to git (.env in .gitignore)
- Use different tokens for staging/production
- Rotate tokens periodically

### 3. Customer Data Protection
- UUID-based references (no internal IDs exposed)
- External ID mapping for lookups
- HTTPS-only communication
- Webhook signature validation

## Performance Considerations

### API Call Optimization
```javascript
// Cache subscription data (5-minute TTL)
const subscriptionCache = new Map();

async function getCachedSubscription(customerId) {
  const cacheKey = `subscription:${customerId}`;
  const cached = subscriptionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.data;
  }

  const subscription = await polar.subscriptions.get(customerId);
  subscriptionCache.set(cacheKey, {
    data: subscription,
    timestamp: Date.now()
  });

  return subscription;
}
```

### Database Query Optimization
```javascript
// Index on polarCustomerId for fast lookups
CommunitySchema.index({ 'subscription.polarCustomerId': 1 });
UserSchema.index({ 'subscription.polarCustomerId': 1 });
```

## Rollback Plan

**If issues arise during migration:**

1. **Code Rollback**: Git revert to pre-migration commit
2. **No Data Rollback Needed**: Pre-launch, no customer data
3. **Polar.sh Cleanup**: Delete test products in Polar.sh dashboard

**Monitoring Post-Migration:**
- Check webhook delivery (Polar.sh dashboard)
- Monitor subscription API endpoint response times
- Verify checkout flow completes successfully
- Test customer portal access

## Future Considerations

### Potential Enhancements
1. **Multi-currency support**: Polar.sh handles automatically
2. **Usage-based billing**: Polar.sh supports metered billing
3. **Annual discounts**: Already supported with yearly products
4. **Free trial extensions**: Configurable in Polar.sh

### Migration Path (if needed)
If we ever need to migrate from Polar.sh:
1. Dual-mode support (both Polar + new provider)
2. Migrate existing customers gradually
3. Sunset Polar.sh after full migration
4. Estimated effort: 2-3 weeks with customer communication
