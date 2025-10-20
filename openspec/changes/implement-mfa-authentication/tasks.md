# Tasks: Implement Multi-Factor Authentication (MFA)

## Phase 1: Backend Infrastructure (2 days)

### 1.1 Install Dependencies
- [ ] **Task 1.1.1**: Install TOTP and QR code packages
  ```bash
  npm install speakeasy qrcode
  ```
- [ ] **Task 1.1.2**: Verify installation in `package.json`
  - `speakeasy: ^2.0.0`
  - `qrcode: ^1.5.0`
- [ ] **Task 1.1.3**: Update `package-lock.json`
- [ ] **Validation**: Dependencies installed, no conflicts

### 1.2 Update User Model
- [ ] **Task 1.2.1**: Locate User model file
  - Path: `src/models/User.js`
- [ ] **Task 1.2.2**: Add MFA fields to schema
  ```javascript
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
  ```
- [ ] **Task 1.2.3**: Run migration (if applicable)
  - Existing users: `mfa.enabled` defaults to `false`
  - No breaking changes to existing data
- [ ] **Validation**: User model updated, existing users unaffected

### 1.3 Implement MFAService
- [ ] **Task 1.3.1**: Create MFAService file
  - Path: `src/services/MFAService.js`
- [ ] **Task 1.3.2**: Implement `generateTOTPSecret(userId, userEmail)`
  ```javascript
  const speakeasy = require('speakeasy');
  const QRCode = require('qrcode');

  async generateTOTPSecret(userId, userEmail) {
    const secret = speakeasy.generateSecret({
      name: `Discord Trade Executor (${userEmail})`,
      issuer: 'Discord Trade Executor',
      length: 32
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl
    };
  }
  ```
- [ ] **Task 1.3.3**: Implement `verifyTOTPSetup(userId, secret, token)`
  - Verify TOTP code during setup
  - Generate backup codes
  - Encrypt secret before storing
  - Hash backup codes with bcrypt
  - Update User model with MFA data
  - Return plaintext backup codes (only time shown)
- [ ] **Task 1.3.4**: Implement `verifyTOTP(userId, token)`
  - Retrieve user from database
  - Decrypt TOTP secret
  - Verify token with `speakeasy.totp.verify()`
  - Window: 2 (±60 seconds for time sync issues)
  - Return boolean (valid/invalid)
- [ ] **Task 1.3.5**: Implement `generateBackupCodes(count = 10)`
  ```javascript
  const crypto = require('crypto');

  generateBackupCodes(count = 10) {
    return Array.from({ length: count }, () => {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      return `${code.slice(0, 4)}-${code.slice(4)}`;
    });
  }
  ```
- [ ] **Task 1.3.6**: Implement `verifyBackupCode(userId, code)`
  - Hash provided code
  - Find matching unused backup code in user document
  - Mark as used if found
  - Return boolean (valid/invalid)
- [ ] **Task 1.3.7**: Implement `regenerateBackupCodes(userId)`
  - Generate new backup codes
  - Invalidate all previous backup codes
  - Save to user document
  - Return plaintext codes
- [ ] **Task 1.3.8**: Implement `disableMFA(userId)`
  - Remove TOTP secret
  - Clear backup codes
  - Set `mfa.enabled` to false
  - Require confirmation (password or existing MFA code)
- [ ] **Validation**: MFAService methods implemented and tested

### 1.4 Add Encryption Utilities
- [ ] **Task 1.4.1**: Locate or create encryption utility
  - Path: `src/utils/encryption.js` (if exists)
  - Reuse existing encryption for broker API keys
- [ ] **Task 1.4.2**: Implement `encryptTOTPSecret(secret)`
  - Use AES-256-GCM with ENCRYPTION_KEY environment variable
  - Return encrypted string (IV + auth tag + ciphertext)
- [ ] **Task 1.4.3**: Implement `decryptTOTPSecret(encryptedSecret)`
  - Decrypt using ENCRYPTION_KEY
  - Handle decryption errors gracefully
  - Return plaintext secret
