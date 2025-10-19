# Spec: OAuth2 UI Components

## ADDED Requirements

### Requirement: OAuth2 Connect Button Component

The system SHALL provide a reusable OAuth2ConnectButton component that initiates OAuth2 flows for any broker. The button MUST display broker logo, connection status, and handle loading states during authorization.

**Rationale**: Consistent OAuth2 connection UI across all brokers improves user experience and reduces implementation duplication.

#### Scenario: Render OAuth2 connect button for disconnected broker

**Given** user has NOT connected IBKR account
**And** IBKR is an OAuth2-enabled broker
**When** BrokerManagement component renders
**Then** OAuth2ConnectButton displays:
- Broker logo: IBKR icon
- Button text: "Connect Interactive Brokers"
- Button state: enabled, not loading
- Visual style: primary button (blue background, white text)
**And** button onClick handler = initiateOAuth2Flow('ibkr')

---

#### Scenario: User clicks OAuth2 connect button

**Given** OAuth2ConnectButton rendered for IBKR
**When** user clicks "Connect Interactive Brokers" button
**Then** button state changes to loading: spinner icon + "Connecting..."
**And** component calls API: GET /api/auth/broker/ibkr/authorize
**And** backend generates authorization URL with state parameter
**And** window.location redirects to IBKR authorization page:
```
https://api.ibkr.com/v1/oauth/authorize?response_type=code&client_id=...
```
**And** user leaves application to complete authorization at IBKR

---

#### Scenario: Display connected status with token expiration

**Given** user has connected IBKR via OAuth2
**And** OAuth2 tokens expire in 12 hours
**When** BrokerManagement component renders
**Then** OAuth2ConnectButton displays:
- Broker logo: IBKR icon with green checkmark badge
- Button text: "Connected" (disabled state)
- Token status badge: "Expires in 12h" (info color)
- Disconnect button: small "×" icon to revoke connection
**And** button is non-clickable (already connected)

---

### Requirement: OAuth2 Callback Handler Page

The system SHALL provide an OAuth2CallbackPage that handles broker redirects after user authorization. The page MUST validate state, exchange code for tokens, and redirect user to dashboard with connection status.

**Rationale**: Dedicated callback page ensures secure OAuth2 flow completion and provides user feedback during token exchange.

#### Scenario: Handle successful OAuth2 callback from broker

**Given** user approved authorization at IBKR
**And** IBKR redirects to: `/auth/broker/callback?code=IBKR_CODE&state=b8f4d0e3...`
**When** OAuth2CallbackPage loads
**Then** page displays loading indicator: "Completing connection..."
**And** extracts code and state from URL query parameters
**And** sends POST request to backend:
```javascript
POST /api/auth/broker/callback
Content-Type: application/json

{
  "code": "IBKR_CODE",
  "state": "b8f4d0e3...",
  "broker": "ibkr"
}
```
**And** backend validates state, exchanges code for tokens
**And** backend returns success response:
```json
{
  "success": true,
  "broker": "ibkr",
  "message": "Interactive Brokers connected successfully"
}
```
**And** page redirects to: `/dashboard?connection=success&broker=ibkr`
**And** dashboard displays success toast: "✅ Interactive Brokers connected!"

---

#### Scenario: Handle OAuth2 callback with error (user denied authorization)

**Given** user clicks "Deny" at IBKR authorization page
**And** IBKR redirects to: `/auth/broker/callback?error=access_denied&state=b8f4d0e3...`
**When** OAuth2CallbackPage loads
**Then** page extracts error parameter from URL
**And** displays error message: "Authorization cancelled. You can try connecting again anytime."
**And** shows "Try Again" button
**And** does NOT send token exchange request to backend
**And** logs event: "User denied IBKR authorization"

---

#### Scenario: Handle OAuth2 callback with invalid state (CSRF attack)

**Given** attacker redirects user to: `/auth/broker/callback?code=FAKE_CODE&state=INVALID_STATE`
**And** session state does NOT match "INVALID_STATE"
**When** OAuth2CallbackPage sends POST to backend
**And** backend validates state: "INVALID_STATE" !== session.oauthState.state
**Then** backend returns 403 Forbidden:
```json
{
  "success": false,
  "error": "Invalid state parameter - possible CSRF attack",
  "securityEvent": true
}
```
**And** page displays security error: "🔒 Authorization session invalid. Please try connecting again."
**And** security audit log created with user IP and attempted state value
**And** user redirected to broker connection page after 3 seconds

---

### Requirement: Token Status Badge Component

The system SHALL provide a TokenStatusBadge component displaying OAuth2 token health: connected, expiring soon, expired, or invalid. Badge color and text MUST update in real-time based on token expiration.

