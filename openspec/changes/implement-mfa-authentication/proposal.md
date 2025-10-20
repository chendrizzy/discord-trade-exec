# Proposal: Implement Multi-Factor Authentication (MFA)

## Summary

Add Time-based One-Time Password (TOTP) multi-factor authentication for enhanced security, protecting high-value broker connections and sensitive trading operations. Users can enable MFA with authenticator apps (Google Authenticator, Authy) and use backup codes for recovery.

## Motivation

### Current State: Single-Factor Authentication
- Discord OAuth2 as sole authentication method
- No additional security layer for broker API key access
- Compromised Discord account = full platform access
- No MFA option for security-conscious users

### Problems with Current Approach
1. **Single Point of Failure**: Discord OAuth2 compromise grants full access to trading accounts
2. **High-Value Risk**: Broker API keys control real money, yet protected by single factor
3. **Compliance Gap**: Financial services increasingly require MFA for customer accounts
4. **User Demand**: Security-conscious traders expect MFA option
5. **Competitive Disadvantage**: Major trading platforms (Robinhood, Coinbase) offer MFA

### Desired State: Optional TOTP MFA
- **TOTP Setup Flow**: Users scan QR code with authenticator app
- **6-Digit Code Verification**: Required after Discord OAuth2 for MFA-enabled accounts
- **Backup Codes**: 10 one-time recovery codes for device loss scenarios
- **Enforcement Policies**: Optional (user choice) initially, with admin toggle for future enforcement
- **Recovery Flow**: Backup codes or admin-assisted account recovery

### Benefits
1. **Enhanced Security**: Two-factor protection for trading accounts (phishing-resistant)
2. **User Confidence**: Security-conscious users can protect high-value accounts
3. **Compliance Ready**: Prepares platform for financial services compliance (SOC2, PCI-DSS)
4. **Competitive Parity**: Matches security features of major trading platforms
5. **Breach Mitigation**: Compromised Discord accounts don't grant full access

## Scope

### In Scope
- ✅ TOTP setup flow (QR code generation, secret storage)
- ✅ Authenticator app support (Google Authenticator, Authy, 1Password)
- ✅ 6-digit code verification during login
- ✅ Backup code generation (10 one-time codes)
- ✅ Backup code redemption and invalidation
- ✅ MFA enforcement toggle (user settings: enabled/disabled)
- ✅ Account recovery flow (backup codes)
- ✅ Dashboard settings UI (enable/disable MFA, view backup codes)
- ✅ Rate limiting on MFA verification (5 attempts per 15 minutes)

### Out of Scope
- ❌ SMS-based MFA (TOTP only, SMS insecure)
- ❌ WebAuthn/FIDO2 (hardware keys, future enhancement)
- ❌ Admin-enforced MFA requirement (optional by default, admin toggle future work)
- ❌ Push notification MFA (e.g., Authy push)
- ❌ Biometric authentication (Touch ID, Face ID)
- ❌ Remember trusted devices (security risk, deferred)

## Technical Approach

### 1. TOTP Library Selection

**Recommended: `speakeasy` npm package**
```bash
npm install speakeasy qrcode
```

**Why speakeasy?**
- Industry-standard TOTP implementation (RFC 6238)
- QR code generation support
- 6-digit code generation (30-second window)
- Well-maintained, 1M+ weekly downloads

### 2. Database Schema Updates

**User Model Changes** (`src/models/User.js`):
```javascript
{
  // Existing fields...
  mfa: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, default: null },  // Encrypted TOTP secret
    backupCodes: [{
      code: { type: String },       // Hashed backup code
      used: { type: Boolean, default: false },
      usedAt: { type: Date, default: null }
    }],
    enabledAt: { type: Date, default: null }
  }
}
```

### 3. TOTP Setup Flow

**Step 1: Generate TOTP Secret**
```javascript
// src/services/MFAService.js
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class MFAService {
  async generateTOTPSecret(userId, userEmail) {
    const secret = speakeasy.generateSecret({
      name: `Discord Trade Executor (${userEmail})`,
      issuer: 'Discord Trade Executor',
      length: 32
    });

    // Return secret and QR code data URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,  // Store this (encrypted)
      qrCode: qrCodeUrl       // Display to user
    };
  }
}
```

