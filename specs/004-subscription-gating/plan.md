# Implementation Plan: Discord Server Subscription/Membership Gating

**Branch**: `004-subscription-gating` | **Date**: 2025-10-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-subscription-gating/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature implements a subscription-gating system that allows server owners to control bot access based on Discord server subscription/membership status. The system supports two modes: subscription-required (for monetization) and open-access (for community value). Server owners configure their preference during initial setup via an interactive wizard, with the ability to modify settings later. The implementation requires Discord API integration for subscription verification, MongoDB persistence for server configurations, and a caching layer to minimize API calls while maintaining real-time accuracy.

## Technical Context

**Language/Version**: Node.js >=22.11.0 (TypeScript for type safety)
**Primary Dependencies**: Discord.js v14+ (Discord API integration), Mongoose (MongoDB ODM), Redis (caching layer)
**Storage**: MongoDB (server configurations, access control settings, audit logs)
**Testing**: Jest (unit tests), Playwright (E2E testing for setup wizard interactions)
**Target Platform**: Linux server (Railway deployment)
**Project Type**: Backend service extension (integrates with existing Discord bot)
**Performance Goals**:
  - Subscription verification: <2 seconds (95th percentile) per FR requirement
  - Configuration changes: <60 seconds propagation per FR requirement
  - Support 1000+ concurrent WebSocket connections per constitution requirement
**Constraints**:
  - Must integrate with existing Discord bot command infrastructure
  - Must respect Discord API rate limits (50 requests/second global)
  - Must cache subscription status for 60 seconds per spec to minimize API calls
  - Must handle Discord API outages gracefully (use cached data)
**Scale/Scope**:
  - Multi-server support (each server has independent configuration)
  - Expected: 100+ servers initially, scalable to 10,000+ servers
  - 15 functional requirements, 5 key entities, 6 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle 0: Excellence & Anti-Complacency
- ✅ **Optimal Efficacy**: Feature delivers clear value (dual monetization/community models)
- ✅ **Performance Priority**: Performance targets specified (SC-002: <2s verification, SC-003: <60s propagation)
- ✅ **Zero Complacency**: Comprehensive spec with 7 edge cases, 11 success criteria
- ✅ **No Shortcuts**: All 15 functional requirements have acceptance criteria
- ✅ **Test Quality**: Test-first approach planned for critical subscription verification path
- ✅ **Implementation Depth**: Spec addresses error handling, caching, graceful degradation

**Status**: ✅ **PASS** - Feature exhibits excellence baseline with measurable outcomes

### Principle I: Security-First Development (NON-NEGOTIABLE)
- ✅ **Input Validation**: Discord API responses must be validated (guild IDs, user IDs, role IDs)
- ✅ **Rate Limiting**: Discord API rate limits respected (50 req/s global), caching minimizes calls
- ✅ **No Sensitive Data Logging**: Configuration data is non-sensitive (access mode, guild IDs)
- ⚠️ **Authentication**: Setup wizard requires server owner authentication (verify owner permissions)
- ✅ **Authorization**: Only server owners can modify configuration (permission checks required)
- N/A **Encryption**: No API keys or credentials stored (uses existing Discord bot token)

**Status**: ✅ **PASS** with note - Must implement server owner permission verification in setup wizard

### Principle II: Test-First for Critical Paths (NON-NEGOTIABLE)
Critical paths identified:
- ✅ **Subscription verification logic** (FR-001, FR-007): MUST write tests first
- ✅ **Access control enforcement** (FR-004, FR-005): MUST write tests first
- ⚠️ **Configuration persistence** (FR-004): Test-first required
- ℹ️ **Setup wizard UI** (FR-002): Can use test-after approach (non-critical per constitution)

**Status**: ✅ **PASS** - TDD required for subscription verification and access control, test-after acceptable for UI

### Principle III: Broker Abstraction & Adapter Pattern
- N/A **Not applicable** - Feature does not integrate with trading brokers

**Status**: ✅ **PASS** (N/A)

### Principle IV: Real-Time Communication Standards
- ⚠️ **WebSocket**: Configuration changes should propagate via WebSocket (FR-005: immediate enforcement)
- ✅ **Room Isolation**: Not required (configurations are per-guild, not per-user)
- ✅ **Graceful Degradation**: Spec requires fallback to cached status during API outages
- N/A **Connection Limits**: No new WebSocket connections introduced

**Status**: ✅ **PASS** with note - Configuration change events should use existing WebSocket infrastructure

### Principle V: API-First Design with Provider Abstraction
- ⚠️ **Discord API Abstraction**: Should we abstract Discord subscription API for testability?
  - **Decision**: Create `SubscriptionProvider` interface for Discord API calls
  - **Rationale**: Enables mock provider for testing, prepares for potential multi-platform support
  - **Implementation**: `DiscordSubscriptionProvider` wraps Discord.js subscription methods

**Status**: ✅ **PASS** - Will implement provider pattern for Discord subscription API

### Principle VI: Observability & Operational Transparency
- ✅ **Structured Logging**: Log subscription verification attempts, configuration changes
- ✅ **Error Tracking**: Log Discord API failures, cache misses, verification failures
- ✅ **Performance Monitoring**: Track verification latency (target <2s p95)
- ✅ **Audit Logs**: Access denial events logged (entity defined in spec)
- ✅ **Health Checks**: Verify Discord API connectivity in deep health check

