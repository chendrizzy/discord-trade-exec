# API Approval Submission Guide
## Complete Setup Information for All Broker Integrations

This document provides all the information you need to submit API approval requests to broker platforms for OAuth2 integration. Each section includes developer portal links, required documentation, and application details.

---

## Table of Contents
1. [Alpaca Markets](#1-alpaca-markets)
2. [Interactive Brokers (IBKR)](#2-interactive-brokers-ibkr)
3. [TD Ameritrade](#3-td-ameritrade)
4. [E*TRADE](#4-etrade)
5. [Charles Schwab](#5-charles-schwab)
6. [Common Application Information](#common-application-information)
7. [Security & Compliance Documentation](#security--compliance-documentation)

---

## 1. Alpaca Markets

### Developer Portal
**URL**: https://app.alpaca.markets/oauth/applications

### Application Type
OAuth2 Integration for Trading Automation

### API Features Needed
- Trading API (place orders, cancel orders, modify orders)
- Account Data API (portfolio, positions, balances)
- Market Data API (quotes, bars, trades)

### OAuth2 Configuration
- **Authorization URL**: `https://app.alpaca.markets/oauth/authorize`
- **Token URL**: `https://api.alpaca.markets/oauth/token`
- **Scopes Required**: `account:write`, `trading`
- **Redirect URI**: `https://yourdomain.com/auth/broker/callback`
- **Token Lifetime**: 7 days
- **Refresh Token Support**: Yes (with rotation)

### Application Information

**Application Name**: Discord Trade Executor SaaS

**Description**:
```
Discord Trade Executor is a SaaS platform that automates cryptocurrency and stock trading based on 
Discord signals. Users can connect their Alpaca trading accounts via OAuth2 to execute trades 
automatically when signals are posted in monitored Discord channels.

Key Features:
- Automated trade execution from Discord signals
- Natural language processing for trade signal extraction
- Risk management (position sizing, stop-loss, daily limits)
- Real-time portfolio tracking and analytics
- Multi-broker support with unified interface

Use Case:
Trading communities and signal providers can offer automated execution services to their members,
allowing subscribers to automatically execute trades shared in Discord channels while maintaining
full control of their own brokerage accounts.
```

**Website**: `https://yourdomain.com`

**Privacy Policy URL**: `https://yourdomain.com/privacy`

**Terms of Service URL**: `https://yourdomain.com/terms`

**Support Email**: `support@yourdomain.com`

### Technical Specifications

**Architecture**:
- Node.js backend with Express.js
- OAuth2 implementation using passport.js strategy
- Secure token storage with AES-256-GCM encryption
- AWS KMS for production credential encryption

**Security Measures**:
- HTTPS/TLS 1.3 for all communications
- CSRF protection with state parameter validation
- Encrypted token storage at rest
- Automatic token refresh with rotation support
- Rate limiting and abuse prevention
- Session management with secure cookies

**Data Handling**:
- Tokens encrypted before database storage
- No storage of user passwords
- Minimal data retention (tokens only)
- GDPR compliant data deletion on account closure

### Submission Checklist
- [ ] Register application at Alpaca developer portal
- [ ] Configure OAuth2 redirect URI: `https://yourdomain.com/auth/broker/callback`
- [ ] Submit application description and use case
- [ ] Provide privacy policy and terms of service URLs
- [ ] Request OAuth2 scopes: `account:write`, `trading`
- [ ] Wait for approval (typically 1-5 business days)
- [ ] Copy Client ID and Client Secret to Railway environment variables
- [ ] Test OAuth2 flow in development environment
- [ ] Deploy to production and verify functionality

---

## 2. Interactive Brokers (IBKR)

### Developer Portal
**URL**: https://www.interactivebrokers.com/webtradingapi/
**Registration**: https://www.interactivebrokers.com/en/index.php?f=1553

### Application Type
Web Trading API - OAuth2 Integration

### API Features Needed
- Trading API (submit orders, modify orders, cancel orders)
- Account Information (portfolio, positions, balances)
- Market Data (real-time quotes, historical data)
- Order Management (order status, execution reports)

### OAuth2 Configuration
- **Authorization URL**: `https://api.ibkr.com/v1/oauth/authorize`
- **Token URL**: `https://api.ibkr.com/v1/oauth/token`
- **Scopes Required**: `trading`, `account`
- **Redirect URI**: `https://yourdomain.com/auth/broker/callback`
- **Token Lifetime**: 24 hours
- **Refresh Token Support**: No (re-authentication required)

### Application Information

**Application Name**: Discord Trade Executor

**Description**:
```
Discord Trade Executor enables automated trading execution through Interactive Brokers accounts
based on trading signals shared in Discord communities. The platform uses OAuth2 authentication
to securely connect user IBKR accounts without handling login credentials.

Features:
- Automated order execution from Discord trading signals
- Support for stocks, options, futures, and forex
- Advanced risk management and position sizing
- Real-time P&L tracking and reporting
- Multi-broker aggregation with IBKR as primary broker

Security:
- OAuth2 authentication only (no credential storage)
- Encrypted token storage with AES-256
- HTTPS/TLS 1.3 for all communications
- Rate limiting and fraud prevention

Target Users:
- Trading communities and educators
- Algorithmic trading strategy developers
- Individual traders seeking automation
- Financial advisors managing client accounts (with proper authorization)
```

**Organization Type**: Financial Technology SaaS

**Expected API Call Volume**: 
- Development: ~100 calls/day
- Production: ~10,000 calls/day (scales with user base)

**Compliance**:
- SEC registered investment advisor compliance
- FINRA communication rules adherence
- Client agreement requirement before trading
- Trade blotter and audit trail maintenance

### Technical Specifications

**Integration Method**:
- Web Trading API (Client Portal API)
- OAuth2 authentication flow
- RESTful API with JSON responses
- WebSocket for real-time order updates

**Error Handling**:
- Graceful degradation on API failures
- Automatic retry with exponential backoff
- User notification for trade failures
- Comprehensive logging for troubleshooting

**Testing Approach**:
- Paper trading account for development
- Extensive automated test coverage
- Manual testing before production deployment
- Gradual rollout to minimize risk

### Submission Checklist
- [ ] Create IBKR individual or institutional account
- [ ] Apply for Web Trading API access via customer portal
- [ ] Complete compliance questionnaire
- [ ] Provide business documentation (if institutional)
- [ ] Submit OAuth2 application details
- [ ] Configure redirect URI: `https://yourdomain.com/auth/broker/callback`
- [ ] Wait for API approval (typically 5-10 business days)
- [ ] Receive Client ID and Client Secret
- [ ] Set up paper trading account for testing
- [ ] Complete integration testing
- [ ] Request production API access
- [ ] Deploy to production environment

---

## 3. TD Ameritrade

### Developer Portal
**URL**: https://developer.tdameritrade.com/
**Registration**: https://developer.tdameritrade.com/user/register

### Application Type
OAuth2 Trading Application

### API Features Needed
- Accounts API (positions, balances, transaction history)
- Trading API (place orders, replace orders, cancel orders)
- Market Data API (quotes, price history, option chains)
- Watchlists API (create/manage watchlists)

### OAuth2 Configuration
- **Authorization URL**: `https://auth.tdameritrade.com/auth`
- **Token URL**: `https://api.tdameritrade.com/v1/oauth2/token`
- **Scopes Required**: `PlaceTrades`, `AccountAccess`
- **Redirect URI**: `https://yourdomain.com/auth/broker/callback`
- **Token Lifetime**: 30 minutes (short-lived, requires frequent refresh)
- **Refresh Token Support**: Yes (with rotation)

### Application Information

**Application Name**: Discord Trade Executor

**Purpose of Application**:
```
Automated trading execution platform that connects TD Ameritrade accounts via OAuth2 to enable
trade automation based on Discord community signals. Designed for retail traders who want to
follow professional traders' signals automatically.

Core Functionality:
- OAuth2 authentication (no credential collection)
- Automated order placement from Discord signals
- Natural language processing for signal extraction
- Position sizing and risk management
- Real-time portfolio synchronization
- Performance analytics and reporting

Security Features:
- OAuth2 with PKCE (Proof Key for Code Exchange)
- End-to-end encryption for all communications
- Secure token storage with encryption at rest
- Regular security audits and penetration testing
- Compliance with TD Ameritrade API policies

User Benefits:
- No manual trade entry required
- Faster execution than manual trading
- Consistent application of trading rules
- Real-time notifications and alerts
- Multi-account support (trade across multiple accounts)
```

**Callback URL**: `https://yourdomain.com/auth/broker/callback`

**Application Type**: Web Application

**Will you make your app available to others?**: Yes (SaaS platform)

### Technical Specifications

**Development Environment**:
- Node.js 22.18.0 with Express.js
- OAuth2 client library: passport-tdameritrade
- Token refresh automation with 25-minute window
- MongoDB for persistent storage

**API Usage Patterns**:
- Token refresh every 25 minutes (5-minute buffer)
- Order placement: Real-time (immediate execution)
- Account data: Polling every 30 seconds during market hours
- Market data: Streaming via WebSocket when available
- Rate limiting: Respect API limits with request queuing

**Monitoring & Logging**:
- Application Performance Monitoring (APM)
- Error tracking and alerting
- API call logging for audit trail
- User activity monitoring

### Important Notes

⚠️ **Token Expiry**: TD Ameritrade access tokens expire after 30 minutes, requiring frequent refresh. The application implements automatic token refresh with a 5-minute buffer to prevent expiry during trading.

⚠️ **Account Agreement**: Users must accept TD Ameritrade's API Terms of Use before connecting their accounts.

### Submission Checklist
- [ ] Create TD Ameritrade account (if not already registered)
- [ ] Register for developer account at developer.tdameritrade.com
- [ ] Create new OAuth2 application
- [ ] Submit application details and use case
- [ ] Configure callback URL: `https://yourdomain.com/auth/broker/callback`
- [ ] Request scopes: `PlaceTrades`, `AccountAccess`
- [ ] Provide privacy policy and terms of service
- [ ] Wait for application approval (typically 1-3 business days)
- [ ] Receive Consumer Key (Client ID)
- [ ] Test OAuth2 flow with paper trading account
- [ ] Implement automatic token refresh (25-minute cycle)
- [ ] Deploy and monitor for token expiry issues

---

## 4. E*TRADE

### Developer Portal
**URL**: https://developer.etrade.com/
**API Key Request**: https://us.etrade.com/etx/ris/apikey

### Application Type
OAuth 1.0a Trading Application

### API Features Needed
- Accounts API (list accounts, balances, positions)
- Order API (place equity orders, place option orders, cancel orders)
- Market Data API (quotes, option chains)
- Alerts API (account alerts, order alerts)

### OAuth Configuration (OAuth 1.0a)
- **Request Token URL**: `https://api.etrade.com/oauth/request_token`
- **Authorization URL**: `https://us.etrade.com/e/t/etws/authorize`
- **Access Token URL**: `https://api.etrade.com/oauth/access_token`
- **Renew Access Token URL**: `https://api.etrade.com/oauth/renew_access_token`
- **Callback URL**: `https://yourdomain.com/auth/broker/callback`
- **Token Lifetime**: 2 hours (renewable)
- **Refresh Mechanism**: Renewal endpoint (not standard OAuth2 refresh)

### Application Information

**Application Name**: Discord Trade Executor

**Description**:
```
Discord Trade Executor is an automated trading platform that integrates with E*TRADE accounts
using OAuth 1.0a authentication. The platform enables traders to automatically execute trades
based on signals shared in Discord trading communities.

Key Features:
- OAuth 1.0a authentication (no credential storage)
- Automated equity and option order execution
- Real-time signal processing from Discord
- Risk management with position limits
- Portfolio tracking and performance analytics
- Multi-broker support with E*TRADE integration

Use Case:
Trading educators and signal providers can offer automated execution services, allowing their
subscribers to automatically replicate trades shared in Discord channels. Users maintain full
control of their E*TRADE accounts and can disable automation at any time.

Security:
- OAuth 1.0a signature-based authentication
- Encrypted token storage (AES-256-GCM)
- HTTPS/TLS 1.3 for all API calls
- CSRF protection and request signing
- Regular token renewal (hourly)
- Comprehensive audit logging
```

**Organization**: [Your Company Name]

**Website**: `https://yourdomain.com`

**Contact Email**: `api@yourdomain.com`

**Expected Daily API Calls**:
- Development: ~50 calls/day
- Production: ~5,000 calls/day

### Technical Specifications

**OAuth 1.0a Implementation**:
- Consumer Key and Secret from E*TRADE
- Request token generation with callback URL
- User authorization at E*TRADE website
- Access token exchange after authorization
- Token renewal every 90 minutes (30-minute buffer)
- OAuth signature generation for each request

**API Endpoints Used**:
- `/accounts/list` - Retrieve account information
- `/accounts/{accountIdKey}/portfolio` - Get positions
- `/accounts/{accountIdKey}/orders` - Place/cancel orders
- `/market/quote/{symbol}` - Get real-time quotes
- `/market/optionchains` - Retrieve option chains

**Error Handling**:
- Token expiry detection and auto-renewal
- Order rejection handling with user notification
- API rate limit compliance (120 calls/minute)
- Graceful degradation on API downtime

### Important Notes

⚠️ **OAuth 1.0a vs OAuth 2.0**: E*TRADE uses OAuth 1.0a (legacy), not OAuth 2.0. This requires different implementation including request signing and token renewal (not refresh).

⚠️ **Token Renewal**: E*TRADE access tokens expire after 2 hours and must be renewed (not refreshed) using a separate API endpoint.

⚠️ **Sandbox Environment**: E*TRADE provides a sandbox environment for testing. Production access requires additional approval.

### Submission Checklist
- [ ] Create E*TRADE brokerage account
- [ ] Apply for API key at https://us.etrade.com/etx/ris/apikey
- [ ] Complete API Key Agreement
- [ ] Provide application details and use case
- [ ] Submit OAuth callback URL: `https://yourdomain.com/auth/broker/callback`
- [ ] Provide company information and website
- [ ] Wait for sandbox API key approval (typically 3-5 business days)
- [ ] Receive Consumer Key and Consumer Secret (sandbox)
- [ ] Implement OAuth 1.0a flow with request signing
- [ ] Test in sandbox environment
- [ ] Request production API access
- [ ] Complete production testing
- [ ] Receive production Consumer Key and Secret
- [ ] Deploy to production

---

## 5. Charles Schwab

### Developer Portal
**URL**: https://developer.schwab.com/
**Registration**: https://developer.schwab.com/login

### Application Type
Trader API OAuth2 Integration

### API Features Needed
- Accounts & Trading API (account info, orders, transactions)
- Market Data API (quotes, price history, movers)
- Options API (option chains, expiration dates)

### OAuth2 Configuration
- **Authorization URL**: `https://api.schwabapi.com/v1/oauth/authorize`
- **Token URL**: `https://api.schwabapi.com/v1/oauth/token`
- **Scopes Required**: `account`, `trading`
- **Redirect URI**: `https://yourdomain.com/auth/broker/callback`
- **Token Lifetime**: 7 days (estimated)
- **Refresh Token Support**: Yes (with rotation)

### Application Information

**Application Name**: Discord Trade Executor

**Description**:
```
Discord Trade Executor is a cloud-based trading automation platform that connects to Charles Schwab
accounts via OAuth2 to enable automated trade execution based on Discord community signals.
Designed for retail traders and trading educators.

Platform Features:
- OAuth2 secure authentication (no credential storage)
- Automated order execution from Discord signals
- Advanced natural language processing for signal extraction
- Comprehensive risk management controls
- Real-time portfolio synchronization
- Performance tracking and analytics
- Multi-broker support with Schwab integration

Security & Compliance:
- OAuth2 with PKCE for mobile/web apps
- End-to-end encryption (TLS 1.3)
- Encrypted credential storage (AES-256 + AWS KMS)
- FINRA communication compliance
- Regular security audits
- SOC 2 Type II compliance (in progress)

Target Market:
- Individual retail traders
- Trading communities and Discord servers
- Financial educators and mentors
- Algorithmic trading enthusiasts
```

**Application Type**: Web Application (SaaS)

**Redirect URI**: `https://yourdomain.com/auth/broker/callback`

**Organization**: [Your Company Name]

**Business Model**: Subscription-based SaaS ($49-299/month)

### Technical Specifications

**Integration Architecture**:
- Microservices architecture on Railway/AWS
- Node.js backend with Express.js
- OAuth2 client with PKCE support
- MongoDB for data persistence
- Redis for session management

**API Usage**:
- Account data polling: Every 30 seconds (market hours)
- Order placement: Real-time execution
- Market data: Streaming when available, polling fallback
- Token refresh: Automatic with 24-hour buffer
- Rate limiting: Respect Schwab API limits with queuing

**Monitoring**:
- Real-time error tracking (Sentry)
- Performance monitoring (Datadog/New Relic)
- API call logging and analytics
- User activity auditing
- Uptime monitoring (99.9% SLA target)

### Important Notes

⚠️ **TD Ameritrade Migration**: Charles Schwab acquired TD Ameritrade. The developer platforms are being merged. Check current status at developer.schwab.com.

⚠️ **Production Access**: Schwab may require business verification and additional documentation for production API access.

⚠️ **Market Data Fees**: Real-time market data may incur additional subscription fees. Check with Schwab developer support.

### Submission Checklist
- [ ] Create Charles Schwab brokerage account
- [ ] Register for developer account at developer.schwab.com
- [ ] Complete developer profile and business information
- [ ] Create new OAuth2 application
- [ ] Provide application description and use case
- [ ] Configure redirect URI: `https://yourdomain.com/auth/broker/callback`
- [ ] Request scopes: `account`, `trading`
- [ ] Submit privacy policy and terms of service
- [ ] Provide business documentation (if required)
- [ ] Wait for application review (typically 5-10 business days)
- [ ] Receive Client ID and Client Secret (sandbox)
- [ ] Test OAuth2 flow in sandbox environment
- [ ] Apply for production access
- [ ] Complete production testing and compliance review
- [ ] Receive production credentials
- [ ] Deploy to production environment

---

## Common Application Information

### Platform Description

**Discord Trade Executor** is a SaaS platform that automates cryptocurrency and stock trading based on signals shared in Discord communities. The platform uses OAuth2 (or OAuth 1.0a where applicable) to securely connect user brokerage accounts without ever handling login credentials.

### Core Value Proposition

1. **Automation**: Eliminates manual trade entry, reducing errors and latency
2. **Security**: OAuth-based authentication means no credential storage
3. **Risk Management**: Built-in position sizing, stop-loss, and daily limits
4. **Multi-Broker**: Unified interface across multiple brokers
5. **Community**: Enables trading educators to offer automated execution services

### Target Users

- **Trading Communities**: Discord servers with 1,000+ members sharing trading signals
- **Signal Providers**: Professional traders offering premium signals
- **Individual Traders**: Retail traders seeking automation for proven strategies
- **Educators**: Trading mentors helping students execute recommended trades

### Revenue Model

- **Basic Plan**: $49/month (100 signals/day)
- **Pro Plan**: $99/month (unlimited signals)
- **Premium Plan**: $299/month (multiple brokers + priority execution)

### Technology Stack

- **Backend**: Node.js 22.18.0, Express.js
- **Database**: MongoDB (hosted on MongoDB Atlas)
- **Authentication**: Passport.js with OAuth strategies
- **Encryption**: AES-256-GCM (data at rest), TLS 1.3 (data in transit)
- **Hosting**: Railway.app with auto-scaling
- **Monitoring**: Datadog, Sentry for error tracking

### Compliance & Legal

- **Privacy Policy**: GDPR and CCPA compliant
- **Terms of Service**: Clear user responsibilities and limitations
- **Data Retention**: Minimal retention (30 days for logs, indefinite for encrypted tokens)
- **User Control**: Users can revoke OAuth access at any time
- **Disclaimers**: Trading involves risk, no performance guarantees

---

## Security & Compliance Documentation

### OAuth2 Security Measures

1. **CSRF Protection**
   - Cryptographically random state parameter (32 bytes)
   - State validation on callback
   - Session-based state storage with expiry

2. **Token Security**
   - AES-256-GCM encryption for token storage
   - AWS KMS for production encryption keys
   - Encrypted MongoDB fields for tokens
   - Automatic token rotation where supported

3. **HTTPS/TLS**
   - TLS 1.3 for all communications
   - HSTS headers enforced
   - Certificate pinning for critical endpoints

4. **Rate Limiting**
   - Per-user rate limits (60 requests/minute)
   - Per-IP rate limits (1000 requests/hour)
   - Exponential backoff for broker API calls

5. **Audit Logging**
   - All OAuth authorization attempts logged
   - Token refresh events recorded
   - Trade execution audit trail
   - Failed authentication tracking

### Data Handling Practices

**Data Collected**:
- Discord user ID and username
- OAuth access/refresh tokens (encrypted)
- Trading account IDs (not account numbers)
- Trade execution history
- Portfolio positions (for display only)

**Data NOT Collected**:
- Brokerage login credentials
- Social Security Numbers
- Banking information
- Credit card numbers
- Personal identification documents

**Data Retention**:
- OAuth tokens: Until user disconnects or revokes
- Trade history: 90 days
- Audit logs: 1 year
- User profiles: Until account deletion

**Data Deletion**:
- User-initiated account deletion: Immediate
- OAuth token deletion: On disconnect
- GDPR deletion requests: Within 30 days
- Automatic data cleanup: Scheduled monthly

### Compliance Statements

**GDPR Compliance**:
- Right to access (data export feature)
- Right to deletion (account deletion feature)
- Right to rectification (profile editing)
- Data processing agreements with third parties
- DPO contact: privacy@yourdomain.com

**CCPA Compliance**:
- Privacy policy with CCPA disclosures
- Do Not Sell My Personal Information (not applicable - no data sales)
- Data deletion requests honored within 45 days

**Financial Regulations**:
- Not a registered investment advisor (RIA)
- Not providing investment advice
- Tool for trade execution automation only
- User responsibility for trading decisions
- Compliance with broker terms of service

### Security Certifications (Planned)

- [ ] SOC 2 Type II (in progress)
- [ ] ISO 27001 (planned for 2026)
- [ ] PCI DSS (not applicable - no payment card data stored)

### Incident Response

**Security Incident Procedure**:
1. Detection and assessment (within 1 hour)
2. Containment and mitigation (within 4 hours)
3. User notification (if applicable, within 72 hours)
4. Root cause analysis and remediation
5. Post-incident review and improvements

**Contact for Security Issues**:
- Email: security@yourdomain.com
- Response time: Within 24 hours
- PGP key: Available at yourdomain.com/pgp

---

## Additional Resources

### Helpful Documentation

1. **OAuth2 RFC**: https://datatracker.ietf.org/doc/html/rfc6749
2. **OAuth2 for Native Apps**: https://datatracker.ietf.org/doc/html/rfc8252
3. **OAuth2 Security Best Practices**: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics

### API Testing Tools

- **Postman**: For API endpoint testing
- **Insomnia**: Alternative REST client
- **ngrok**: For local OAuth callback testing
- **Burp Suite**: For security testing

### Support Contacts

**Internal Support**:
- Development team: dev@yourdomain.com
- Security team: security@yourdomain.com
- Compliance: compliance@yourdomain.com

**Broker Developer Support** (check each broker's developer portal for current contacts)

---

## Next Steps After Approval

Once you receive API credentials from each broker:

1. **Set Environment Variables** (Railway):
   ```bash
   railway variables --set "BROKER_OAUTH_CLIENT_ID=your_client_id"
   railway variables --set "BROKER_OAUTH_CLIENT_SECRET=your_client_secret"
   ```

2. **Test OAuth Flow**:
   - Visit dashboard and attempt broker connection
   - Complete OAuth authorization
   - Verify token storage and refresh

3. **Monitor Logs**:
   - Check for OAuth warnings (should disappear)
   - Verify successful authentication
   - Test automated token refresh

4. **User Communication**:
   - Update documentation with new broker support
   - Announce new broker integration to users
   - Provide setup guides for end users

5. **Ongoing Maintenance**:
   - Monitor API rate limits
   - Track token refresh success rates
   - Watch for API deprecation notices
   - Maintain compliance with broker TOS updates

---

## Summary Checklist

### Before Submission
- [ ] Review each broker's developer terms of service
- [ ] Prepare application descriptions tailored to each broker
- [ ] Set up privacy policy and terms of service pages
- [ ] Create professional company website
- [ ] Prepare business documentation (if required)

### During Submission
- [ ] Submit applications to all 5 brokers
- [ ] Track application status for each broker
- [ ] Respond promptly to any requests for additional information
- [ ] Test in sandbox/paper trading environments

### After Approval
- [ ] Set environment variables in Railway
- [ ] Test OAuth flows for each broker
- [ ] Monitor for errors and token refresh issues
- [ ] Document any broker-specific quirks or limitations
- [ ] Update user-facing documentation

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-10-21  
**Maintained By**: Development Team

For questions or updates to this guide, contact: dev@yourdomain.com
