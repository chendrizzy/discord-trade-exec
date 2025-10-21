# Spec: Community Host Dashboard

## ADDED Requirements

### Requirement: Community overview page with key metrics

The community dashboard SHALL display an overview page with real-time KPIs for community health, member activity, and signal performance.

#### Scenario: Admin views community overview
**Given** a community admin is authenticated
**When** they access `/dashboard/community`
**Then** they should see:
- Total active members count
- Total signals sent in last 30 days
- Average execution rate across all members
- Community-wide P&L (aggregated)
- Top performing signal providers (by win rate)
- Recent member activity feed (last 10 actions)
**And** all metrics should be scoped to their `communityId`
**And** data should load in <2 seconds

#### Scenario: No members in community
**Given** a community has zero members (only the admin)
**When** the admin views the overview
**Then** they should see an empty state with:
- "No members yet" message
- Call-to-action to invite members
- Link to Discord integration setup

### Requirement: Signal management interface

The community dashboard SHALL provide an interface for admins to configure and manage signal channels, providers, and broadcasting settings.

#### Scenario: Admin configures signal channels
**Given** a community admin is on `/dashboard/community/signals`
**When** they add a Discord channel ID to monitor for signals
**Then** the channel should be validated against the Discord API
**And** saved to the community's `webhookConfig.signalChannelIds` array
**And** signals from that channel should begin processing immediately
**And** they should see a success toast notification

#### Scenario: Admin enables/disables signal provider
**Given** a signal provider exists in the community
**When** the admin toggles the `isActive` status
**Then** the change should be reflected in the `SignalProvider` document
**And** if disabled, no new signals from that provider should be processed
**And** existing followers should receive a notification about the status change

### Requirement: Member management with role assignment

The community dashboard SHALL allow admins to view all community members, update their roles, and manage permissions.

#### Scenario: Admin updates member role
**Given** a community admin is on `/dashboard/community/members`
**When** they select a trader and promote them to 'moderator'
**Then** the user's `communityRole` should be updated to 'moderator'
**And** an audit log entry should be created via `SecurityAudit` model
**And** the user should receive a notification of their role change
**And** the user should be automatically redirected to `/dashboard/community` on next login

#### Scenario: Admin views member activity
**Given** a community admin selects a specific member
**When** they view the member detail page
**Then** they should see:
- Member's trade history (scoped to this community)
- Signal providers followed
- Execution rate and P&L
- Broker connection status
- Last active timestamp
**And** admins should NOT see the member's encrypted API keys

### Requirement: Community analytics dashboard

The community dashboard SHALL display performance analytics aggregated across all community members.

#### Scenario: Admin views community performance
**Given** a community admin is on `/dashboard/community/analytics`
**When** the page loads
**Then** they should see charts for:
- Total community P&L over time (line chart, 30-day default)
- Signal execution rate by provider (bar chart)
- Member engagement metrics (active traders, signals per day)
- Top performing members by P&L (leaderboard)
**And** all charts should be interactive with date range filters
**And** data should be cached for 5 minutes to reduce database load

### Requirement: Community subscription and billing management

The community dashboard SHALL display the community's subscription tier, usage limits, and billing information.

#### Scenario: Admin views subscription details
**Given** a community admin is on `/dashboard/community/settings/billing`
**When** the page loads
**Then** they should see:
- Current subscription tier ('starter', 'pro', 'enterprise')
- Subscription status and renewal date
- Member usage vs. limits for current tier
- Upgrade/downgrade options with tier comparison
- Polar billing portal link for subscription management
**And** they should be able to upgrade the tier inline
**And** tier changes should be reflected immediately after Polar confirmation

### Requirement: Discord integration configuration

The community dashboard SHALL provide a UI for admins to configure Discord webhook settings, channel mappings, and bot permissions.

#### Scenario: Admin configures execution notification channel
**Given** a community admin is on `/dashboard/community/settings/discord`
**When** they set the `executionChannelId` in webhook config
**Then** the channel should be validated for bot access
**And** execution notifications should be posted to that channel
**And** they should see a test notification button to verify the setup

## MODIFIED Requirements

None (new dashboard, no existing requirements modified)

## REMOVED Requirements

None
