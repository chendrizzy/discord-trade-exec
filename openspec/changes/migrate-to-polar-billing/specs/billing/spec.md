# Billing Capability

## ADDED Requirements

### Requirement: Polar.sh Payment Integration
The system SHALL integrate with Polar.sh as the Merchant of Record (MoR) for subscription billing, replacing Stripe payment processing.

#### Scenario: Community subscription with Polar.sh customer
- **GIVEN** a community with a valid `polarCustomerId`
- **WHEN** retrieving subscription details via `GET /api/community/subscription`
- **THEN** the system SHALL fetch subscription data from Polar.sh API
- **AND** the system SHALL return tier, status, limits, usage, and billing portal URL

#### Scenario: Free tier without Polar customer
- **GIVEN** a community without a `polarCustomerId`
- **WHEN** retrieving subscription details via `GET /api/community/subscription`
- **THEN** the system SHALL return free tier limits (10 members, 2 signal providers, 50 signals/day)
- **AND** the system SHALL NOT make Polar.sh API calls

#### Scenario: Graceful degradation without Polar credentials
- **GIVEN** `POLAR_ACCESS_TOKEN` environment variable is not configured
- **WHEN** any Polar.sh service method is called
- **THEN** the system SHALL return mock subscription data
- **AND** the system SHALL NOT crash or throw errors

### Requirement: UUID-based Customer Identification
The system SHALL use RFC 4122 UUID format for Polar.sh customer identifiers, replacing Stripe's object ID format.

#### Scenario: Valid UUID customer ID
- **GIVEN** a community with `polarCustomerId` in UUID format
- **WHEN** saving or validating the customer ID
- **THEN** the system SHALL validate against UUID regex pattern
- **AND** the system SHALL accept valid UUIDs (e.g., `550e8400-e29b-41d4-a716-446655440000`)

#### Scenario: Invalid customer ID format
- **GIVEN** an attempt to save a non-UUID customer ID
- **WHEN** the database validation runs
- **THEN** the system SHALL reject the value with a validation error

### Requirement: Subscription Checkout Flow
The system SHALL provide checkout session creation for subscription upgrades using Polar.sh products.

#### Scenario: Create checkout for Professional plan monthly
- **GIVEN** a community owner wants to upgrade to Professional tier
- **WHEN** creating a checkout session with `PROFESSIONAL_MONTHLY_UUID` product ID
- **THEN** the system SHALL create a Polar.sh checkout session
- **AND** the system SHALL include `success_url` pointing to dashboard
- **AND** the system SHALL include `customer_email` for pre-filling

#### Scenario: Checkout success webhook
- **GIVEN** a user completes payment on Polar.sh checkout page
- **WHEN** Polar.sh sends `checkout.completed` webhook event
- **THEN** the system SHALL update Community document with `polarCustomerId` and `polarSubscriptionId`
- **AND** the system SHALL verify webhook signature before processing

### Requirement: Customer Portal Access
The system SHALL provide Polar.sh customer portal URLs for subscription management.

#### Scenario: Generate portal URL for existing customer
- **GIVEN** a community with a valid `polarCustomerId`
- **WHEN** generating a customer portal session
- **THEN** the system SHALL create a Polar.sh portal session with `return_url`
- **AND** the system SHALL return the portal URL for frontend redirect

#### Scenario: Portal unavailable for free tier
- **GIVEN** a community without a Polar customer (free tier)
- **WHEN** subscription details are requested
- **THEN** the system SHALL NOT include a billing portal URL
- **AND** the response SHALL indicate `hasStripeCustomer: false` (legacy naming)

### Requirement: Webhook Event Processing
The system SHALL process Polar.sh webhook events to maintain subscription state synchronization.

#### Scenario: Subscription created event
- **WHEN** receiving `subscription.created` webhook event
- **THEN** the system SHALL link the subscription to the appropriate community
- **AND** the system SHALL update subscription status to 'active'

#### Scenario: Subscription cancelled event
- **WHEN** receiving `subscription.cancelled` webhook event
- **THEN** the system SHALL update community subscription status to 'canceled'
- **AND** the system SHALL log SecurityAudit event with HIGH risk level

#### Scenario: Webhook signature verification
- **GIVEN** a webhook request from Polar.sh
- **WHEN** validating the webhook signature
- **THEN** the system SHALL verify HMAC-SHA256 signature using `POLAR_WEBHOOK_SECRET`
- **AND** the system SHALL reject requests with invalid signatures

### Requirement: Product-Price 1:1 Mapping
The system SHALL support Polar.sh's 1:1 product-price mapping model, requiring separate products for each tier and billing interval.

