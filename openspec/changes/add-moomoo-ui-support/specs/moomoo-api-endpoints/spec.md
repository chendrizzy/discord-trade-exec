# Spec: Moomoo API Endpoints Support

## ADDED Requirements

### Requirement: Moomoo Broker Metadata in Listing Endpoint

The system SHALL include Moomoo broker in the GET /api/brokers response with complete metadata including credentialFields and prerequisites.

**Rationale**: UI needs to discover Moomoo as an available broker and retrieve its configuration requirements.

#### Scenario: GET /api/brokers includes Moomoo

**Given** user is authenticated
**When** client sends GET /api/brokers
**Then** response includes Moomoo in brokers array:
```json
{
  "success": true,
  "brokers": [
    {
      "key": "moomoo",
      "name": "Moomoo",
      "type": "stock",
      "status": "available",
      "description": "Commission-free stock trading with OpenD Gateway integration",
      "authMethods": ["api-key"],
      "features": ["stocks", "options", "futures", "forex", "crypto"],
      "credentialFields": [
        { "name": "accountId", "label": "Account ID", "type": "text", "required": true },
        { "name": "password", "label": "Trading Password", "type": "password", "required": true },
        { "name": "host", "label": "OpenD Gateway Host", "type": "text", "required": false, "default": "127.0.0.1" },
        { "name": "port", "label": "OpenD Gateway Port", "type": "number", "required": false, "default": 11111 }
      ],
      "prerequisites": {
        "requiresOpenDRunning": true,
        "requiresAPIQuestionnaire": true,
        "setupGuideUrl": "/docs/MOOMOO_OPEND_TROUBLESHOOTING.md"
      }
    },
    // ... other brokers (alpaca, ibkr, etc.)
  ]
}
```
**And** response status is 200 OK
**And** Moomoo entry includes all required metadata fields

---

### Requirement: Moomoo Broker Detail Endpoint

The system SHALL return complete Moomoo broker metadata when querying GET /api/brokers/moomoo, including credentialFields array and prerequisites object.

**Rationale**: UI needs detailed Moomoo metadata including credential structure and prerequisites.

#### Scenario: GET /api/brokers/moomoo returns full metadata

**Given** user is authenticated
**When** client sends GET /api/brokers/moomoo
**Then** response returns Moomoo broker details:
```json
{
  "success": true,
  "broker": {
    "key": "moomoo",
    "name": "Moomoo",
    "type": "stock",
    "description": "Commission-free stock trading with OpenD Gateway integration",
    "authMethods": ["api-key"],
    "features": ["stocks", "options", "futures", "forex", "crypto"],
    "rateLimit": {
      "orders": 10,
      "requests": 100
    },
    "credentialFields": [
      { "name": "accountId", "label": "Account ID", "type": "text", "required": true, "placeholder": "Enter your Moomoo account ID" },
      { "name": "password", "label": "Trading Password", "type": "password", "required": true, "placeholder": "Enter unlock password" },
      { "name": "host", "label": "OpenD Gateway Host", "type": "text", "required": false, "default": "127.0.0.1" },
      { "name": "port", "label": "OpenD Gateway Port", "type": "number", "required": false, "default": 11111 }
    ],
    "prerequisites": {
      "requiresOpenDRunning": true,
      "requiresAPIQuestionnaire": true,
      "setupGuideUrl": "/docs/MOOMOO_OPEND_TROUBLESHOOTING.md",
      "documentationUrl": "https://openapi.moomoo.com/"
    }
  }
}
```
**And** response status is 200 OK

---

### Requirement: Configure Moomoo Broker Credentials

The system SHALL validate Moomoo credential structure against credentialFields schema, encrypt credentials using AWS KMS, and store in user.brokerConfigs.moomoo. The system MUST reject requests with missing required credential fields.

**Rationale**: System must accept and securely store Moomoo-specific credential structure.

#### Scenario: POST /api/brokers/configure saves Moomoo credentials

**Given** user is authenticated with community ID "community123"
**When** client sends POST /api/brokers/configure with body:
```json
{
  "brokerKey": "moomoo",
  "brokerType": "stock",
  "authMethod": "api-key",
  "credentials": {
    "accountId": "72635647",
    "password": "unlock_password_md5",
    "host": "127.0.0.1",
    "port": 11111
  },
  "environment": "testnet"
}
```
**Then** system validates credentials structure matches Moomoo credentialFields
**And** system encrypts credentials using AWS KMS
**And** system stores encrypted credentials in user.brokerConfigs.moomoo:
```json
{
  "moomoo": {
    "type": "stock",
    "authMethod": "api-key",
    "credentials": "<encrypted_blob>",
    "environment": "testnet",
    "configuredAt": "2025-10-16T23:30:00.000Z"
  }
}
```
**And** response returns:
```json
{
  "success": true,
  "message": "Moomoo broker configured successfully",
  "broker": {
    "key": "moomoo",
    "name": "Moomoo",
    "environment": "testnet",
    "configuredAt": "2025-10-16T23:30:00.000Z"
  }
}
```
**And** response status is 200 OK

