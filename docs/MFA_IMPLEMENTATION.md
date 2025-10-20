# Multi-Factor Authentication (MFA) Implementation

## Overview

Discord Trade Executor implements industry-standard Time-based One-Time Password (TOTP) multi-factor authentication with backup code support, providing an additional layer of security for user accounts.

### Features

- **TOTP-based MFA**: RFC 6238 compliant time-based one-time passwords
- **QR Code Setup**: Easy enrollment with authenticator apps (Google Authenticator, Authy, etc.)
- **Backup Codes**: 10 single-use emergency access codes
- **Rate Limiting**: Protection against brute-force attacks (5 attempts per 15 minutes)
- **Encrypted Storage**: AES-256-GCM encryption for TOTP secrets
- **Session Management**: Persistent MFA verification state
- **Self-Service Management**: Users can enable, disable, and regenerate codes

## Architecture

### Backend Components

#### 1. MFAService (`src/services/MFAService.js`)

Singleton service managing all MFA operations:

```javascript
const mfaService = getMFAService();

// Available methods:
- setup(userId)                    // Generate TOTP secret and QR code
- enable(userId, token)            // Verify and enable MFA
- verify(userId, token)            // Verify TOTP token
- verifyBackupCode(userId, code)   // Verify backup code
- disable(userId)                  // Disable MFA
- getStatus(userId)                // Get MFA status
- regenerateBackupCodes(userId)    // Generate new backup codes
- clearRateLimit(userId)           // Clear rate limiting
```

#### 2. User Model Extensions (`src/models/User.js`)

MFA-related fields:
```javascript
{
  mfa: {
    secret: String,           // Encrypted TOTP secret
    backupCodes: [String],    // Hashed backup codes
    enabled: Boolean,         // MFA enabled status
    verifiedAt: Date,         // Initial verification timestamp
    lastVerified: Date        // Last successful verification
  }
}
```

#### 3. Authentication Middleware (`src/middleware/auth.js`)

- `ensureMFAVerified()`: Protects routes requiring MFA verification
- `checkMFAPending()`: Redirects to MFA verification if needed

#### 4. API Endpoints (`src/routes/api/auth.js`)

```
POST   /api/auth/mfa/setup              - Initialize MFA setup
POST   /api/auth/mfa/enable             - Enable MFA with verification
POST   /api/auth/mfa/verify             - Verify MFA token
POST   /api/auth/mfa/verify-backup      - Verify backup code
POST   /api/auth/mfa/disable            - Disable MFA
GET    /api/auth/mfa/status             - Get MFA status
POST   /api/auth/mfa/regenerate-backup  - Regenerate backup codes
```

### Frontend Components

#### Security Settings Page (`public/security.html`)

Complete MFA management interface:

1. **Status Dashboard**
   - Enabled/disabled status badge
   - Backup codes remaining count
   - Last verification timestamp

2. **3-Step Setup Flow**
   - Step 1: Install authenticator app instructions
   - Step 2: QR code + manual entry
   - Step 3: Backup codes display and download

3. **Management Controls**
   - Regenerate backup codes
   - Disable MFA
   - Low backup code warnings

4. **Security Features**
   - XSS-safe DOM manipulation
   - Token input validation (6 digits)
   - Confirmation dialogs
   - Backup code download

## Security

### Encryption

**TOTP Secrets**: AES-256-GCM encryption
- Algorithm: `aes-256-gcm`
- Key: `MFA_ENCRYPTION_KEY` environment variable (32 bytes)
- IV: Randomly generated per encryption (12 bytes)
- Format: `iv:encrypted:authTag` (hex-encoded)

**Backup Codes**: Bcrypt hashing
- Algorithm: bcrypt
- Cost factor: 10
- Format: `XXXX-XXXX` (8 alphanumeric characters)
- Normalization: Hyphens removed before hashing

### Rate Limiting

In-memory rate limiting prevents brute-force attacks:
- **Max attempts**: 5
- **Window**: 15 minutes
- **Scope**: Per user
- **Storage**: JavaScript Map (in-memory)

**Note**: For production, consider Redis-backed rate limiting for distributed systems.

### Session Management

MFA verification state stored in session:
```javascript
req.session.mfaVerified = true;  // Set after successful verification
```

Session configuration:
- HttpOnly cookies
- Secure flag (HTTPS)
- SameSite: 'strict'

## Setup & Configuration

### Environment Variables

Required in `.env`:
```bash
# MFA encryption key (32 bytes)
MFA_ENCRYPTION_KEY=your-32-byte-hex-string-here

# Session secret (for session management)
SESSION_SECRET=your-session-secret-here
```

