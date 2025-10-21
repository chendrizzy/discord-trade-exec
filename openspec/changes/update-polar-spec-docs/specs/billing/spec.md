## MODIFIED Requirements

### Requirement: Merchant of Record billing integration
The system SHALL operate with Polar.sh as the active Merchant of Record, removing live Stripe dependencies while retaining optional provider stubs for future migrations.

#### Scenario: Polar billing is configured
- **Given** the application is deployed with `BILLING_PROVIDER=polar`
- **When** subscription APIs (`/api/community/subscription`, `/api/trader/subscription`) are invoked
- **Then** they SHALL return billing data sourced from Polar via the billing provider abstraction
- **And** no runtime dependency SHALL exist on `src/services/stripe.js`

#### Scenario: Stripe references are archived
- **Given** developers review change documentation
- **When** they read active change specs or task lists
- **Then** references to Stripe SHALL appear only in archived context or historical discussion
- **And** success criteria SHALL reflect that Stripe dependencies have been removed from the codebase