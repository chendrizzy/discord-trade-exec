# Spec: Role-Based Dashboard Routing

## ADDED Requirements

### Requirement: Automatic role-based dashboard redirection

The system SHALL automatically redirect authenticated users to the appropriate dashboard based on their `communityRole` field without requiring manual role selection.

#### Scenario: Community admin accesses dashboard root
**Given** a user with `communityRole: 'admin'` is authenticated
**When** they navigate to `/dashboard`
**Then** they should be automatically redirected to `/dashboard/community`
**And** the redirect should complete in <500ms

#### Scenario: Trader accesses dashboard root
**Given** a user with `communityRole: 'trader'` is authenticated
**When** they navigate to `/dashboard`
**Then** they should be automatically redirected to `/dashboard/trader`
**And** the redirect should complete in <500ms

#### Scenario: Moderator accesses dashboard root
**Given** a user with `communityRole: 'moderator'` is authenticated
**When** they navigate to `/dashboard`
**Then** they should be automatically redirected to `/dashboard/community`
**And** have the same access as admins for community management

### Requirement: Role validation on protected routes

The system SHALL validate user roles before granting access to role-specific dashboard routes and return 403 Forbidden for unauthorized access attempts.

#### Scenario: Trader attempts to access community dashboard
**Given** a user with `communityRole: 'trader'` is authenticated
**When** they attempt to navigate to `/dashboard/community`
**Then** they should receive a 403 Forbidden response
**And** be redirected back to `/dashboard/trader`
**And** see an error message "You don't have permission to access this page"

#### Scenario: Admin accesses trader dashboard
**Given** a user with `communityRole: 'admin'` is authenticated
**When** they attempt to navigate to `/dashboard/trader`
**Then** they SHOULD be allowed access to view the trader perspective
**And** see a banner indicating "Viewing as Trader" at the top

### Requirement: Unauthenticated user handling

The system SHALL redirect unauthenticated users attempting to access any dashboard route to the Discord OAuth login flow.

#### Scenario: Unauthenticated user accesses dashboard
**Given** no user is authenticated (no session)
**When** they navigate to `/dashboard`, `/dashboard/community`, or `/dashboard/trader`
**Then** they should be redirected to `/auth/discord`
**And** the original URL should be stored as `returnTo` in session
**And** after successful authentication, they should be redirected to the appropriate dashboard

### Requirement: Deep link preservation across authentication

The system SHALL preserve deep links to specific dashboard pages through the authentication flow.

#### Scenario: Unauthenticated user accesses specific dashboard page
**Given** no user is authenticated
**When** they navigate to `/dashboard/trader/signals`
**Then** they should be redirected to `/auth/discord` with `returnTo=/dashboard/trader/signals`
**And** after successful authentication, they should land on `/dashboard/trader/signals` if authorized
**Or** on the appropriate role-based dashboard if not authorized for the requested page

### Requirement: Multi-community role handling

The system SHALL support users who belong to multiple communities with different roles per community.

#### Scenario: User with multiple community memberships
**Given** a user is an admin in Community A and a trader in Community B
**When** they log in with community A active in their session
**Then** they should be redirected to `/dashboard/community`
**When** they switch to community B via community selector
**Then** they should be automatically redirected to `/dashboard/trader`

## MODIFIED Requirements

None (new functionality, no existing requirements modified)

## REMOVED Requirements

None (existing unified dashboard routes will be deprecated but not removed in Phase 1)
