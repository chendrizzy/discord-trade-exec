# Tasks: Add Billing Provider Abstraction

## Phase 1: Define Abstraction (4 hours)

### 1.1 Create BillingProvider Interface
- [ ] **Task 1.1.1**: Create base interface file
  - Path: `src/services/billing/BillingProvider.js`
  - Define abstract class with unimplemented methods
  - Add JSDoc documentation for each method
- [ ] **Task 1.1.2**: Define core methods with signatures
  - `getSubscription(userId)` → Returns Promise<Subscription>
  - `createCheckoutSession(userId, planId)` → Returns Promise<{sessionUrl}>
  - `cancelSubscription(subscriptionId)` → Returns Promise<void>
  - `updateSubscription(subscriptionId, updates)` → Returns Promise<Subscription>
  - `getInvoices(userId)` → Returns Promise<Invoice[]>
- [ ] **Task 1.1.3**: Add method contracts (pre/post-conditions)
  - Input validation requirements
  - Expected error types (NotFoundError, InvalidStateError)
  - Return value guarantees
- [ ] **Validation**: Interface compiles, JSDoc complete

### 1.2 Define Common Data Models
- [ ] **Task 1.2.1**: Create `Subscription` data model
  ```javascript
  // src/services/billing/models/Subscription.js
  {
    id: string,              // Provider-agnostic subscription ID
    userId: string,          // Internal user ID
    planId: string,          // Plan identifier (basic/pro/premium)
    status: string,          // active, canceled, past_due, trialing
    currentPeriodEnd: Date,  // Billing period end date
    cancelAtPeriodEnd: boolean, // Auto-cancel flag
    createdAt: Date,
    metadata: object         // Provider-specific data
  }
  ```
- [ ] **Task 1.2.2**: Create `Invoice` data model
  ```javascript
  // src/services/billing/models/Invoice.js
  {
    id: string,
    subscriptionId: string,
    amount: number,          // Decimal amount (e.g., 49.99)
    currency: string,        // ISO currency code (USD, EUR)
    status: string,          // paid, open, void, uncollectible
    createdAt: Date,
    paidAt: Date,
    pdfUrl: string           // Download link (optional)
  }
  ```
- [ ] **Task 1.2.3**: Document data model guarantees
  - Required vs optional fields
  - Data type constraints
  - Provider-specific mapping notes
- [ ] **Validation**: Models documented, example objects created

### 1.3 Document Interface Contract
- [ ] **Task 1.3.1**: Write implementation guide
  - How to extend `BillingProvider` class
  - Required method implementations
  - Error handling patterns
  - Logging requirements
- [ ] **Task 1.3.2**: Create example provider skeleton
  - Minimal implementation template
  - Method stubs with comments
  - Test harness example
- [ ] **Task 1.3.3**: Document provider responsibilities
  - Data normalization (provider format → common format)
  - Error translation (provider errors → standard errors)
  - Rate limiting (provider-specific throttling)
  - Idempotency guarantees
- [ ] **Validation**: Guide reviewed, clear and actionable

## Phase 2: Implement PolarBillingProvider (6 hours)

### 2.1 Audit Existing Polar.sh API Calls
- [ ] **Task 2.1.1**: Search codebase for Polar.sh API calls
  ```bash
  rg "api\.polar\.sh" --type js
  rg "POLAR_API_KEY" --type js
  ```
- [ ] **Task 2.1.2**: Document all Polar.sh endpoints used
  - GET /subscriptions
  - POST /checkout
  - POST /subscriptions/:id/cancel
  - PATCH /subscriptions/:id
  - GET /invoices
  - (any others discovered)
- [ ] **Task 2.1.3**: Identify data structures returned by Polar.sh
  - Subscription object fields
  - Invoice object fields
  - Error response formats
- [ ] **Validation**: Complete list of Polar.sh API surface area

### 2.2 Implement PolarBillingProvider Methods
- [ ] **Task 2.2.1**: Create provider class file
  - Path: `src/services/billing/providers/PolarBillingProvider.js`
  - Extend `BillingProvider` base class
  - Initialize Polar.sh API client in constructor
  - Load `POLAR_API_KEY` from environment
- [ ] **Task 2.2.2**: Implement `getSubscription(userId)`
  - Make GET request to `/subscriptions?user_id=${userId}`
  - Handle 404 (no subscription) → return null
  - Map Polar.sh response to common Subscription model
  - Add error handling (network errors, API errors)
