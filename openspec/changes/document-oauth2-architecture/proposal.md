# Proposal: Document OAuth2 Architecture

## Status: ✅ COMPLETE
- **Implementation Date**: Previous session
- **Documentation**: docs/OAUTH2_SETUP.md

## Summary

Create comprehensive documentation for the Discord OAuth2 authentication system, broker integration patterns, security hardening measures, and troubleshooting guides. This is a **P0 CRITICAL DOCUMENTATION** requirement for team onboarding and production maintenance.

## Implementation Evidence
- **Documentation**: docs/OAUTH2_SETUP.md (comprehensive OAuth2 guide)

## Motivation

### Current State: Undocumented OAuth2 System
- OAuth2 authentication fully implemented and working in production
- Discord OAuth2 integration with Passport.js complete
- Broker API key management and encryption functioning
- Security patterns (session management, cookie security) operational
- **Zero comprehensive documentation** for team members and maintainers

### Problems with Current Approach
1. **Team Onboarding Friction**: New developers must reverse-engineer OAuth2 flow from code
2. **Maintenance Risk**: Security patterns not explicitly documented, increasing vulnerability to regressions
3. **Troubleshooting Complexity**: No guide for debugging OAuth failures, session issues, or broker connection problems
4. **Compliance Gap**: Security architecture undocumented, complicating security audits
5. **Knowledge Silos**: Critical authentication logic understood only by original implementer

### Desired State: Comprehensive OAuth2 Documentation
- **Architecture Diagrams**: Visual OAuth2 flow (authorization, token exchange, session creation)
- **Integration Guides**: Step-by-step broker connection setup (Alpaca, Binance, CCXT adapters)
- **Security Hardening Documentation**: Encryption practices, session security, cookie policies, API key storage
- **Troubleshooting Guides**: Common OAuth errors, debugging steps, recovery procedures
- **Code References**: Clear mapping of documentation to implementation files

### Benefits
1. **Reduced Onboarding Time**: New developers productive in hours, not days
2. **Security Confidence**: Explicit documentation of security measures enables better audits
3. **Faster Debugging**: Troubleshooting guides reduce mean-time-to-resolution (MTTR)
4. **Compliance Support**: Security documentation supports SOC2/PCI compliance efforts
5. **Knowledge Continuity**: Team can maintain and extend system without original developer

## Scope

### In Scope
- ✅ OAuth2 architecture diagram (Discord OAuth2 flow with Passport.js)
- ✅ Authentication flow documentation (login, callback, session creation)
- ✅ Broker integration guide (Alpaca, Binance, CCXT adapters)
- ✅ API key management documentation (encryption, storage, rotation)
- ✅ Session management patterns (express-session, connect-mongo, cookie security)
- ✅ Security hardening checklist (Helmet CSP, HSTS, secure cookies, CSRF protection)
- ✅ Troubleshooting guide (common errors, debugging steps, recovery procedures)
- ✅ Code reference mapping (documentation → implementation files)

### Out of Scope
- ❌ OAuth2 implementation changes (documentation only)
- ❌ New authentication providers (focus on existing Discord OAuth2)
- ❌ Authorization/RBAC documentation (separate from authentication)
- ❌ Frontend dashboard authentication UI documentation (covered separately)

## Technical Approach

### 1. Architecture Documentation

**OAuth2 Flow Diagram:**
```
User → Frontend → /auth/discord → Discord OAuth Portal
                                     ↓
                            Authorization Code
                                     ↓
Backend /auth/discord/callback → Token Exchange → Discord API
                                     ↓
                            User Profile Retrieval
                                     ↓
                        Session Creation (connect-mongo)
                                     ↓
                    Redirect to Dashboard (Secure Cookie)
```

**Documentation Structure:**
```markdown
## OAuth2 Architecture

### 1. OAuth2 Flow Overview
- Authorization request
- User consent
- Callback handling
- Token exchange
- Session establishment

### 2. Implementation Details
- File: `src/routes/auth.js`
- Passport Strategy: `src/config/passport.js`
- Session Store: `connect-mongo` in `server.js`
- Cookie Config: `express-session` options

### 3. Security Measures
- HTTPS enforcement (Helmet HSTS)
- Secure cookie flags (httpOnly, secure, sameSite)
- CSRF protection (session-based)
- Rate limiting on auth endpoints
```

### 2. Broker Integration Guide

