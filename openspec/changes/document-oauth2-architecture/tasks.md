# Tasks: Document OAuth2 Architecture

## Phase 1: Architecture Documentation (2 hours)

### 1.1 Create OAuth2 Flow Diagram
- [ ] **Task 1.1.1**: Create Mermaid sequence diagram for OAuth2 flow
  - User clicks "Login with Discord" button
  - Frontend redirects to `/auth/discord`
  - Backend redirects to Discord OAuth portal
  - User authorizes application
  - Discord redirects to `/auth/discord/callback` with authorization code
  - Backend exchanges code for access token
  - Backend fetches user profile from Discord API
  - Backend creates session in MongoDB (connect-mongo)
  - Backend sets secure cookie and redirects to dashboard
- [ ] **Task 1.1.2**: Create component diagram showing architecture layers
  - Frontend Layer (React dashboard)
  - Express Middleware Layer (Passport.js, express-session)
  - Passport Strategy Layer (Discord OAuth2 Strategy)
  - Session Store Layer (connect-mongo + MongoDB)
  - External Services (Discord API, MongoDB)
- [ ] **Validation**: Diagrams reviewed by technical lead

### 1.2 Document Authentication Flow
- [ ] **Task 1.2.1**: Document authorization request phase
  - File reference: `src/routes/auth.js` (GET /auth/discord)
  - Passport.js `authenticate('discord')` method
  - OAuth2 scopes requested: `identify`, `email`, `guilds`
  - State parameter generation for CSRF protection
- [ ] **Task 1.2.2**: Document callback handling phase
  - File reference: `src/routes/auth.js` (GET /auth/discord/callback)
  - Token exchange with Discord API
  - User profile retrieval
  - Session creation logic
- [ ] **Task 1.2.3**: Document session management
  - File reference: `server.js` (express-session configuration)
  - Session store: connect-mongo configuration
  - Cookie options: httpOnly, secure, sameSite, maxAge (7 days)
  - Trust proxy settings for Railway/Heroku
- [ ] **Task 1.2.4**: Map code references to architecture components
  - Create table: Component → File Path → Key Functions
  - Example: "OAuth Strategy" → `src/config/passport.js` → `passport.use(new DiscordStrategy(...))`
- [ ] **Validation**: All file references validated (files exist, functions present)

### 1.3 Document Passport.js Integration
- [ ] **Task 1.3.1**: Document Passport strategy configuration
  - File reference: `src/config/passport.js`
  - DiscordStrategy options: clientID, clientSecret, callbackURL
  - Verify callback function: user profile processing
  - Serialize/deserialize user functions
- [ ] **Task 1.3.2**: Document session serialization
  - User ID serialization to session store
  - Deserialization from MongoDB on subsequent requests
  - Performance considerations (caching user lookups)
- [ ] **Validation**: Code walkthrough confirms documentation accuracy

## Phase 2: Integration & Security Guides (1.5 hours)

### 2.1 Document Broker Adapter Pattern
- [ ] **Task 2.1.1**: Document base adapter interface
  - File reference: `src/brokers/adapters/base.js` (or equivalent)
  - Abstract methods: `connect()`, `executeTrade()`, `getBalance()`, `getPositions()`
  - Common patterns: error handling, rate limiting, API key management
- [ ] **Task 2.1.2**: Document factory pattern
  - File reference: `src/brokers/factory.js` (or equivalent)
  - Broker instantiation logic
  - Configuration injection
  - Adapter selection based on user preferences
- [ ] **Task 2.1.3**: Create adapter implementation guide
  - How to add new broker adapter
  - Required methods to implement
  - Testing checklist
- [ ] **Validation**: Sample adapter creation walkthrough successful

### 2.2 Create Broker-Specific Integration Guides
- [ ] **Task 2.2.1**: Document Alpaca integration
  - Environment variables: ALPACA_PAPER_KEY, ALPACA_PAPER_SECRET, ALPACA_LIVE_KEY, ALPACA_LIVE_SECRET
  - File reference: `src/brokers/adapters/AlpacaAdapter.js` (or CCXT equivalent)
  - API rate limits: 200 requests/minute
  - Paper trading vs live trading configuration
  - Common errors: "Account not approved for trading", "Insufficient buying power"
