# Tasks for Feature: Discord Trade Executor SaaS

Feature: `003-discord-trade-executor-main`  
Source: `spec.md`, `plan.md`, `research.md`  
Generated: 2025-10-22

---

## Phase 1 — Setup (Project initialization)

- [ ] T001 Initialize Node.js project workspace scaffolding (no story) — ensure `.env.example` present at `/.env.example` and `package.json` scripts include `dev`, `build`, `test`, `start`. File: `package.json`
- [ ] T002 [P] Create development Docker Compose for MongoDB + Redis + Local Railway-like env (parallelizable) — add `docker-compose.yml` at repo root
- [ ] T003 Create `src/config/env.js` to validate environment variables listed in `.env.example` (no story) — File: `src/config/env.js`
- [ ] T004 Create `src/config/database.js` to connect to MongoDB using `MONGODB_URI` (no story) — File: `src/config/database.js`
- [ ] T005 Create `src/config/redis.js` to connect to Redis using `REDIS_URL` (no story) — File: `src/config/redis.js`
- [ ] T006 [P] Add CI pipeline skeleton to run `npm test` and `npm run lint` on push/PR — add `.github/workflows/ci.yml`
- [ ] T007 Add `README.md` quickstart reference linking to `specs/003-discord-trade-executor-main/quickstart.md` (create stub) — File: `README.md`

---

## Phase 2 — Foundational (Blocking prerequisites)

- [ ] T008 Implement AES-256-GCM credential encryption utilities — File: `src/utils/encryption.js`
- [ ] T009 Implement JWT utilities and short TTL policy functions — File: `src/utils/jwt.js`
- [ ] T010 Implement Winston logger wrapper with structured JSON output — File: `src/middleware/logger.js`
- [ ] T011 Implement global error handler middleware (sanitized messages) — File: `src/middleware/errorHandler.js`
- [ ] T012 Implement request validation helper using Joi and connect into `src/middleware/validator.js` — File: `src/middleware/validator.js`
- [ ] T013 Create Mongoose base models for 6 core entities (User, BrokerConnection, Trade, Position, AuditLog, Subscription) — Files: `src/models/*.js`
- [ ] T014 [P] Add MongoDB indexes per data-model recommendations (parallelizable) — File: `scripts/db/create_indexes.js`
- [ ] T015 Implement append-only AuditLog service skeleton (write-only API) — File: `src/services/AuditLogService.js`
- [ ] T016 Add rate-limiter-flexible Redis-backed token bucket wrapper — File: `src/brokers/utils/RateLimiter.js`

---

## Phase 3 — User Story Phases (Priority order)

### US-001: Automated Trade Execution (P1)
Goal: Parse signals and submit orders via broker adapters with risk validation.
Independent test: Use paper trading Alpaca account; simulate Discord commands; verify executed orders logged in `auditLogs` and WebSocket event emitted.

- [ ] T017 [US1] Create Discord bot scaffold and signal parser `src/bot/discordBot.js`, `src/bot/signalParser.js` — File: `src/bot/discordBot.js`
- [ ] T018 [P] [US1] Implement `src/services/TradeExecutionService.js` core with placeholder `placeOrder()` calls to BrokerFactory — File: `src/services/TradeExecutionService.js`
- [ ] T019 [US1] Implement risk checks in `src/services/RiskManagementService.js` (position sizing, daily loss) — File: `src/services/RiskManagementService.js`
- [ ] T020 [US1] Create trades route `src/routes/trades.js` with POST `/api/v1/trades` and validation — File: `src/routes/trades.js`
- [ ] T021 [US1] Wire TradeExecutionService into route and audit logging — Files: `src/routes/trades.js`, `src/services/AuditLogService.js`
- [ ] T022 [US1] Implement integration test: `tests/integration/api/trades.test.js` (paper trading scenario) — File: `tests/integration/api/trades.test.js`

### US-002: Multi-Broker Integration (P1)
Goal: Provide BrokerAdapter base and at least Alpaca adapter working with test keys.
Independent test: Add Alpaca paper keys, place order, confirm audit log and brokerOrderId stored.

- [ ] T023 [US2] Implement `src/brokers/adapters/BrokerAdapter.js` base interface with methods listed in FR-011 — File: `src/brokers/adapters/BrokerAdapter.js`
- [ ] T024 [US2] Implement `src/brokers/adapters/AlpacaAdapter.js` using `@alpacahq/alpaca-trade-api` — File: `src/brokers/adapters/AlpacaAdapter.js`
- [ ] T025 [US2] Implement `src/brokers/BrokerFactory.js` to instantiate adapters by `brokerType` — File: `src/brokers/BrokerFactory.js`
- [ ] T026 [US2] Implement adapter error mapping `src/brokers/utils/ErrorMapper.js` — File: `src/brokers/utils/ErrorMapper.js`
- [ ] T027 [P] [US2] Unit tests for Alpaca adapter mocking network responses — File: `tests/unit/brokers/AlpacaAdapter.test.js`

