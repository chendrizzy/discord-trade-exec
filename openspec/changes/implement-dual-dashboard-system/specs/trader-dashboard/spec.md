# Spec: Trader User Dashboard

## ADDED Requirements

### Requirement: Trader overview with personal metrics

The trader dashboard SHALL display an overview page focused on the individual user's trading performance, active positions, and account status.

#### Scenario: Trader views personal overview
**Given** a trader user is authenticated
**When** they access `/dashboard/trader`
**Then** they should see:
- Personal P&L for last 30 days (total and percentage)
- Current active positions across all brokers
- Today's trades count and net P&L
- Signal execution rate (personal)
- Top 3 signal providers followed (by performance)
- Recent trade history (last 10 trades)
**And** all metrics should be scoped to their `userId` and `communityId`
**And** data should load in <2 seconds

#### Scenario: New trader with no trades
**Given** a trader has never executed a trade
**When** they view the overview
**Then** they should see an empty state with:
- "Get started" guide
- Link to configure brokers
- Link to browse available signals
- Demo trade walkthrough

### Requirement: Signal feed with follow/unfollow capability

The trader dashboard SHALL display available signal providers from their community with the ability to follow or unfollow providers.

#### Scenario: Trader follows a signal provider
**Given** a trader is on `/dashboard/trader/signals`
**When** they click "Follow" on a signal provider
**Then** the provider should be added to their followed list
**And** they should start receiving signals from that provider
**And** they should see a success toast notification
**And** the provider's card should update to show "Following" status

#### Scenario: Trader views signal provider performance
**Given** a trader is browsing signal providers
**When** they click on a provider to view details
**Then** they should see:
- Provider's win rate, average P&L, total signals sent
- Recent signals from this provider (last 20)
- Execution metrics for this provider across community
- Risk profile and typical position sizes
**And** they should see a "Follow" or "Unfollow" button based on current status

#### Scenario: Trader filters signals by performance
**Given** a trader is on the signals page
**When** they apply a filter for "Win Rate > 60%"
**Then** only providers matching the criteria should be displayed
**And** the filter state should persist in URL query params
**And** they should be able to save the filter as a preset

### Requirement: Broker management interface

The trader dashboard SHALL allow users to view, add, configure, and manage their personal broker connections.

#### Scenario: Trader adds a new broker
**Given** a trader is on `/dashboard/trader/brokers`
**When** they click "Add Broker" and select "Alpaca"
**Then** they should be presented with the OAuth flow or API key input
**And** credentials should be encrypted before saving
**And** broker connection should be validated immediately
**And** they should see the broker in their active connections list with status "Connected"

#### Scenario: Broker connection fails validation
**Given** a trader attempts to add a broker with invalid credentials
**When** the system validates the connection
**Then** they should see an error message with specific details
**And** the broker should not be saved
**And** they should have the option to retry or edit credentials

### Requirement: Personal trade history with filtering

The trader dashboard SHALL display the user's complete trade history with advanced filtering and export capabilities.

#### Scenario: Trader views trade history
**Given** a trader is on `/dashboard/trader/history`
**When** the page loads
**Then** they should see a paginated table with columns:
- Trade date/time
- Symbol, side (buy/sell), quantity
- Entry/exit price, P&L
- Signal provider (if applicable)
- Broker used
- Status (filled, partial, failed)
**And** the table should be sortable by any column
**And** default sort should be by date descending

#### Scenario: Trader filters trades by date range
**Given** a trader is viewing their trade history
**When** they select a date range (e.g., "Last 7 days")
**Then** only trades within that range should be displayed
**And** summary metrics should update to reflect the filtered data
**And** the filter should persist in URL query params

#### Scenario: Trader exports trade history
**Given** a trader has filtered their trades
**When** they click "Export CSV"
**Then** a CSV file should download with all filtered trades
**And** the CSV should include all table columns plus trade ID
**And** the export should complete in <5 seconds for up to 10,000 trades

### Requirement: Risk and position management settings

The trader dashboard SHALL provide a UI for users to configure their personal risk preferences, position sizing rules, and stop-loss/take-profit defaults.

#### Scenario: Trader configures position sizing
**Given** a trader is on `/dashboard/trader/settings/risk`
**When** they set their position sizing to "2% of account per trade"
**Then** the setting should be saved to their `User.tradingConfig.riskManagement`
**And** future trades should automatically calculate position size using this rule
**And** they should see a preview calculation based on current account balance

#### Scenario: Trader sets default stop-loss percentage
**Given** a trader is configuring risk settings
**When** they set a default stop-loss of "5%"
**Then** all signals without explicit stop-loss should use this default
**And** they should see the impact on recent signals (retroactive preview)
**And** they should be able to override on a per-trade basis

### Requirement: Personal notifications and alerts

The trader dashboard SHALL allow users to configure notification preferences for trade executions, signal alerts, and account events.

#### Scenario: Trader enables Discord DM notifications
**Given** a trader is on `/dashboard/trader/settings/notifications`
**When** they enable "Discord DM on trade execution"
**Then** the setting should be saved to their user preferences
**And** they should receive a test notification immediately
**And** future trade executions should trigger Discord DMs

#### Scenario: Trader configures alert thresholds
**Given** a trader is setting up alerts
**When** they set "Alert me if daily loss exceeds $500"
**Then** the system should monitor their daily P&L
**And** send an alert when the threshold is breached
**And** provide options to pause trading or adjust limits

### Requirement: Personal subscription management

The trader dashboard SHALL display the user's individual subscription tier, usage, and provide self-service upgrade/downgrade options.

#### Scenario: Trader views subscription status
**Given** a trader is on `/dashboard/trader/settings/subscription`
**When** the page loads
**Then** they should see:
- Current subscription tier and status
- Renewal date and payment method (masked)
- Usage metrics (signals used vs. limit)
- Upgrade options with feature comparison
- Stripe customer portal link
**And** they should be able to upgrade inline
**And** see immediate tier upgrade after payment

## MODIFIED Requirements

None (new dashboard, no existing requirements modified)

## REMOVED Requirements

None