- [ ] **Task 2.2.2**: Document Binance integration
  - Environment variables: BINANCE_API_KEY, BINANCE_SECRET
  - CCXT-based adapter implementation
  - Rate limits: Weight-based system explanation
  - API key permissions required: "Spot Trading", "Enable Reading"
  - Common errors: "Invalid signature", "IP not whitelisted"
- [ ] **Task 2.2.3**: Document CCXT multi-exchange pattern
  - Supported exchanges: Coinbase Pro, Kraken, FTX (if applicable)
  - CCXT unified API benefits
  - Exchange-specific quirks and workarounds
  - Configuration examples per exchange
- [ ] **Validation**: Each integration guide tested by following step-by-step

### 2.3 Document Security Hardening Measures
- [ ] **Task 2.3.1**: Document API key encryption
  - Environment variable: ENCRYPTION_KEY
  - Encryption algorithm: AES-256-GCM (verify actual implementation)
  - File reference: Encryption middleware or utility
  - Key rotation strategy (planned/implemented)
  - Decryption on API call execution
- [ ] **Task 2.3.2**: Document session security
  - Session lifetime: 7 days (configurable via SESSION_MAX_AGE)
  - Secure cookie flags: httpOnly, secure (HTTPS only), sameSite (Lax/Strict)
  - Session invalidation on logout
  - Session hijacking prevention measures
- [ ] **Task 2.3.3**: Document Helmet security headers
  - File reference: `server.js` (Helmet middleware configuration)
  - Content Security Policy (CSP) rules
  - HTTP Strict Transport Security (HSTS) settings
  - X-Frame-Options, X-Content-Type-Options headers
  - Rationale for each security header
- [ ] **Task 2.3.4**: Document rate limiting
  - Express rate limiter configuration (per-route limits)
  - Rate-limiter-flexible for broker API throttling
  - Authentication endpoint limits: 5 requests/15 minutes
  - Trade execution limits: User-specific quotas
  - DDoS protection strategy
- [ ] **Task 2.3.5**: Create security checklist for production
  - [ ] HTTPS enforced (NODE_ENV=production)
  - [ ] Secure cookie flags enabled
  - [ ] Helmet configured with strict CSP
  - [ ] Rate limiting active on all public endpoints
  - [ ] API keys encrypted at rest
  - [ ] Session store secured (MongoDB authentication)
  - [ ] Trust proxy configured for Railway/Heroku
  - [ ] Environment secrets not committed to git
- [ ] **Validation**: Security checklist reviewed by security-conscious team member

## Phase 3: Troubleshooting & Review (30 minutes)

### 3.1 Create Troubleshooting Guide
- [ ] **Task 3.1.1**: Document "Invalid OAuth State" error
  - **Symptoms**: Callback fails with state mismatch error
  - **Root Cause**: Session not persisted between authorization request and callback
  - **Debugging Steps**:
    1. Check MongoDB connection status (connect-mongo logs)
    2. Verify `trust proxy` setting in express-session (Railway/Heroku deployments)
    3. Ensure HTTPS enforced in production (secure cookie requirement)
    4. Check browser cookie storage (Developer Tools → Application → Cookies)
  - **Solution**: Configure `trust proxy: 1` for Railway/Heroku deployments
- [ ] **Task 3.1.2**: Document "Discord API Error: Invalid Client" error
  - **Symptoms**: Token exchange fails during callback
  - **Root Cause**: Incorrect DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET
  - **Debugging Steps**:
    1. Verify credentials in Discord Developer Portal
    2. Check `.env` file loaded correctly (log `process.env.DISCORD_CLIENT_ID`)
    3. Ensure redirect URI matches registered callback URL
    4. Verify no trailing slashes in callback URL configuration
  - **Solution**: Update environment variables and restart server
- [ ] **Task 3.1.3**: Document "Session Not Found" error
  - **Symptoms**: User logged out unexpectedly or 401 errors
  - **Root Cause**: Session expired or MongoDB connection lost
  - **Debugging Steps**:
    1. Check session TTL (default 7 days)
    2. Verify MongoDB connection stable (no network issues)
    3. Check connect-mongo logs for errors
    4. Inspect session collection in MongoDB
  - **Solution**: Reconnect MongoDB or extend session lifetime