- [ ] **Task 2.2.3**: Implement `createCheckoutSession(userId, planId)`
  - Make POST request to `/checkout` with user and plan
  - Extract checkout URL from response
  - Return `{sessionUrl: string}` format
  - Handle invalid plan errors
- [ ] **Task 2.2.4**: Implement `cancelSubscription(subscriptionId)`
  - Make POST request to `/subscriptions/${subscriptionId}/cancel`
  - Handle already-canceled subscriptions gracefully
  - Log cancellation events
  - Return void on success
- [ ] **Task 2.2.5**: Implement `updateSubscription(subscriptionId, updates)`
  - Make PATCH request to `/subscriptions/${subscriptionId}`
  - Support plan changes, quantity updates
  - Map updated Polar.sh response to Subscription model
  - Handle proration calculations (if applicable)
- [ ] **Task 2.2.6**: Implement `getInvoices(userId)`
  - Make GET request to `/invoices?user_id=${userId}`
  - Map each invoice to common Invoice model
  - Sort by createdAt descending
  - Handle empty invoice lists
- [ ] **Validation**: Each method tested with real Polar.sh API (staging)

### 2.3 Implement Data Mapping Logic
- [ ] **Task 2.3.1**: Create `_mapPolarSubscription(polarData)` helper
  - Map Polar.sh field names to common Subscription format
  - Convert timestamps (Polar ISO strings → Date objects)
  - Normalize status values (Polar `cancelled` → common `canceled`)
  - Preserve provider-specific data in `metadata` field
- [ ] **Task 2.3.2**: Create `_mapPolarInvoice(polarInvoice)` helper
  - Map Polar.sh invoice fields to common Invoice format
  - Convert `amount_cents` to decimal `amount` (divide by 100)
  - Normalize currency codes (uppercase)
  - Map `pdf_url` to `pdfUrl`
- [ ] **Task 2.3.3**: Add data validation in mappers
  - Ensure required fields present
  - Validate data types (strings, numbers, dates)
  - Throw descriptive errors for invalid data
- [ ] **Validation**: Mappers tested with sample Polar.sh responses

### 2.4 Add Error Handling
- [ ] **Task 2.4.1**: Define custom error classes
  - `BillingProviderError` (base error)
  - `SubscriptionNotFoundError` (404s)
  - `InvalidPlanError` (bad plan IDs)
  - `BillingApiError` (upstream API failures)
- [ ] **Task 2.4.2**: Wrap Polar.sh API errors
  - Catch axios errors in each method
  - Translate HTTP status codes to custom errors
  - Preserve original error details in `metadata`
  - Log errors with Winston
- [ ] **Task 2.4.3**: Add retry logic for transient failures
  - Retry on 500/502/503 status codes
  - Exponential backoff (1s, 2s, 4s)
  - Max 3 retries
  - Log retry attempts
- [ ] **Validation**: Error handling tested with mocked failures

### 2.5 Write Unit Tests for PolarBillingProvider
- [ ] **Task 2.5.1**: Create test file
  - Path: `src/services/billing/providers/__tests__/PolarBillingProvider.test.js`
  - Use Jest as test framework
  - Mock axios for API calls
- [ ] **Task 2.5.2**: Test `getSubscription(userId)` success case
  - Mock Polar.sh API response
  - Verify correct subscription returned
  - Verify data mapping accurate
- [ ] **Task 2.5.3**: Test `getSubscription(userId)` 404 case
  - Mock 404 response from Polar.sh
  - Verify null returned (no subscription)
- [ ] **Task 2.5.4**: Test `createCheckoutSession(userId, planId)`
  - Mock checkout session creation
  - Verify sessionUrl returned
  - Test invalid plan error handling
- [ ] **Task 2.5.5**: Test `cancelSubscription(subscriptionId)`
  - Mock cancellation success
  - Verify no errors thrown
  - Test already-canceled idempotency
- [ ] **Task 2.5.6**: Test `updateSubscription(subscriptionId, updates)`
  - Mock subscription update
  - Verify updated subscription returned
  - Test plan change validation
- [ ] **Task 2.5.7**: Test `getInvoices(userId)`
  - Mock invoice list response
  - Verify invoices mapped correctly
  - Test empty invoice list
- [ ] **Task 2.5.8**: Test error handling
  - Mock network errors
  - Mock API errors (400, 401, 500)
  - Verify custom errors thrown
  - Verify retry logic works
- [ ] **Validation**: All tests passing, coverage >90%

## Phase 3: Create Factory & Refactor (4 hours)