Generate secure keys:
```bash
# Generate MFA encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Dependencies

Already installed:
```json
{
  "speakeasy": "^2.0.0",   // TOTP generation
  "qrcode": "^1.5.3",      // QR code generation
  "bcrypt": "^5.1.1"       // Backup code hashing
}
```

### Database

No migrations required - Mongoose schema handles MFA fields automatically.

## User Guide

### Enabling MFA

1. **Navigate to Security**
   - Go to Dashboard → Security

2. **Start Setup**
   - Click "Enable MFA" button
   - Choose authenticator app (Google Authenticator, Authy, etc.)

3. **Scan QR Code**
   - Open authenticator app
   - Scan displayed QR code
   - Or manually enter secret key

4. **Verify Token**
   - Enter 6-digit code from app
   - Click "Verify & Enable"

5. **Save Backup Codes**
   - Download and securely store 10 backup codes
   - Each code can only be used once
   - Keep in safe location (not on same device)

### Using MFA

After login:
1. Enter username/password (Discord OAuth)
2. Enter 6-digit code from authenticator app
3. Or use backup code if needed

### Managing MFA

**View Status**:
- See enabled/disabled state
- Check backup codes remaining
- View last verification time

**Regenerate Backup Codes**:
- Click "Regenerate Backup Codes"
- Confirm action (invalidates old codes)
- Download and save new codes

**Disable MFA**:
- Click "Disable MFA"
- Confirm action
- MFA will be removed from account

## API Documentation

### POST /api/auth/mfa/setup

Initialize MFA setup for authenticated user.

**Request**: None (user from session)

**Response**:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Errors**:
- `401`: Not authenticated
- `400`: MFA already enabled

---

### POST /api/auth/mfa/enable

Enable MFA after token verification.

**Request**:
```json
{
  "token": "123456"
}
```

**Response**:
```json
{
  "backupCodes": [
    "AAAA-BBBB",
    "CCCC-DDDD",
    ...
  ]
}
```

**Errors**:
- `401`: Not authenticated
- `400`: Invalid token
- `400`: MFA already enabled

---

### POST /api/auth/mfa/verify

Verify TOTP token.

**Request**:
```json
{
  "token": "123456"
}
```

**Response**:
```json
{
  "verified": true
}
```

**Errors**:
- `401`: Not authenticated
- `400`: MFA not enabled
- `400`: Invalid token
- `429`: Rate limited

---

### POST /api/auth/mfa/verify-backup

Verify backup code.

**Request**:
```json
{
  "code": "AAAA-BBBB"
}
```

**Response**:
```json
{
  "verified": true,
  "codesRemaining": 9
}
```

**Errors**:
- `401`: Not authenticated
- `400`: MFA not enabled
- `400`: Invalid backup code
- `429`: Rate limited

---

### POST /api/auth/mfa/disable

Disable MFA for authenticated user.

**Request**: None

**Response**:
```json
{
  "disabled": true
}
```

**Errors**:
- `401`: Not authenticated
- `400`: MFA not enabled

---

### GET /api/auth/mfa/status

Get MFA status for authenticated user.

**Request**: None

**Response**:
```json
{
  "enabled": true,
  "backupCodesRemaining": 8,
  "lastVerified": "2025-10-20T22:30:00.000Z"
}
```

**Errors**:
- `401`: Not authenticated

---

### POST /api/auth/mfa/regenerate-backup

Regenerate backup codes (invalidates old ones).

**Request**: None

**Response**:
```json
{
  "backupCodes": [
    "EEEE-FFFF",
    "GGGG-HHHH",
    ...
  ]
}
```

**Errors**:
- `401`: Not authenticated
- `400`: MFA not enabled

## Testing

### Unit Tests

Located: `tests/unit/MFAService.test.js`

Coverage: **100%** (53 tests)

Run:
```bash
npm test tests/unit/MFAService.test.js
```

Test categories:
- Setup and secret generation (8 tests)
- TOTP verification (10 tests)
- Backup code management (12 tests)
- Enable/disable operations (6 tests)
- Rate limiting (8 tests)
- Status and utility methods (9 tests)

---

### Integration Tests

Located: `tests/integration/auth-mfa.test.js`

Coverage: 9 tests, all passing

Run:
```bash
npm test tests/integration/auth-mfa.test.js
```

Test categories:
- Service-Model integration (4 tests)
- Encryption integration (2 tests)
- Rate limiting integration (2 tests)
- Complete MFA lifecycle (1 test)

---

### E2E Tests

Located: `tests/e2e/mfa.spec.js`

Coverage: 26 Playwright tests

Run:
```bash
npx playwright test tests/e2e/mfa.spec.js
```

Test categories:
- Security page access (3 tests)
- MFA setup flow (6 tests)
- MFA management (5 tests)
- Error handling (3 tests)
- Security features (3 tests)

---

### Manual Testing Checklist

#### Setup Flow
- [ ] Navigate to /dashboard/security
- [ ] Click "Enable MFA" button
- [ ] Verify 3-step flow displays
- [ ] Scan QR code with authenticator app
- [ ] Enter valid token
- [ ] Verify 10 backup codes display
- [ ] Download backup codes

#### Verification Flow
- [ ] Logout and login again
- [ ] Enter TOTP token from app
- [ ] Verify successful login
- [ ] Try invalid token (should fail)
- [ ] Try backup code (should succeed once)

#### Management Flow
- [ ] View MFA status (enabled)
- [ ] Check backup codes remaining
- [ ] Regenerate backup codes
- [ ] Verify old codes don't work
- [ ] Disable MFA
- [ ] Verify MFA is disabled

#### Security Testing
- [ ] Try accessing /dashboard/security without auth (should redirect)
- [ ] Test rate limiting (5 failed attempts)
- [ ] Verify session persistence
- [ ] Check for XSS vulnerabilities
- [ ] Verify backup code downloads are secure

## Production Considerations

### Scaling

**Rate Limiting**: Current implementation uses in-memory Map. For production:
```javascript
// Consider Redis-backed rate limiting:
const redis = require('redis');
const client = redis.createClient();