**Step 2: Verify TOTP Code (Setup)**
```javascript
async verifyTOTPSetup(userId, secret, token) {
  const verified = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2  // Allow ±1 time step (60 seconds)
  });

  if (verified) {
    // Generate backup codes
    const backupCodes = this.generateBackupCodes(10);

    // Save encrypted secret and hashed backup codes to user
    await User.findByIdAndUpdate(userId, {
      'mfa.enabled': true,
      'mfa.secret': encryptSecret(secret),
      'mfa.backupCodes': backupCodes.map(code => ({
        code: hashBackupCode(code),
        used: false
      })),
      'mfa.enabledAt': new Date()
    });

    // Return plaintext backup codes (only time shown)
    return { success: true, backupCodes: backupCodes };
  }

  return { success: false, error: 'Invalid code' };
}
```

**Step 3: Generate Backup Codes**
```javascript
const crypto = require('crypto');

generateBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    // Generate 8-character alphanumeric code (e.g., "A3F8-9K2L")
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  });
}
```

### 4. Login Flow with MFA

**Updated Authentication Middleware** (`src/middleware/auth.js`):
```javascript
// After Discord OAuth2 callback
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  async (req, res) => {
    const user = req.user;

    if (user.mfa.enabled) {
      // MFA enabled: redirect to MFA verification page
      req.session.mfaPending = true;
      req.session.userId = user._id;
      return res.redirect('/mfa/verify');
    }

    // MFA disabled: complete login
    req.session.authenticated = true;
    res.redirect('/dashboard');
  }
);
```

**MFA Verification Endpoint** (`src/routes/auth.js`):
```javascript
app.post('/auth/mfa/verify', rateLimiter, async (req, res) => {
  const { code } = req.body;
  const userId = req.session.userId;

  if (!req.session.mfaPending) {
    return res.status(400).json({ error: 'No MFA verification pending' });
  }

  const user = await User.findById(userId);
  const mfaService = new MFAService();

  // Try TOTP code first
  const decryptedSecret = decryptSecret(user.mfa.secret);
  const totpValid = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: code,
    window: 2
  });

  if (totpValid) {
    req.session.authenticated = true;
    req.session.mfaPending = false;
    return res.json({ success: true });
  }

  // Try backup code if TOTP failed
  const backupCodeValid = await mfaService.verifyBackupCode(userId, code);
  if (backupCodeValid) {
    req.session.authenticated = true;
    req.session.mfaPending = false;
    return res.json({ success: true, usedBackupCode: true });
  }

  return res.status(401).json({ error: 'Invalid MFA code' });
});
```

### 5. Backup Code Verification

```javascript
async verifyBackupCode(userId, code) {
  const user = await User.findById(userId);
  const hashedCode = hashBackupCode(code);

  const backupCode = user.mfa.backupCodes.find(
    bc => bc.code === hashedCode && !bc.used
  );

  if (backupCode) {
    // Mark backup code as used
    backupCode.used = true;
    backupCode.usedAt = new Date();
    await user.save();
    return true;
  }

  return false;
}
```

### 6. Frontend UI Components

**MFA Setup Page** (`src/dashboard/pages/MFASetup.jsx`):
- Display QR code for scanning
- Text input for 6-digit verification code
- "Verify and Enable MFA" button
- Display backup codes after successful setup (one-time only)
- Warning: "Save backup codes in secure location (password manager)"

**MFA Verification Page** (`src/dashboard/pages/MFAVerify.jsx`):
- Text input for 6-digit code
- "Use backup code instead" toggle
- Rate limiting feedback (5 attempts remaining)
- "Lost access?" link to recovery flow

**Settings Page Updates** (`src/dashboard/pages/Settings.jsx`):
- MFA status indicator (enabled/disabled)
- "Enable MFA" button (if disabled)
- "Disable MFA" button (if enabled, requires password confirmation)
- "Regenerate backup codes" button (invalidates old codes)

### 7. Rate Limiting