### 3.1 Build BillingProviderFactory
- [ ] **Task 3.1.1**: Create factory class file
  - Path: `src/services/billing/BillingProviderFactory.js`
  - Static method: `createProvider()`
  - No constructor (factory uses static methods)
- [ ] **Task 3.1.2**: Implement provider selection logic
  - Read `BILLING_PROVIDER` environment variable (default: 'polar')
  - Switch on provider name (case-insensitive)
  - Instantiate PolarBillingProvider for 'polar'
  - Instantiate StripeBillingProvider for 'stripe'
  - Throw error for unknown providers
- [ ] **Task 3.1.3**: Add provider caching (singleton pattern)
  - Cache provider instance after first creation
  - Return cached instance on subsequent calls
  - Rationale: avoid re-initializing API clients
- [ ] **Task 3.1.4**: Write factory tests
  - Test Polar provider instantiation
  - Test Stripe provider instantiation (expect error - not implemented)
  - Test unknown provider error
  - Test caching behavior
- [ ] **Validation**: Factory tests passing, provider selection works

### 3.2 Create StripeBillingProvider Stub
- [ ] **Task 3.2.1**: Create stub file
  - Path: `src/services/billing/providers/StripeBillingProvider.js`
  - Extend `BillingProvider` base class
  - Constructor throws "Not implemented" error
- [ ] **Task 3.2.2**: Add method stubs with TODOs
  - `getSubscription(userId)` → throw "Not implemented"
  - `createCheckoutSession(userId, planId)` → throw "Not implemented"
  - `cancelSubscription(subscriptionId)` → throw "Not implemented"
  - `updateSubscription(subscriptionId, updates)` → throw "Not implemented"
  - `getInvoices(userId)` → throw "Not implemented"
- [ ] **Task 3.2.3**: Document Stripe implementation plan
  - Add comments with Stripe API equivalents
  - Link to Stripe documentation
  - Note differences from Polar.sh (e.g., customer IDs)
- [ ] **Validation**: Stub compiles, throws expected errors

### 3.3 Refactor SubscriptionManager
- [ ] **Task 3.3.1**: Locate SubscriptionManager implementation
  - Find file: `src/services/SubscriptionManager.js` (or equivalent)
  - Identify all methods using Polar.sh API
- [ ] **Task 3.3.2**: Add BillingProvider dependency
  - Import `BillingProviderFactory`
  - Initialize provider in constructor: `this.billingProvider = BillingProviderFactory.createProvider()`
  - Support dependency injection for testing: `constructor(billingProvider = null)`
- [ ] **Task 3.3.3**: Refactor `getUserSubscription(userId)`
  - Replace direct Polar.sh API call
  - Call `this.billingProvider.getSubscription(userId)`
  - Remove Polar-specific data mapping (now in provider)
- [ ] **Task 3.3.4**: Refactor `createCheckout(userId, planId)`
  - Replace direct Polar.sh checkout creation
  - Call `this.billingProvider.createCheckoutSession(userId, planId)`
  - Return sessionUrl unchanged
- [ ] **Task 3.3.5**: Refactor `cancelSubscription(subscriptionId)`
  - Replace direct Polar.sh cancellation
  - Call `this.billingProvider.cancelSubscription(subscriptionId)`
  - Keep business logic (notifications, logging) unchanged
- [ ] **Task 3.3.6**: Refactor `getInvoiceHistory(userId)`
  - Replace direct Polar.sh invoice retrieval
  - Call `this.billingProvider.getInvoices(userId)`
  - Apply any additional filtering/sorting if needed
- [ ] **Validation**: SubscriptionManager refactored, no direct Polar.sh calls

### 3.4 Eliminate Remaining Direct Polar.sh Calls
- [ ] **Task 3.4.1**: Search for remaining Polar.sh API calls
  ```bash
  rg "api\.polar\.sh" --type js
  rg "POLAR_API_KEY" --type js
  ```
- [ ] **Task 3.4.2**: Refactor each call to use provider abstraction
  - Update route handlers to use SubscriptionManager
  - Update webhook handlers (if any outside provider)
  - Update admin utilities
- [ ] **Task 3.4.3**: Verify no direct Polar.sh imports remain
  - Ensure Polar.sh calls only in `PolarBillingProvider`
  - Check axios calls with 'polar.sh' domain
- [ ] **Validation**: Zero direct Polar.sh API calls outside provider

## Phase 4: Testing & Documentation (2 hours)