#### Scenario: Four subscription products
- **GIVEN** Professional and Enterprise tiers with monthly and yearly billing
- **WHEN** configuring Polar.sh products
- **THEN** the system SHALL support four distinct product IDs:
  - Professional Plan Monthly ($99/month)
  - Professional Plan Yearly ($990/year)
  - Enterprise Plan Monthly ($299/month)
  - Enterprise Plan Yearly ($2990/year)

### Requirement: Tenant-Scoped Subscription Queries
The system SHALL enforce tenant scoping for all subscription-related database queries per Constitution Principle I.

#### Scenario: Subscription retrieval with tenant isolation
- **GIVEN** a user authenticated to Community A
- **WHEN** retrieving subscription details
- **THEN** the system SHALL only query subscriptions scoped to `communityId` of Community A
- **AND** the system SHALL NOT expose subscription data from other communities

### Requirement: Subscription Tier Limits
The system SHALL enforce tier-based limits for community resources based on subscription level.

#### Scenario: Free tier limits
- **GIVEN** a community on free tier
- **THEN** the system SHALL enforce:
  - `maxMembers`: 10
  - `maxSignalProviders`: 2
  - `maxSignalsPerDay`: 50

#### Scenario: Professional tier limits
- **GIVEN** a community on professional tier
- **THEN** the system SHALL enforce:
  - `maxMembers`: 100
  - `maxSignalProviders`: 10
  - `maxSignalsPerDay`: 1000

#### Scenario: Enterprise tier limits
- **GIVEN** a community on enterprise tier
- **THEN** the system SHALL enforce:
  - `maxMembers`: 1000
  - `maxSignalProviders`: 50
  - `maxSignalsPerDay`: 10000

### Requirement: Real-Time Usage Tracking
The system SHALL calculate real-time resource usage for subscription limit enforcement.

#### Scenario: Calculate current usage
- **GIVEN** a community with multiple members and signal providers
- **WHEN** retrieving subscription details
- **THEN** the system SHALL query:
  - Current member count via `User.countDocuments({ communityId })`
  - Current signal provider count via `SignalProvider.countDocuments({ communityId })`
  - Today's signal count via `Signal.countDocuments({ communityId, createdAt: { $gte: todayStart } })`
- **AND** the system SHALL return usage data alongside limits

## REMOVED Requirements

### Requirement: Stripe Customer Integration
The system no longer uses Stripe for payment processing. All Stripe-based customer management has been replaced with Polar.sh.

**Reason**: Migration to Polar.sh as Merchant of Record for automatic tax compliance.

**Migration**: Existing Stripe customer IDs (`stripeCustomerId`, `stripeSubscriptionId`) are removed from database schemas. Pre-launch migration has zero customer impact.

#### Scenario: Stripe API calls (removed)
- Previously: System made calls to `stripe.customers.retrieve()` and `stripe.subscriptions.retrieve()`
- Now: System uses `polar.customers.get()` and `polar.subscriptions.get()` with UUID identifiers

### Requirement: Stripe Billing Portal
The system no longer uses Stripe billing portal for subscription management.

**Reason**: Replaced with Polar.sh customer portal.

**Migration**: All portal URL generation now uses Polar.sh portal sessions.

#### Scenario: Stripe portal session creation (removed)
- Previously: `stripe.billingPortal.sessions.create({ customer, return_url })`
- Now: `polar.billingPortal.sessions.create({ customer_id, return_url })`

### Requirement: Stripe Checkout Sessions
The system no longer uses Stripe Checkout for subscription purchases.

**Reason**: Replaced with Polar.sh checkout flow.

**Migration**: Checkout session creation now uses Polar.sh product IDs (UUIDs) instead of Stripe price IDs.

#### Scenario: Stripe checkout creation (removed)
- Previously: `stripe.checkout.sessions.create({ line_items: [{ price: priceId }], ... })`
- Now: `polar.checkouts.create({ product_id: productUuid, success_url, ... })`

### Requirement: Stripe Webhook Handling
The system no longer processes Stripe webhook events (`customer.subscription.*`, `invoice.payment_*`).

**Reason**: Replaced with Polar.sh webhook events.

**Migration**: Webhook endpoint `/webhook/stripe` deleted, replaced with `/webhook/polar`.

#### Scenario: Stripe webhook events (removed)
- Previously: Processed `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- Now: Processes `subscription.created`, `subscription.updated`, `subscription.cancelled`, `checkout.completed`

## MODIFIED Requirements

None. This is a complete replacement of payment provider, not a modification of existing billing requirements.