### US-004: Unified OAuth2 Authentication (P1)
Goal: Implement Discord OAuth2 flow and token refresh mechanism.
Independent test: Login flow from browser, refresh token auto-renew before expiry.

- [ ] T028 [US4] Implement `src/routes/auth.js` with `/auth/discord` and `/auth/discord/callback` using Passport.js — File: `src/routes/auth.js`
- [ ] T029 [US4] Implement session storage (MongoDB sessions) and secure httpOnly cookie setup — File: `src/config/session.js`
- [ ] T030 [US4] Implement refresh token handler and auto-refresh logic middleware — File: `src/middleware/sessionRefresh.js`
- [ ] T031 [US4] Integration tests for OAuth2 flow `tests/integration/api/auth.test.js` (mock Discord OAuth) — File: `tests/integration/api/auth.test.js`

### US-006: Risk Management & Position Sizing (P1)
Goal: Implement core risk rules and position sizing.
Independent test: Send large trade; system reduces quantity to conform with max position size.

- [ ] T032 [US6] Implement `src/services/RiskManagementService.js` position sizing calculations — File: `src/services/RiskManagementService.js`
- [ ] T032a [US6] Implement daily loss limit circuit breaker with automatic position closure in RiskManagementService — File: `src/services/RiskManagementService.js`
- [ ] T033 [P] [US6] Unit tests for position sizing and daily loss enforcement — File: `tests/unit/services/RiskManagementService.test.js`

### US-007: Audit Logging & Compliance (P1)
Goal: Immutable audit logs append-only with cryptographic hashing.
Independent test: Write a trade event and verify `previousHash`/`currentHash` chaining and immutability (no delete/update allowed).

- [ ] T034 [US7] Implement `src/models/AuditLog.js` Mongoose schema with indexes and TTL — File: `src/models/AuditLog.js`
- [ ] T035 [US7] Implement `src/services/AuditLogService.js` write-only append API calculating SHA-256 chaining — File: `src/services/AuditLogService.js`
- [ ] T036 [US7] Add MongoDB role enforcement script `scripts/db/enforce_audit_rbac.js` to prevent deletes/updates — File: `scripts/db/enforce_audit_rbac.js`
- [ ] T037 [US7] Integration test for audit immutability `tests/integration/audit/auditlog.test.js` — File: `tests/integration/audit/auditlog.test.js`

### US-008: WebSocket JWT Authentication (P1)
Goal: Implement JWT validation on Socket.IO connection upgrade and token refresh events.
Independent test: Connect with valid token -> authorized; missing/expired token -> rejected.

- [ ] T038 [US8] Implement `src/websocket/socketServer.js` with Redis adapter and JWT connection middleware — File: `src/websocket/socketServer.js`
- [ ] T039 [US8] Implement `src/websocket/middleware/JWTAuthMiddleware.js` to validate tokens during upgrade — File: `src/websocket/middleware/JWTAuthMiddleware.js`
- [ ] T040 [US8] Integration tests: `tests/integration/websocket/jwt-auth.test.js` testing token.expiring flow — File: `tests/integration/websocket/jwt-auth.test.js`

### US-012: Subscription Billing & Tiered Plans (P1)
Goal: BillingProvider abstraction with Polar.sh implementation mocked for tests.
Independent test: Create subscription object, receive webhook `invoice.paid`, user's subscription status updated.

- [ ] T041 [US12] Implement `src/billing/providers/BillingProvider.js` abstract interface — File: `src/billing/providers/BillingProvider.js`
- [ ] T042 [US12] Implement `src/billing/providers/PolarProvider.js` wrapper (mockable) — File: `src/billing/providers/PolarProvider.js`
- [ ] T043 [US12] Implement billing webhooks handler `src/routes/webhooks.js` for billing events — File: `src/routes/webhooks.js`
- [ ] T044 [US12] Integration tests: `tests/integration/billing/webhooks.test.js` — File: `tests/integration/billing/webhooks.test.js`

### US-003: Real-Time Dashboard Updates (P2)
Goal: WebSocket handlers that emit portfolio/trade events to connected clients.
Independent test: Simulate trade fill -> `trade.filled` broadcasted to user sockets.

- [ ] T045 [US3] Implement `src/websocket/handlers/TradeHandler.js` to emit trade events — File: `src/websocket/handlers/TradeHandler.js`
- [ ] T046 [US3] Implement `src/websocket/handlers/PortfolioHandler.js` to emit portfolio updates — File: `src/websocket/handlers/PortfolioHandler.js`
- [ ] T047 [P] [US3] Frontend Socket.IO client hook `src/dashboard/services/websocket.js` to handle events (parallelizable) — File: `src/dashboard/services/websocket.js`
- [ ] T048 [US3] E2E Playwright test: `tests/e2e/trade-execution.spec.js` checks real-time update flow — File: `tests/e2e/trade-execution.spec.js`

