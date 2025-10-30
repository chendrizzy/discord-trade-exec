# Tasks: Discord Server Subscription/Membership Gating

**Input**: Design documents from `/specs/004-subscription-gating/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/subscription-verification-api.md, quickstart.md

**TDD Requirements**: Per constitution Principle II, test-first development is **MANDATORY** for critical paths:
- Subscription verification logic (US2, US3)
- Access control enforcement (US2, US3, US5)
- Configuration persistence (US1, US4)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md structure:
- Models: `src/models/`
- Services: `src/services/subscription/`, `src/services/access-control/`, `src/services/setup-wizard/`
- Commands: `src/commands/setup/`, `src/commands/config/`
- Middleware: `src/middleware/`
- Events: `src/events/`
- Tests: `tests/unit/`, `tests/integration/`, `tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and TypeScript configuration

- [x] T001 Create directory structure per plan.md (models, services, commands, middleware, events, tests)
- [x] T002 [P] Configure TypeScript compiler options for strict type checking in tsconfig.json
- [x] T003 [P] Setup Jest configuration for unit and integration tests in jest.config.js
- [x] T004 [P] Setup Playwright configuration for E2E tests in playwright.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before ANY user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Data Models (TDD REQUIRED per constitution) ✅ COMPLETE

- [x] T005 [P] Write failing tests for ServerConfiguration model validation (27 tests in tests/unit/models/server-configuration.model.test.js)
- [x] T006 [P] Write failing tests for UserAccessStatus model validation (29 tests in tests/unit/models/user-access-status.model.test.js)
- [x] T007 [P] Write failing tests for AccessDenialEvent model validation (33 tests in tests/unit/models/access-denial-event.model.test.js)
- [x] T008 [P] Implement ServerConfiguration Mongoose model (27/27 tests passing - src/models/ServerConfiguration.js)
- [x] T009 [P] Implement UserAccessStatus Mongoose model with TTL index (29/29 tests passing - src/models/UserAccessStatus.js)
- [x] T010 [P] Implement AccessDenialEvent Mongoose model with TTL index (33/33 tests passing - src/models/AccessDenialEvent.js)

**Checkpoint**: 89/89 model tests passing | Commits: f712d78, fb69509, c934af6, 698e8d0

### Provider Abstraction (TDD REQUIRED - critical path) ✅ COMPLETE

- [x] T011 Define SubscriptionProvider interface (src/services/subscription/SubscriptionProvider.js)
- [x] T012 Write failing tests for DiscordSubscriptionProvider (33 tests in tests/unit/services/subscription/discord-subscription-provider.test.js)
- [x] T013 Write failing tests for MockSubscriptionProvider (36 tests in tests/unit/services/subscription/mock-subscription-provider.test.js)
- [x] T014 Implement DiscordSubscriptionProvider with Discord.js integration (33/33 tests passing - src/services/subscription/DiscordSubscriptionProvider.js)
- [x] T015 [P] Implement MockSubscriptionProvider for testing (36/36 tests passing - src/services/subscription/MockSubscriptionProvider.js)

**Checkpoint**: 69 provider tests passing | Commits: 078fd23, 556dc7e, 74b73b9, b2b6235, f782b3a

### Caching Infrastructure (TDD REQUIRED - critical path) ✅ COMPLETE

- [x] T016 Write failing tests for SubscriptionCacheService (54 tests in tests/unit/services/subscription/subscription-cache-service.test.js)
- [x] T017 Implement SubscriptionCacheService with Redis TTL (32/32 tests passing - src/services/subscription/SubscriptionCacheService.js)

**Checkpoint**: Caching complete - 60s TTL Redis layer ready | Commit: 0782093

### Configuration Management (TDD REQUIRED - critical path) ✅ COMPLETE

- [x] T018 Write failing tests for ServerConfigurationService (63 tests in tests/unit/services/subscription/server-configuration-service.test.js)
- [x] T019 Implement ServerConfigurationService with in-memory cache (39/39 tests passing - src/services/subscription/ServerConfigurationService.js)

**Checkpoint**: Configuration management complete - in-memory cache, cache corruption handling | Commits: fa897c8, d6a2d72

