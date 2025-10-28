# Deployment Validation Guide

**US5-T06**: Environment Validation and Mock Detection for Railway Deployments

## Overview

This guide documents the comprehensive validation process implemented in `deploy-railway.sh` to ensure production deployments are properly configured and free of development mocks.

## Deployment Validation Process

The deployment script implements a 5-step validation and deployment process:

### Step 1: Environment Validation

Validates critical environment variables before deployment:

```bash
node -e "const EnvValidator = require('./src/utils/env-validator');
  const result = EnvValidator.validate();
  // Checks NODE_ENV, DATABASE_URL, JWT_SECRET, BILLING_PROVIDER
"
```

**Validations**:
- `NODE_ENV` must be set to "development", "test", or "production"
- `DATABASE_URL` required in production
- `JWT_SECRET` required in production (minimum 32 characters recommended)
- `BILLING_PROVIDER` cannot be "mock" in production
- `POLAR_ACCESS_TOKEN` recommended in production

**Failure Behavior**: Deployment stops with clear error messages indicating which variables need fixing.

---

### Step 2: Mock/Sandbox Detection

Checks for dangerous mock configurations:

```bash
const detection = EnvValidator.detectMocks();
if (detection.isDangerous) {
  // Fails deployment in production with mocks
}
```

**Detects**:
- `BILLING_PROVIDER=mock` (not allowed in production)
- Missing `POLAR_ACCESS_TOKEN` (will use mock data)
- `BROKER_ALLOW_SANDBOX=true` (sandbox brokers enabled)

**Failure Behavior**: Deployment stops with specific fix instructions:
- Remove `BILLING_PROVIDER=mock`
- Set `POLAR_ACCESS_TOKEN`
- Remove `BROKER_ALLOW_SANDBOX=true`

---

### Step 3: Test Execution

Runs unit tests before deploying:

```bash
npm run test:unit
```

**Purpose**: Prevents deployment of broken code.

**Failure Behavior**: Deployment stops if any tests fail.

---

### Step 4: Railway Deployment

Deploys to Railway using the CLI:

```bash
railway up
```

**Failure Behavior**: Deployment stops if Railway upload fails.

---

### Step 5: Post-Deployment Health Check

Verifies the deployed service is healthy:

```bash
# Wait for startup
sleep 10

# Check health endpoint
curl https://discord-trade-exec-production.up.railway.app/health

# Verify no dangerous mocks reported
grep '"mockDetection":{[^}]*"isDangerous":true'
```

**Health Check Responses**:
- **HTTP 200**: Service healthy
  - Checks if health endpoint reports dangerous mocks
  - Warns if mock detection indicates production misconfiguration
- **HTTP 503**: Service unavailable (may be starting up)
- **HTTP 000**: Connection failed (service may have deployment issues)

---

## Error Messages and Fixes

### Error: "BILLING_PROVIDER=mock is not allowed in production"

**Fix**:
1. Remove `BILLING_PROVIDER=mock` from Railway environment variables
2. Set `POLAR_ACCESS_TOKEN` in Railway dashboard
3. Redeploy

### Error: "DATABASE_URL is required in production"

**Fix**:
1. Add MongoDB connection string to Railway environment variables
2. Format: `mongodb://username:password@host:port/database`
3. Redeploy

### Error: "JWT_SECRET is required in production"

**Fix**:
1. Generate secure random secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. Set `JWT_SECRET` in Railway environment variables
3. Redeploy

### Warning: "BROKER_ALLOW_SANDBOX=true in production"

**Recommendation**:
- Remove `BROKER_ALLOW_SANDBOX=true` unless intentionally testing with sandbox brokers
- Sandbox brokers use testnet/paper trading accounts (no real money)

---

## Usage

### Local Deployment

```bash
./deploy-railway.sh
```

The script will:
1. Validate your environment
2. Check for mocks
3. Run tests
4. Deploy to Railway
5. Verify health

### CI/CD Integration

Add to GitHub Actions or other CI/CD:

```yaml
- name: Deploy to Railway
  run: |
    chmod +x deploy-railway.sh
    ./deploy-railway.sh
  env:
    NODE_ENV: production
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
    POLAR_ACCESS_TOKEN: ${{ secrets.POLAR_ACCESS_TOKEN }}
```

---

## Manual Health Check

After deployment, manually verify:

```bash
# Check service health
curl https://discord-trade-exec-production.up.railway.app/health

# Expected response (no mocks):
{
  "status": "healthy",
  "timestamp": "2025-10-28T12:00:00.000Z",
  "mockDetection": {
    "hasMocks": false,
    "isDangerous": false,
    "mocks": [],
    "environment": "production"
  },
  "services": {
    "database": "connected",
    "billing": "configured"
  }
}
```

---

## Environment Validator API

### `EnvValidator.validate()`