- [ ] **Task 3.1.4**: Document "Broker Connection Failed" error
  - **Symptoms**: API key validation fails when connecting broker
  - **Root Cause**: Encryption key mismatch, invalid API keys, or rate limit exhaustion
  - **Debugging Steps**:
    1. Verify ENCRYPTION_KEY matches production value (for decryption)
    2. Test API keys directly using broker's API (curl or Postman)
    3. Check broker dashboard for API key status (revoked, expired)
    4. Review rate limit headers in API responses
    5. Check broker-specific error codes (e.g., Alpaca 40310001)
  - **Solution**: Update API keys, verify encryption key, or wait for rate limit reset
- [ ] **Task 3.1.5**: Document "CORS Errors" during OAuth flow
  - **Symptoms**: Browser blocks callback due to CORS policy
  - **Root Cause**: Frontend and backend on different domains without proper CORS config
  - **Debugging Steps**:
    1. Check CORS middleware configuration in `server.js`
    2. Verify `Access-Control-Allow-Origin` header in responses
    3. Ensure credentials: true for cookie-based auth
  - **Solution**: Configure CORS to allow frontend origin with credentials
- [ ] **Task 3.1.6**: Document "Cookie Not Set" error
  - **Symptoms**: Dashboard shows logged out despite successful OAuth
  - **Root Cause**: Secure cookie flag without HTTPS, or sameSite policy blocking
  - **Debugging Steps**:
    1. Verify HTTPS in production (secure cookie requirement)
    2. Check sameSite cookie attribute (Lax vs Strict vs None)
    3. Inspect browser Developer Tools → Network → Response Headers
  - **Solution**: Use HTTPS in production, adjust sameSite policy if needed
- [ ] **Task 3.1.7**: Add debugging tips section
  - Enable debug logs: `DEBUG=passport:*` environment variable
  - Inspect session data in MongoDB: `db.sessions.find()`
  - Check Express logs for authentication middleware errors
  - Use Postman to test OAuth flow manually
  - Browser Developer Tools → Network tab for callback inspection
- [ ] **Validation**: Each troubleshooting entry tested against known issue

### 3.2 Review and Finalize Documentation
- [ ] **Task 3.2.1**: Cross-reference all file paths
  - Verify each referenced file exists in codebase
  - Check function names and line numbers accurate
  - Update references if code has moved/refactored
- [ ] **Task 3.2.2**: Add "Last Updated" metadata
  - Add date to top of each documentation file
  - Include version or commit hash reference
  - Plan for quarterly documentation reviews
- [ ] **Task 3.2.3**: Create documentation index/table of contents
  - Link to architecture diagram
  - Link to integration guides
  - Link to security checklist
  - Link to troubleshooting guide
- [ ] **Task 3.2.4**: Peer review documentation
  - Share with team member unfamiliar with OAuth2 implementation
  - Collect feedback on clarity and completeness
  - Incorporate feedback and revise
- [ ] **Validation**: Documentation peer-reviewed and approved

### 3.3 Integration with Project Documentation
- [ ] **Task 3.3.1**: Update main README.md with OAuth2 documentation link
- [ ] **Task 3.3.2**: Add link to `openspec/project.md` under "Authentication" section
- [ ] **Task 3.3.3**: Create quick start guide for new developers
  - Set up Discord OAuth2 application
  - Configure environment variables
  - Test authentication flow locally
- [ ] **Validation**: New developer can follow guide successfully

## Success Criteria Checklist

- [ ] OAuth2 architecture diagram created and clear
- [ ] Authentication flow documented with code references
- [ ] Broker integration guide complete (Alpaca, Binance, CCXT)
- [ ] API key encryption/storage patterns documented
- [ ] Session management configuration documented
- [ ] Security hardening checklist complete
- [ ] Troubleshooting guide covers 10+ common issues
- [ ] Documentation reviewed by at least one team member
- [ ] All code references validated (files exist, functions accurate)

## Effort Estimate

**Total**: 4 hours

- Architecture documentation: 2 hours
- Integration & security guides: 1.5 hours
- Troubleshooting & review: 30 minutes