### Error Handling Infrastructure ✅ COMPLETE

- [x] T020 [P] Implement SubscriptionVerificationError custom error class (src/services/subscription/SubscriptionVerificationError.js) - COMPLETED EARLY for T014 dependency
- [x] T021 [P] Configure structured logging with correlation IDs (src/utils/logger.js already implements Winston + AsyncLocalStorage + UUID correlation tracking)

**Checkpoint**: Phase 2 Foundation COMPLETE (16/16 tasks) ✅ - User story implementation can now begin in parallel
**Documentation**: docs/004-subscription-gating-logging.md

---

## Phase 3: User Story 1 - Initial Bot Setup with Access Control Selection (Priority: P1) 🎯 MVP

**Goal**: Server owners can complete initial bot setup including mandatory access control selection during setup wizard

**Independent Test**: Install bot on test server, verify setup wizard appears with clear options for "Subscription Required" vs "Open Access", confirm configuration saves correctly

### Tests for User Story 1 (TDD - write tests FIRST)

- [ ] T022 [P] [US1] Write failing E2E test for setup wizard interaction in tests/e2e/setup-wizard.e2e.spec.ts
- [ ] T023 [P] [US1] Write failing integration test for setup wizard flow in tests/integration/setup-wizard.integration.spec.ts

### Implementation for User Story 1

- [ ] T024 [US1] Implement SetupWizardService in src/services/setup-wizard/setup-wizard.service.ts
- [ ] T025 [US1] Implement /setup configure-access command with button UI in src/commands/setup/configure-access.command.ts
- [ ] T026 [US1] Add server owner permission verification in setup command handler
- [ ] T027 [US1] Implement role auto-detection logic (scan for "subscriber", "member", "patron", "supporter" roles)
- [ ] T028 [US1] Add configuration validation (warn if no subscription system detected)
- [ ] T029 [US1] Verify all US1 tests pass (E2E and integration)

**Checkpoint**: Setup wizard complete - server owners can configure access control on first bot install

---

## Phase 4: User Story 2 - Subscription Member Attempts Bot Access (Priority: P1) 🎯 MVP

**Goal**: Subscribers can successfully use all bot commands in gated servers

**Independent Test**: Configure bot with subscription-gating, have user with active subscription role execute bot commands, verify commands execute normally

### Tests for User Story 2 (TDD REQUIRED - critical path)

**⚠️ MANDATORY**: Write these tests FIRST, ensure they FAIL before implementation

- [ ] T030 [P] [US2] Write failing tests for AccessControlService.checkAccess() in tests/unit/services/access-control/access-control.service.spec.ts
- [ ] T031 [P] [US2] Write failing tests for subscription gate middleware in tests/unit/middleware/subscription-gate.middleware.spec.ts
- [ ] T032 [P] [US2] Write failing integration test for subscriber access flow in tests/integration/subscription-verification.integration.spec.ts

### Implementation for User Story 2

- [ ] T033 [US2] Implement AccessControlService.checkAccess() method in src/services/access-control/access-control.service.ts
- [ ] T034 [US2] Implement AccessControlService.invalidateCache() method in src/services/access-control/access-control.service.ts
- [ ] T035 [US2] Implement subscription gate middleware in src/middleware/subscription-gate.middleware.ts
- [ ] T036 [US2] Register middleware with Discord.js command handler
- [ ] T037 [US2] Add performance monitoring for <2s verification SLA in access control service
- [ ] T038 [US2] Add structured logging for subscription verification attempts
- [ ] T039 [US2] Verify all US2 tests pass (unit, integration)

**Checkpoint**: Subscribers can use bot in gated servers - core gating mechanism works for authorized users

---

## Phase 5: User Story 3 - Non-Subscriber Attempts Bot Access (Priority: P1) 🎯 MVP

**Goal**: Non-subscribers receive clear, actionable denial messages when attempting to use bot in gated servers

**Independent Test**: Have non-subscribed user attempt any bot command in gated server, verify denial message appears with subscription information

### Tests for User Story 3 (TDD REQUIRED - critical path)

**⚠️ MANDATORY**: Write these tests FIRST, ensure they FAIL before implementation