**Rationale**: Real-time token status visibility helps users proactively reconnect accounts before authentication failures occur.

#### Scenario: Display healthy token status (>24 hours remaining)

**Given** user has IBKR OAuth2 tokens
**And** tokens expire in 36 hours
**When** TokenStatusBadge component renders
**Then** badge displays:
- Icon: green checkmark ✅
- Text: "Connected"
- Background: light green
- Tooltip: "IBKR tokens valid for 36 hours"

---

#### Scenario: Display expiring soon warning (<24 hours remaining)

**Given** user has TD Ameritrade OAuth2 tokens
**And** tokens expire in 15 minutes
**When** TokenStatusBadge component renders
**Then** badge displays:
- Icon: yellow warning ⚠️
- Text: "Expiring Soon"
- Background: light yellow
- Tooltip: "TD Ameritrade tokens expire in 15 minutes - automatic refresh scheduled"
**And** badge pulses to draw attention

---

#### Scenario: Display expired token status

**Given** user has E*TRADE OAuth2 tokens
**And** tokens expired 2 hours ago
**And** token refresh failed (invalid refresh token)
**When** TokenStatusBadge component renders
**Then** badge displays:
- Icon: red error ❌
- Text: "Reconnect Required"
- Background: light red
- Tooltip: "E*TRADE connection expired - please reconnect"
**And** badge is clickable
**And** onClick triggers reconnect flow: initiateOAuth2Flow('etrade')

---

### Requirement: OAuth2 Scope Display and Consent

The system SHALL display requested OAuth2 scopes to users BEFORE initiating authorization flow. Users MUST see plain-language explanations of what permissions the application is requesting.

**Rationale**: Transparency about OAuth2 scopes builds user trust and complies with OAuth2 best practices for informed consent.

#### Scenario: Show scope consent dialog before OAuth2 authorization

**Given** user clicks "Connect Interactive Brokers"
**When** OAuth2ConnectButton onClick handler fires
**Then** ScopeConsentDialog modal displays:
```
┌─────────────────────────────────────────────┐
│ Connect Interactive Brokers                 │
├─────────────────────────────────────────────┤
│ This app will request the following         │
│ permissions from Interactive Brokers:       │
│                                             │
│ ✓ Account Access                           │
│   Read account balances and positions       │
│                                             │
│ ✓ Trading                                   │
│   Execute buy and sell orders               │
│                                             │
│ [Cancel]              [Continue to IBKR →]  │
└─────────────────────────────────────────────┘
```
**And** "Continue to IBKR →" button redirects to authorization URL
**And** [Cancel] button closes dialog without initiating OAuth2

---

#### Scenario: User grants scope consent and proceeds

**Given** ScopeConsentDialog displayed for IBKR
**When** user clicks "Continue to IBKR →"
**Then** dialog closes
**And** OAuth2 flow initiates: window.location = authorizationURL
**And** consent timestamp logged for audit trail
**And** user redirected to IBKR authorization page

---

### Requirement: OAuth2 Connection Management UI

The system SHALL provide BrokerConnectionCard component displaying OAuth2 connection status, token expiration, last refresh timestamp, and disconnect option. Card MUST support both OAuth2 and API key brokers.

**Rationale**: Unified broker connection UI allows users to manage all broker connections (OAuth2 and API key) in one interface.

#### Scenario: Display OAuth2 broker connection card

**Given** user has connected IBKR via OAuth2
**And** tokens last refreshed 4 hours ago
**And** tokens expire in 20 hours
**When** BrokerManagement page renders
**Then** BrokerConnectionCard displays:
```
┌──────────────────────────────────────────────┐
│ [IBKR Logo] Interactive Brokers             │
│                                              │
│ Status: ✅ Connected (OAuth2)                │
│ Expires: in 20 hours                         │
│ Last Refresh: 4 hours ago                    │
│                                              │
│ [Test Connection] [Disconnect]               │
└──────────────────────────────────────────────┘
```
**And** "Test Connection" button verifies IBKR API access
**And** "Disconnect" button revokes OAuth2 tokens and removes from user.oauthTokens

---

#### Scenario: User disconnects OAuth2 broker

**Given** BrokerConnectionCard displayed for connected IBKR
**When** user clicks "Disconnect" button
**Then** confirmation dialog displays:
```
Disconnect Interactive Brokers?

This will remove your OAuth2 tokens and disable automated trading.
You can reconnect anytime.

[Cancel] [Disconnect]
```
**And** user clicks "Disconnect"
**Then** component calls API: DELETE /api/brokers/ibkr/oauth
**And** backend revokes OAuth2 tokens at IBKR (if broker supports revocation)
**And** backend removes tokens from user.oauthTokens.delete('ibkr')
**And** UI updates to show disconnected state
**And** OAuth2ConnectButton re-appears for IBKR