- [ ] **Task 1.4.4**: Implement `hashBackupCode(code)`
  - Use bcrypt with salt rounds: 10
  - Return hashed code
- [ ] **Validation**: Encryption utilities tested (encrypt → decrypt round-trip)

### 1.5 Update Authentication Middleware
- [ ] **Task 1.5.1**: Locate Discord OAuth2 callback handler
  - Path: `src/routes/auth.js` (GET `/auth/discord/callback`)
- [ ] **Task 1.5.2**: Add MFA check after successful OAuth2
  ```javascript
  app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login' }),
    async (req, res) => {
      const user = req.user;

      if (user.mfa.enabled) {
        req.session.mfaPending = true;
        req.session.userId = user._id;
        req.session.authenticated = false;  // Not fully authenticated yet
        return res.redirect('/mfa/verify');
      }

      req.session.authenticated = true;
      res.redirect('/dashboard');
    }
  );
  ```
- [ ] **Task 1.5.3**: Update `isAuthenticated` middleware
  - Check `req.session.authenticated === true`
  - Reject if `req.session.mfaPending === true`
  - Existing routes protected by this middleware
- [ ] **Validation**: OAuth2 callback redirects to MFA verification if enabled

### 1.6 Implement MFA Verification Endpoint
- [ ] **Task 1.6.1**: Create MFA verification endpoint
  - Path: POST `/auth/mfa/verify`
  - Rate limited: 5 attempts per 15 minutes
- [ ] **Task 1.6.2**: Implement rate limiter middleware
  ```javascript
  const rateLimit = require('express-rate-limit');

  const mfaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many MFA verification attempts. Try again in 15 minutes.',
    standardHeaders: true
  });
  ```
- [ ] **Task 1.6.3**: Implement verification logic
  ```javascript
  app.post('/auth/mfa/verify', mfaLimiter, async (req, res) => {
    const { code } = req.body;
    const userId = req.session.userId;

    if (!req.session.mfaPending) {
      return res.status(400).json({ error: 'No MFA verification pending' });
    }

    const mfaService = new MFAService();

    // Try TOTP code
    const totpValid = await mfaService.verifyTOTP(userId, code);
    if (totpValid) {
      req.session.authenticated = true;
      req.session.mfaPending = false;
      return res.json({ success: true });
    }

    // Try backup code
    const backupCodeValid = await mfaService.verifyBackupCode(userId, code);
    if (backupCodeValid) {
      req.session.authenticated = true;
      req.session.mfaPending = false;
      return res.json({ success: true, usedBackupCode: true });
    }

    return res.status(401).json({ error: 'Invalid MFA code' });
  });
  ```
- [ ] **Task 1.6.4**: Add logging for MFA attempts
  - Log successful verifications (info level)
  - Log failed attempts (warning level)
  - Include userId and timestamp
- [ ] **Validation**: Endpoint accepts valid TOTP/backup codes, rejects invalid

### 1.7 Implement MFA Setup Endpoints
- [ ] **Task 1.7.1**: Create MFA setup initiation endpoint
  - Path: POST `/api/mfa/setup`
  - Authentication required (existing session)
  - Response: `{ secret, qrCode }`
  - Store temporary secret in session (not DB yet)
- [ ] **Task 1.7.2**: Create MFA setup verification endpoint
  - Path: POST `/api/mfa/setup/verify`
  - Body: `{ token }` (6-digit code)
  - Retrieve secret from session
  - Verify token with MFAService
  - If valid: Save encrypted secret and backup codes to DB
  - Response: `{ success: true, backupCodes: [...] }`
- [ ] **Task 1.7.3**: Create MFA disable endpoint
  - Path: POST `/api/mfa/disable`
  - Body: `{ password }` or `{ mfaCode }` for confirmation
  - Verify confirmation
  - Call `mfaService.disableMFA(userId)`
  - Response: `{ success: true }`