**MFA Verification Rate Limiter**:
```javascript
const rateLimit = require('express-rate-limit');

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many MFA verification attempts. Try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/auth/mfa/verify', mfaLimiter, async (req, res) => { ... });
```

### 8. Security Considerations

**Secret Encryption**:
- TOTP secrets encrypted at rest (same ENCRYPTION_KEY as broker API keys)
- Backup codes hashed with bcrypt (like passwords)
- Never log TOTP secrets or backup codes in plaintext

**Backup Code Security**:
- 10 codes generated initially
- One-time use only (marked as used after redemption)
- User can regenerate codes (invalidates all previous codes)
- Hashed with bcrypt before storage

**Rate Limiting**:
- 5 MFA verification attempts per 15 minutes
- Prevents brute-force attacks on 6-digit codes
- Applies to both TOTP and backup codes

**Recovery Flow**:
- Backup codes are primary recovery method
- Admin-assisted recovery as last resort (verify identity, regenerate MFA)

## Implementation Plan

### Phase 1: Backend Infrastructure (2 days)
1. Install `speakeasy` and `qrcode` packages
2. Update User model with MFA fields
3. Implement MFAService (setup, verification, backup codes)
4. Update authentication middleware for MFA flow
5. Add MFA verification endpoint with rate limiting
6. Write unit tests for MFAService

### Phase 2: Frontend UI (1-2 days)
1. Create MFA setup page (QR code, verification)
2. Create MFA verification page (login flow)
3. Update settings page (enable/disable MFA, view backup codes)
4. Add MFA status indicators
5. Implement backup code display/download (one-time only)

### Phase 3: Testing & Documentation (1 day)
1. Integration tests for MFA flow
2. Test with real authenticator apps (Google Authenticator, Authy)
3. Test backup code recovery
4. Document MFA setup guide for users
5. Update security documentation

## Success Criteria

- [ ] TOTP secret generation and QR code display working
- [ ] Authenticator apps (Google Authenticator, Authy) can scan QR code
- [ ] 6-digit TOTP verification successful during login
- [ ] 10 backup codes generated and displayed (one-time)
- [ ] Backup code redemption invalidates code
- [ ] MFA can be enabled/disabled in settings
- [ ] Rate limiting prevents brute-force attacks (5 attempts/15 min)
- [ ] All TOTP secrets encrypted at rest
- [ ] Backup codes hashed with bcrypt
- [ ] User documentation complete (setup guide, troubleshooting)
- [ ] Integration tests passing (setup, login, recovery)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users lose access to authenticator app | HIGH | Backup codes for recovery, admin-assisted recovery process |
| Backup codes lost or stolen | MEDIUM | Allow regeneration (invalidates old codes), rate limiting |
| TOTP time sync issues | LOW | Allow ±2 time step window (60 seconds), document time sync requirement |
| Brute-force attacks on 6-digit codes | MEDIUM | Rate limiting (5 attempts/15 min), account lockout after 10 failed attempts |
| Secret encryption key compromise | HIGH | Rotate ENCRYPTION_KEY, force MFA re-setup, audit access logs |

## Dependencies

**Blocking**:
- None (can implement immediately)

**Blocked By**:
- None

**Optional Enhancements** (Future):
- WebAuthn/FIDO2 hardware key support
- Admin-enforced MFA requirement (compliance)
- Remember trusted devices (30-day cookie)

## Effort Estimate

**Total**: 3-5 days (24-40 hours focused work)

**Breakdown**:
- Backend (MFAService, middleware, endpoints): 2 days (16 hours)
- Frontend (setup UI, verification UI, settings): 1-2 days (8-16 hours)
- Testing & documentation: 1 day (8 hours)

**Complexity Factors**:
- QR code generation and display
- Backup code hashing and verification
- Rate limiting implementation
- Frontend state management (MFA pending, verification flow)

## Rollback Plan

If MFA causes critical issues:
1. Feature flag: `MFA_ENABLED=false` to disable MFA requirement globally
2. Allow admin bypass: Admin can disable user MFA via support interface
3. Database rollback: Remove MFA fields from User model (data loss acceptable for new feature)
4. Revert authentication middleware changes
5. No data corruption risk (MFA fields additive, not replacing existing auth)
