# Spec: Shared Dashboard Components

## ADDED Requirements

### Requirement: Generic performance chart component

The system SHALL provide a reusable performance chart component that can display P&L data scoped to either a community or individual user.

#### Scenario: Render community-wide P&L chart
**Given** a community admin requests performance data
**When** they render the `<PerformanceChart scope="community" />` component
**Then** the chart should fetch data from `/api/community/analytics/performance`
**And** display aggregated P&L for all community members
**And** support date range selection (7d, 30d, 90d, 1y, all)
**And** render using Recharts library with smooth line chart

#### Scenario: Render personal P&L chart
**Given** a trader requests performance data
**When** they render the `<PerformanceChart scope="user" />` component
**Then** the chart should fetch data from `/api/trader/analytics/performance`
**And** display only the user's personal P&L
**And** use the same date range and styling as community chart
**And** maintain visual consistency across dashboards

### Requirement: Reusable trade history table component

The system SHALL provide a shared trade table component with sorting, filtering, and pagination capabilities.

#### Scenario: Render community trade history
**Given** a community admin views member trades
**When** they render `<TradeTable scope="community" memberId={userId} />`
**Then** the table should display trades for that specific member
**And** include all standard columns (date, symbol, side, P&L, etc.)
**And** support client-side sorting by any column
**And** paginate with 25 trades per page

#### Scenario: Render personal trade history
**Given** a trader views their own trades
**When** they render `<TradeTable scope="user" />`
**Then** the table should display only the user's trades
**And** use the same table structure and styling
**And** support the same sorting and pagination features

### Requirement: Signal provider card component

The system SHALL provide a reusable signal provider card that displays provider information and performance metrics.

#### Scenario: Display signal provider in community dashboard
**Given** a community admin views signal providers
**When** they render `<SignalCard provider={provider} viewMode="admin" />`
**Then** the card should display:
- Provider name and description
- Win rate, total signals, average P&L
- Active/inactive status toggle (admin-only)
- Edit configuration button (admin-only)
**And** clicking the toggle should update provider status

#### Scenario: Display signal provider in trader dashboard
**Given** a trader browses available signals
**When** they render `<SignalCard provider={provider} viewMode="trader" />`
**Then** the card should display:
- Provider name and description
- Win rate, total signals, average P&L
- Follow/Unfollow button
- Performance trend indicator
**And** clicking Follow should add provider to user's followed list

### Requirement: Broker connection status badge

The system SHALL provide a status badge component that indicates broker connection health.

#### Scenario: Display connected broker status
**Given** a broker connection is active and validated
**When** the `<BrokerStatusBadge status="connected" broker="Alpaca" />` is rendered
**Then** it should display a green badge with text "Connected"
**And** show the broker name and last validated timestamp
**And** include a tooltip with connection details

#### Scenario: Display disconnected broker status
**Given** a broker connection has failed validation
**When** the badge is rendered with `status="error"`
**Then** it should display a red badge with text "Connection Error"
**And** show an error icon
**And** include a "Reconnect" button in the tooltip
**And** clicking Reconnect should trigger re-validation flow

### Requirement: Subscription details card component

The system SHALL provide a subscription card that displays tier, status, and usage information for both community and individual subscriptions.

#### Scenario: Display community subscription
**Given** a community admin views billing settings
**When** they render `<SubscriptionCard type="community" />`
**Then** the card should display:
- Community subscription tier and status
- Member count vs. tier limit
- Renewal date and payment status
- Upgrade/downgrade options
**And** provide a link to Polar billing portal

#### Scenario: Display personal subscription
**Given** a trader views their subscription
**When** they render `<SubscriptionCard type="user" />`
**Then** the card should display:
- Personal subscription tier and status
- Signal usage vs. daily limit
- Renewal date
- Upgrade options
**And** show a different layout optimized for individual context

## MODIFIED Requirements

None (new shared components)

## REMOVED Requirements

None