- [ ] **Task 1.7.4**: Create backup codes regeneration endpoint
  - Path: POST `/api/mfa/backup-codes/regenerate`
  - Authentication required
  - Require MFA code for confirmation
  - Call `mfaService.regenerateBackupCodes(userId)`
  - Response: `{ backupCodes: [...] }`
- [ ] **Validation**: All MFA management endpoints working

### 1.8 Write Unit Tests
- [ ] **Task 1.8.1**: Create MFAService test file
  - Path: `src/services/__tests__/MFAService.test.js`
- [ ] **Task 1.8.2**: Test `generateTOTPSecret()`
  - Verify secret generated (32 characters, base32)
  - Verify QR code data URL returned
  - Test issuer and name in otpauth URL
- [ ] **Task 1.8.3**: Test `verifyTOTPSetup()`
  - Mock user update
  - Test valid token → success, backup codes returned
  - Test invalid token → failure
  - Verify backup codes hashed before storage
  - Verify secret encrypted before storage
- [ ] **Task 1.8.4**: Test `verifyTOTP()`
  - Mock user with encrypted secret
  - Test valid code → true
  - Test invalid code → false
  - Test time window (codes from ±60 seconds valid)
- [ ] **Task 1.8.5**: Test `generateBackupCodes()`
  - Verify 10 codes generated
  - Format: `XXXX-XXXX` (8 hex characters)
  - All codes unique
- [ ] **Task 1.8.6**: Test `verifyBackupCode()`
  - Mock user with hashed backup codes
  - Test valid unused code → true, marks as used
  - Test already-used code → false
  - Test invalid code → false
- [ ] **Task 1.8.7**: Test `regenerateBackupCodes()`
  - Verify new codes generated
  - Verify old codes invalidated
- [ ] **Task 1.8.8**: Test `disableMFA()`
  - Verify secret removed
  - Verify backup codes cleared
  - Verify `mfa.enabled` set to false
- [ ] **Validation**: All MFAService tests passing, coverage >90%

### 1.9 Integration Tests
- [ ] **Task 1.9.1**: Create MFA integration test file
  - Path: `tests/integration/mfa.test.js`
- [ ] **Task 1.9.2**: Test full MFA setup flow
  1. Initiate setup (POST `/api/mfa/setup`)
  2. Receive secret and QR code
  3. Generate TOTP code using speakeasy
  4. Verify setup (POST `/api/mfa/setup/verify`)
  5. Receive backup codes
  6. Verify user MFA enabled in DB
- [ ] **Task 1.9.3**: Test login flow with MFA
  1. Login via Discord OAuth2 (mock)
  2. Verify redirect to `/mfa/verify`
  3. Submit valid TOTP code (POST `/auth/mfa/verify`)
  4. Verify session authenticated
  5. Access protected route successfully
- [ ] **Task 1.9.4**: Test backup code recovery
  1. Login with MFA-enabled user
  2. Submit backup code instead of TOTP
  3. Verify session authenticated
  4. Verify backup code marked as used
- [ ] **Task 1.9.5**: Test rate limiting
  - Submit 5 invalid MFA codes
  - Verify 6th attempt blocked (429 status)
  - Wait 15 minutes (or mock time)
  - Verify attempts reset
- [ ] **Validation**: Integration tests passing, full flow verified

## Phase 2: Frontend UI (1-2 days)

### 2.1 Create MFA Setup Page
- [ ] **Task 2.1.1**: Create setup page component
  - Path: `src/dashboard/pages/MFASetup.jsx`
- [ ] **Task 2.1.2**: Implement QR code display
  - Fetch `/api/mfa/setup` on page load
  - Display QR code image from data URL
  - Show secret text (manual entry option)
- [ ] **Task 2.1.3**: Add verification input
  - 6-digit code input (numeric only, auto-submit)
  - "Verify and Enable MFA" button
  - Loading state during verification
- [ ] **Task 2.1.4**: Handle verification response
  - Success: Display backup codes
  - Failure: Show error message
