# Discord Trade Executor SaaS Constitution

<!--
Sync Impact Report - Constitution Update
=====================================
Version Change: N/A → 1.0.0 (Initial ratification)
Modified Principles: N/A (Initial version)
Added Sections: All (Initial version)
Removed Sections: None

Templates Status:
✅ .specify/templates/plan-template.md - Reviewed, aligned with constitution principles
✅ .specify/templates/spec-template.md - Reviewed, aligned with constitution principles
✅ .specify/templates/tasks-template.md - Reviewed, aligned with constitution principles
⚠ .specify/templates/commands/*.md - No command templates found (expected location empty)

Follow-up TODOs: None
-->

## Core Principles

### I. Security-First Development (NON-NEGOTIABLE)

All features MUST prioritize security before functionality. This means:
- AES-256-GCM encryption for all sensitive data (API keys, secrets, credentials)
- Input validation and sanitization on ALL user inputs to prevent XSS, NoSQL injection, and prototype pollution
- OAuth2-based authentication with secure session management (HttpOnly cookies, SameSite protection)
- Rate limiting on ALL endpoints to prevent brute force and DDoS attacks
- Security headers via Helmet.js with strict CSP policies
- OWASP Top 10 compliance verified before ANY production deployment
- API key permissions MUST be validated (read/trade only, NEVER withdrawal permissions)
- Encrypted data NEVER logged in plain text

**Rationale**: Financial platforms handling user funds and API keys are prime targets for attacks. A single security breach destroys user trust and exposes the business to catastrophic liability. Security cannot be retrofitted—it must be built in from day one.

### II. Test-First for Critical Paths (NON-NEGOTIABLE)

Test-Driven Development is MANDATORY for:
- Financial operations (trade execution, position sizing, stop-loss calculations)
- Security features (encryption, authentication, authorization, input validation)
- Billing and subscription management (payment processing, usage tracking, tier enforcement)
- Integration points (broker APIs, payment webhooks, Discord events)

Tests MUST be written FIRST, user-approved, confirmed to FAIL, then implementation proceeds following Red-Green-Refactor cycle.

Non-critical features (UI polish, analytics dashboards, documentation) MAY use test-after approach if time-constrained.

**Rationale**: Financial errors lose real money. Security bugs expose user funds. Billing bugs cost revenue. These critical paths demand verification before a single line of implementation code is written. Tests for these areas serve as executable specifications and prevent catastrophic regressions.

### III. Broker Abstraction & Adapter Pattern

All broker integrations MUST use the standardized adapter pattern:
- Base interface: `BrokerAdapter` defines contract (15 methods: connect, disconnect, executeOrder, etc.)
- Factory: `BrokerFactory` instantiates adapters based on broker type
- Implementations: Individual adapters per broker (Alpaca, Interactive Brokers, Schwab, Binance, etc.)
- Rate limiting: Each adapter MUST implement broker-specific rate limits with automatic throttling
- Error handling: Standardized error codes and retry logic across all brokers
- Paper trading: ALL brokers MUST support sandbox/testnet mode for risk-free testing

New broker integrations MUST NOT bypass the adapter pattern. Direct API calls in application code are prohibited.

**Rationale**: The SaaS supports multiple brokers with vastly different APIs, rate limits, and error behaviors. The adapter pattern isolates broker-specific complexity, enables easy broker additions, ensures consistent error handling, and allows seamless switching between brokers without touching business logic.

### IV. Real-Time Communication Standards

WebSocket infrastructure MUST adhere to these requirements:
- Socket.IO for bidirectional communication with Redis adapter for horizontal scaling
- Automatic reconnection with exponential backoff (max 5 attempts)
- JWT-based authentication for socket connections
- Room-based isolation (user-specific rooms prevent cross-user data leakage)
- Heartbeat/ping-pong mechanism for connection health monitoring
- Graceful degradation: System MUST function without WebSocket if connections fail (poll fallback)
- Message throttling: Maximum 10 messages/second per user to prevent abuse
- Connection limits: Maximum 1000 concurrent connections per instance (scale horizontally beyond)

**Rationale**: Real-time portfolio updates and trade notifications are core UX differentiators. Poor WebSocket implementation leads to stale data, missed notifications, and user frustration. Proper architecture ensures scalability (1000+ concurrent users), reliability (auto-reconnect), and security (JWT auth, room isolation).

### V. API-First Design with Provider Abstraction

External service integrations MUST use the provider pattern:
- Base interface: Abstract provider class defining contract (e.g., `BillingProvider` with 9 methods)
- Factory: Provider factory selects implementation via environment variable (e.g., `BILLING_PROVIDER=polar`)
- Implementations: Multiple providers supported (Polar.sh, Stripe for billing; Discord OAuth2, JWT for auth)
- Data normalization: Provider-specific formats converted to unified internal models
- Webhook security: HMAC-SHA256 signature verification with timing-safe comparison
- Mock support: Development mode MUST work with mock providers (no external API dependency)

This pattern applies to:
- Billing providers (`BillingProvider`, `BillingProviderFactory`)
- Authentication providers (Discord OAuth2 primary, extensible to others)
- Exchange/broker APIs (handled by broker adapters)
- Marketing automation platforms (Twitter, Reddit APIs)

**Rationale**: Provider lock-in is a business risk. The billing provider abstraction allows switching from Polar.sh to Stripe without rewriting business logic. Unified interfaces simplify testing (mock providers), reduce external dependencies, and enable multi-provider support for user choice.

### VI. Observability & Operational Transparency

Production systems MUST have:
- Structured logging via Winston with severity levels (error, warn, info, debug)
- Request logging for ALL API calls with sanitized payloads (NO sensitive data logged)
- Error tracking with context (user ID, operation, timestamp, stack trace)
- Performance monitoring (response times, database query durations, external API latency)
- Health check endpoints (`/health`, `/health/deep`) for uptime monitoring
- Metrics collection for business KPIs (trades executed, revenue, active users, subscription churn)
- Audit logs for financial operations (trades, withdrawals, refunds) with immutable storage

Logs MUST NOT contain: API keys, encryption keys, passwords, session tokens, or PII beyond user IDs.

**Rationale**: "You can't fix what you can't see." Production issues in financial systems are urgent. Comprehensive observability enables rapid debugging, performance optimization, security incident response, and business intelligence. Proper log sanitization ensures compliance with security requirements.

### VII. Graceful Error Handling & User Communication

Error handling MUST follow these principles:
- User-facing errors: Generic, actionable messages ("Your API key is invalid. Please check and try again.")
- Internal errors: Detailed logs with full context for debugging
- NEVER expose: Stack traces, internal paths, database queries, or system architecture to users
- Retry logic: Transient failures (network timeouts, rate limits) automatically retried with exponential backoff
- Fallback behavior: System degrades gracefully (e.g., if real-time updates fail, fall back to polling)
- User notifications: Critical errors (trade failures) sent via Discord DM and dashboard notifications

HTTP status codes MUST be semantically correct:
- 400: Client errors (validation failures, invalid requests)
- 401: Unauthenticated (missing/invalid session)
- 403: Unauthorized (insufficient permissions)
- 429: Rate limited
- 500: Server errors (unexpected failures)
- 503: Service unavailable (maintenance, overload)

**Rationale**: Poor error handling frustrates users and complicates debugging. Generic user messages prevent information disclosure attacks while detailed internal logs enable rapid troubleshooting. Proper HTTP status codes enable client-side error handling and API debugging.

## Additional Constraints

### Technology Stack Requirements

**Backend** (Node.js >=22.11.0):
- Express.js for API framework
- MongoDB with Mongoose ODM for data persistence
- Discord.js for Discord integration
- CCXT for crypto exchange integration
- Alpaca API for stock trading
- Natural.js for NLP signal parsing
- Passport.js for authentication
- Winston for logging
- Jest for unit testing
- Playwright for E2E testing

**Frontend** (React 19.2.0):
- Vite for build tooling
- TailwindCSS for styling
- Radix UI for accessible components
- shadcn/ui component patterns
- React Hook Form for forms
- Recharts for data visualization
- Socket.IO client for real-time updates

**Infrastructure**:
- Railway for deployment and hosting
- MongoDB Atlas for production database
- Redis (Railway addon) for session store and WebSocket scaling
- GitHub Actions for CI/CD (optional)

**Rationale**: These technologies are proven, well-documented, and actively maintained. The stack balances developer productivity with production reliability. Deviations require architecture review and migration plan approval.

### Performance Standards

The system MUST meet these performance benchmarks:

| Metric                           | Target             | Critical Path                      |
| -------------------------------- | ------------------ | ---------------------------------- |
| Trade execution latency          | <500ms p95         | Signal received → Order placed     |
| API response time                | <200ms p95         | Dashboard data endpoints           |
| WebSocket message delivery       | <100ms p95         | Trade notification → User receipt  |
| Database query time              | <50ms p95          | User data, portfolio queries       |
| Page load time                   | <3s p95            | Dashboard initial load             |
| Concurrent WebSocket connections | 1000+ per instance | Horizontal scaling required beyond |
| API rate limit headroom          | 50% buffer         | Broker API calls vs. rate limit    |

Performance degradation beyond these thresholds MUST trigger alerts and investigation.

**Rationale**: Trading platforms compete on speed. Slow trade execution costs users money (slippage). Slow dashboards frustrate users. These benchmarks ensure competitive UX while remaining achievable with the chosen stack.

### Security Compliance

The system MUST maintain OWASP Top 10 compliance:

| OWASP Risk                     | Mitigation                                              | Verification                                |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| A01: Broken Access Control     | Authentication middleware + role-based authorization    | Security tests + manual penetration testing |
| A02: Cryptographic Failures    | AES-256-GCM encryption + secure key storage             | Encryption tests + key rotation audit       |
| A03: Injection                 | Input validation + sanitization + parameterized queries | Validation tests + fuzzing                  |
| A04: Insecure Design           | Security-first architecture + threat modeling           | Architecture review + constitution check    |
| A05: Security Misconfiguration | Helmet headers + secure defaults + config validation    | Deployment checklist + automated scans      |
| A06: Vulnerable Components     | Dependency scanning + automated updates                 | `npm audit` in CI/CD                        |
| A07: Authentication Failures   | OAuth2 + rate limiting + session management             | Auth tests + brute force simulation         |
| A08: Data Integrity Failures   | HMAC verification + authentication tags                 | Webhook tests + tamper detection            |
| A09: Logging Failures          | Structured logging + audit trails                       | Log coverage review                         |
| A10: SSRF                      | URL validation + localhost blocking                     | SSRF attack simulation                      |

Security audit MUST be performed before production launch and annually thereafter.

**Rationale**: Financial platforms are high-value targets. OWASP Top 10 represents the most critical web application risks. Compliance is non-negotiable for protecting user funds and maintaining platform integrity.

## Development Workflow

### Feature Development Process

1. **Specification** (`/specs/[###-feature]/spec.md`):
   - Define user stories with priorities (P1, P2, P3)
   - Each story MUST be independently testable
   - Acceptance criteria in Given/When/Then format
   - Success metrics defined

2. **Planning** (`/specs/[###-feature]/plan.md`):
   - Constitution check (verify compliance before proceeding)
   - Technical context (languages, dependencies, performance goals)
   - Project structure (source layout, test organization)
   - Complexity justification (if violating simplicity principles)

3. **Research & Design** (Phase 0-1):
   - `research.md`: Technology evaluation, library selection
   - `data-model.md`: Entity definitions, relationships, constraints
   - `contracts/`: API contracts, endpoint specifications
   - `quickstart.md`: Developer onboarding guide

4. **Task Breakdown** (`/specs/[###-feature]/tasks.md`):
   - Tasks organized by user story (enables independent development)
   - Test tasks FIRST (for critical paths per Principle II)
   - Parallel tasks marked `[P]` (different files, no dependencies)
   - Dependencies documented (prerequisite tasks, blocking operations)

5. **Implementation**:
   - Feature branch: `###-feature-name`
   - Commit after each task or logical group
   - Stop at checkpoints to validate story independently
   - Red-Green-Refactor for critical paths

6. **Review & Merge**:
   - Constitution compliance verification
   - Security review (encryption, validation, authorization)
   - Performance benchmarks met
   - Test coverage >80% for critical paths
   - Conventional commits (e.g., `feat: add risk module`)

### Code Review Requirements

ALL pull requests MUST verify:
- [ ] Constitution compliance (principles followed, constraints met)
- [ ] Security checklist passed (no hardcoded secrets, inputs validated, encryption used)
- [ ] Tests written FIRST for critical paths (financial, security, billing)
- [ ] Test coverage >80% for new critical code
- [ ] Performance benchmarks met (if applicable)
- [ ] Error handling implemented (user messages + internal logs)
- [ ] Documentation updated (API docs, README, architecture diagrams)
- [ ] No linter warnings (`npx eslint src/ --fix` run)
- [ ] Conventional commit format
- [ ] References issue number (`Closes #123`)

### Quality Gates

**Pre-Merge** (automated CI/CD):
- [ ] All tests pass (`npm test`)
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Linter passes (ESLint)
- [ ] Build succeeds (`npm run build`)

**Pre-Deployment** (manual checklist):
- [ ] Constitution compliance verified
- [ ] Security audit completed (if new security-relevant code)
- [ ] Performance benchmarks met (if performance-critical)
- [ ] Smoke tests passed on staging environment
- [ ] Database migrations tested (if schema changes)
- [ ] Rollback plan documented

**Post-Deployment** (monitoring):
- [ ] Health checks passing (`/health`, `/health/deep`)
- [ ] Error rate <1% (24-hour window)
- [ ] Performance metrics within targets
- [ ] No security incidents reported
- [ ] User-facing errors investigated and resolved

## Governance

### Constitutional Authority

This constitution supersedes all other development practices, coding guidelines, and architectural decisions. When conflicts arise between this document and other sources (README, code comments, informal agreements), this constitution takes precedence.

### Amendment Process

Constitution amendments require:

1. **Proposal**: Written proposal documenting:
   - Specific change (principle addition/removal/modification)
   - Rationale (why change is needed)
   - Impact analysis (affected templates, existing code)
   - Migration plan (how to bring codebase into compliance)

2. **Review**: Technical review by project maintainers:
   - Alignment with project goals
   - Impact on existing architecture
   - Complexity vs. benefit tradeoff

3. **Approval**: Consensus approval from maintainers

4. **Documentation**: Update constitution with:
   - Version bump (MAJOR for breaking changes, MINOR for additions, PATCH for clarifications)
   - Sync impact report (affected files, follow-up TODOs)
   - Updated ratification date

5. **Migration**: Execute migration plan to bring codebase into compliance

### Versioning Policy

Constitution versions follow semantic versioning:
- **MAJOR** (e.g., 1.0.0 → 2.0.0): Backward-incompatible governance changes, principle removals, or redefinitions requiring codebase refactoring
- **MINOR** (e.g., 1.0.0 → 1.1.0): New principles added or existing sections materially expanded without breaking changes
- **PATCH** (e.g., 1.0.0 → 1.0.1): Clarifications, wording improvements, typo fixes, non-semantic refinements

### Compliance Review

Constitution compliance MUST be verified:
- **Every PR**: Reviewer checks constitution adherence before approval
- **Quarterly**: Audit existing codebase for compliance drift
- **Before major releases**: Comprehensive constitutional review

Violations discovered in existing code MUST be:
1. Documented in GitHub issues with `constitution-violation` label
2. Prioritized based on principle severity (NON-NEGOTIABLE violations are P0)
3. Remediated within one sprint for critical violations, three sprints for non-critical

### Runtime Development Guidance

For day-to-day development guidance beyond this constitution, refer to:
- **Architecture Patterns**: `openspec/project.md` (tech stack, conventions, adapter patterns)
- **Repository Guidelines**: `AGENTS.md` (project structure, build commands, coding style)
- **Security Standards**: `SECURITY.md` (encryption, validation, authentication details)
- **Deployment Procedures**: `docs/DEPLOYMENT.md`, `docs/DEPLOY-NOW.md`

When guidance conflicts with this constitution, the constitution prevails.

---

**Version**: 1.0.0 | **Ratified**: 2025-10-21 | **Last Amended**: 2025-10-21
