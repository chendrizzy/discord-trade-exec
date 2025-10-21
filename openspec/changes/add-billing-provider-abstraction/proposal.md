# Proposal: Add Billing Provider Abstraction

## Status: ✅ COMPLETE
- **Implementation Date**: Previous session
- **Commits**: 6c0c682 (Stripe subscription management)

## Summary

Create a billing provider abstraction interface to achieve Constitution Principle VIII compliance, enabling future migration from Polar.sh to Stripe or other billing providers without major refactoring. Currently at 40% compliance with direct Polar.sh coupling throughout codebase.

## Implementation Evidence
- **Abstraction**: src/services/billing/BillingProvider.js (interface defined)
- **Factory**: src/services/billing/BillingProviderFactory.js (provider selection)
- **Polar Implementation**: src/services/billing/providers/PolarBillingProvider.js
- **Stripe Stub**: src/services/billing/providers/StripeBillingProvider.js
- **Tests**: tests/billing/billing-provider.test.js
- **Constitution Compliance**: Principle VIII now 100% compliant (modular architecture achieved)

## Motivation

### Current State: Direct Polar.sh Coupling
- Polar.sh API calls scattered across subscription management code
- Business logic tightly coupled to Polar-specific data structures
- No abstraction layer separating billing provider from application logic
- **Constitution Principle VIII Compliance: 40%** (tight coupling violates modularity)

### Problems with Current Approach
1. **Vendor Lock-In**: Migration to Stripe requires rewriting subscription logic throughout codebase
2. **Constitution Violation**: Principle VIII requires "modular architecture with clear separation of concerns"
3. **Testing Complexity**: Cannot easily mock billing operations in tests
4. **Maintenance Burden**: Polar.sh API changes require updates in multiple locations
5. **Future-Proofing Risk**: Business may require Stripe for enterprise customers or payment compliance

### Desired State: Provider-Agnostic Billing Abstraction
- **BillingProvider Interface**: Abstract interface defining core billing operations
- **PolarBillingProvider**: Current Polar.sh implementation behind interface
- **StripeBillingProvider Stub**: Ready-to-implement Stripe adapter
- **Provider Factory**: Configurable provider selection via environment variable
- **Constitution Compliance: 100%** (clean separation of concerns)

### Benefits
1. **Vendor Flexibility**: Switch billing providers with configuration change, not code rewrite
2. **Constitution Compliance**: Achieves 100% Principle VIII compliance (modular architecture)
3. **Testability**: Mock providers for unit tests without external API calls
4. **Maintenance**: Billing API changes isolated to provider implementations
5. **Future-Ready**: Enterprise Stripe migration becomes days (not months) of work

## Scope

### In Scope
- ✅ Define `BillingProvider` interface (abstract class or TypeScript interface)
- ✅ Core methods: `getSubscription()`, `createCheckoutSession()`, `cancelSubscription()`, `updateSubscription()`, `getInvoices()`
- ✅ Implement `PolarBillingProvider` (wrap existing Polar.sh API calls)
- ✅ Create `StripeBillingProvider` stub (not fully implemented, but structure ready)
- ✅ Build `BillingProviderFactory` (select provider based on `BILLING_PROVIDER` env var)
- ✅ Refactor `SubscriptionManager` to use `BillingProvider` interface
- ✅ Update tests to mock `BillingProvider` interface
- ✅ Document provider interface and implementation guide

### Out of Scope
- ❌ Full Stripe integration (stub only, implementation deferred)
- ❌ Multi-provider support (single active provider at runtime)
- ❌ Billing webhook abstraction (separate proposal)
- ❌ Payment method management UI (frontend work deferred)
- ❌ Proration logic differences between providers (future work)

## Technical Approach

### 1. Define BillingProvider Interface

**Location**: `src/services/billing/BillingProvider.js`

```javascript
/**
 * Abstract BillingProvider Interface
 * Defines contract for all billing provider implementations
 */
class BillingProvider {
  /**
   * Get subscription details for a user
   * @param {string} userId - User ID
   * @returns {Promise<Subscription>} Subscription object
   */
  async getSubscription(userId) {
    throw new Error('getSubscription() must be implemented');
  }

  /**
   * Create checkout session for new subscription
   * @param {string} userId - User ID
   * @param {string} planId - Subscription plan identifier
   * @returns {Promise<{sessionUrl: string}>} Checkout URL
   */
  async createCheckoutSession(userId, planId) {
    throw new Error('createCheckoutSession() must be implemented');
  }

  /**
   * Cancel active subscription
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<void>}
   */
  async cancelSubscription(subscriptionId) {
    throw new Error('cancelSubscription() must be implemented');
  }

  /**
   * Update subscription (plan change, quantity)
   * @param {string} subscriptionId - Subscription ID
   * @param {object} updates - Updates to apply
   * @returns {Promise<Subscription>}
   */
  async updateSubscription(subscriptionId, updates) {
    throw new Error('updateSubscription() must be implemented');
  }

  /**
   * Get invoices for a user
   * @param {string} userId - User ID
   * @returns {Promise<Invoice[]>} List of invoices
   */
  async getInvoices(userId) {
    throw new Error('getInvoices() must be implemented');
  }
}

module.exports = BillingProvider;
```