- [ ] **Task 2.1.5**: Display backup codes (one-time only)
  - Show all 10 codes in list
  - "Download as text file" button
  - "Copy to clipboard" button
  - Warning: "Save these codes in a secure location (password manager)"
  - Checkbox: "I have saved my backup codes"
  - "Continue" button (disabled until checkbox checked)
- [ ] **Task 2.1.6**: Add styling
  - Responsive layout (mobile-friendly)
  - QR code centered
  - Backup codes in monospace font
  - Clear visual hierarchy
- [ ] **Validation**: MFA setup flow works end-to-end in browser

### 2.2 Create MFA Verification Page
- [ ] **Task 2.2.1**: Create verification page component
  - Path: `src/dashboard/pages/MFAVerify.jsx`
- [ ] **Task 2.2.2**: Add 6-digit code input
  - Numeric input with auto-focus
  - Auto-submit on 6 digits
  - "Verify" button as fallback
- [ ] **Task 2.2.3**: Add backup code toggle
  - "Use backup code instead" link
  - Switches input to text (8 characters with hyphen)
  - Help text: "Backup codes are 8 characters (XXXX-XXXX)"
- [ ] **Task 2.2.4**: Handle verification response
  - Success: Redirect to dashboard
  - Failure: Show error message
  - Rate limit error: Show countdown timer
- [ ] **Task 2.2.5**: Add rate limiting feedback
  - Display remaining attempts (if available from server)
  - Show error: "Too many attempts. Try again in X minutes"
- [ ] **Task 2.2.6**: Add "Lost access?" link
  - Links to recovery help page or support
  - Explains backup code usage
- [ ] **Task 2.2.7**: Add styling
  - Clean, focused layout
  - Large input field for code
  - Clear error messages (red text)
- [ ] **Validation**: MFA verification page works during login

### 2.3 Update Settings Page
- [ ] **Task 2.3.1**: Locate settings page component
  - Path: `src/dashboard/pages/Settings.jsx`
- [ ] **Task 2.3.2**: Add MFA status section
  - Heading: "Two-Factor Authentication (2FA)"
  - Status indicator: "Enabled" (green) or "Disabled" (gray)
  - If enabled: Show enabledAt date
- [ ] **Task 2.3.3**: Add "Enable MFA" button (if disabled)
  - Redirects to `/mfa/setup` page
  - Button style: Primary CTA
- [ ] **Task 2.3.4**: Add "Disable MFA" button (if enabled)
  - Opens confirmation modal
  - Modal requires password or MFA code
  - Warning: "Disabling 2FA reduces account security"
  - Confirm button calls POST `/api/mfa/disable`
- [ ] **Task 2.3.5**: Add "Regenerate Backup Codes" button (if enabled)
  - Opens confirmation modal
  - Requires MFA code for confirmation
  - Warning: "Old backup codes will no longer work"
  - Confirm button calls POST `/api/mfa/backup-codes/regenerate`
  - Displays new backup codes (one-time, like setup)
- [ ] **Task 2.3.6**: Add styling
  - Consistent with existing settings sections
  - Status badge for enabled/disabled state
  - Clear button hierarchy (enable = primary, disable = danger)
- [ ] **Validation**: Settings page MFA controls working

### 2.4 Create Confirmation Modals
- [ ] **Task 2.4.1**: Create DisableMFAModal component
  - Path: `src/dashboard/components/DisableMFAModal.jsx`
  - Password or MFA code input
  - "Disable 2FA" button (danger style)
  - Cancel button
- [ ] **Task 2.4.2**: Create RegenerateBackupCodesModal component
  - Path: `src/dashboard/components/RegenerateBackupCodesModal.jsx`
  - MFA code input (required)
  - Warning text
  - "Regenerate" button
  - Cancel button
  - Success state: Display new backup codes
- [ ] **Validation**: Modals functional, validation works