**Structure:**
```markdown
## Broker Integration Patterns

### Adapter Pattern
- Base: `BrokerAdapter` (src/brokers/adapters/base.js)
- Factory: `BrokerFactory` (src/brokers/factory.js)

### Supported Brokers
1. Alpaca (Stocks/ETFs)
   - Setup: ALPACA_PAPER_KEY, ALPACA_PAPER_SECRET
   - Implementation: `src/brokers/adapters/AlpacaAdapter.js`
   - Rate Limits: 200 requests/minute

2. Binance (Crypto)
   - Setup: BINANCE_API_KEY, BINANCE_SECRET
   - Implementation: CCXT-based adapter
   - Rate Limits: Weight-based system

3. CCXT Multi-Exchange
   - Supported: Coinbase Pro, Kraken, etc.
   - Configuration: Exchange-specific credentials
```

### 3. Security Hardening Documentation

**Topics:**
- API Key Encryption (ENCRYPTION_KEY environment variable)
- Session Security (7-day lifetime, secure cookies)
- Helmet Configuration (CSP, HSTS, X-Frame-Options)
- Rate Limiting (express-rate-limit + rate-limiter-flexible)
- Environment-Based Security (NODE_ENV=production requirements)

### 4. Troubleshooting Guide

**Common Issues:**
```markdown
## Troubleshooting OAuth2

### Issue: "Invalid OAuth State"
**Symptoms:** Callback fails with state mismatch
**Root Cause:** Session not persisted between auth request and callback
**Solution:**
1. Verify MongoDB connection (connect-mongo store)
2. Check cookie settings (trust proxy for Railway/Heroku)
3. Ensure HTTPS in production

### Issue: "Discord API Error: Invalid Client"
**Symptoms:** Token exchange fails
**Root Cause:** Incorrect DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET
**Solution:**
1. Verify credentials in Discord Developer Portal
2. Check environment variables loaded correctly
3. Ensure redirect URI matches registered callback URL

### Issue: "Broker Connection Failed"
**Symptoms:** API key validation fails
**Root Cause:** Encryption key mismatch or invalid API keys
**Solution:**
1. Verify ENCRYPTION_KEY matches production value
2. Test API keys directly with broker's API
3. Check rate limit exhaustion
```

## Implementation Plan

### Phase 1: Architecture Documentation (2 hours)
1. Create OAuth2 flow diagram (Mermaid or ASCII art)
2. Document authentication sequence with code references
3. Map implementation files to architecture components

### Phase 2: Integration & Security Guides (1.5 hours)
1. Document broker adapter pattern
2. Create step-by-step integration guides per broker
3. Document security hardening measures (Helmet, cookies, encryption)

### Phase 3: Troubleshooting & Review (30 minutes)
1. Compile common OAuth2 errors and solutions
2. Add debugging checklists
3. Review documentation for completeness and accuracy

## Success Criteria

- [ ] OAuth2 architecture diagram created and clear
- [ ] Authentication flow documented with code references
- [ ] Broker integration guide complete (Alpaca, Binance, CCXT)
- [ ] API key encryption/storage patterns documented
- [ ] Session management configuration documented
- [ ] Security hardening checklist complete
- [ ] Troubleshooting guide covers 10+ common issues
- [ ] Documentation reviewed by at least one team member
- [ ] All code references validated (files exist, line numbers accurate)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Documentation becomes outdated | MEDIUM | Add "Last Updated" timestamps, link to code reviews |
| Code examples drift from implementation | MEDIUM | Use file references instead of code snippets where possible |
| Incomplete troubleshooting guide | LOW | Collect issues from production logs, iterate over time |
| Security details exposed | LOW | Document patterns, not secrets; reference .env.example |

## Dependencies

**Blocking**:
- New team member onboarding (blocked until documentation complete)

**Blocked By**:
- None (can document immediately based on existing implementation)

## Effort Estimate

**Total**: 4 hours (focused documentation work)

**Breakdown**:
- Architecture diagrams: 2 hours (OAuth2 flow, component relationships)
- Integration guides: 1.5 hours (broker setup, security patterns)
- Troubleshooting: 30 minutes (common errors, debugging steps)

## Rollback Plan

Not applicable (documentation-only change). If documentation is inaccurate:
1. Flag inaccuracies via GitHub issues
2. Update documentation to match actual implementation
3. No code changes required
