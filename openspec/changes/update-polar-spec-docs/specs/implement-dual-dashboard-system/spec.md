## MODIFIED Requirements

### Requirement: Community billing management
The system SHALL allow community hosts to view their community subscription, usage, and manage upgrades through the active billing provider (Polar.sh).

#### Scenario: Community admin views billing settings with Polar billing
- **Given** a community admin is authenticated
- **And** the community has a Polar customer ID
- **When** they open `/dashboard/community/subscription`
- **Then** the UI SHALL display usage limits and subscription status sourced from Polar
- **And** a "Manage Billing" link SHALL open the Polar billing portal for that community

### Requirement: Trader personal subscription management
The system SHALL allow individual traders to manage their personal subscription using the active billing provider (Polar.sh).

#### Scenario: Trader opens personal subscription tab with Polar billing
- **Given** a trader is authenticated
- **And** they have an active Polar subscription
- **When** they open `/dashboard/trader/settings`
- **Then** the "Subscription" card SHALL display tier, renewal info, and usage from Polar
- **And** the "Manage Billing" action SHALL link to the Polar customer portal without referencing Stripe

### Requirement: Shared subscription card component
The shared subscription card component SHALL render billing summaries using the active billing provider without referencing deprecated Stripe integrations.

#### Scenario: Subscription card renders with Polar data
- **Given** the subscription card component receives `type="community"` and Polar billing data
- **When** it renders the billing summary
- **Then** it SHALL display Polar tier and usage information
- **And** all portal links SHALL target the Polar billing portal endpoint