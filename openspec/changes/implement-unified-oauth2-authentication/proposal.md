# Proposal: Implement Unified OAuth2 Authentication System

## Overview
Implement a comprehensive OAuth2 authentication infrastructure that standardizes OAuth2 flows across all supported brokers and adds OAuth2 support to additional broker integrations (IBKR, TD Ameritrade, E*TRADE).

## Motivation

### Current State
- **Fragmented OAuth2 Implementation**: Alpaca and Schwab have partial OAuth2 support, but implementation is inconsistent
- **Missing OAuth2 Support**: IBKR, TD Ameritrade, and E*TRADE support OAuth2 but aren't implemented
- **No Token Refresh Automation**: Manual token refresh required, leading to authentication failures
- **Inconsistent UI**: No unified OAuth2 connection flow across brokers
- **Security Gaps**: API keys stored permanently vs. OAuth2 tokens with expiration

### Business Impact
- **User Friction**: Complex, broker-specific authentication flows reduce conversion
- **Security Risk**: Long-lived API keys more vulnerable than short-lived OAuth2 tokens
- **Maintenance Burden**: Duplicated OAuth2 logic across broker adapters
- **Limited Broker Support**: Can't integrate OAuth2-only brokers (Schwab requires OAuth2)

## Goals

### Primary Objectives
1. **Unified OAuth2 Service**: Centralized OAuth2 flow management for all brokers
2. **Broker OAuth2 Integration**: Add OAuth2 to IBKR, TD Ameritrade, E*TRADE
3. **Automatic Token Refresh**: Background token renewal before expiration
4. **Consistent UI/UX**: Unified OAuth2 connection experience across all brokers

### Success Metrics
- 100% OAuth2 coverage for brokers that support it
- <5 second OAuth2 flow completion time
- 0% authentication failures due to expired tokens (auto-refresh)
- Single OAuth2 codebase shared across all broker adapters

## Scope

### In Scope
- **OAuth2 Service** (`src/services/OAuth2Service.js`)
  - Authorization URL generation
  - Token exchange (authorization code → access token)
  - Token refresh automation
  - Token storage (encrypted in User model)

- **Broker OAuth2 Integrations**
  - Interactive Brokers (IBKR) OAuth2 adapter
  - TD Ameritrade OAuth2 adapter
  - E*TRADE OAuth2 adapter
  - Standardize existing Alpaca/Schwab OAuth2

- **OAuth2 UI Components**
  - Unified "Connect with OAuth2" button
  - OAuth2 callback handler page
  - Token status indicators
  - Re-authentication prompts

- **Token Refresh Automation**
  - Background job for token renewal
  - Webhook notifications before expiration
  - Automatic re-authentication flow

### Out of Scope
- OAuth2 for brokers that don't support it (Moomoo, Binance, Kraken via API keys)
- OAuth2 for Discord/Stripe (existing implementations)
- Multi-user OAuth2 delegation (enterprise feature)
- Custom OAuth2 scopes beyond trading + account read

## Dependencies

### External Dependencies
- Broker OAuth2 documentation:
  - IBKR: https://www.interactivebrokers.com/en/trading/oauth.php
  - TD Ameritrade: https://developer.tdameritrade.com/authentication/apis
  - E*TRADE: https://developer.etrade.com/home

### Internal Dependencies
- **User Model** (`src/models/User.js`): Add `oauthTokens` field (Map of broker → token data)
- **BrokerFactory** (`src/brokers/BrokerFactory.js`): OAuth2 broker detection
- **Dashboard** (`src/dashboard`): OAuth2 UI components integration
- **Environment Variables**: OAuth2 client credentials per broker

### Blocking Issues
- None identified - all brokers have public OAuth2 APIs

## Risks & Mitigations

### Technical Risks

**Risk**: OAuth2 callback URL changes break existing integrations
- **Mitigation**: Use single `/auth/broker/callback` endpoint with state parameter for broker routing
- **Mitigation**: Maintain backward compatibility with existing Alpaca OAuth2 URLs

**Risk**: Token refresh failures during broker outages
- **Mitigation**: Exponential backoff retry logic
- **Mitigation**: Email notifications to users for manual re-authentication

**Risk**: OAuth2 scope differences across brokers
- **Mitigation**: Broker-specific scope mapping in OAuth2Service
- **Mitigation**: Document minimum required scopes per broker

### Security Risks

**Risk**: OAuth2 state parameter forgery (CSRF attacks)
- **Mitigation**: Cryptographically random state generation
- **Mitigation**: State validation on callback with 5-minute expiration

**Risk**: Refresh token theft from database
- **Mitigation**: Encrypt refresh tokens at rest using ENCRYPTION_KEY
- **Mitigation**: Rotate refresh tokens on each use (if broker supports)

### Business Risks

**Risk**: OAuth2 app approval delays from brokers
- **Mitigation**: Apply for OAuth2 apps early (parallel to development)
- **Mitigation**: Use sandbox environments for initial testing

## Alternatives Considered

### Alternative 1: Keep Per-Broker OAuth2 Implementations
- **Rejected**: Duplicated code, inconsistent UX, maintenance burden
- **Analysis**: Current approach already showing pain points with Alpaca/Schwab differences

### Alternative 2: Use Third-Party OAuth2 Library (e.g., Passport OAuth2 Strategy)
- **Rejected**: Adds dependency, over-engineered for our needs
- **Analysis**: Custom OAuth2Service provides better broker-specific control

### Alternative 3: Client-Side OAuth2 Flow (Implicit Grant)
- **Rejected**: Less secure (tokens in browser), deprecated by OAuth2.1
- **Analysis**: Authorization Code flow with PKCE is modern standard

## Related Changes
- `implement-broker-integrations`: Depends on this for IBKR/TD Ameritrade/E*TRADE OAuth2
- `implement-analytics-platform`: Uses OAuth2 tokens for broker connection metrics

## Open Questions
1. **Token Storage Location**: MongoDB User model vs. separate OAuth2Tokens collection?
   - **Recommendation**: User model (simpler, matches existing API key pattern)

2. **Refresh Token Rotation**: Should we rotate refresh tokens on every use?
   - **Recommendation**: Yes, if broker supports it (better security)

3. **OAuth2 Callback Timeout**: How long to wait for user authorization?
   - **Recommendation**: 10 minutes, then show "Authorization timed out" message

4. **Multi-Broker OAuth2**: Can users connect multiple brokers simultaneously?
   - **Recommendation**: Yes, stored as `oauthTokens: Map<brokerKey, tokenData>`

## Next Steps
1. Review and approve this proposal
2. Finalize architectural decisions in `design.md`
3. Create detailed spec deltas for each capability
4. Implement in phases:
   - Phase 1: OAuth2Service + Alpaca/Schwab standardization
   - Phase 2: IBKR OAuth2 integration
   - Phase 3: TD Ameritrade OAuth2 integration
   - Phase 4: E*TRADE OAuth2 integration
   - Phase 5: Token refresh automation + UI components