---

#### Scenario: POST /api/brokers/configure rejects invalid Moomoo credentials structure

**Given** user is authenticated
**When** client sends POST /api/brokers/configure with MISSING accountId:
```json
{
  "brokerKey": "moomoo",
  "credentials": {
    "password": "unlock_password"
    // accountId missing (required field)
  },
  "environment": "testnet"
}
```
**Then** system validates credentials against credentialFields
**And** system detects missing required field "accountId"
**And** response returns error:
```json
{
  "success": false,
  "error": "Missing required credential field: accountId"
}
```
**And** response status is 400 Bad Request

---

### Requirement: Test Moomoo Connection with Inline Credentials

The system SHALL accept Moomoo credentials in POST /api/brokers/test request body, instantiate MoomooAdapter, and return connection status with balance information. The system MUST provide helpful error messages when OpenD Gateway is unavailable or API questionnaire is incomplete.

**Rationale**: Before saving configuration, users must test that credentials work with OpenD Gateway.

#### Scenario: POST /api/brokers/test succeeds with valid Moomoo credentials

**Given** OpenD Gateway is running on localhost:11111
**And** Moomoo account ID 72635647 has completed API questionnaire
**When** client sends POST /api/brokers/test with body:
```json
{
  "brokerKey": "moomoo",
  "credentials": {
    "accountId": "72635647",
    "password": "unlock_password",
    "host": "127.0.0.1",
    "port": 11111
  },
  "options": { "isTestnet": true }
}
```
**Then** system instantiates MoomooAdapter with provided credentials
**And** system calls MoomooAdapter.authenticate()
**And** system calls MoomooAdapter.getBalance()
**And** response returns:
```json
{
  "success": true,
  "message": "Connected to Moomoo successfully",
  "broker": "moomoo",
  "balance": {
    "total": 1000000,
    "available": 1000000,
    "equity": 1000000,
    "cash": 1000000,
    "currency": "USD"
  }
}
```
**And** response status is 200 OK

---

#### Scenario: POST /api/brokers/test fails when OpenD Gateway not running

**Given** OpenD Gateway is NOT running
**When** client sends POST /api/brokers/test with valid Moomoo credentials
**Then** system attempts to connect to 127.0.0.1:11111
**And** connection times out or receives ECONNREFUSED
**And** response returns:
```json
{
  "success": false,
  "message": "Cannot connect to OpenD Gateway. Ensure OpenD Gateway is running on localhost:11111",
  "helpUrl": "/docs/MOOMOO_OPEND_TROUBLESHOOTING.md"
}
```
**And** response status is 200 OK (application-level error, not HTTP error)

---

#### Scenario: POST /api/brokers/test fails when API questionnaire not completed

**Given** OpenD Gateway is running
**And** Moomoo account has NOT completed API questionnaire
**When** client sends POST /api/brokers/test with credentials
**Then** OpenD Gateway returns retType: -1 (permission denied)
**And** response returns:
```json
{
  "success": false,
  "message": "API access denied. Please complete the API Questionnaire in your Moomoo mobile app.",
  "helpUrl": "https://openapi.moomoo.com/docs/questionnaire"
}
```
**And** response status is 200 OK

---

### Requirement: Test Configured Moomoo Connection

The system SHALL retrieve encrypted Moomoo credentials from database, decrypt using AWS KMS, instantiate MoomooAdapter, execute testConnection(), and update lastVerified timestamp on success.

