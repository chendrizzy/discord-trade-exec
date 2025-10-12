# Security Documentation

## Overview

This document outlines the comprehensive security measures implemented in the Discord Trade Executor SaaS platform. Our security architecture follows industry best practices and addresses the OWASP Top 10 vulnerabilities.

## Table of Contents

1. [Encryption & Data Protection](#encryption--data-protection)
2. [Authentication & Authorization](#authentication--authorization)
3. [Input Validation & Sanitization](#input-validation--sanitization)
4. [Rate Limiting](#rate-limiting)
5. [Security Headers](#security-headers)
6. [API Key Management](#api-key-management)
7. [Error Handling](#error-handling)
8. [Security Best Practices](#security-best-practices)
9. [Testing](#testing)
10. [Reporting Security Issues](#reporting-security-issues)

---

## Encryption & Data Protection

### AES-256-GCM Encryption

All sensitive data (API keys, secrets) is encrypted using **AES-256-GCM** (Advanced Encryption Standard with Galois/Counter Mode), which provides:

- **Confidentiality**: Data is encrypted and unreadable without the key
- **Authenticity**: Built-in authentication tag prevents tampering
- **Integrity**: Any modification to ciphertext is detected

**Implementation**: `src/middleware/encryption.js`

```javascript
const { encrypt, decrypt } = require('./middleware/encryption');

// Encrypt API key before storing
const { encrypted, iv, authTag } = encrypt(apiKey);

// Decrypt when needed
const apiKey = decrypt(encrypted, iv, authTag);
```

**Key Features**:
- Unique IV (Initialization Vector) for each encryption operation
- Authentication tags verify data integrity
- Encryption key stored securely in environment variables
- SHA-256 hashing for one-way data verification
- HMAC signature verification for webhooks

### Environment Variables

**Required variables** (must be set in production):

```env
# Encryption
ENCRYPTION_KEY=<64-character hex string>  # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session
SESSION_SECRET=<strong random string>

# Discord OAuth2
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_CLIENT_SECRET=<your-client-secret>
DISCORD_CALLBACK_URL=<your-callback-url>

# Database
MONGODB_URI=<mongodb-connection-string>
```

⚠️ **Never commit these values to version control!**

---

## Authentication & Authorization

### Discord OAuth2

Authentication is handled via **Discord OAuth2**, providing:
- Secure user authentication without password storage
- Industry-standard OAuth2 flow
- Automatic session management

**Security Features**:
- HTTPS-only cookies in production
- HttpOnly cookies (prevents XSS cookie theft)
- SameSite=Lax (prevents CSRF attacks)
- 1-week session expiration
- MongoDB-backed session persistence

**Implementation**: `src/middleware/auth.js`

### Authorization Middleware

**Protected Routes**:
```javascript
router.get('/protected', isAuthenticated, (req, res) => {
    // Only authenticated users can access
});

router.post('/admin', isAuthenticated, isAdmin, (req, res) => {
    // Only admin users can access
});

router.put('/premium', isAuthenticated, isPremium, (req, res) => {
    // Only premium subscribers can access
});
```

**Middleware Functions**:
- `isAuthenticated`: Verifies user is logged in
- `isAdmin`: Verifies user has admin role
- `isPremium`: Verifies user has active premium subscription
- `userOwnsResource`: Verifies user owns the resource being accessed

---

## Input Validation & Sanitization

### Validation Middleware

**Implementation**: `src/middleware/validation.js`

All user inputs are validated and sanitized to prevent:
- XSS (Cross-Site Scripting) attacks
- SQL/NoSQL injection
- CSRF (Cross-Site Request Forgery)
- Prototype pollution
- Buffer overflow attacks

**Available Validators**:

```javascript
const {
    validateEmail,
    validateApiKey,
    validateAmount,
    validatePercentage,
    validateSymbol,
    validateExchangeName,
    validateWebhookUrl,
    validateDiscordId,
    validateTimeString,
    validateEnum
} = require('./middleware/validation');
```

### String Sanitization

**Automatic XSS Prevention**:
```javascript
const { sanitizeString, sanitizeObject } = require('./middleware/validation');

// Removes HTML tags, script content, null bytes
const clean = sanitizeString('<script>alert("XSS")</script>Hello');
// Result: "Hello"
```

### Object Sanitization

**NoSQL Injection Prevention**:
```javascript
const input = {
    name: 'John',
    __proto__: { admin: true },  // Prototype pollution attempt
    $where: 'malicious code'     // MongoDB injection attempt
};

const safe = sanitizeObject(input);
// Dangerous keys filtered out
// Result: { name: 'John' }
```

### Schema Validation

**Express Middleware**:
```javascript
const { validateBody } = require('./middleware/validation');

router.post('/api/exchange', validateBody({
    name: {
        required: true,
        validate: validateExchangeName
    },
    apiKey: {
        required: true,
        validate: validateApiKey
    }
}), handler);
```

---

## Rate Limiting

### Implementation

**Implementation**: `src/middleware/rateLimiter.js`

Rate limiting protects against:
- Brute force attacks
- DDoS attacks
- API abuse
- Credential stuffing

**Rate Limit Tiers**:

| Endpoint Type | Limit | Window | Purpose |
|--------------|-------|--------|---------|
| Authentication | 5 requests | 15 minutes | Prevent brute force |
| Login | 10 requests | 1 hour | Additional login protection |
| API Endpoints | 100 requests | 15 minutes | General API protection |
| Webhooks | 100 requests | 1 minute | High-volume webhook handling |

**Usage**:
```javascript
const { apiLimiter, authLimiter, webhookLimiter } = require('./middleware/rateLimiter');

router.post('/auth/login', authLimiter, loginHandler);
router.get('/api/data', apiLimiter, dataHandler);
router.post('/webhook/tv', webhookLimiter, webhookHandler);
```

**Response Headers**:
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets
- `Retry-After`: Seconds to wait (when rate limited)

---

## Security Headers

### Helmet Configuration

**Implementation**: `src/index.js`

All security headers are configured using **Helmet.js**:

**Content Security Policy (CSP)**:
```javascript
helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
            connectSrc: ["'self'", "https://discord.com"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"]
        }
    }
})
```

**Other Security Headers**:
- **HSTS**: Force HTTPS for 1 year (including subdomains)
- **X-Content-Type-Options**: Prevent MIME-sniffing
- **Referrer-Policy**: Control referrer information
- **X-XSS-Protection**: Enable browser XSS filter
- **X-Powered-By**: Hidden (prevents fingerprinting)

**CORS Configuration**:
```javascript
cors({
    origin: process.env.DASHBOARD_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
})
```

---

## API Key Management

### Exchange API Key Security

**Implementation**: `src/routes/api/exchanges.js`

**Security Workflow**:

1. **User submits API key** →
2. **Real-time validation** (CCXT library) →
3. **Permission check** (read/trade only, NO withdrawals) →
4. **AES-256-GCM encryption** →
5. **Store in database** (encrypted form only)

**API Permission Validation**:
```javascript
// Verifies:
// ✓ Read permission (fetchBalance)
// ✓ Trade permission (fetchOpenOrders)
// ✗ Withdrawal permission (must be disabled)

const { valid, permissions } = await validateExchangeKey(
    'binance',
    apiKey,
    apiSecret,
    testnet  // Use sandbox mode for testing
);
```

**API Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/exchanges` | GET | List user's exchanges (keys hidden) |
| `/api/exchanges` | POST | Add new exchange (validates & encrypts) |
| `/api/exchanges/:id` | DELETE | Remove exchange |
| `/api/exchanges/:id/validate` | POST | Re-validate API permissions |
| `/api/exchanges/:id/toggle` | PATCH | Enable/disable exchange |

**Response Format**:
```json
{
    "success": true,
    "exchanges": [
        {
            "id": "507f1f77bcf86cd799439011",
            "name": "binance",
            "label": "Binance Main",
            "apiKeyPreview": "****1234",  // Only last 4 chars
            "active": true,
            "testnet": false,
            "permissions": {
                "read": true,
                "trade": true,
                "withdraw": false  // Always false
            }
        }
    ]
}
```

**Key Security Features**:
- API keys NEVER logged in plain text
- Only last 4 characters shown in responses
- Automatic deactivation on validation failure
- Support for testnet/sandbox mode
- Real-time permission re-validation

---

## Error Handling

### Secure Error Messages

**Implementation**: `src/index.js`, route handlers

**Production Mode**:
- Generic error messages to users
- Detailed errors logged internally
- No stack traces exposed
- No sensitive data in error messages

**Development Mode**:
- Detailed error messages
- Stack traces for debugging
- Full error context

**Example**:
```javascript
try {
    // Operation
} catch (error) {
    logger.error('Detailed error for logs:', error);

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'An error occurred'
            : error.message
    });
}
```

**Global Error Handlers**:
```javascript
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // Don't exit process, keep running
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
    // Don't exit process, keep running
});
```

---

## Security Best Practices

### For Developers

**API Key Handling**:
```javascript
// ✅ GOOD
const apiKey = decrypt(encrypted, iv, authTag);
logger.info('Using API key for trade');

// ❌ BAD
logger.info('API key:', apiKey);  // Never log plain text
console.log(req.body);  // May contain API keys
```

**Input Validation**:
```javascript
// ✅ GOOD
const result = validateAmount(req.body.amount);
if (!result.valid) {
    return res.status(400).json({ error: result.error });
}
const amount = result.sanitized;

// ❌ BAD
const amount = parseFloat(req.body.amount);  // No validation
```

**Database Queries**:
```javascript
// ✅ GOOD (Mongoose parameterized query)
await Exchange.findOne({ userId, _id: exchangeId });

// ❌ BAD (NoSQL injection risk)
await Exchange.findOne({ userId, ...req.body });
```

**Authentication Checks**:
```javascript
// ✅ GOOD
router.get('/user/data', isAuthenticated, (req, res) => {
    // Only authenticated users
});

// ❌ BAD
router.get('/user/data', (req, res) => {
    if (req.session.user) {  // Missing middleware
        // ...
    }
});
```

### For Operations

**Production Checklist**:
- [ ] All environment variables set (especially `ENCRYPTION_KEY`)
- [ ] `NODE_ENV=production` configured
- [ ] HTTPS enabled (SSL/TLS certificates)
- [ ] Database connection uses TLS/SSL
- [ ] Session secret is strong and random
- [ ] Rate limiting enabled
- [ ] Security headers configured (Helmet)
- [ ] CORS whitelist set to production URLs only
- [ ] Error logging configured (Winston)
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting set up

**Environment Security**:
```bash
# Generate secure encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate secure session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Never use default/example values in production!
```

---

## Testing

### Security Test Coverage

**Test Files**:
- `tests/security/encryption.test.js` (22 tests)
- `tests/security/validation.test.js` (52 tests)
- **Total**: 74 security tests

**Running Tests**:
```bash
# All security tests
npm test tests/security/

# Encryption tests only
npm test tests/security/encryption.test.js

# Validation tests only
npm test tests/security/validation.test.js
```

**Test Categories**:

**Encryption Tests**:
- AES-256-GCM encryption/decryption
- Unique IV generation
- Authentication tag verification
- Tamper detection
- Edge cases (unicode, long keys, special chars)
- Performance (1000 ops < 1 second)

**Validation Tests**:
- XSS prevention (HTML tag removal)
- NoSQL injection prevention
- Prototype pollution prevention
- Email validation
- API key validation
- Amount/percentage validation
- Symbol/exchange validation
- URL validation
- Discord ID validation
- Enum validation

### Manual Security Testing

**Recommended Tools**:
- **OWASP ZAP**: Automated vulnerability scanning
- **Burp Suite**: Manual penetration testing
- **Postman**: API security testing
- **npm audit**: Dependency vulnerability scanning

**Testing Checklist**:
```bash
# 1. Check for vulnerable dependencies
npm audit

# 2. Fix vulnerabilities
npm audit fix

# 3. Run security tests
npm test tests/security/

# 4. Manual penetration testing
# - Test XSS injection in all input fields
# - Test SQL/NoSQL injection attempts
# - Test authentication bypass
# - Test authorization privilege escalation
# - Test rate limiting
# - Test CSRF protection
```

---

## Reporting Security Issues

### Responsible Disclosure

If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. **DO NOT** disclose the vulnerability publicly
3. **DO** email security reports to: `security@yourdomain.com`

**Include in your report**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response Timeline**:
- **24 hours**: Initial response acknowledging receipt
- **7 days**: Assessment and severity classification
- **30 days**: Fix deployed (for critical issues)
- **90 days**: Public disclosure (after fix is deployed)

### Security Response Process

1. **Triage**: Assess severity and impact
2. **Investigation**: Reproduce and analyze
3. **Development**: Create and test fix
4. **Deployment**: Release security patch
5. **Disclosure**: Publish security advisory
6. **Recognition**: Credit security researcher (if desired)

---

## OWASP Top 10 Compliance

| Risk | Status | Mitigation |
|------|--------|------------|
| A01: Broken Access Control | ✅ | Authentication middleware, role-based access |
| A02: Cryptographic Failures | ✅ | AES-256-GCM encryption, secure key storage |
| A03: Injection | ✅ | Input validation, sanitization, parameterized queries |
| A04: Insecure Design | ✅ | Security-first architecture, threat modeling |
| A05: Security Misconfiguration | ✅ | Helmet headers, secure defaults, environment checks |
| A06: Vulnerable Components | ✅ | Regular updates, npm audit, dependency scanning |
| A07: Authentication Failures | ✅ | OAuth2, rate limiting, session management |
| A08: Data Integrity Failures | ✅ | HMAC verification, authentication tags |
| A09: Logging Failures | ⚠️ | Winston logging (audit logging pending) |
| A10: SSRF | ✅ | URL validation, localhost blocking |

---

## Current Security Score: 85/100

### Strengths
- ✅ Strong encryption (AES-256-GCM)
- ✅ Comprehensive input validation
- ✅ OAuth2 authentication
- ✅ Rate limiting on all endpoints
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ API key permission validation
- ✅ Extensive test coverage

### Areas for Improvement
- ⚠️ Audit logging (60% complete)
- ⚠️ Security monitoring (planned)
- ⚠️ 2FA/MFA support (planned)
- ⚠️ Key rotation mechanism (planned)
- ⚠️ Third-party security audit (before production)

---

## Additional Resources

**Documentation**:
- [SECURITY_AUDIT_CHECKLIST.md](./SECURITY_AUDIT_CHECKLIST.md) - Detailed security audit
- [README.md](./README.md) - General project documentation

**External Resources**:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

**Last Updated**: 2025-10-07
**Version**: 1.0 (Phase 2.4)
