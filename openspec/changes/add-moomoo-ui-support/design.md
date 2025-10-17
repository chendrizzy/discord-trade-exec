# Design: Add Full Moomoo Connection Support

## Architectural Overview

This change extends the existing broker configuration system to support Moomoo's unique authentication and connection requirements while maintaining consistency with the existing BrokerConfigWizard pattern.

## Core Design Decisions

### 1. Dynamic Credential Fields Architecture

**Decision**: Extend broker metadata to include `credentialFields` schema

**Rationale**:
- Moomoo requires different fields (Account ID, Password, Host, Port) vs standard API Key/Secret
- Future brokers may have unique requirements (OAuth callback URL, 2FA tokens, etc.)
- Avoids hard-coding broker-specific logic in UI components

**Implementation**:
```javascript
// src/brokers/BrokerFactory.js
this.registerBroker('moomoo', {
  name: 'Moomoo',
  type: 'stock',
  authMethods: ['api-key'], // Uses custom API key structure
  credentialFields: [
    { name: 'accountId', label: 'Account ID', type: 'text', required: true },
    { name: 'password', label: 'Trading Password', type: 'password', required: true },
    { name: 'host', label: 'OpenD Gateway Host', type: 'text', required: false, default: '127.0.0.1' },
    { name: 'port', label: 'OpenD Gateway Port', type: 'number', required: false, default: 11111 }
  ],
  prerequisites: {
    requiresOpenDRunning: true,
    requiresAPIQuestionnaire: true,
    setupGuideUrl: '/docs/MOOMOO_OPEND_TROUBLESHOOTING.md'
  }
});
```

**Alternatives Considered**:
1. **Hard-code Moomoo fields in UI** - Rejected: Not scalable to future brokers
2. **Create separate Moomoo wizard** - Rejected: Fragments UX, duplicates code
3. **Use generic "custom fields" JSON** - Rejected: Less type-safe, harder to validate

### 2. API Endpoint Design

**Decision**: Leverage existing `/api/brokers` endpoints with minimal changes

**Current Endpoints**:
```
GET  /api/brokers                    → List all available brokers
GET  /api/brokers/:brokerKey         → Get broker metadata
POST /api/brokers/configure          → Save broker configuration
POST /api/brokers/test               → Test broker connection (with credentials in body)
POST /api/brokers/test/:brokerKey    → Test configured broker (Bug #4 endpoint)
GET  /api/brokers/user/configured    → Get user's configured brokers
DELETE /api/brokers/user/:brokerKey  → Disconnect broker
```

**Required Changes**:
1. `GET /api/brokers` - Include Moomoo in response
2. `GET /api/brokers/moomoo` - Return Moomoo metadata with `credentialFields`
3. `POST /api/brokers/configure` - Handle Moomoo credential structure
4. `POST /api/brokers/test` - Map Moomoo fields to adapter constructor

**Design Pattern**:
```javascript
// src/routes/api/brokers.js
router.post('/configure', ensureAuthenticated, async (req, res) => {
  const { brokerKey, credentials, environment } = req.body;

  // Get broker metadata to validate credential structure
  const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

  // Validate credentials match expected fields
  validateCredentials(credentials, brokerInfo.credentialFields);

  // Encrypt and store (existing encryption service)
  const encryptedCreds = await encryptionService.encryptCredential(
    req.user.communityId,
    credentials
  );

  // Save to user document
  await user.save();
});
```

### 3. UI Component Extension

**Decision**: Use conditional rendering in existing BrokerConfigWizard

**Pattern**:
```jsx
// src/dashboard/components/BrokerConfigWizard.jsx - Step 4 (Credentials)
case 4:
  return (
    <div className="space-y-4">
      {/* Environment selection (all brokers) */}
      <EnvironmentSelector />

      {/* Dynamic credential fields based on broker metadata */}
      {selectedBrokerInfo?.credentialFields?.map((field) => (
        <CredentialField
          key={field.name}
          field={field}
          value={config[field.name]}
          onChange={(value) => updateConfig(field.name, value)}
        />
      ))}

      {/* Prerequisite warnings */}
      {selectedBrokerInfo?.prerequisites?.requiresOpenDRunning && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Moomoo requires OpenD Gateway to be running locally.
            <a href={selectedBrokerInfo.prerequisites.setupGuideUrl}>
              Setup Guide →
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
```