### 4.1 Update Existing Tests
- [ ] **Task 4.1.1**: Update SubscriptionManager tests
  - Path: `src/services/__tests__/SubscriptionManager.test.js`
  - Replace Polar.sh API mocks with provider mocks
  - Inject mock BillingProvider in SubscriptionManager constructor
- [ ] **Task 4.1.2**: Create mock BillingProvider helper
  ```javascript
  // tests/mocks/MockBillingProvider.js
  class MockBillingProvider extends BillingProvider {
    constructor() {
      super();
      this.getSubscription = jest.fn();
      this.createCheckoutSession = jest.fn();
      this.cancelSubscription = jest.fn();
      this.updateSubscription = jest.fn();
      this.getInvoices = jest.fn();
    }
  }
  ```
- [ ] **Task 4.1.3**: Update integration tests
  - Replace Polar.sh nock mocks with provider mocks
  - Test factory provider selection
  - Verify provider abstraction works end-to-end
- [ ] **Task 4.1.4**: Add tests for provider factory
  - Test environment-based selection
  - Test caching behavior
  - Test error on unknown provider
- [ ] **Validation**: All tests passing, coverage maintained/improved

### 4.2 Write Provider Implementation Guide
- [ ] **Task 4.2.1**: Create documentation file
  - Path: `docs/billing-provider-implementation-guide.md`
  - Or: Add to `openspec/specs/billing/design.md`
- [ ] **Task 4.2.2**: Document provider interface
  - List required methods with signatures
  - Explain data models (Subscription, Invoice)
  - Provide implementation checklist
- [ ] **Task 4.2.3**: Create Stripe implementation guide
  - Map Stripe API calls to provider methods
  - Document Stripe-specific considerations:
    - Customer ID management (Polar uses user_id directly)
    - Proration handling differences
    - Webhook events for subscription updates
  - Provide code examples for each method
- [ ] **Task 4.2.4**: Document testing approach
  - How to mock provider in tests
  - Integration test patterns
  - Staging environment testing with real APIs
- [ ] **Validation**: Guide reviewed by team member

### 4.3 Update Project Documentation
- [ ] **Task 4.3.1**: Update `openspec/project.md`
  - Add BillingProvider to "Architecture Patterns" section
  - Document adapter pattern usage
  - List supported providers (Polar, Stripe-stub)
- [ ] **Task 4.3.2**: Update `.env.example`
  - Add `BILLING_PROVIDER=polar` (default)
  - Document supported values: `polar`, `stripe`
- [ ] **Task 4.3.3**: Update deployment documentation
  - Add `BILLING_PROVIDER` to environment variable checklist
  - Document provider migration process
- [ ] **Validation**: Documentation accurate and complete

### 4.4 Verify Constitution Principle VIII Compliance
- [ ] **Task 4.4.1**: Audit modular architecture
  - Verify clean separation: BillingProvider ↔ SubscriptionManager
  - Ensure no business logic in provider (only API calls)
  - Confirm provider swappable via configuration
- [ ] **Task 4.4.2**: Document compliance achievement
  - Update Constitution compliance matrix
  - Change Principle VIII from 40% → 100%
  - Provide evidence: abstraction layer, factory pattern, zero coupling
- [ ] **Task 4.4.3**: Code review for architecture violations
  - Check for Polar-specific logic outside provider
  - Verify error handling consistent
  - Ensure testability improved
- [ ] **Validation**: Principle VIII 100% compliant

### 4.5 Production Validation
- [ ] **Task 4.5.1**: Deploy to staging environment
  - Ensure `BILLING_PROVIDER=polar` set
  - Verify application starts without errors
- [ ] **Task 4.5.2**: Test subscription flows end-to-end
  - Create new subscription (checkout flow)
  - View subscription details
  - Cancel subscription
  - View invoice history
- [ ] **Task 4.5.3**: Verify no regressions
  - Compare API response times (before/after abstraction)
  - Check error logs for new errors
  - Verify data format unchanged for frontend
- [ ] **Task 4.5.4**: Load test with abstraction layer
  - 100 concurrent subscription lookups
  - Measure latency overhead (<10ms acceptable)
  - Verify no memory leaks in provider caching
- [ ] **Validation**: Production-ready, zero regressions

## Success Criteria Checklist

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

## Effort Estimate

**Total**: 2 days (16 hours)

- Abstraction design: 4 hours
- PolarBillingProvider: 6 hours
- Factory & refactoring: 4 hours
- Testing & docs: 2 hours