### 2.5 Add MFA Status Indicators
- [ ] **Task 2.5.1**: Add MFA badge to user profile dropdown
  - Show "2FA Enabled" badge if user has MFA
  - Green checkmark icon
- [ ] **Task 2.5.2**: Add security score indicator (optional enhancement)
  - Dashboard widget showing security score
  - "Enable 2FA" increases score by 20%
- [ ] **Validation**: Status indicators visible and accurate

### 2.6 Frontend Integration Testing
- [ ] **Task 2.6.1**: Test MFA setup flow in browser
  - Navigate to settings
  - Click "Enable MFA"
  - Scan QR code with Google Authenticator app
  - Enter TOTP code from app
  - Verify backup codes displayed
  - Save backup codes
- [ ] **Task 2.6.2**: Test login flow with MFA
  - Logout
  - Login via Discord OAuth2
  - Verify redirect to MFA verification page
  - Enter TOTP code from app
  - Verify redirect to dashboard
- [ ] **Task 2.6.3**: Test backup code recovery
  - Logout
  - Login via Discord OAuth2
  - Click "Use backup code instead"
  - Enter one backup code
  - Verify login successful
  - Verify backup code marked as used (cannot reuse)
- [ ] **Task 2.6.4**: Test MFA disable flow
  - Navigate to settings
  - Click "Disable MFA"
  - Enter MFA code
  - Confirm
  - Verify MFA disabled
- [ ] **Task 2.6.5**: Test backup code regeneration
  - Enable MFA again
  - Click "Regenerate Backup Codes"
  - Enter MFA code
  - Verify new codes displayed
  - Test old backup code (should fail)
  - Test new backup code (should work)
- [ ] **Validation**: All frontend flows working as expected

## Phase 3: Testing & Documentation (1 day)

### 3.1 End-to-End Testing
- [ ] **Task 3.1.1**: Test with real authenticator apps
  - Google Authenticator (iOS/Android)
  - Authy (iOS/Android/Desktop)
  - 1Password (authenticator feature)
  - Microsoft Authenticator
- [ ] **Task 3.1.2**: Test time sync edge cases
  - Server time ahead of authenticator
  - Server time behind authenticator
  - Verify ±60 second window works
- [ ] **Task 3.1.3**: Test rate limiting edge cases
  - 5 failed attempts → blocked
  - Wait 15 minutes → unblocked
  - Mix of valid and invalid attempts
- [ ] **Task 3.1.4**: Test backup code edge cases
  - Use all 10 backup codes → no codes left
  - Regenerate after using some codes
  - Attempt to reuse used backup code
- [ ] **Task 3.1.5**: Test MFA disable edge cases
  - Disable with password vs MFA code
  - Disable after losing authenticator (backup code)
- [ ] **Validation**: All edge cases handled gracefully

### 3.2 Security Audit
- [ ] **Task 3.2.1**: Verify secrets encrypted at rest
  - Check MongoDB: `mfa.secret` should be ciphertext
  - Verify cannot decrypt without ENCRYPTION_KEY
- [ ] **Task 3.2.2**: Verify backup codes hashed
  - Check MongoDB: `mfa.backupCodes[].code` should be bcrypt hash
  - Verify cannot reverse hash
- [ ] **Task 3.2.3**: Verify no secrets in logs
  - Search logs for TOTP secrets (should be none)
  - Search logs for backup codes (should be none)
  - Verify only userId and timestamps logged
- [ ] **Task 3.2.4**: Test rate limiting effectiveness
  - Brute-force attack simulation (automated script)
  - Verify blocked after 5 attempts
  - Calculate time to brute-force 6-digit code with rate limiting
  - Expected: 15 min * 200,000 attempts / 5 = ~417 days
- [ ] **Task 3.2.5**: Test session security
  - Verify `mfaPending` session flag cannot be bypassed
  - Attempt to access protected routes with `mfaPending=true`
  - Verify rejected
- [ ] **Validation**: Security audit passed, no vulnerabilities

