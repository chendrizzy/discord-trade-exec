# Spec: Dashboard API Endpoints

## ADDED Requirements

### Requirement: Community dashboard API endpoints with role-based authorization

The system SHALL provide API endpoints for community dashboard features that enforce admin/moderator role validation.

#### Scenario: Get community overview metrics
**Given** a community admin makes a request to `GET /api/community/overview`
**When** the request is authenticated with valid session
**Then** the response should include:
```json
{
  "memberCount": 45,
  "activeMembersLast30Days": 38,
  "totalSignals": 1204,
  "avgExecutionRate": 0.87,
  "communityPnL": {
    "total": 12450.32,
    "last30Days": 8234.12
  },
  "topProviders": [
    { "id": "...", "name": "Pro Trader", "winRate": 0.72 }
  ],
  "recentActivity": [ /* last 10 member actions */ ]
}
```
**And** all data should be filtered by `req.user.communityId`
**And** the response should complete in <2 seconds

#### Scenario: Trader attempts to access community endpoints
**Given** a trader user makes a request to `GET /api/community/overview`
**When** the request is authenticated with `communityRole: 'trader'`
**Then** the response should be `403 Forbidden`
**And** include error message "Insufficient permissions. Admin or moderator role required."

#### Scenario: Update member role
**Given** a community admin makes a request to `POST /api/community/members/:memberId/role`
**With** request body:
```json
{
  "role": "moderator",
  "permissions": ["manage_signals", "view_analytics"]
}
```
**When** the target member belongs to the same community
**Then** the member's `communityRole` should be updated
**And** a `SecurityAudit` log entry should be created with action 'community.member_role_change'
**And** the response should be `200 OK` with updated user object

### Requirement: Trader dashboard API endpoints with user scoping

The system SHALL provide API endpoints for trader dashboard features that enforce user-scoped data access.

#### Scenario: Get personal trading overview
**Given** a trader makes a request to `GET /api/trader/overview`
**When** the request is authenticated
**Then** the response should include:
```json
{
  "personalPnL": {
    "total": 2340.15,
    "last30Days": 840.22,
    "percentChange": 0.056
  },
  "activePositions": [
    { "symbol": "AAPL", "qty": 10, "unrealizedPnL": 45.20 }
  ],
  "todayStats": {
    "tradesCount": 3,
    "netPnL": 125.40
  },
  "executionRate": 0.92,
  "topProviders": [ /* top 3 followed providers */ ],
  "recentTrades": [ /* last 10 trades */ ]
}
```
**And** all data should be filtered by `req.user._id` AND `req.user.communityId`
**And** the response should complete in <2 seconds

#### Scenario: Follow a signal provider
**Given** a trader makes a request to `POST /api/trader/signals/:providerId/follow`
**When** the provider belongs to the user's community
**And** the provider is active
**Then** the provider should be added to the user's followed list
**And** the user should start receiving signals from that provider
**And** the response should be `200 OK` with updated followed providers list
**And** a notification should be sent to the user confirming the follow

#### Scenario: Trader attempts to follow provider from different community
**Given** a trader makes a request to follow a provider
**When** the provider's `communityId` does not match the user's `communityId`
**Then** the response should be `403 Forbidden`
**And** include error message "Cannot follow providers from other communities"

#### Scenario: Get personal trade history with pagination
**Given** a trader makes a request to `GET /api/trader/trades?page=1&limit=25&sortBy=date&order=desc`
**When** the request is authenticated
**Then** the response should include:
```json
{
  "trades": [ /* 25 trade objects */ ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "totalPages": 4,
    "totalTrades": 97
  },
  "summary": {
    "totalPnL": 2340.15,
    "winRate": 0.64
  }
}
```
**And** trades should be filtered by `userId` and `communityId`
**And** trades should be sorted by the specified field

### Requirement: Analytics endpoints with scope-aware aggregation

The system SHALL provide analytics endpoints that aggregate data based on the requesting user's role and scope.

#### Scenario: Community admin requests performance analytics
**Given** a community admin makes a request to `GET /api/community/analytics/performance?range=30d`
**When** the request is authenticated
**Then** the system should aggregate trades from all community members
**And** return time-series data points for the last 30 days
**And** include metrics: total P&L, number of trades, win rate, average trade size
**And** cache the result for 5 minutes with key `community:${communityId}:analytics:30d`

#### Scenario: Trader requests personal performance analytics
**Given** a trader makes a request to `GET /api/trader/analytics/performance?range=30d`
**When** the request is authenticated
**Then** the system should aggregate only the user's trades
**And** return the same data structure as community analytics
**And** cache the result for 5 minutes with key `user:${userId}:analytics:30d`

### Requirement: Rate limiting on dashboard API endpoints

The system SHALL apply rate limits to dashboard API endpoints to prevent abuse.

#### Scenario: Trader makes excessive requests
**Given** a trader makes more than 100 requests to `/api/trader/*` endpoints in 1 minute
**When** they attempt the 101st request
**Then** the response should be `429 Too Many Requests`
**And** include `Retry-After` header with seconds until limit resets
**And** the rate limit should be user-scoped (not IP-based)

#### Scenario: Community admin makes analytics requests
**Given** a community admin makes requests to `/api/community/analytics/*`
**When** they make more than 20 requests in 1 minute
**Then** the response should be `429 Too Many Requests`
**And** analytics endpoints should have a stricter limit due to computational cost

### Requirement: Audit logging for sensitive operations

The system SHALL create audit log entries for all sensitive dashboard operations via the `SecurityAudit` model.

#### Scenario: Admin changes member role
**Given** a community admin updates a member's role
**When** the `POST /api/community/members/:id/role` endpoint is called
**Then** a `SecurityAudit` entry should be created with:
- `action: 'community.member_role_change'`
- `userId: <admin_id>`
- `communityId: <community_id>`
- `targetId: <member_id>`
- `metadata: { oldRole, newRole, permissions }`
- `status: 'success'`

#### Scenario: Trader adds new broker connection
**Given** a trader adds a broker via `POST /api/trader/brokers`
**When** the broker is successfully connected
**Then** a `SecurityAudit` entry should be created with:
- `action: 'broker.connection_added'`
- `userId: <trader_id>`
- `communityId: <community_id>`
- `metadata: { brokerName, status }`

## MODIFIED Requirements

None (new API endpoints)

## REMOVED Requirements

None (existing API endpoints remain for backward compatibility during migration)