**Status**: ✅ **PASS** - Comprehensive observability planned

### Principle VII: Graceful Error Handling
- ✅ **User-Facing Errors**: Access denial messages are clear and actionable (FR-006)
- ✅ **Retry Logic**: Discord API calls should retry transient failures with backoff
- ✅ **Fallback Behavior**: Use cached subscription status during API outages (edge case documented)
- ✅ **User Notifications**: Access denial messages sent via Discord (FR-006, FR-011)
- ✅ **Semantic HTTP**: N/A (Discord bot, not HTTP API)

**Status**: ✅ **PASS** - Error handling comprehensively specified

### Technology Stack Compliance
- ✅ **Node.js >=22.11.0**: Confirmed
- ✅ **Discord.js**: Existing dependency, v14+ required
- ✅ **MongoDB + Mongoose**: Existing infrastructure
- ✅ **Redis**: Existing infrastructure (for caching)
- ✅ **Jest**: Existing test framework
- ✅ **Playwright**: Existing E2E framework

**Status**: ✅ **PASS** - No new dependencies, uses existing stack

### Performance Standards
| Metric                       | Constitution Target | Feature Target | Status |
|------------------------------|---------------------|----------------|--------|
| API response time            | <200ms p95          | N/A (Discord bot) | ✅ N/A |
| Database query time          | <50ms p95           | <50ms p95      | ✅ PASS |
| WebSocket message delivery   | <100ms p95          | <100ms p95     | ✅ PASS |
| Subscription verification    | N/A                 | <2s p95        | ✅ PASS |
| Configuration change latency | N/A                 | <60s           | ✅ PASS |

**Status**: ✅ **PASS** - Feature-specific performance targets defined and achievable

### Security Compliance (OWASP Top 10)
- ✅ **A01: Broken Access Control**: Server owner verification required for configuration
- N/A **A02: Cryptographic Failures**: No sensitive data stored
- ✅ **A03: Injection**: Discord API inputs validated (guild IDs, user IDs, role IDs)
- ✅ **A04: Insecure Design**: Security-first architecture, permission checks
- N/A **A05: Security Misconfiguration**: No new configuration surface
- ✅ **A06: Vulnerable Components**: Uses existing vetted dependencies
- N/A **A07: Authentication Failures**: Leverages existing Discord OAuth2
- ✅ **A08: Data Integrity**: Server configuration changes logged in audit trail
- ✅ **A09: Logging Failures**: Comprehensive logging planned
- N/A **A10: SSRF**: No URL processing

**Status**: ✅ **PASS** - Security requirements met

### Overall Constitution Compliance

✅ **ALL GATES PASSED** - Feature is compliant with constitution. Proceed to Phase 0 research.

## Project Structure

### Documentation (this feature)

```text
specs/004-subscription-gating/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (in progress)
├── data-model.md        # Phase 1 output (pending)
├── quickstart.md        # Phase 1 output (pending)
├── contracts/           # Phase 1 output (pending)
│   └── subscription-verification-api.md
├── checklists/          # Quality validation (completed)
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── models/
│   ├── server-configuration.model.ts      # MongoDB model for server config
│   ├── user-access-status.model.ts        # MongoDB model for cached access status
│   └── access-denial-event.model.ts       # MongoDB model for audit logs
├── services/
│   ├── subscription/
│   │   ├── subscription-provider.interface.ts      # Provider abstraction
│   │   ├── discord-subscription-provider.ts        # Discord.js implementation
│   │   └── mock-subscription-provider.ts           # Mock for testing
│   ├── access-control/
│   │   ├── access-control.service.ts               # Main gating logic
│   │   └── subscription-cache.service.ts           # Redis caching layer
│   └── setup-wizard/
│       └── setup-wizard.service.ts                 # Interactive setup flow
├── commands/
│   ├── setup/
│   │   └── configure-access.command.ts             # /setup command for wizard
│   └── config/
│       └── access-settings.command.ts              # /config access command
├── middleware/
│   └── subscription-gate.middleware.ts             # Command middleware for gating
└── events/
    └── subscription-change.handler.ts              # Discord role change events

tests/
├── unit/
│   ├── services/
│   │   ├── access-control.service.spec.ts
│   │   └── subscription-cache.service.spec.ts
│   └── middleware/
│       └── subscription-gate.middleware.spec.ts
├── integration/
│   └── subscription-verification.integration.spec.ts
└── e2e/
    └── setup-wizard.e2e.spec.ts                    # Playwright tests
```

**Structure Decision**: Backend-only extension to existing Discord bot. Following standard Node.js/TypeScript structure with models-services-commands pattern already established in the project. The subscription provider pattern aligns with constitution Principle V (API-First Design with Provider Abstraction). Access control implemented as middleware that intercepts all bot commands, similar to existing authentication middleware.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Feature complexity is justified:
- Provider pattern for Discord API abstraction: Enables testing and future multi-platform support
- Redis caching layer: Required to meet 60-second cache requirement and minimize Discord API calls
- Separate service classes: Follows single-responsibility principle and existing codebase patterns
- No additional infrastructure required beyond existing MongoDB and Redis