- [ ] T040 [P] [US3] Write failing tests for access denial scenarios in tests/unit/services/access-control/access-control.service.spec.ts
- [ ] T041 [P] [US3] Write failing tests for AccessControlService.logDenialEvent() in tests/unit/services/access-control/access-control.service.spec.ts
- [ ] T042 [P] [US3] Write failing integration test for non-subscriber denial flow in tests/integration/subscription-verification.integration.spec.ts

### Implementation for User Story 3

- [ ] T043 [US3] Implement AccessControlService.logDenialEvent() method in src/services/access-control/access-control.service.ts
- [ ] T044 [US3] Create denial message embed template with role information in src/utils/denial-message.builder.ts
- [ ] T045 [US3] Implement ephemeral denial message delivery in subscription gate middleware
- [ ] T046 [US3] Add analytics logging for denial events to AccessDenialEvent model
- [ ] T047 [US3] Add error handling for verification failures (graceful degradation to cached status)
- [ ] T048 [US3] Verify all US3 tests pass (unit, integration)

**Checkpoint**: Access control is fully functional - both allow and deny paths work correctly (MVP core complete!)

---

## Phase 6: Real-Time Updates (Cross-Cutting for US2 & US3)

**Goal**: Subscription status changes (role additions/removals) propagate immediately via cache invalidation

**Independent Test**: Subscribe user, verify access granted, remove subscription role, immediately test command again, verify access denied

### Implementation for Real-Time Updates

- [ ] T049 [P] Implement guildMemberUpdate event handler in src/events/subscription-change.handler.ts
- [ ] T050 [P] Register event handler with Discord.js client
- [ ] T051 Write integration test for role change cache invalidation in tests/integration/subscription-verification.integration.spec.ts
- [ ] T052 Verify <60 second propagation SLA is met
- [ ] T053 Verify real-time update tests pass

**Checkpoint**: Subscription changes propagate immediately - meets FR-009 real-time requirement

---

## Phase 7: User Story 4 - Server Owner Reconfigures Access Control (Priority: P2)

**Goal**: Server owners can change access control settings after initial setup

**Independent Test**: Access bot config, toggle access control mode, verify change takes effect immediately

### Tests for User Story 4 (TDD REQUIRED - configuration persistence)

- [ ] T054 [P] [US4] Write failing tests for configuration updates in tests/unit/services/server-configuration.service.spec.ts
- [ ] T055 [P] [US4] Write failing E2E test for config command in tests/e2e/access-settings.e2e.spec.ts

### Implementation for User Story 4

- [ ] T056 [US4] Implement /config access command in src/commands/config/access-settings.command.ts
- [ ] T057 [US4] Add server owner permission verification in config command handler
- [ ] T058 [US4] Implement configuration change confirmation message with impact explanation
- [ ] T059 [US4] Add in-memory cache invalidation on configuration update
- [ ] T060 [US4] Verify <60 second propagation SLA for config changes (SC-003)
- [ ] T061 [US4] Verify all US4 tests pass (unit, E2E)

**Checkpoint**: Server owners can reconfigure access control - meets FR-008

---

## Phase 8: User Story 5 - User in Open-Access Server Uses Bot (Priority: P2)

**Goal**: Bot works normally when gating is disabled (open access mode)

**Independent Test**: Configure bot with open access, have any server member execute commands, verify commands work regardless of subscription

### Tests for User Story 5

- [ ] T062 [P] [US5] Write tests for open access mode in tests/unit/services/access-control/access-control.service.spec.ts
- [ ] T063 [P] [US5] Write integration test for open access flow in tests/integration/subscription-verification.integration.spec.ts

### Implementation for User Story 5

- [ ] T064 [US5] Implement open access bypass logic in AccessControlService.checkAccess()
- [ ] T065 [US5] Add logging for open access mode operations
- [ ] T066 [US5] Verify all US5 tests pass (unit, integration)

**Checkpoint**: Open access mode works correctly - both gating modes fully functional

---

## Phase 9: User Story 6 - Server Owner Views Access Analytics (Priority: P3)

**Goal**: Server owners can view access denial statistics and subscriber usage metrics

**Independent Test**: Generate various access attempts, verify statistics are accurately captured and displayed per-server