**Component Hierarchy**:
```
BrokerConfigWizard
├─ Step 1: Broker Type (Stock/Crypto)
├─ Step 2: Broker Selection
├─ Step 3: Auth Method
├─ Step 4: Credentials
│   ├─ EnvironmentSelector (testnet/live)
│   ├─ DynamicCredentialFields (based on broker metadata)
│   └─ PrerequisiteWarnings (OpenD Gateway, API questionnaire)
├─ Step 5: Connection Test
└─ Step 6: Review & Save
```

### 4. Credential Encryption Strategy

**Decision**: Reuse existing AWS KMS encryption service

**Flow**:
```
User Input → BrokerConfigWizard → API POST /configure
              ↓
            Validation (credentialFields schema)
              ↓
            Encryption (AWS KMS via encryptionService)
              ↓
            Storage (MongoDB user.brokerConfigs[brokerKey])
              ↓
            Response (success/error)
```

**Security Considerations**:
- All credential fields encrypted using same DEK (Data Encryption Key)
- DEK encrypted by AWS KMS CMK (Customer Master Key)
- Credentials never logged or exposed in API responses
- Decryption only happens during connection test or trade execution

### 5. Connection Testing Flow

**Decision**: Support both inline testing (Step 5) and post-configuration testing

**Inline Testing (Step 5 of wizard)**:
```javascript
POST /api/brokers/test
Body: {
  brokerKey: 'moomoo',
  credentials: { accountId, password, host, port },
  options: { isTestnet: true }
}
```

**Post-Configuration Testing (BrokerManagement.jsx)**:
```javascript
POST /api/brokers/test/:brokerKey
Body: {} // Uses stored encrypted credentials
```

**Test Result Structure**:
```javascript
{
  success: true,
  message: "Connected to Moomoo successfully",
  broker: "moomoo",
  balance: {
    total: 1000000,
    available: 1000000,
    currency: "USD"
  }
}
```

## Data Flow Diagrams

### Configuration Flow
```
User → BrokerConfigWizard
        ↓ Select Moomoo
        ↓ Fetch /api/brokers/moomoo (get metadata)
        ↓ Render credentialFields dynamically
        ↓ Enter: accountId, password, host, port
        ↓ Click "Test Connection"
        ↓ POST /api/brokers/test
        ↓ BrokerFactory.testConnection()
        ↓ MoomooAdapter.authenticate()
        ↓ OpenD Gateway connection
        ↓ Return balance
        ↓ Show success/failure
        ↓ Click "Save Configuration"
        ↓ POST /api/brokers/configure
        ↓ Encrypt credentials (AWS KMS)
        ↓ Save to MongoDB user.brokerConfigs.moomoo
        ↓ Close wizard
```

### Connection Test Flow (Configured Broker)
```
User → BrokerManagement → Click "Test Connection"
        ↓
      POST /api/brokers/test/:brokerKey
        ↓
      Fetch user.brokerConfigs.moomoo from MongoDB
        ↓
      Decrypt credentials (AWS KMS)
        ↓
      BrokerFactory.testConnection()
        ↓
      MoomooAdapter.authenticate()
        ↓
      OpenD Gateway connection
        ↓
      Update lastVerified timestamp
        ↓
      Return balance + success
        ↓
      Display result in UI
```

## Error Handling Strategy

### OpenD Gateway Not Running
```javascript
catch (error) {
  if (error.message.includes('Connection timeout') ||
      error.message.includes('ECONNREFUSED')) {
    return {
      success: false,
      message: "Cannot connect to OpenD Gateway. Ensure OpenD Gateway is running on localhost:11111",
      helpUrl: "/docs/MOOMOO_OPEND_TROUBLESHOOTING.md"
    };
  }
}
```

