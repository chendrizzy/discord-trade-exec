# Spec: Moomoo Broker UI Support

## ADDED Requirements

### Requirement: Dynamic Credential Fields Rendering

BrokerConfigWizard SHALL iterate over credentialFields metadata and dynamically render input fields based on field type, required status, and default values. The system MUST maintain backward compatibility with brokers lacking credentialFields.

**Rationale**: Different brokers require different credential structures (API Key/Secret, OAuth tokens, Account ID/Password, etc.). The UI must dynamically render appropriate fields based on broker metadata.

#### Scenario: Moomoo displays Account ID and Password fields

**Given** user selects Moomoo as their broker
**And** Moomoo metadata includes `credentialFields`:
```json
{
  "credentialFields": [
    { "name": "accountId", "label": "Account ID", "type": "text", "required": true },
    { "name": "password", "label": "Trading Password", "type": "password", "required": true },
    { "name": "host", "label": "OpenD Gateway Host", "type": "text", "required": false, "default": "127.0.0.1" },
    { "name": "port", "label": "OpenD Gateway Port", "type": "number", "required": false, "default": 11111 }
  ]
}
```
**When** user reaches Step 4 (Credentials) of BrokerConfigWizard
**Then** UI renders 4 input fields: Account ID, Trading Password, OpenD Gateway Host, OpenD Gateway Port
**And** Host field is pre-filled with "127.0.0.1"
**And** Port field is pre-filled with "11111"
**And** Account ID and Password are required (marked with *)
**And** Host and Port are optional

---

#### Scenario: Alpaca continues to display API Key and Secret fields (backward compatibility)

**Given** user selects Alpaca as their broker
**And** Alpaca metadata does NOT include `credentialFields` (legacy structure)
**When** user reaches Step 4 (Credentials) of BrokerConfigWizard
**Then** UI renders standard API Key and API Secret fields
**And** existing Alpaca configuration flow works unchanged

---

### Requirement: OpenD Gateway Prerequisite Warning

The UI SHALL display a warning Alert component when prerequisites.requiresOpenDRunning is true. The alert MUST include a link to the setup guide URL specified in broker metadata.

**Rationale**: Moomoo requires OpenD Gateway to be running locally before configuration. Users must be informed of this prerequisite with actionable guidance.

#### Scenario: Display OpenD Gateway warning for Moomoo

**Given** user selects Moomoo as their broker
**And** Moomoo metadata includes `prerequisites.requiresOpenDRunning: true`
**When** user reaches Step 4 (Credentials) of BrokerConfigWizard
**Then** UI displays a warning Alert component below credential fields
**And** Alert contains message: "Moomoo requires OpenD Gateway to be running locally."
**And** Alert includes link to setup guide: `docs/MOOMOO_OPEND_TROUBLESHOOTING.md`
**And** Alert uses "warning" variant styling (yellow/amber)

---

#### Scenario: No prerequisite warning for standard brokers

**Given** user selects Alpaca, IBKR, or Kraken as their broker
**And** broker metadata does NOT include `prerequisites.requiresOpenDRunning`
**When** user reaches Step 4 (Credentials) of BrokerConfigWizard
**Then** No prerequisite warning Alert is displayed

---

### Requirement: Dynamic Credential Validation

The UI SHALL disable the "Next" button when any required credential field is empty. The system SHALL validate field types (number, URL) and display appropriate error messages for invalid inputs.

**Rationale**: Each credential field may have specific validation requirements (required, number format, URL format). UI must validate based on field metadata.

#### Scenario: Validate required Moomoo fields before allowing Next

**Given** user is on Step 4 (Credentials) with Moomoo selected
**When** Account ID field is empty
**Or** Trading Password field is empty
**Then** "Next" button is disabled
**And** user cannot proceed to Step 5 (Connection Test)

---

#### Scenario: Allow Next when all required fields filled

**Given** user is on Step 4 (Credentials) with Moomoo selected
**When** Account ID field contains "72635647"
**And** Trading Password field contains "test_password"
**And** Host field contains "127.0.0.1" (default)
**And** Port field contains "11111" (default)
**Then** "Next" button is enabled
**And** user can proceed to Step 5 (Connection Test)

---

### Requirement: Connection Test with Moomoo Credentials

The UI SHALL send POST /api/brokers/test with Moomoo credentials structure (accountId, password, host, port) when "Test Connection" is clicked. The system SHALL display loading state during test and show success/error Alert based on API response.

**Rationale**: Users must verify their credentials work before saving configuration. Test must use Moomoo-specific credential structure.

#### Scenario: Test Moomoo connection with valid credentials

**Given** user has filled all required Moomoo credential fields
**And** OpenD Gateway is running locally on 127.0.0.1:11111
**When** user clicks "Test Connection" button on Step 5
**Then** UI sends POST /api/brokers/test with body:
```json
{
  "brokerKey": "moomoo",
  "credentials": {
    "accountId": "72635647",
    "password": "test_password",
    "host": "127.0.0.1",
    "port": 11111
  },
  "options": { "isTestnet": true }
}
```
**And** UI displays loading state "Testing Connection..."
**And** When API returns success, UI shows green Alert: "Connected to Moomoo successfully"
**And** Alert displays available balance: "$1,000,000.00"
**And** "Next" button becomes enabled