class RedisRateLimiter {
  async checkRateLimit(userId) {
    const key = `mfa:ratelimit:${userId}`;
    const attempts = await client.get(key);
    if (attempts >= 5) {
      const ttl = await client.ttl(key);
      throw new Error(`Too many attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`);
    }
    await client.incr(key);
    await client.expire(key, 900); // 15 minutes
  }
}
```

### Monitoring

Add metrics for:
- MFA enablement rate
- Verification success/failure rates
- Rate limit triggers
- Backup code usage
- Error rates by endpoint

### Security Hardening

1. **Key Rotation**
   - Rotate `MFA_ENCRYPTION_KEY` periodically
   - Implement key versioning
   - Re-encrypt secrets on rotation

2. **Audit Logging**
   - Log MFA setup events
   - Log verification attempts
   - Log backup code usage
   - Log disable events

3. **Account Recovery**
   - Implement admin-assisted recovery
   - Add account recovery codes
   - Support authenticator app reset

4. **Advanced Features**
   - SMS backup option
   - Hardware key support (U2F/WebAuthn)
   - Trusted device management
   - Location-based MFA requirements

## Troubleshooting

### Common Issues

**"Invalid token" errors**:
- Check device time synchronization
- Verify 30-second TOTP window
- Try adjacent time windows

**Rate limiting triggered**:
- Wait 15 minutes
- Or admin can clear: `mfaService.clearRateLimit(userId)`

**Lost authenticator app**:
- Use backup codes
- Or contact admin for manual MFA disable

**Backup codes not working**:
- Verify format (remove hyphens)
- Check if already used
- Regenerate new codes

### Debug Mode

Enable debug logging:
```javascript
// In MFAService.js
const DEBUG = process.env.MFA_DEBUG === 'true';

if (DEBUG) {
  console.log('MFA Debug:', data);
}
```

## Version History

### v2.0.0 (2025-10-20)
- ✅ Complete MFA frontend implementation
- ✅ XSS-safe security page
- ✅ All 5 dashboard pages updated
- ✅ E2E test suite (26 tests)
- ✅ Comprehensive documentation

### v1.9.0 (2025-10-20)
- ✅ Integration tests (9 tests, 100% passing)
- ✅ Service-Model-Database integration
- ✅ Encryption round-trip validation
- ✅ Rate limiting persistence

### v1.8.0 (2025-10-20)
- ✅ MFAService unit tests (53 tests, 100% coverage)
- ✅ Complete method coverage
- ✅ Edge case handling

### v1.0.0 (2025-10-20)
- ✅ Initial MFA backend implementation
- ✅ TOTP support with speakeasy
- ✅ Backup code system
- ✅ Rate limiting
- ✅ API endpoints

## References

- [RFC 6238 - TOTP](https://tools.ietf.org/html/rfc6238)
- [OWASP MFA Guide](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [Google Authenticator](https://support.google.com/accounts/answer/1066447)
- [Speakeasy Library](https://github.com/speakeasyjs/speakeasy)

## Support

For issues or questions:
1. Check this documentation
2. Review test files for examples
3. Check application logs
4. Contact development team