### 3.3 User Documentation
- [ ] **Task 3.3.1**: Create MFA setup guide
  - Path: `docs/user/mfa-setup-guide.md` or in app help section
  - Step-by-step instructions with screenshots
  - Recommended authenticator apps
  - Backup code storage best practices
- [ ] **Task 3.3.2**: Create MFA troubleshooting guide
  - "Invalid code" errors → check time sync
  - "Lost authenticator app" → use backup code
  - "Lost backup codes" → contact support
  - Time sync instructions (iOS/Android)
- [ ] **Task 3.3.3**: Create FAQ section
  - What is 2FA/MFA?
  - Why should I enable it?
  - Which authenticator apps are supported?
  - Can I use SMS 2FA? (No, not supported)
  - What if I lose my phone?
- [ ] **Task 3.3.4**: Add in-app help tooltips
  - Setup page: Explain QR code and manual entry
  - Settings page: Explain MFA status and backup codes
  - Verification page: Link to troubleshooting guide
- [ ] **Validation**: User documentation complete and clear

### 3.4 Developer Documentation
- [ ] **Task 3.4.1**: Document MFAService API
  - Method signatures with JSDoc
  - Usage examples
  - Error handling patterns
- [ ] **Task 3.4.2**: Update architecture documentation
  - Add MFA to authentication flow diagram
  - Document session state (`mfaPending`, `authenticated`)
  - Update security documentation (encryption, hashing)
- [ ] **Task 3.4.3**: Document deployment requirements
  - Environment variables: `ENCRYPTION_KEY` (required)
  - Database migration: User model MFA fields
  - No additional external services required
- [ ] **Task 3.4.4**: Document future enhancements
  - WebAuthn/FIDO2 hardware keys
  - Admin-enforced MFA requirement
  - Remember trusted devices (30-day cookie)
- [ ] **Validation**: Developer documentation complete

### 3.5 Performance Testing
- [ ] **Task 3.5.1**: Benchmark TOTP verification latency
  - Measure time for `verifyTOTP()` call
  - Expected: <50ms
  - Profile decryption overhead
- [ ] **Task 3.5.2**: Benchmark backup code verification latency
  - Measure time for `verifyBackupCode()` call
  - Expected: <100ms (bcrypt hashing)
  - Profile bcrypt compare time
- [ ] **Task 3.5.3**: Load test MFA verification endpoint
  - 100 concurrent requests to `/auth/mfa/verify`
  - Measure response times
  - Verify rate limiting works under load
- [ ] **Task 3.5.4**: Profile database impact
  - Measure User model size increase (MFA fields)
  - Expected: ~500 bytes per user (encrypted secret + hashed codes)
  - Verify no performance degradation on user lookups
- [ ] **Validation**: Performance acceptable, no bottlenecks

### 3.6 Deployment Checklist
- [ ] **Task 3.6.1**: Update `.env.example`
  - Add `ENCRYPTION_KEY=your-encryption-key-here` (if not already present)
  - Document key generation: `openssl rand -base64 32`
- [ ] **Task 3.6.2**: Create deployment guide
  - Database migration steps (if applicable)
  - Environment variable configuration
  - Feature flag rollout strategy (if applicable)
- [ ] **Task 3.6.3**: Plan staged rollout
  - Stage 1: Deploy to staging, test with team
  - Stage 2: Deploy to 10% of production users
  - Stage 3: Monitor for issues, rollback plan ready
  - Stage 4: Full rollout to 100%
- [ ] **Task 3.6.4**: Set up monitoring
  - MFA setup rate (users enabling MFA)
  - MFA verification success rate
  - Backup code usage rate
  - Rate limit hits (failed attempts)
- [ ] **Validation**: Deployment plan complete and reviewed

## Success Criteria Checklist

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

## Effort Estimate

**Total**: 3-5 days (24-40 hours)

- Backend infrastructure: 2 days (16 hours)
- Frontend UI: 1-2 days (8-16 hours)
- Testing & documentation: 1 day (8 hours)
