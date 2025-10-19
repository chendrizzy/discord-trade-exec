# Proposal: Implement Dual Dashboard System

## Problem Statement

Currently, the application has a single dashboard interface that serves both **Community Hosts** (server/channel owners who provide trading signals) and **Trader Users** (community members who receive and execute signals). These two user types have fundamentally different needs, responsibilities, and workflows:

**Community Hosts need to:**
- Manage their Discord server integration
- Configure signal channels and broadcasting
- Monitor community member activity and execution
- Track community-wide performance metrics
- Manage subscription/billing for their community tier
- Control access permissions and moderation
- View analytics on signal effectiveness and user engagement

**Trader Users need to:**
- View available signal providers in their community
- Configure their personal broker connections
- Set individual risk preferences and position sizing
- Track their personal trade history and P&L
- Manage their individual subscription
- View their own execution metrics
- Configure notifications and alerts

The current unified dashboard creates UX confusion, shows irrelevant features to each user type, and makes it difficult for users to quickly access their primary workflows.

## Proposed Solution

Implement separate, purpose-built dashboard interfaces for each user type:

1. **Community Host Dashboard** (`/dashboard/community`)
   - Community management focus
   - Signal provider configuration
   - Member management and oversight
   - Community-wide analytics
   - Billing and subscription management for the community tier

2. **Trader Dashboard** (`/dashboard/trader`)
   - Personal trading focus
   - Broker configuration and management
   - Individual risk and position management
   - Personal trade history and P&L tracking
   - Individual subscription management
   - Signal provider selection within community

## Key Design Decisions

### 1. Role-Based Routing
- Automatic redirect based on `user.communityRole` field
- Community admins → `/dashboard/community`
- Traders/viewers → `/dashboard/trader`
- Support role switching for users with multiple roles

### 2. Shared Components
- Reuse existing UI primitives from `src/dashboard/components/ui/`
- Share common components (charts, tables, forms) between dashboards
- Maintain consistent visual design language
- Factor out common logic into hooks/utilities

### 3. Access Control
- Middleware-enforced role validation on API endpoints
- Community-scoped data access (tenant isolation)
- Clear permission boundaries for each dashboard

### 4. Progressive Migration
- Phase 1: Create new dashboard components without breaking existing
- Phase 2: Migrate users to appropriate dashboards
- Phase 3: Deprecate and remove unified dashboard
- Maintain backward compatibility during transition

## User Benefits

**For Community Hosts:**
- ✅ Streamlined community management interface
- ✅ Clear visibility into member activity
- ✅ Tools for moderating and optimizing signal delivery
- ✅ Community health metrics at a glance

**For Trader Users:**
- ✅ Simplified personal trading interface
- ✅ Focus on execution and performance
- ✅ No clutter from irrelevant community management features
- ✅ Faster access to critical trading functions

**For the Platform:**
- ✅ Better user onboarding with role-appropriate UX
- ✅ Reduced support burden from confused users
- ✅ Clear feature prioritization per user type
- ✅ Foundation for role-specific feature expansion

## Technical Scope

This change introduces:
- New dashboard page components and routes
- Role-based routing middleware
- New API endpoints for role-specific data
- Component refactoring for shared UI elements
- Database query optimization for multi-tenant data access
- Comprehensive test coverage for both dashboards

## Dependencies

**Blocking:**
- None (can be implemented independently)

**Related:**
- `implement-realtime-infrastructure` - WebSocket events can be scoped per dashboard
- `implement-analytics-platform` - Analytics views differ per role
- Multi-tenant tenant scoping already implemented in models

## Risks & Mitigation

**Risk:** Breaking existing user workflows during migration
- **Mitigation:** Progressive rollout, feature flags, backward-compatible redirects

**Risk:** Code duplication between dashboards
- **Mitigation:** Strict component sharing policy, shared hooks/utilities

**Risk:** Inconsistent UX between dashboards
- **Mitigation:** Design system enforcement, shared UI primitives

## Success Metrics

- [ ] Community hosts can manage their community without seeing trader-only features
- [ ] Traders can access their trading tools without community management clutter
- [ ] Zero regression in existing functionality
- [ ] <500ms additional route decision overhead
- [ ] 90%+ test coverage on new dashboard components
- [ ] Positive user feedback on dashboard clarity (post-launch survey)

## Out of Scope

- Mobile-specific dashboard layouts (future enhancement)
- Dark mode / theme customization (separate change)
- Dashboard customization / widget configuration (separate change)
- Third-party integrations beyond existing broker connections