### Implementation for User Story 6

- [ ] T067 [P] [US6] Implement analytics query service in src/services/analytics/access-analytics.service.ts
- [ ] T068 [US6] Implement /analytics access command in src/commands/analytics/access-stats.command.ts
- [ ] T069 [US6] Add per-server data isolation in analytics queries
- [ ] T070 [US6] Create analytics embed template with time-based metrics
- [ ] T071 [P] [US6] Write integration tests for analytics queries in tests/integration/analytics.integration.spec.ts
- [ ] T072 [US6] Verify all US6 tests pass

**Checkpoint**: Analytics available - server owners can make data-driven decisions (nice-to-have feature complete)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [ ] T073 [P] Add performance benchmarks to verify <2s p95 verification SLA (SC-002)
- [ ] T074 [P] Add load testing with artillery for 1000+ concurrent operations
- [ ] T075 [P] Review and optimize Discord API rate limit handling
- [ ] T076 [P] Add health check endpoint for subscription verification service
- [ ] T077 [P] Create quickstart.md validation tests
- [ ] T078 [P] Add comprehensive error logging for observability (Principle VI)
- [ ] T079 Code cleanup and refactoring across all services
- [ ] T080 [P] Update project documentation in docs/
- [ ] T081 Security audit for Discord ID validation and permission checks
- [ ] T082 Performance optimization for Redis cache operations
- [ ] T083 Final E2E testing across all user stories

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← BLOCKS everything else
    ↓
Phase 3-9 (User Stories) ← Can proceed in parallel after Phase 2
    ↓
Phase 10 (Polish)
```

**CRITICAL**: Phase 2 (Foundational) MUST be 100% complete before any user story work begins.

### User Story Dependencies

```
Setup (Phase 1) → Foundational (Phase 2) → All User Stories Can Start
                                                    ↓
                                    ┌───────────────┼───────────────┐
                                    ↓               ↓               ↓
                            US1 (Setup)     US2 (Allow)     US3 (Deny)
                                    ↓               ↓               ↓
                         Real-Time Updates (Cross-cutting)
                                    ↓
                         ┌──────────┴──────────┐
                         ↓                      ↓
                    US4 (Reconfig)      US5 (Open Access)
                         ↓                      ↓
                            US6 (Analytics)
```

**Independence**: Each user story (US1-US6) can be implemented independently after Foundational phase completes.

### Within Each User Story

1. **Tests FIRST** (if TDD required) - must FAIL before implementation
2. Models (if needed for story)
3. Services
4. Commands/Middleware
5. Event handlers (if needed)
6. **Verify tests PASS**

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks can run in parallel (marked [P])

**Phase 2 (Foundational)**:
- T005-T007: Model tests in parallel
- T008-T010: Model implementations in parallel (after tests written)
- T012-T013: Provider tests in parallel
- T014-T015: Provider implementations in parallel
- T020-T021: Error handling and logging in parallel

**Phase 3+ (User Stories)**: 
- Once Phase 2 completes, ALL user stories can start in parallel if team capacity allows
- Within each story, tasks marked [P] can run in parallel

**Example: Parallel Team Execution After Foundational Phase**
```bash
Developer A: User Story 1 (Setup Wizard)
Developer B: User Story 2 (Subscriber Access)
Developer C: User Story 3 (Denial Handling)
Developer D: Real-Time Updates
```

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Step 1: Write all model tests in parallel
Task T005: tests/unit/models/server-configuration.model.spec.ts
Task T006: tests/unit/models/user-access-status.model.spec.ts
Task T007: tests/unit/models/access-denial-event.model.spec.ts

# Step 2: Implement all models in parallel (after tests fail)
Task T008: src/models/server-configuration.model.ts
Task T009: src/models/user-access-status.model.ts
Task T010: src/models/access-denial-event.model.ts

# Step 3: Write provider tests in parallel
Task T012: tests/unit/services/subscription/discord-subscription-provider.spec.ts
Task T013: tests/unit/services/subscription/mock-subscription-provider.spec.ts

# Step 4: Implement providers in parallel
Task T014: src/services/subscription/discord-subscription-provider.ts
Task T015: src/services/subscription/mock-subscription-provider.ts
```