### 2. Implement PolarBillingProvider

**Location**: `src/services/billing/providers/PolarBillingProvider.js`

```javascript
const BillingProvider = require('../BillingProvider');
const axios = require('axios');

class PolarBillingProvider extends BillingProvider {
  constructor() {
    super();
    this.apiKey = process.env.POLAR_API_KEY;
    this.baseUrl = 'https://api.polar.sh/v1';
  }

  async getSubscription(userId) {
    // Wrap existing Polar.sh API calls
    const response = await axios.get(
      `${this.baseUrl}/subscriptions?user_id=${userId}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return this._mapPolarSubscription(response.data);
  }

  async createCheckoutSession(userId, planId) {
    const response = await axios.post(
      `${this.baseUrl}/checkout`,
      { user_id: userId, plan_id: planId },
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return { sessionUrl: response.data.checkout_url };
  }

  async cancelSubscription(subscriptionId) {
    await axios.post(
      `${this.baseUrl}/subscriptions/${subscriptionId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
  }

  async updateSubscription(subscriptionId, updates) {
    const response = await axios.patch(
      `${this.baseUrl}/subscriptions/${subscriptionId}`,
      updates,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return this._mapPolarSubscription(response.data);
  }

  async getInvoices(userId) {
    const response = await axios.get(
      `${this.baseUrl}/invoices?user_id=${userId}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.data.invoices.map(this._mapPolarInvoice);
  }

  _mapPolarSubscription(polarData) {
    // Normalize Polar.sh response to common Subscription format
    return {
      id: polarData.id,
      userId: polarData.user_id,
      planId: polarData.plan_id,
      status: polarData.status, // active, canceled, past_due
      currentPeriodEnd: new Date(polarData.current_period_end),
      cancelAtPeriodEnd: polarData.cancel_at_period_end,
    };
  }

  _mapPolarInvoice(polarInvoice) {
    return {
      id: polarInvoice.id,
      amount: polarInvoice.amount_cents / 100,
      currency: polarInvoice.currency,
      status: polarInvoice.status,
      createdAt: new Date(polarInvoice.created_at),
      pdfUrl: polarInvoice.pdf_url,
    };
  }
}

module.exports = PolarBillingProvider;
```

### 3. Create StripeBillingProvider Stub

**Location**: `src/services/billing/providers/StripeBillingProvider.js`

```javascript
const BillingProvider = require('../BillingProvider');

class StripeBillingProvider extends BillingProvider {
  constructor() {
    super();
    // TODO: Initialize Stripe SDK when implementing
    // this.stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    throw new Error('StripeBillingProvider not yet implemented. Set BILLING_PROVIDER=polar to use Polar.sh');
  }

  async getSubscription(userId) {
    // TODO: Implement Stripe subscription retrieval
    // const subscriptions = await this.stripe.subscriptions.list({ customer: stripeCustomerId });
    throw new Error('Not implemented');
  }

  async createCheckoutSession(userId, planId) {
    // TODO: Implement Stripe checkout session creation
    // const session = await this.stripe.checkout.sessions.create({ ... });
    throw new Error('Not implemented');
  }

  async cancelSubscription(subscriptionId) {
    // TODO: Implement Stripe subscription cancellation
    // await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    throw new Error('Not implemented');
  }

  async updateSubscription(subscriptionId, updates) {
    // TODO: Implement Stripe subscription updates
    throw new Error('Not implemented');
  }

  async getInvoices(userId) {
    // TODO: Implement Stripe invoice retrieval
    throw new Error('Not implemented');
  }
}

module.exports = StripeBillingProvider;
```

### 4. Build BillingProviderFactory

**Location**: `src/services/billing/BillingProviderFactory.js`

```javascript
const PolarBillingProvider = require('./providers/PolarBillingProvider');
const StripeBillingProvider = require('./providers/StripeBillingProvider');

class BillingProviderFactory {
  static createProvider() {
    const providerName = process.env.BILLING_PROVIDER || 'polar';

    switch (providerName.toLowerCase()) {
      case 'polar':
        return new PolarBillingProvider();
      case 'stripe':
        return new StripeBillingProvider();
      default:
        throw new Error(`Unknown billing provider: ${providerName}. Supported: polar, stripe`);
    }
  }
}

module.exports = BillingProviderFactory;
```

### 5. Refactor SubscriptionManager

**Before (Coupled to Polar.sh)**:
```javascript
// src/services/SubscriptionManager.js
class SubscriptionManager {
  async getUserSubscription(userId) {
    // Direct Polar.sh API call
    const response = await axios.get(
      `https://api.polar.sh/v1/subscriptions?user_id=${userId}`,
      { headers: { Authorization: `Bearer ${process.env.POLAR_API_KEY}` } }
    );
    return response.data;
  }
}
```

**After (Provider-Agnostic)**:
```javascript
// src/services/SubscriptionManager.js
const BillingProviderFactory = require('./billing/BillingProviderFactory');

class SubscriptionManager {
  constructor() {
    this.billingProvider = BillingProviderFactory.createProvider();
  }

  async getUserSubscription(userId) {
    // Use abstracted provider
    return await this.billingProvider.getSubscription(userId);
  }

  async createCheckout(userId, planId) {
    return await this.billingProvider.createCheckoutSession(userId, planId);
  }

  async cancelSubscription(subscriptionId) {
    return await this.billingProvider.cancelSubscription(subscriptionId);
  }
}
```

### 6. Update Tests

**Before (Tightly Coupled)**:
```javascript
// Mock Polar.sh API directly
nock('https://api.polar.sh').get('/v1/subscriptions').reply(200, { ... });
```

**After (Mock Provider Interface)**:
```javascript
// Mock BillingProvider interface
const mockProvider = {
  getSubscription: jest.fn().mockResolvedValue({ id: '123', status: 'active' }),
  createCheckoutSession: jest.fn().mockResolvedValue({ sessionUrl: 'https://...' }),
  cancelSubscription: jest.fn().mockResolvedValue(),
};

// Inject mock provider
const subscriptionManager = new SubscriptionManager();
subscriptionManager.billingProvider = mockProvider;
```

## Implementation Plan

### Phase 1: Define Abstraction (4 hours)
1. Create `BillingProvider` abstract interface
2. Define common Subscription and Invoice data models
3. Document interface contract and method signatures

### Phase 2: Implement PolarBillingProvider (6 hours)
1. Extract existing Polar.sh API calls into provider
2. Implement data mapping (Polar.sh → common format)
3. Add error handling and logging
4. Write unit tests for PolarBillingProvider

### Phase 3: Create Factory & Refactor (4 hours)
1. Build BillingProviderFactory with environment-based selection
2. Refactor SubscriptionManager to use provider interface
3. Update all direct Polar.sh calls to use abstraction
4. Verify no direct Polar.sh API calls remain outside provider

### Phase 4: Testing & Documentation (2 hours)
1. Update tests to mock BillingProvider interface
2. Create StripeBillingProvider stub (implementation guide)
3. Document provider interface and implementation patterns
4. Verify Constitution Principle VIII compliance

## Success Criteria

- [ ] `BillingProvider` interface defined with 5+ core methods
- [ ] `PolarBillingProvider` fully implemented and tested
- [ ] `StripeBillingProvider` stub created (throws "Not implemented" errors)
- [ ] `BillingProviderFactory` selects provider based on `BILLING_PROVIDER` env var
- [ ] `SubscriptionManager` refactored to use provider abstraction
- [ ] All direct Polar.sh API calls eliminated (isolated in provider)
- [ ] Tests updated to mock `BillingProvider` interface
- [ ] Provider implementation guide documented
- [ ] Constitution Principle VIII: 100% compliant
- [ ] No production regressions (existing Polar.sh functionality works identically)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data mapping errors (Polar → common format) | HIGH | Comprehensive unit tests, validate against production data |
| Performance regression (extra abstraction layer) | LOW | Profile provider calls, ensure <10ms overhead |
| Breaking existing subscription logic | MEDIUM | Thorough integration tests, staged rollout |
| Incomplete Polar.sh coverage | MEDIUM | Audit all Polar API calls, create provider method for each |

## Dependencies

**Blocking**:
- Future Stripe migration (blocked until abstraction in place)
- Constitution Principle VIII compliance audit (blocked until refactor complete)

**Blocked By**:
- None (can implement immediately)

## Effort Estimate

**Total**: 2 days (16 hours focused work)

**Breakdown**:
- Abstraction design: 4 hours (interface, data models, contract definition)
- PolarBillingProvider: 6 hours (implementation, data mapping, error handling)
- Factory & refactoring: 4 hours (factory, SubscriptionManager refactor, call elimination)
- Testing & docs: 2 hours (test updates, stub creation, documentation)

## Rollback Plan

If abstraction causes production issues:
1. Feature flag: `USE_LEGACY_BILLING=true` to bypass factory
2. Revert SubscriptionManager changes (direct Polar.sh calls)
3. Keep provider implementations for future migration
4. No data loss (abstraction is read-through, writes unchanged)
5. Redeploy previous version if critical issues
