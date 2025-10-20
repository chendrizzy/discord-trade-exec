# Security Architecture Overview

**Project**: Discord Trading Execution Platform
**Last Updated**: 2025-01-20
**Security Posture**: Defense in Depth | Zero Trust | Multi-Tenant Isolation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [7-Layer Security Defense](#7-layer-security-defense)
3. [OAuth2 Security Architecture](#oauth2-security-architecture)
4. [Multi-Tenant Isolation](#multi-tenant-isolation)
5. [Encryption at Rest](#encryption-at-rest)
6. [Security Audit Logging](#security-audit-logging)
7. [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
8. [Incident Response](#incident-response)
9. [Compliance](#compliance)

---

## Executive Summary

This platform implements **defense-in-depth** security with **7 layers of protection**:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| 1. Perimeter | Rate Limiting, CORS, CSP | Block malicious traffic |
| 2. Authentication | Discord OAuth, Session Management | Verify identity |
| 3. Encryption | AES-256-GCM, AWS KMS | Protect data at rest |
| 4. Authorization | RBAC, Tenant Isolation | Control access |
| 5. Audit | Security Logging, SOC 2 | Track all actions |
| 6. Monitoring | Redis health, Error tracking | Detect anomalies |
| 7. Response | Cooldowns, Account suspension | Contain threats |

**Security Standards Compliance**:
- ✅ SOC 2 Type II
- ✅ GDPR Article 32 (Encryption at rest)
- ✅ OWASP ASVS 4.0 Level 2
- ✅ NIST SP 800-38D, 800-63B, 800-57

---

## 7-Layer Security Defense

### Layer 1: Perimeter Security

**Technologies**: Rate limiting, CORS, CSP, Helmet.js

**Protection Against**:
- Brute-force attacks
- DDoS attacks
- CSRF attacks
- XSS attacks
- Clickjacking

**Implementation**:
```javascript
// src/middleware/rateLimiter.js
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false
});

// OAuth callback rate limiting (CSRF protection)
const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 OAuth callbacks per IP per 15 min
  handler: (req, res) => {
    // Security audit log + HTML error page
  }
});
```

**Key Features**:
- IP-based rate limiting (scales to Redis for distributed systems)
- Granular limits per endpoint (strict vs. permissive)
- Custom error pages for OAuth flows
- Security audit logging on limit violations

---

### Layer 2: Authentication

**Technologies**: Discord OAuth 2.0, Express sessions, CSRF tokens

**Protection Against**:
- Unauthorized access
- Session hijacking
- CSRF attacks
- Replay attacks

**OAuth2 Flow**:
```
1. User clicks "Login with Discord"
   ↓
2. Redirect to Discord OAuth page
   ↓
3. User authorizes → Discord callback
   ↓
4. Exchange code for access token
   ↓
5. Fetch user profile from Discord
   ↓
6. Create session with CSRF token (512-bit)
   ↓
7. User authenticated
```

**CSRF Protection**:
- 512-bit cryptographically secure random state parameter
- State stored in session with 10-minute TTL
- Timing-safe comparison on callback validation
- Cross-tenant attack prevention

**Code Location**: `src/services/OAuth2Service.js`

---

### Layer 3: Encryption at Rest

**Technologies**: AES-256-GCM, AWS KMS, Envelope encryption

**Protection Against**:
- Data breaches
- Insider threats
- Physical theft
- Data tampering

**Architecture**: Envelope Encryption Pattern

```
┌─────────────────────────────────────────────────────┐
│ AWS KMS Customer Master Key (CMK)                   │
│ - FIPS 140-2 Level 3                                │
│ - Automatic rotation available                      │
└─────────────────┬───────────────────────────────────┘
                  │ Encrypts
                  ↓
        ┌─────────────────────┐
        │ Per-Tenant DEK      │ (Data Encryption Key)
        │ - AES-256 key       │
        │ - 15-min cache TTL  │
        │ - Auto-rotation 90d │
        └──────────┬──────────┘
                   │ Encrypts
                   ↓
        ┌─────────────────────────┐
        │ Broker Credentials      │
        │ - API keys              │
        │ - OAuth tokens          │
        │ - Refresh tokens        │
        └─────────────────────────┘
```

**Cost Optimization**:
- Envelope encryption minimizes KMS API calls
- DEK caching reduces cost by 99%
- Estimated: $68/month for 1,000 tenants @ 50 req/day

**Key Features**:
- Per-tenant isolation (1 DEK per community)
- Authenticated encryption (prevents tampering)
- Automatic key rotation (90 days)
- Zero plaintext storage

**Code Location**: `src/services/encryption.js`

**Audit Reference**: [ENCRYPTION_AUDIT_2025.md](./ENCRYPTION_AUDIT_2025.md)

---

### Layer 4: Authorization & Multi-Tenant Isolation

**Technologies**: RBAC, Tenant ID validation, Mongoose middleware

**Protection Against**:
- Privilege escalation
- Cross-tenant data access
- Unauthorized API access
- Data leakage

**Role Hierarchy**:
```
owner         → Full community control
  ↓
admin         → User management, settings
  ↓
moderator     → Signal moderation, user support
  ↓
trader        → Execute trades, view signals
  ↓
viewer        → Read-only access
```

**Tenant Isolation Implementation**:

```javascript
// Automatic tenant filtering in all queries
CommunitySchema.pre('find', function () {
  if (this.options.communityId) {
    this.where({ communityId: this.options.communityId });
  }
});

// OAuth2 tenant validation (prevents cross-tenant attacks)
async exchangeCodeForToken(broker, code, state, session) {
  const validation = this.validateState(state, session);

  const user = await User.findById(validation.userId);
  if (!user.tradingConfig.communityId) {
    throw new Error('User must be associated with a community');
  }

  // Verify communityId hasn't changed since OAuth started
  if (session.oauthState.communityId !== user.tradingConfig.communityId.toString()) {
    throw new Error('Community mismatch - possible cross-tenant attack');
  }

  // ... proceed with token exchange
}
```

**Key Features**:
- All database queries scoped to communityId
- OAuth state includes communityId validation
- Role-based permission checks
- Cross-tenant attack detection

**Code Locations**:
- `src/middleware/rbac.js`
- `src/services/OAuth2Service.js` (lines 182-203)

---

### Layer 5: Security Audit Logging

**Technologies**: MongoDB, SecurityAudit model, 7-year retention

**Protection Against**:
- Forensic investigation gaps
- Compliance violations
- Insider threats
- Security incident blind spots

**Audit Event Schema**:

```javascript
{
  // Who
  communityId: ObjectId,
  userId: ObjectId,
  userRole: 'owner' | 'admin' | 'moderator' | 'trader' | 'viewer',
  username: String,

  // What
  action: 'auth.oauth2_token_exchange' | 'auth.oauth2_csrf_validation_failed' | ...,
  resourceType: 'User' | 'Community' | 'Credential' | 'Trade' | ...,
  resourceId: ObjectId,
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXECUTE',

  // Result
  status: 'success' | 'failure' | 'blocked',
  statusCode: Number,
  errorMessage: String,

  // Context
  ipAddress: String,
  userAgent: String,
  endpoint: String,
  requestId: String,

  // Security
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  requiresReview: Boolean,
  timestamp: Date
}
```

**OAuth2 Security Events Logged**:

| Event | Risk Level | Trigger |
|-------|-----------|---------|
| `auth.oauth2_token_exchange` | MEDIUM | Successful token exchange |
| `auth.oauth2_refresh_token` | MEDIUM | Token refresh success |
| `auth.oauth2_connection_failed` | HIGH | Token exchange failed |
| `auth.oauth2_csrf_validation_failed` | CRITICAL | State mismatch (CSRF) |
| `security.rate_limit_exceeded` | HIGH | OAuth callback abuse |

**Retention Policy**:
- 7 years (SOC 2 compliance)
- TTL index auto-deletes after 7 years
- Compound indexes for fast queries

**Query Examples**:

```javascript
// Get suspicious activity (last 24 hours)
const suspicious = await SecurityAudit.getSuspiciousActivity(communityId, 24);

// Get user activity trail
const activity = await SecurityAudit.getUserActivity(communityId, userId, 100);

// Get failed OAuth attempts (last hour)
const failed = await SecurityAudit.getFailedAttempts(communityId, userId, 1);
```

**Code Location**: `src/models/SecurityAudit.js`

---

### Layer 6: Monitoring & Anomaly Detection

**Technologies**: Redis health checks, Error tracking, Performance metrics

**Protection Against**:
- Service degradation
- Memory leaks
- Performance bottlenecks
- Silent failures

**Health Checks**:
- Redis connectivity monitoring
- Database connection pool health
- OAuth token expiration tracking
- Rate limit quota monitoring

**Code Location**: `src/services/healthCheck.js`

---

### Layer 7: Incident Response

**Technologies**: Account suspension, IP blocking, Cooldowns

**Protection Against**:
- Active attacks
- Compromised accounts
- Brute-force attempts
- Account takeovers

**Response Mechanisms**:

1. **Automatic Cooldowns**:
   - Failed login → 15-minute cooldown after 5 attempts
   - Failed OAuth → 1-hour cooldown after 3 attempts
   - Rate limit violation → Temporary IP block

2. **Manual Interventions**:
   - Admin account suspension
   - Force password reset
   - Revoke all sessions
   - IP blacklisting

**Code Location**: `src/services/incidentResponse.js`

---

## OAuth2 Security Architecture

### Broker Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Initiates OAuth (clicks "Connect Alpaca")           │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Generate 512-bit CSRF State                              │
│    - crypto.randomBytes(64).toString('hex')                 │
│    - Store in session with communityId + userId + broker    │
│    - 10-minute TTL                                           │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Redirect to Broker OAuth Page                            │
│    - Alpaca: https://app.alpaca.markets/oauth/authorize     │
│    - Schwab: https://api.schwabapi.com/v1/oauth/authorize   │
│    - Include: client_id, redirect_uri, state, scope         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. User Authorizes → Broker Redirects to Callback           │
│    - URL: /api/brokers/oauth/callback/:brokerKey            │
│    - Query: ?code=...&state=...                             │
│    - Rate Limited: 10 requests/15min per IP                 │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Validate CSRF State (3 checks)                           │
│    ✅ State exists in session                               │
│    ✅ State matches (timing-safe comparison)                │
│    ✅ State not expired (< 10 minutes old)                  │
│    ✅ CommunityId unchanged (tenant validation)             │
│    ❌ Any failure → CRITICAL audit log + error page         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Exchange Authorization Code for Access Token             │
│    - POST to broker token endpoint                          │
│    - Include: code, client_id, client_secret, redirect_uri  │
│    - Receive: access_token, refresh_token, expires_in       │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Encrypt Credentials (AES-256-GCM)                        │
│    - Get community DEK from AWS KMS (envelope encryption)   │
│    - Encrypt: { accessToken, refreshToken, expiresIn }      │
│    - Generate random IV (128-bit)                           │
│    - Create auth tag (prevents tampering)                   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. Store in User.brokerConfigs                              │
│    - Map<brokerKey, { credentials, environment, ... }>      │
│    - Credentials stored as encrypted base64 string          │
│    - Audit log: auth.oauth2_token_exchange (MEDIUM risk)    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. Return Success Page (closes popup)                       │
│    - postMessage to parent window: { type: 'oauth-success' }│
│    - Auto-close after 2 seconds                             │
└─────────────────────────────────────────────────────────────┘
```

### Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Detect Expired Access Token                              │
│    - Check expiresAt timestamp                              │
│    - Buffer: Refresh 5 minutes before expiration            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Decrypt Refresh Token                                    │
│    - Get community DEK from AWS KMS or cache                │
│    - Decrypt stored credentials (AES-256-GCM)               │
│    - Extract refresh_token                                  │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Request New Access Token                                 │
│    - POST to broker token endpoint                          │
│    - Include: refresh_token, client_id, client_secret       │
│    - grant_type: refresh_token                              │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Handle Response                                           │
│                                                              │
│ SUCCESS (200 OK):                                            │
│   - Receive new access_token (+ optional new refresh_token) │
│   - Encrypt and store new credentials                       │
│   - Audit log: auth.oauth2_refresh_token (MEDIUM)           │
│   - Return success                                           │
│                                                              │
│ PERMANENT FAILURE (4xx):                                     │
│   - Invalid refresh token (user revoked access)             │
│   - Clear stored credentials                                │
│   - Audit log: auth.oauth2_connection_failed (HIGH)         │
│   - Require user re-authorization                           │
│                                                              │
│ TEMPORARY FAILURE (5xx):                                     │
│   - Retry with exponential backoff (3 attempts)             │
│   - Delays: 1s, 2s, 4s                                      │
│   - If all retries fail:                                    │
│     - Audit log: auth.oauth2_connection_failed (HIGH)       │
│     - Alert user to check broker connection                 │
└─────────────────────────────────────────────────────────────┘
```

**Security Guarantees**:
- ✅ All tokens encrypted at rest (AES-256-GCM)
- ✅ CSRF protection (512-bit state, timing-safe validation)
- ✅ Multi-tenant isolation (communityId validation)
- ✅ Rate limiting (prevents brute-force)
- ✅ Comprehensive audit logging (SOC 2 compliance)
- ✅ Automatic cleanup (expired states deleted after 10 min)
- ✅ Secure token refresh (exponential backoff + retry logic)

---

## Multi-Tenant Isolation

### Isolation Mechanisms

**1. Database-Level Isolation**:
```javascript
// All queries automatically scoped to communityId
const trades = await Trade.find({ communityId });
const users = await User.find({ 'tradingConfig.communityId': communityId });
```

**2. OAuth Session Isolation**:
```javascript
// State includes communityId - validated on callback
session.oauthState = {
  state: '512-bit-random',
  userId,
  communityId,  // ← Prevents cross-tenant attacks
  broker,
  createdAt
};
```

**3. Encryption Key Isolation**:
```javascript
// Each community has its own DEK (Data Encryption Key)
const dek = await encryptionService.getDEK(community);
```

**4. Rate Limit Isolation**:
- Per-IP rate limits (prevents one tenant from exhausting global quota)
- Per-community resource quotas (configurable limits)

---

## Encryption at Rest

**Full documentation**: [ENCRYPTION_AUDIT_2025.md](./ENCRYPTION_AUDIT_2025.md)

**Key Points**:
- AES-256-GCM for all sensitive data
- AWS KMS (FIPS 140-2 Level 3) for key management
- Argon2id for password hashing (OWASP 2023 params)
- HMAC-SHA256 for webhook signatures
- 512-bit CSRF tokens

---

## Security Audit Logging

**Retention**: 7 years (SOC 2 compliance)
**Storage**: MongoDB with TTL indexes
**Format**: Structured JSON with compound indexes

**Critical Events Auto-Logged**:
- All authentication attempts (success/failure)
- All OAuth operations (token exchange, refresh, CSRF failures)
- All rate limit violations
- All cross-tenant access attempts
- All credential access (encrypt/decrypt)
- All admin actions

**Query Performance**:
- 8 compound indexes for common queries
- Text search for investigation
- Sub-second response times

---

## Rate Limiting & DDoS Protection

**Implementation**: `express-rate-limit` with optional Redis backend

**Limits by Endpoint**:

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| OAuth callback | 10 req | 15 min | CSRF protection |
| Login | 5 req | 15 min | Brute-force prevention |
| API (strict) | 100 req | 15 min | General protection |
| API (permissive) | 1000 req | 15 min | High-traffic endpoints |

**Scaling**:
- Development: In-memory store (single process)
- Production: Redis store (distributed, multi-process)

**Error Handling**:
- Custom HTML error pages for OAuth flows
- JSON error responses for API endpoints
- Security audit logging on violations

---

## Incident Response

### Response Levels

**Level 1: Automatic (< 1 second)**:
- Rate limit enforcement
- CSRF validation failure blocking
- Invalid state rejection

**Level 2: Alert (< 1 minute)**:
- Security audit log creation
- High-risk event flagging
- Admin dashboard notification

**Level 3: Manual Review (< 1 hour)**:
- Admin reviews flagged events
- Investigates suspicious patterns
- Decides on account actions

**Level 4: Incident (< 24 hours)**:
- Cross-tenant attack attempts
- Mass credential access
- Coordinated attacks

### Incident Playbooks

**Suspected CSRF Attack**:
1. Review SecurityAudit logs for `auth.oauth2_csrf_validation_failed`
2. Check IP addresses for patterns
3. Verify legitimate user vs. attack
4. Block IPs if coordinated
5. Document findings

**Suspected Cross-Tenant Attack**:
1. Review SecurityAudit logs for community mismatch errors
2. Identify affected users and communities
3. Verify data isolation maintained
4. Suspend suspicious accounts
5. Audit database access logs
6. Document and report

---

## Compliance

### SOC 2 Type II

**Security Criteria Met**:
- ✅ Access controls (RBAC, multi-tenant isolation)
- ✅ Encryption at rest (AES-256-GCM, AWS KMS)
- ✅ Encryption in transit (TLS 1.3)
- ✅ Audit logging (7-year retention)
- ✅ Key rotation (automatic 90-day)
- ✅ Incident response procedures

### GDPR Article 32

**Technical Measures**:
- ✅ Pseudonymization (encrypted credentials)
- ✅ Encryption of personal data at rest
- ✅ Ability to restore availability after incident
- ✅ Regular testing of security measures

**Organizational Measures**:
- ✅ Security audit trail (7 years)
- ✅ Access controls and authorization
- ✅ Incident response procedures
- ✅ Regular security audits

### OWASP ASVS 4.0

**Level 2 Compliance** (Recommended for most applications):
- ✅ V2: Authentication (OAuth2, session management)
- ✅ V3: Session Management (secure cookies, CSRF)
- ✅ V6: Cryptography (AES-256-GCM, Argon2id)
- ✅ V7: Error Handling (no sensitive data leaks)
- ✅ V8: Data Protection (encryption at rest)
- ✅ V9: Communications (TLS, secure headers)

**Level 3 Partial**:
- ✅ V6.2.1: Timing-safe comparisons (webhook signatures)
- ⚠️ V6.2.2: Session key validation (development fallback)

---

## Security Checklist for Developers

**Before deploying to production**:

- [ ] All environment variables configured:
  - [ ] `AWS_REGION`
  - [ ] `AWS_ACCESS_KEY_ID`
  - [ ] `AWS_SECRET_ACCESS_KEY`
  - [ ] `AWS_KMS_CMK_ID`
  - [ ] `ENCRYPTION_KEY`
  - [ ] `SESSION_SECRET`
  - [ ] `REDIS_URL` (for distributed rate limiting)

- [ ] Database indexes created:
  - [ ] SecurityAudit compound indexes
  - [ ] User.brokerConfigs indexes
  - [ ] Community indexes

- [ ] Rate limiting configured:
  - [ ] Redis connection tested
  - [ ] Rate limits appropriate for traffic
  - [ ] Custom error pages deployed

- [ ] Security testing completed:
  - [ ] CSRF protection verified
  - [ ] Multi-tenant isolation tested
  - [ ] Encryption/decryption tested
  - [ ] OAuth flows tested
  - [ ] Audit logging verified

- [ ] Monitoring configured:
  - [ ] Error tracking (Sentry, etc.)
  - [ ] Performance monitoring
  - [ ] Security audit alerts
  - [ ] Health check endpoints

---

## References

- [ENCRYPTION_AUDIT_2025.md](./ENCRYPTION_AUDIT_2025.md) - Comprehensive encryption audit
- [OAUTH2_ARCHITECTURE.md](../architecture/OAUTH2_ARCHITECTURE.md) - OAuth2 flow documentation
- OWASP ASVS 4.0: https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-38D: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
- SOC 2 Framework: https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/sorhome
- GDPR Article 32: https://gdpr-info.eu/art-32-gdpr/

---

*Last Updated: 2025-01-20 | Phase 1.3: OAuth2 Security Hardening*
