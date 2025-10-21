# Proposal: Migrate to Polar.sh Billing

## Summary

Migrate from Stripe to Polar.sh as the payment provider to leverage Merchant of Record (MoR) capabilities for automatic global tax compliance. This migration must occur **before any customer subscriptions are processed** to avoid complex data migration scenarios.

## Motivation

### Current State: Stripe Payment Processing
- Using Stripe for subscription management
- Manual tax compliance required for all jurisdictions
- Stripe Tax Complete costs $90/month for only 2 jurisdictions
- Risk of tax filing penalties and manual administrative burden
- Customer ID format: `cus_xxx` (Stripe object IDs)

### Problems with Current Approach
1. **Tax Compliance Burden**: As a SaaS selling globally, we face:
   - EU: Tax from first sale (zero threshold)
   - UK: Tax from first sale
   - Quarterly/monthly filing requirements
   - Registration in multiple jurisdictions
   - Penalty risk for missed deadlines
   - 2-4 hours/month administrative overhead

2. **Stripe Tax Complete Limitations**:
   - $90/month for only 2 global registrations
   - Only 4 filings annually (insufficient for EU quarterly requirements)
   - Additional cost on top of 2.9% + $0.30 fees

3. **Pre-Launch Timing**:
   - No customer data yet = trivial migration
   - Post-launch migration would require:
     - Customer notifications
     - Subscription data migration
     - 2-3 weeks of work
     - Risk of data loss