**Rationale**: Users need to verify stored Moomoo credentials still work after initial configuration (Bug #4 fix).

#### Scenario: POST /api/brokers/test/:brokerKey works for Moomoo

**Given** user has previously configured Moomoo broker
**And** Moomoo credentials are stored encrypted in database
**And** OpenD Gateway is running
**When** client sends POST /api/brokers/test/moomoo (no body needed)
**Then** system retrieves user.brokerConfigs.moomoo from database
**And** system decrypts credentials using AWS KMS
**And** system extracts: accountId, password, host, port
**And** system instantiates MoomooAdapter with decrypted credentials
**And** system calls MoomooAdapter.testConnection()
**And** system updates user.brokerConfigs.moomoo.lastVerified timestamp
**And** response returns:
```json
{
  "success": true,
  "message": "Moomoo connection test successful",
  "broker": "moomoo",
  "balance": {
    "total": 1000000,
    "available": 1000000,
    "currency": "USD"
  }
}
```
**And** user.brokerConfigs.moomoo.lastVerified is updated to current timestamp
**And** response status is 200 OK

---

## MODIFIED Requirements

### Requirement: Broker Factory Registration Extension

The system SHALL accept credentialFields array and prerequisites object as optional parameters in BrokerFactory.registerBroker(). When provided, these MUST be included in the broker metadata returned by getAllBrokers() and getBrokerInfo().

**Previous Behavior**: BrokerFactory.registerBroker() accepted basic metadata (name, type, class, authMethods, features)

**New Behavior**: BrokerFactory.registerBroker() now accepts extended metadata including `credentialFields` and `prerequisites`.

**Example**:
```javascript
// src/brokers/BrokerFactory.js
this.registerBroker('moomoo', {
  name: 'Moomoo',
  class: null, // Lazy-loaded
  type: 'stock',
  authMethods: ['api-key'],
  features: ['stocks', 'options', 'futures', 'forex', 'crypto'],
  description: 'Commission-free stock trading with OpenD Gateway integration',
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
  },
  rateLimit: {
    orders: 10,
    requests: 100
  }
});
```

#### Scenario: BrokerFactory returns Moomoo with credentialFields

**Given** Moomoo is registered in BrokerFactory with credentialFields
**When** application calls BrokerFactory.getBrokerInfo('moomoo')
**Then** returned object includes credentialFields array with 4 elements
**And** credentialFields includes accountId, password, host, port field definitions
**And** returned object includes prerequisites.requiresOpenDRunning = true
**And** returned object includes prerequisites.setupGuideUrl

**Impact**: Enables dynamic credential field discovery for UI rendering and validation

---

## REMOVED Requirements

None. All changes are additive (backward compatible with existing brokers).

---

## Cross-References

- **Related Spec**: `moomoo-broker-ui` - UI layer that consumes this API
- **Dependency**: MoomooAdapter must be registered in BrokerFactory with `credentialFields`
- **Dependency**: AWS KMS encryption service must handle Moomoo credential structure

---

## Technical Notes

### API Endpoint Implementation

**GET /api/brokers**:
```javascript
router.get('/', ensureAuthenticated, async (req, res) => {
  const allBrokers = BrokerFactory.getAllBrokers(); // Includes Moomoo
  res.json({
    success: true,
    brokers: allBrokers.map(b => ({
      ...b,
      status: b.class || b.authMethods.includes('oauth') ? 'available' : 'planned'
    }))
  });
});
```

**POST /api/brokers/configure** (Moomoo-specific handling):
```javascript
router.post('/configure', ensureAuthenticated, async (req, res) => {
  const { brokerKey, credentials, environment } = req.body;

  // Get broker metadata for validation
  const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey);

  // Validate credentials structure
  if (brokerInfo.credentialFields) {
    validateCredentialFields(credentials, brokerInfo.credentialFields);
  }

  // Encrypt credentials (works with any structure)
  const encrypted = await encryptionService.encryptCredential(
    req.user.communityId,
    credentials
  );

  // Save to user document
  req.user.brokerConfigs[brokerKey] = {
    type: brokerInfo.type,
    authMethod: req.body.authMethod,
    credentials: encrypted,
    environment,
    configuredAt: new Date()
  };
  await req.user.save();

  res.json({ success: true });
});
```

### Credential Validation Logic
```javascript
function validateCredentialFields(credentials, fieldSchema) {
  fieldSchema.forEach(field => {
    if (field.required && !credentials[field.name]) {
      throw new Error(`Missing required credential field: ${field.name}`);
    }

    if (field.type === 'number' && credentials[field.name]) {
      credentials[field.name] = parseInt(credentials[field.name]);
    }

    if (field.type === 'url' && credentials[field.name]) {
      try {
        new URL(credentials[field.name]);
      } catch {
        throw new Error(`Invalid URL format for field: ${field.name}`);
      }
    }
  });
}
```

---

**Spec Status**: Complete
**Scenarios**: 8 scenarios defined
**Coverage**: Broker listing, detail retrieval, configuration, connection testing