---

## Parallel Example: User Stories (After Phase 2)

```bash
# All can start simultaneously after Foundational phase:
Task T022-T029: User Story 1 (Setup)
Task T030-T039: User Story 2 (Allow)
Task T040-T048: User Story 3 (Deny)
Task T049-T053: Real-Time Updates (can overlap with US2/US3)
```

---

## Implementation Strategy

### MVP First (Critical P1 Stories Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T021) ← **CRITICAL BLOCKER**
3. Complete Phase 3: User Story 1 (T022-T029) ← Setup wizard
4. Complete Phase 4: User Story 2 (T030-T039) ← Allow access
5. Complete Phase 5: User Story 3 (T040-T048) ← Deny access
6. Complete Phase 6: Real-Time Updates (T049-T053)
7. **STOP and VALIDATE**: Test MVP independently
8. Deploy if ready (MVP = US1 + US2 + US3 + Real-time updates)

### Incremental Delivery

```
Foundation Ready (Phase 1 + 2)
    ↓
+ US1 → Deploy/Demo (Setup wizard works)
    ↓
+ US2 → Deploy/Demo (Subscribers can access)
    ↓
+ US3 → Deploy/Demo (Non-subscribers blocked) ← MVP COMPLETE
    ↓
+ Real-time → Deploy/Demo (Changes propagate)
    ↓
+ US4 → Deploy/Demo (Reconfiguration works)
    ↓
+ US5 → Deploy/Demo (Open access mode)
    ↓
+ US6 → Deploy/Demo (Analytics available)
```

### Parallel Team Strategy (3+ Developers)

**Prerequisites**: Phase 1 + Phase 2 complete (everyone works together)

**After Phase 2**:
- Developer 1: US1 (Setup Wizard) - Independent work
- Developer 2: US2 (Subscriber Access) - Independent work
- Developer 3: US3 (Denial Handling) - Independent work
- Developer 4: Real-Time Updates - Can start immediately after US2/US3 start

**Result**: 4x faster than sequential, each story independently testable

---

## Success Criteria Mapping

Tasks mapped to spec.md success criteria:

- **SC-001** (Setup <3min): T024-T029 (User Story 1)
- **SC-002** (<2s verification p95): T030-T039 (User Story 2) + T073 (benchmarks)
- **SC-003** (<60s config propagation): T049-T053 (Real-time) + T056-T061 (US4)
- **SC-004** (100% blocking): T040-T048 (User Story 3)
- **SC-005** (100% allow subscribers): T030-T039 (User Story 2)
- **SC-006** (100% denial messages): T043-T045 (User Story 3)
- **SC-007** (<30s config change): T056-T061 (User Story 4)
- **SC-008** (<60s status changes): T049-T053 (Real-time updates)
- **SC-009** (90% comprehension): T044 (denial message template)
- **SC-010** (Zero unauthorized access): T030-T048 (US2 + US3 tests)
- **SC-011** (99.9% uptime): T047 (graceful degradation) + T076 (health checks)

---

## TDD Requirements Summary

Per constitution Principle II, the following tasks **REQUIRE** test-first development:

### MANDATORY TDD (Critical Paths):
- **T005-T010**: All model validation tests (subscription verification depends on correct data)
- **T012-T015**: Provider tests and implementation (core verification logic)
- **T016-T017**: Cache service tests (performance-critical path)
- **T018-T019**: Configuration service tests (persistence critical)
- **T030-T039**: Access control service tests (main gating logic - CRITICAL)
- **T040-T048**: Denial handling tests (access control enforcement - CRITICAL)
- **T054-T055**: Configuration update tests (data integrity critical)

### Acceptable Test-After:
- **T022-T023**: Setup wizard E2E (UI/UX, non-critical per constitution)
- **T062-T066**: Open access mode (simple bypass logic)
- **T067-T072**: Analytics (nice-to-have feature)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story independently completable and testable after Phase 2
- TDD REQUIRED for all tasks marked "TDD REQUIRED" or "MANDATORY"
- Verify tests FAIL before implementing
- Verify tests PASS after implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independence
- Constitution compliance checked at each phase