### API Questionnaire Not Completed
```javascript
catch (error) {
  if (error.message.includes('retType: -1') ||
      error.message.includes('permission denied')) {
    return {
      success: false,
      message: "API access denied. Please complete the API Questionnaire in your Moomoo mobile app.",
      helpUrl: "https://openapi.moomoo.com/docs/questionnaire"
    };
  }
}
```

### Invalid Credentials
```javascript
catch (error) {
  if (error.message.includes('Authentication failed') ||
      error.message.includes('Invalid password')) {
    return {
      success: false,
      message: "Invalid Account ID or Trading Password. Please verify your credentials."
    };
  }
}
```

## Testing Strategy

### Unit Tests
- BrokerFactory returns Moomoo metadata with credentialFields
- API endpoints validate Moomoo credential structure
- Credential encryption/decryption roundtrip
- Error handling for missing OpenD Gateway

### Integration Tests
- Full configuration flow with mocked OpenD Gateway
- Connection test with valid/invalid credentials
- Disconnect flow removes encrypted credentials

### E2E Tests (Playwright)
```javascript
// tests/e2e/moomoo-configuration.spec.js
test('configure Moomoo broker successfully', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('[data-testid="add-broker-button"]');
  await page.click('[data-testid="broker-type-stock"]');
  await page.click('[data-testid="broker-moomoo"]');
  await page.click('[data-testid="auth-method-api-key"]');

  // Fill Moomoo-specific fields
  await page.fill('[name="accountId"]', '72635647');
  await page.fill('[name="password"]', 'test_password');
  await page.fill('[name="host"]', '127.0.0.1');
  await page.fill('[name="port"]', '11111');

  // Verify prerequisite warning displayed
  await expect(page.locator('text=OpenD Gateway')).toBeVisible();

  // Test connection (will fail without OpenD running)
  await page.click('[data-testid="test-connection"]');

  // Save configuration
  await page.click('[data-testid="save-configuration"]');

  // Verify Moomoo appears in configured brokers
  await expect(page.locator('text=Moomoo')).toBeVisible();
});
```

## Performance Considerations

### API Response Time
- `/api/brokers` response size increases minimally (+ ~500 bytes for Moomoo metadata)
- No impact on database queries (same user document structure)
- Encryption/decryption time unchanged (same AWS KMS operations)

### UI Bundle Size
- No additional dependencies required
- Conditional rendering adds negligible JavaScript
- `credentialFields` pattern reusable for future brokers (no technical debt)

## Migration Strategy

**No Breaking Changes:**
- Existing brokers (Alpaca, IBKR, Schwab, Kraken) continue to work
- BrokerConfigWizard backward compatible (falls back to standard API Key/Secret if no credentialFields)
- Database schema unchanged (brokerConfigs already flexible object)

**Deployment Steps**:
1. Deploy backend API changes
2. Deploy frontend UI changes
3. Update documentation
4. Announce Moomoo support availability

## Future Extensibility

**This design enables:**
1. Adding brokers with custom credential structures (e.g., TD Ameritrade OAuth)
2. Supporting multi-step OAuth flows (e.g., Schwab callback handling)
3. Implementing broker-specific validation rules
4. Creating broker setup wizards with custom prerequisites

**Pattern Reusability**:
```javascript
// Future broker example: TD Ameritrade with OAuth
this.registerBroker('tdameritrade', {
  name: 'TD Ameritrade',
  authMethods: ['oauth'],
  credentialFields: [
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'redirectUri', label: 'Redirect URI', type: 'url', required: true }
  ],
  prerequisites: {
    requiresOAuthSetup: true,
    setupGuideUrl: '/docs/TDAMERITRADE_OAUTH_SETUP.md'
  }
});
```

---

**Design Status**: Complete
**Approved By**: [Pending Review]
**Implementation Start**: TBD