---

## MODIFIED Requirements

None. All OAuth2 UI components are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `oauth2-service` - UI components call OAuth2Service methods via API routes
- **Related Spec**: `broker-oauth2-integrations` - UI supports OAuth2 flows for IBKR, TD Ameritrade, E*TRADE
- **Related Spec**: `token-refresh-automation` - Token status badges reflect automatic refresh status
- **Dependency**: API routes for OAuth2 flows:
  - GET /api/auth/broker/:broker/authorize
  - POST /api/auth/broker/callback
  - DELETE /api/brokers/:broker/oauth
- **Dependency**: WebSocket connection for real-time token status updates

---

## Technical Notes

### OAuth2ConnectButton Component Implementation

```jsx
// src/dashboard/components/OAuth2ConnectButton.jsx
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';

export function OAuth2ConnectButton({ broker, isConnected, onConnect }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      // Call backend to generate authorization URL
      const response = await fetch(`/api/auth/broker/${broker}/authorize`);
      const { authorizationURL } = await response.json();

      // Redirect to broker authorization page
      window.location.href = authorizationURL;
    } catch (error) {
      console.error('OAuth2 authorization failed:', error);
      setIsLoading(false);
    }
  };

  if (isConnected) {
    return (
      <Button disabled variant="secondary">
        ✓ Connected
      </Button>
    );
  }

  return (
    <Button onClick={handleConnect} disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        `Connect ${broker.toUpperCase()}`
      )}
    </Button>
  );
}
```

### OAuth2CallbackPage Component

```jsx
// src/dashboard/pages/OAuth2CallbackPage.jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export function OAuth2CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing connection...');

  useEffect(() => {
    async function completeOAuth2() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      // Handle error from broker
      if (error) {
        setStatus('error');
        setMessage(getErrorMessage(error));
        return;
      }

      try {
        // Exchange code for tokens
        const response = await fetch('/api/auth/broker/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });

        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage(`${data.broker} connected successfully!`);
          // Redirect to dashboard after 2 seconds
          setTimeout(() => {
            navigate(`/dashboard?connection=success&broker=${data.broker}`);
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Connection failed');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Connection failed. Please try again.');
      }
    }

    completeOAuth2();
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        {status === 'processing' && (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
        )}
        {status === 'success' && (
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        )}
        {status === 'error' && (
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
        )}
        <p className="mt-4 text-lg">{message}</p>
      </div>
    </div>
  );
}

function getErrorMessage(error) {
  const errorMessages = {
    'access_denied': 'Authorization cancelled. You can try again anytime.',
    'invalid_request': 'Invalid request. Please try connecting again.',
    'server_error': 'Broker server error. Please try again later.'
  };
  return errorMessages[error] || 'Connection failed. Please try again.';
}
```

### TokenStatusBadge Component

```jsx
// src/dashboard/components/TokenStatusBadge.jsx
import React from 'react';
import { Badge } from './ui/badge';
import { Tooltip } from './ui/tooltip';

export function TokenStatusBadge({ expiresAt, broker }) {
  const getTokenStatus = () => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hoursRemaining = (expiry - now) / (1000 * 60 * 60);

    if (hoursRemaining <= 0) {
      return {
        variant: 'destructive',
        text: 'Expired',
        icon: '❌',
        tooltip: `${broker} tokens expired - reconnection required`
      };
    } else if (hoursRemaining < 1) {
      return {
        variant: 'warning',
        text: 'Expiring Soon',
        icon: '⚠️',
        tooltip: `${broker} tokens expire in ${Math.round(hoursRemaining * 60)} minutes`
      };
    } else if (hoursRemaining < 24) {
      return {
        variant: 'secondary',
        text: 'Valid',
        icon: '✓',
        tooltip: `${broker} tokens valid for ${Math.round(hoursRemaining)} hours`
      };
    } else {
      return {
        variant: 'success',
        text: 'Connected',
        icon: '✅',
        tooltip: `${broker} tokens valid for ${Math.round(hoursRemaining / 24)} days`
      };
    }
  };

  const status = getTokenStatus();

  return (
    <Tooltip content={status.tooltip}>
      <Badge variant={status.variant}>
        {status.icon} {status.text}
      </Badge>
    </Tooltip>
  );
}
```

---

**Spec Status**: Complete
**Scenarios**: 12 scenarios defined
**Coverage**: OAuth2 connect button, callback handler, token status badge, scope consent, connection management