### US-005: Analytics Platform & Business Intelligence (P2)
Goal: Implement MRR/ARR calculations and basic churn scoring pipeline (offline job initially).
Independent test: Seed subscriptions -> verify MRR/ARR values and churn scores generated.

- [ ] T049 [US5] Implement `src/services/AnalyticsService.js` with MRR/ARR functions — File: `src/services/AnalyticsService.js`
- [ ] T050 [US5] Implement baseline churn scorer script `scripts/analytics/churn_score.js` (batch job) — File: `scripts/analytics/churn_score.js`
- [ ] T051 [P] [US5] Unit tests for analytics calculations — File: `tests/unit/services/AnalyticsService.test.js`

### US-010, US-011, US-013 (P3/P3/P1) — Lower priority / infra
- [ ] T052 [US10] Create placeholder `src/brokers/adapters/BinanceAdapter.js` following the adapter contract (P3) — File: `src/brokers/adapters/BinanceAdapter.js`
- [ ] T053 [US11] Add data structures for social trading (followers/leaderboard) schema `src/models/SocialProfile.js` (P3) — File: `src/models/SocialProfile.js`
- [ ] T054 [US13] Prepare Railway deployment manifest `scripts/deploy/railway-deploy.sh` and health-check script `scripts/deployment/validate-websocket-deployment.js` (P1 infra) — Files: `scripts/deploy/railway-deploy.sh`, `scripts/deployment/validate-websocket-deployment.js`

---

## Final Phase — Polish & Cross-Cutting Concerns

- [ ] T055 Add Sentry integration for error tracking with environment toggle — File: `src/config/sentry.js`
- [ ] T055a [P] Test Sentry alerting by triggering uncaught exception in staging environment — File: `tests/integration/monitoring/sentry.test.js`
- [ ] T056 Add automated OWASP ZAP scan job to CI as an optional manual step (report generator) — File: `.github/workflows/zap-scan.yml`
- [ ] T057 Add DB migration runner `scripts/db/migrate.js` (skeleton) and document migration steps in `docs/DEPLOYMENT.md`
- [ ] T058 Finalize `specs/003-discord-trade-executor-main/quickstart.md` with local dev steps and test broker instructions — File: `specs/003-discord-trade-executor-main/quickstart.md`
- [ ] T059 Add tests coverage gating in CI requiring >95% for `src/auth/*` and `src/billing/*` when running on `main` branch — File: `.github/workflows/ci.yml`
- [ ] T059a Implement automated encryption key rotation cron job (January 1st annually) with backward-compatible decryption for previous 2 key versions — File: `src/services/KeyRotationService.js`

---

## Dependencies & Story Order

1. Foundational tasks (T008-T016) MUST complete before most US-* tasks that rely on encryption, audit logs, or config.
2. Authentication (T028-T031) should complete early—many stories (US-001, US-002, US-003) require authenticated user context.
3. Broker adapters (T023-T027) required before full trade submission (T018, T021).
4. WebSocket JWT auth (T038-T040) required for US-003 real-time flows before E2E tests.

## Parallel Execution Examples (per story)

- US-002 (Brokers): T024 (AlpacaAdapter) and T026 (ErrorMapper) are parallelizable; implement adapters for different brokers independently (mark as [P]).
- US-001 (TradeExecution): T018 (TradeExecutionService) and T019 (RiskManagementService) can be worked on in parallel across different engineers—both must integrate in T021.
- Frontend work (T047) can proceed in parallel with backend WebSocket handlers (T045/T046) once socket contracts are defined.

---

## Implementation Strategy

1. MVP-first: Implement US-001 (Automated Trade Execution) with a single broker (Alpaca) and paper trading accounts to demonstrate core value.
2. Test-First for critical paths: Implement tests for auth (T031), trade execution (T022), billing (T044) before production runs.
3. Iterative expansion: Add more brokers (US-002) after adapter pattern stable. Add analytics/social features as P2/P3.

---

## Metrics & Acceptance

- Total tasks: 62 (T001..T059, T032a, T055a, T059a)
- Tasks per story: US-001 (T017..T022: 6), US-002 (T023..T027: 5), US-004 (T028..T031:4), US-006 (T032, T032a, T033:3), US-007 (T034..T037:4), US-008 (T038..T040:3), US-012 (T041..T044:4), US-003 (T045..T048:4), US-005 (T049..T051:3), others (T052..T054:3), polish (T055, T055a, T056..T059, T059a:7)
- Parallel opportunities identified: 13 tasks marked with [P]

---

## Files Created

- `specs/003-discord-trade-executor-main/tasks.md` — This file (task breakdown)

---

## Notes

- All tasks follow the required checklist format and include file paths. Tasks are immediately actionable by an LLM or developer. If you want unit tests generated for each implementation task, say "TDD please" and I'll expand test tasks.

---

End of tasks.md