### Desired State: Polar.sh MoR
- Polar.sh acts as Merchant of Record
- Automatic tax collection and remittance (included in 4% fee)
- No manual tax compliance or filing
- Customer ID format: UUID (RFC 4122)
- Product-price 1:1 mapping (vs Stripe's 1:many)
- External ID field for easy user lookup

### Benefits
1. **Tax Automation**: Zero administrative burden, included in 4% fee
2. **Pre-Launch Migration**: 1 day of work now vs 2-3 weeks later
3. **Global Compliance**: Works from day 1 in all jurisdictions
4. **Developer Experience**: Excellent SDK, documentation, sandbox
5. **Cost Effective**: At $5K/month revenue:
   - Stripe: $145 + $90 Tax Complete + 4hrs = $235 + time
   - Polar.sh: $200 all-inclusive

## Scope

### In Scope
- ✅ Replace Stripe SDK with Polar.sh SDK
- ✅ Update Community and User subscription schemas (Stripe IDs → Polar UUIDs)
- ✅ Migrate subscription service layer
- ✅ Update subscription API endpoints
- ✅ Create Polar.sh product setup documentation
- ✅ Update environment variable configuration
- ✅ Migrate webhook handling
- ✅ Update all tests to use Polar.sh mocks
- ✅ Remove Stripe dependencies

### Out of Scope
- ❌ Migrating existing customer data (none exists yet)
- ❌ Running both systems in parallel (clean replacement)
- ❌ Stripe Tax Complete evaluation (decided against)
- ❌ PostgreSQL migration (separate decision)

## Technical Approach

### 1. Schema Changes
**Community Model** (`src/models/Community.js`):
```javascript
// REMOVE:
stripeCustomerId: String,
stripeSubscriptionId: String,

// ADD:
polarCustomerId: String,      // UUID format
polarSubscriptionId: String,  // UUID format
polarOrganizationId: String   // Polar.sh org ID
```

**User Model** (`src/models/User.js`):
```javascript
// REMOVE:
stripeCustomerId: String,
stripeSubscriptionId: String,

// ADD:
polarCustomerId: String,      // UUID format
polarSubscriptionId: String   // UUID format
```

### 2. Service Layer
- Create `src/services/polar.js` (replace `stripe.js`)
- Install `@polar-sh/sdk` package
- Implement subscription management methods
- Handle UUID-based customer references
- Support graceful degradation (mock data when unconfigured)

### 3. API Integration
- Update `GET /api/community/subscription` endpoint
- Update `GET /api/trader/subscription` endpoint
- Replace Stripe checkout with Polar.sh checkout
- Replace Stripe customer portal with Polar.sh portal
- Implement Polar.sh webhook handler

### 4. Product Configuration
Polar.sh requires 1:1 product-price mapping (vs Stripe's 1:many):
- Create 4 separate products (vs 2 Stripe products):
  - Professional Plan Monthly ($99/mo)
  - Professional Plan Yearly ($990/yr)
  - Enterprise Plan Monthly ($299/mo)
  - Enterprise Plan Yearly ($2990/yr)

### 5. Environment Configuration
```bash
# REMOVE:
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# ADD:
POLAR_ACCESS_TOKEN
POLAR_ORGANIZATION_ID
POLAR_WEBHOOK_SECRET
```

## Dependencies

### External Dependencies
- Polar.sh account creation (self-service)
- Polar.sh access token generation
- Product setup in Polar.sh dashboard

### Internal Dependencies
- None (pre-launch, no customer data)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Polar.sh API changes | Medium | Use official SDK, monitor changelog |
| Higher base fee (4% vs 2.9%) | Low | Tax automation saves more in admin time |
| Product 1:1 mapping complexity | Low | Clear documentation, simple mapping |
| Vendor lock-in | Medium | MoR services (Paddle, Lemon Squeezy) similar |
| UUID vs object ID migration | Low | Pre-launch = no data to migrate |

## Success Criteria

- [x] All Stripe references removed from codebase (legacy stub retained for future provider support)
- [x] Polar.sh SDK successfully integrated
- [x] Community and User models updated with Polar fields
- [x] Subscription endpoints return Polar.sh data
- [ ] Products configured in Polar.sh dashboard
- [ ] Webhook handler processes Polar.sh events
- [ ] All tests pass with Polar.sh mocks
- [x] Documentation updated (POLAR_SETUP.md created)
- [x] No Stripe dependencies in package.json
- [ ] `openspec validate migrate-to-polar-billing --strict` passes

## Timeline

**Estimated Duration: 1 day** (8 hours focused work)

**Phases:**
1. Setup (1 hour): Install SDK, create Polar.sh account
2. Schema (1 hour): Update models
3. Service Layer (2 hours): Implement polar.js service
4. API Updates (2 hours): Update endpoints
5. Testing (1 hour): Update tests, verify mocks
6. Documentation (1 hour): Create POLAR_SETUP.md

**Note**: Actual Polar.sh credential setup (access tokens, product creation) is deferred until user completes account setup.

## Alternatives Considered

### Alternative 1: Keep Stripe + Tax Complete
- **Pros**: Already implemented, familiar
- **Cons**: $90/month, only 2 jurisdictions, limited filings
- **Decision**: Rejected - insufficient for EU requirements

### Alternative 2: Keep Stripe + Manual Tax Filing
- **Pros**: No additional fees
- **Cons**: 2-4 hours/month admin, penalty risk, scales poorly
- **Decision**: Rejected - administrative burden unsustainable

### Alternative 3: Lemon Squeezy or Paddle
- **Pros**: Similar MoR benefits
- **Cons**: Higher fees (5-10% vs Polar's 4%)
- **Decision**: Rejected - Polar.sh is cheapest MoR

### Alternative 4: Defer Migration Until Post-Launch
- **Pros**: None
- **Cons**: 2-3 weeks work, customer disruption, migration risk
- **Decision**: Rejected - NOW is the right time

## Open Questions

- [x] Which Polar.sh pricing tier do we need? **Answer**: Standard (4% fee)
- [x] Do we need both monthly and yearly products? **Answer**: Yes, for flexibility
- [x] Should we keep Stripe as fallback? **Answer**: No, clean replacement
- [ ] What happens to free tier users? **Answer**: TBD - likely no Polar customer until upgrade