Validates all environment variables and throws on critical errors.

**Returns**:
```javascript
{
  valid: true,
  errors: [],
  warnings: ['JWT_SECRET is only 16 characters...']
}
```

**Throws**: Error with all validation failures if any critical checks fail.

---

### `EnvValidator.detectMocks()`

Detects mock/sandbox configurations.

**Returns**:
```javascript
{
  hasMocks: true,
  isDangerous: true,  // true if production + mocks
  mocks: [
    {
      type: 'billing',
      provider: 'mock',
      reason: 'BILLING_PROVIDER=mock'
    }
  ],
  environment: 'production'
}
```

---

### `EnvValidator.getSummary()`

Returns safe configuration summary (no secrets).

**Returns**:
```javascript
{
  nodeEnv: 'production',
  billingProvider: 'polar',
  hasPolarToken: true,
  hasJwtSecret: true,
  hasDatabase: true,
  brokerAllowSandbox: false,
  discordEnabled: true,
  port: 5000
}
```

---

## Testing

Run environment validator tests:

```bash
npm test -- tests/unit/utils/env-validator.test.js
```

**Test Coverage**: 26 tests covering:
- Production environment validation (8 tests)
- Development environment validation (4 tests)
- Mock detection (7 tests)
- Environment summary (3 tests)
- Health check integration (2 tests)

---

## Related Documentation

- **Environment Configuration**: `.env.example`
- **Health Endpoint**: `src/app.js` (GET /health)
- **Environment Validator**: `src/utils/env-validator.js`
- **Test Suite**: `tests/unit/utils/env-validator.test.js`

---

## Security Considerations

### Never Commit Secrets

The deployment script safely handles secrets:
- Reads from process.env (not logged)
- Uses `EnvValidator.getSummary()` which returns boolean flags only
- Never exposes actual secret values in logs

### Production Safeguards

Multiple layers of protection:
1. **Pre-deployment validation** - Fails before Railway upload
2. **Mock detection** - Blocks dangerous configurations
3. **Post-deployment health check** - Verifies production readiness
4. **Health endpoint** - Runtime mock detection

### Development vs Production

**Development** (safe):
- `BILLING_PROVIDER=mock` ✅ Allowed
- Missing `POLAR_ACCESS_TOKEN` ✅ Allowed
- `BROKER_ALLOW_SANDBOX=true` ✅ Allowed

**Production** (strict):
- `BILLING_PROVIDER=mock` ❌ Blocked
- Missing `POLAR_ACCESS_TOKEN` ⚠️ Warning
- `BROKER_ALLOW_SANDBOX=true` ⚠️ Warning

---

## Troubleshooting

### Deployment fails at Step 1

**Symptom**: "Environment validation failed"

**Cause**: Missing or invalid environment variables

**Fix**: Check error message for specific variables, set in Railway dashboard

---

### Deployment fails at Step 2

**Symptom**: "Dangerous mock configuration detected"

**Cause**: Production environment has development mocks enabled

**Fix**: Remove mock configurations from Railway environment variables

---

### Deployment fails at Step 3

**Symptom**: "Tests failed"

**Cause**: Unit tests failing locally

**Fix**: Run `npm test` locally, fix failing tests, commit fixes

---

### Health check reports HTTP 503

**Symptom**: Post-deployment health check shows "Service unavailable"

**Possible Causes**:
1. Service still starting up (wait 30 seconds, check again)
2. Application crash on startup (check `railway logs`)
3. Database connection failure (verify DATABASE_URL)

**Fix**: Check Railway logs for startup errors

---

### Health check reports mocks in production

**Symptom**: "Health endpoint reports dangerous mock configuration"

**Cause**: Environment variables changed after deployment

**Fix**: Verify Railway environment variables, redeploy with correct configuration

---

## Maintenance

### Updating Validation Rules

Edit `src/utils/env-validator.js`:

```javascript
// Add new validation
if (!process.env.NEW_REQUIRED_VAR) {
  errors.push('NEW_REQUIRED_VAR is required in production');
}
```

Update tests in `tests/unit/utils/env-validator.test.js`:

```javascript
it('should fail when NEW_REQUIRED_VAR missing in production', () => {
  delete process.env.NEW_REQUIRED_VAR;
  expect(() => EnvValidator.validate()).toThrow(/NEW_REQUIRED_VAR is required/);
});
```

---

## Changelog

### US5-T06 (2025-10-28)
- ✅ Implemented 5-step validation process
- ✅ Added environment validation (Step 1)
- ✅ Added mock detection (Step 2)
- ✅ Added test execution (Step 3)
- ✅ Enhanced Railway deployment (Step 4)
- ✅ Added post-deployment health check (Step 5)
- ✅ Created comprehensive test suite (26 tests)
- ✅ Documented validation process and troubleshooting