---

#### Scenario: Test Moomoo connection fails when OpenD Gateway not running

**Given** user has filled all required Moomoo credential fields
**And** OpenD Gateway is NOT running
**When** user clicks "Test Connection" button on Step 5
**Then** UI sends POST /api/brokers/test
**And** When API returns error with message "Cannot connect to OpenD Gateway"
**Then** UI shows red Alert with error message
**And** Alert includes link to troubleshooting guide
**And** "Next" button remains disabled

---

### Requirement: Save Moomoo Configuration

The UI SHALL send POST /api/brokers/configure with Moomoo credentials structure after successful connection test. Upon success, the system SHALL close the wizard dialog, reset wizard state, and display Moomoo in the configured brokers list.

**Rationale**: Successful configuration must be saved with encrypted credentials to user's account.

#### Scenario: Save Moomoo configuration after successful test

**Given** user has successfully tested Moomoo connection
**And** user clicks "Next" to reach Step 6 (Review)
**When** user reviews configuration showing:
- Broker Type: Stocks
- Broker: Moomoo
- Auth Method: API Key
- Environment: Paper Trading
- Connection: Verified
**And** user clicks "Save Configuration" button
**Then** UI sends POST /api/brokers/configure with body:
```json
{
  "brokerKey": "moomoo",
  "brokerType": "stock",
  "authMethod": "api-key",
  "credentials": {
    "accountId": "72635647",
    "password": "test_password",
    "host": "127.0.0.1",
    "port": 11111
  },
  "environment": "testnet"
}
```
**And** When API returns success, UI closes wizard dialog
**And** UI resets wizard state
**And** Moomoo appears in BrokerManagement configured brokers list

---

## MODIFIED Requirements

### Requirement: BrokerConfigWizard Step 4 Credentials Rendering

BrokerConfigWizard Step 4 SHALL check for credentialFields in selectedBrokerInfo. If present, the system SHALL dynamically render fields based on metadata. If absent, the system MUST render standard API Key/Secret fields to maintain backward compatibility.

**Previous Behavior**: Hard-coded API Key and API Secret fields for all brokers

**New Behavior**: Dynamically render credential fields based on `selectedBrokerInfo.credentialFields` metadata, with fallback to API Key/Secret for backward compatibility.

#### Scenario: Dynamic fields for Moomoo, standard fields for Alpaca

**Given** user is configuring a broker in BrokerConfigWizard
**When** broker is Moomoo with credentialFields defined
**Then** Step 4 renders 4 dynamic fields: Account ID, Password, Host, Port
**And** When broker is Alpaca without credentialFields
**Then** Step 4 renders 2 standard fields: API Key, API Secret
**And** Both configuration flows complete successfully

**Impact**: Enables support for brokers with non-standard credential structures (Moomoo, future OAuth brokers)

---

## REMOVED Requirements

None. All changes are additive (backward compatible).

---

## Cross-References

- **Related Spec**: `moomoo-api-endpoints` - API layer that provides broker metadata
- **Related Spec**: `moomoo-setup-docs` - Documentation displayed in prerequisite warnings
- **Dependency**: BrokerFactory Moomoo registration must include `credentialFields` and `prerequisites`

---

## Technical Notes

### Component Structure
```
BrokerConfigWizard
├─ useState: config (extended with dynamic fields)
├─ useState: selectedBrokerInfo (includes credentialFields)
├─ Step 4: renderCredentialFields()
│   ├─ Environment Selector (all brokers)
│   ├─ Dynamic Field Rendering
│   │   └─ selectedBrokerInfo.credentialFields.map(field => <DynamicField />)
│   └─ Prerequisite Warnings
│       └─ {prerequisites.requiresOpenDRunning && <Alert />}
├─ Step 5: Connection Test
│   └─ buildCredentialsFromDynamicFields()
└─ Step 6: Save Configuration
    └─ buildCredentialsFromDynamicFields()
```

### Validation Logic
```javascript
const isStepValid = (step) => {
  if (step === 4) {
    // Get required fields from metadata
    const requiredFields = selectedBrokerInfo.credentialFields
      .filter(f => f.required)
      .map(f => f.name);

    // Check all required fields are filled
    return requiredFields.every(fieldName =>
      config[fieldName] && config[fieldName].trim() !== ''
    );
  }
  // ... other steps
};
```

### Backward Compatibility Pattern
```javascript
const buildCredentials = () => {
  if (selectedBrokerInfo.credentialFields) {
    // New dynamic pattern
    return selectedBrokerInfo.credentialFields.reduce((creds, field) => {
      creds[field.name] = config[field.name] || field.default;
      return creds;
    }, {});
  } else {
    // Legacy pattern (API Key/Secret or OAuth)
    return config.authMethod === 'oauth'
      ? { accessToken: config.accessToken }
      : { apiKey: config.apiKey, apiSecret: config.apiSecret };
  }
};
```

---

**Spec Status**: Complete
**Scenarios**: 8 scenarios defined
**Coverage**: UI rendering, validation, connection testing, configuration saving
