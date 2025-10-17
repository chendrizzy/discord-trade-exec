# Broker Setup Guide

Complete guide for connecting supported brokers to your trading automation platform.

## Table of Contents

- [Supported Brokers](#supported-brokers)
- [Interactive Brokers (IBKR)](#interactive-brokers-ibkr)
- [Charles Schwab](#charles-schwab)
- [Alpaca](#alpaca)
- [Crypto Exchanges](#crypto-exchanges)
- [Troubleshooting](#troubleshooting)

---

## Supported Brokers

### Stock Brokers

| Broker | Tier Required | Authentication | Features |
|--------|--------------|----------------|----------|
| **Alpaca** | Free+ | API Key | Paper & Live Trading, Real-time Data |
| **Interactive Brokers (IBKR)** | Premium | TWS/IB Gateway | Professional Platform, Global Markets |
| **Charles Schwab** | Premium | OAuth2 | Commission-free Trading, Research Tools |

### Crypto Exchanges

| Exchange | Tier Required | Authentication | Features |
|----------|--------------|----------------|----------|
| **Binance** | Basic+ | API Key | High Liquidity, Low Fees |
| **Coinbase Pro** | Basic+ | API Key | USD On-ramp, Secure |
| **Kraken** | Basic+ | API Key | Advanced Trading, Staking |

---

## Interactive Brokers (IBKR)

**Requirement:** Premium tier subscription
**Authentication:** TWS/IB Gateway connection
**Markets:** Stocks, Options, Futures, Forex, Crypto (global)

### Prerequisites

1. **IBKR Account**
   - Open account at [interactivebrokers.com](https://www.interactivebrokers.com)
   - Complete verification process (typically 1-3 business days)
   - Fund your account (minimum $0 for paper trading)

2. **TWS or IB Gateway**
   - Download from [IBKR Downloads](https://www.interactivebrokers.com/en/trading/tws-software.php)
   - **Recommended:** IB Gateway (lightweight, API-focused)
   - **Alternative:** Trader Workstation (TWS) - full trading platform

### Step 1: Install IB Gateway

#### macOS
```bash
# Download IB Gateway installer
open https://www.interactivebrokers.com/en/trading/ibgateway-stable.php

# Install IB Gateway
# Follow on-screen instructions
# Default installation: /Applications/IBGateway
```

#### Windows
```powershell
# Download installer from IBKR website
# Run installer as Administrator
# Default installation: C:\Program Files\IBGateway
```

#### Linux
```bash
# Download Linux installer
wget https://download2.interactivebrokers.com/installers/ibgateway/latest-standalone/ibgateway-latest-standalone-linux-x64.sh

# Make executable
chmod +x ibgateway-latest-standalone-linux-x64.sh

# Install
./ibgateway-latest-standalone-linux-x64.sh
```

### Step 2: Configure IB Gateway

1. **Launch IB Gateway**
   - Open IB Gateway application
   - Select **Paper Trading** or **Live Trading** mode

2. **Enable API Connections**
   - Go to **Configure** → **Settings** → **API** → **Settings**
   - Enable **"Enable ActiveX and Socket Clients"**
   - Set **Socket Port:** `7497` (paper) or `7496` (live)
   - Add **Trusted IP Address:** `127.0.0.1` (localhost)
   - Enable **"Allow connections from localhost only"**

3. **Auto-Login Configuration (Optional)**
   - Go to **Configure** → **Settings** → **Lock and Exit**
   - Enable **"Auto restart"**
   - Set **Auto-restart time** (e.g., 11:45 PM ET daily)
   - **Security Note:** Use strong password and consider IP restrictions

### Step 3: Connect to Platform

1. **Get Connection Details**
   - **Host:** `127.0.0.1` (localhost)
   - **Port:**
     - Paper Trading: `7497`
     - Live Trading: `7496`
   - **Client ID:** Any unique integer (e.g., `1`, `2`, `3`)

2. **Configure in Dashboard**
   - Navigate to **Dashboard** → **Settings** → **Brokers**
   - Click **"Add Broker Connection"**
   - Select **Interactive Brokers (IBKR)**
   - Choose authentication method: **TWS/IB Gateway**
   - Enter connection details:
     ```
     Host: 127.0.0.1
     Port: 7497 (paper) or 7496 (live)
     Client ID: 1
     ```
   - Select environment: **Paper Trading** or **Live Trading**

3. **Test Connection**
   - Click **"Test Connection"**
   - Expected result: ✅ Connected to IBKR
   - Account details should display (balance, buying power)

4. **Save Configuration**
   - Review settings
   - Click **"Save & Connect"**
   - Credentials are encrypted using AES-256-GCM + AWS KMS

### Paper Trading Setup

1. **Request Paper Trading Account**
   - Log in to [IBKR Client Portal](https://www.interactivebrokers.com/portal)
   - Go to **Settings** → **Paper Trading**
   - Click **"Request Paper Trading Account"**
   - Paper account is instant (no verification required)

2. **Reset Paper Account (Optional)**
   - Client Portal → **Settings** → **Paper Trading** → **Reset Account**
   - Resets balance to starting amount (typically $1M USD)

### Rate Limits

- **Order Placement:** 50 requests/second
- **Market Data:** 100 requests/second (per subscription)
- **Historical Data:** 60 requests/10 minutes

### Best Practices

1. **Keep IB Gateway Running**
   - Connection requires active IB Gateway/TWS session
   - Use auto-restart feature for 24/7 operation
   - Monitor connection status in dashboard

2. **Security**
   - Use paper trading for testing
   - Enable IP restrictions in IB Gateway
   - Use strong password with 2FA on IBKR account
   - Never share Client ID or account credentials

3. **Market Data Subscriptions**
   - Real-time data requires paid subscriptions
   - Free delayed data available (15-20 minute delay)
   - Check your [market data subscriptions](https://www.interactivebrokers.com/en/index.php?f=14193)

---

## Charles Schwab

**Requirement:** Premium tier subscription
**Authentication:** OAuth2 with API Keys
**Markets:** Stocks, Options, ETFs (US markets)

### Prerequisites

1. **Schwab Account**
   - Open account at [schwab.com](https://www.schwab.com)
   - Complete verification (typically 2-5 business days)
   - Fund account or use virtual trading

2. **Developer Account**
   - Register at [Schwab Developer Portal](https://developer.schwab.com)
   - Accept Developer Terms and Conditions

### Step 1: Create App Credentials

1. **Navigate to Developer Portal**
   - Go to [developer.schwab.com](https://developer.schwab.com)
   - Log in with Schwab credentials

2. **Create New App**
   - Dashboard → **"Create App"**
   - **App Name:** `Trading Automation Platform`
   - **Description:** `Automated trading via Discord signals`
   - **Redirect URI:** `https://127.0.0.1:8443/callback`
   - **Select APIs:**
     - ✅ Accounts and Trading Production
     - ✅ Market Data Production

3. **Get API Credentials**
   - **App Key:** Copy and save securely (shown once)
   - **App Secret:** Copy and save securely (shown once)
   - **Redirect URI:** Must match exactly with your app configuration

### Step 2: OAuth2 Authorization

1. **Initial Authorization (Required Once)**
   - Navigate to: Dashboard → Settings → Brokers → Add Broker
   - Select **Charles Schwab**
   - Enter API credentials:
     ```
     App Key: [your_app_key]
     App Secret: [your_app_secret]
     Redirect URI: https://127.0.0.1:8443/callback
     ```

2. **Complete OAuth Flow**
   - Click **"Authorize with Schwab"**
   - Browser will open Schwab login page
   - Log in with Schwab credentials
   - Review permissions and click **"Allow"**
   - You'll be redirected back to dashboard

3. **Token Management**
   - **Access Token:** Valid for 30 minutes (refreshed automatically)
   - **Refresh Token:** Valid for 7 days (renewed automatically)
   - Platform handles token refresh transparently

### Step 3: Test Connection

1. **Verify Account Access**
   - Click **"Test Connection"**
   - Expected result: ✅ Connected to Schwab
   - Account details should display

2. **Save Configuration**
   - Review settings
   - Click **"Save & Connect"**
   - Tokens are encrypted using AES-256-GCM + AWS KMS

### Paper Trading

Schwab does not offer a public paper trading API. Options:

1. **Open Separate Paper Account** (not automated)
2. **Use Small Position Sizes** in live account for testing
3. **Test with Alpaca Paper Account** first

### Rate Limits

- **Order Placement:** 120 requests/minute
- **Market Data:** 120 requests/minute
- **Account Queries:** 120 requests/minute

### Best Practices

1. **Token Security**
   - Never share App Key or App Secret
   - Tokens are automatically refreshed
   - Revoke app access if compromised: [Schwab Security Center](https://client.schwab.com/app/accounts/security/)

2. **Testing Strategy**
   - Test order logic with Alpaca paper account first
   - Start with small position sizes on Schwab
   - Monitor orders carefully during initial testing

3. **Market Data**
   - Real-time quotes included with active trading
   - No additional subscription fees for basic data

---

## Alpaca

**Requirement:** Free tier and above
**Authentication:** API Key & Secret
**Markets:** US stocks, ETFs, Crypto (via partner exchanges)

### Prerequisites

1. **Alpaca Account**
   - Sign up at [alpaca.markets](https://alpaca.markets)
   - Choose **Paper Trading** or **Live Trading**
   - Paper account is instant (no verification)
   - Live account requires identity verification (1-3 days)

### Step 1: Get API Credentials

1. **Navigate to API Keys**
   - Log in to [Alpaca Dashboard](https://app.alpaca.markets)
   - Go to **Paper Trading** or **Live Trading** section
   - Click **"Generate API Key"**

2. **Create API Key**
   - **Key Name:** `Trading Platform`
   - **Permissions:**
     - ✅ Account (Read)
     - ✅ Trading (Read/Write)
     - ✅ Data (Read)
   - Click **"Generate Key"**

3. **Save Credentials**
   - **API Key ID:** Copy immediately (shown once)
   - **Secret Key:** Copy immediately (shown once)
   - **IMPORTANT:** Save securely - cannot be retrieved later

### Step 2: Connect to Platform

1. **Add Broker Connection**
   - Dashboard → Settings → Brokers → Add Broker
   - Select **Alpaca**
   - Choose authentication method: **API Key**

2. **Enter Credentials**
   - **API Key:** [your_api_key_id]
   - **Secret Key:** [your_secret_key]
   - **Environment:** Paper Trading or Live Trading

3. **Test Connection**
   - Click **"Test Connection"**
   - Expected result: ✅ Connected to Alpaca
   - Account balance should display

4. **Save Configuration**
   - Review settings
   - Click **"Save & Connect"**
   - Credentials are encrypted

### Paper Trading

Alpaca provides separate paper trading environment:

- **Paper Account:** Instant, free, $100,000 starting balance
- **Reset Balance:** Dashboard → Paper Trading → Reset Account
- **Same API:** Uses identical API endpoints (different base URL)

### Rate Limits

- **Order Placement:** 200 requests/minute
- **Market Data:** 200 requests/minute
- **Account Queries:** 200 requests/minute

### Best Practices

1. **Start with Paper Trading**
   - Test all strategies in paper environment first
   - Paper account behavior matches live (except fills)

2. **API Key Security**
   - Never commit API keys to code repositories
   - Rotate keys periodically
   - Use separate keys for paper/live environments

3. **Market Hours**
   - Regular hours: 9:30 AM - 4:00 PM ET
   - Extended hours available: 4:00 AM - 8:00 PM ET
   - Crypto trading: 24/7

---

## Crypto Exchanges

### Binance

**Requirement:** Basic tier and above
**Rate Limit:** 1200 requests/minute

1. **Create API Key**
   - Log in to [binance.com](https://www.binance.com)
   - Account → API Management → Create API
   - Enable **Spot & Margin Trading** permissions
   - **Important:** Enable IP whitelist for security

2. **Connect to Platform**
   - Dashboard → Settings → Brokers → Add Broker
   - Select **Binance**
   - Enter API Key and Secret Key
   - Test connection

### Coinbase Pro

**Requirement:** Basic tier and above
**Rate Limit:** 10 requests/second

1. **Create API Key**
   - Log in to [pro.coinbase.com](https://pro.coinbase.com)
   - Settings → API → New API Key
   - Enable **View** and **Trade** permissions
   - Save passphrase securely

2. **Connect to Platform**
   - Dashboard → Settings → Brokers → Add Broker
   - Select **Coinbase Pro**
   - Enter API Key, Secret Key, and Passphrase

### Kraken

**Requirement:** Basic tier and above
**Rate Limit:** 15 requests/second

1. **Create API Key**
   - Log in to [kraken.com](https://www.kraken.com)
   - Settings → API → Generate New Key
   - Enable **Query Funds** and **Create & Modify Orders**

2. **Connect to Platform**
   - Dashboard → Settings → Brokers → Add Broker
   - Select **Kraken**
   - Enter API Key and Private Key

---

## Troubleshooting

### IBKR Connection Issues

**Problem:** "Failed to connect to IBKR"

**Solutions:**
1. **Verify IB Gateway is Running**
   - Check if IB Gateway application is open
   - Look for green icon in system tray (Windows) or menu bar (macOS)

2. **Check Port Configuration**
   - Paper trading: Port `7497`
   - Live trading: Port `7496`
   - Verify port in IB Gateway settings matches your configuration

3. **Enable API Connections**
   - IB Gateway → Configure → Settings → API → Settings
   - Enable "Enable ActiveX and Socket Clients"
   - Add `127.0.0.1` to trusted IP addresses

4. **Firewall Configuration**
   - Allow IB Gateway through firewall
   - macOS: System Preferences → Security & Privacy → Firewall → Firewall Options
   - Windows: Windows Defender → Firewall → Allow an app

5. **Client ID Conflicts**
   - Each connection requires unique Client ID
   - If using multiple apps, assign different IDs (1, 2, 3, etc.)

**Problem:** "Connection refused" or "Connection reset"

**Solutions:**
- Restart IB Gateway
- Check if another application is using the same Client ID
- Verify you're logged in to correct account (paper vs live)

### Schwab Authorization Issues

**Problem:** "OAuth authorization failed"

**Solutions:**
1. **Verify Redirect URI**
   - Must match exactly in Schwab Developer Portal
   - Common: `https://127.0.0.1:8443/callback`
   - Check for typos, http vs https, trailing slashes

2. **Clear Browser Cache**
   - Clear cookies and cache for schwab.com
   - Try authorization in incognito/private window

3. **Check App Status**
   - Schwab Developer Portal → Check app is "Active"
   - Verify API permissions are enabled

4. **Token Expiration**
   - Refresh tokens expire after 7 days of inactivity
   - Re-authorize if you see "Token expired" errors

**Problem:** "Invalid credentials" or "401 Unauthorized"

**Solutions:**
- Verify App Key and App Secret are correct
- Ensure credentials are from Production environment (not Sandbox)
- Check that API subscriptions are active in Developer Portal

### Alpaca Connection Issues

**Problem:** "Authentication failed"

**Solutions:**
1. **Verify API Keys**
   - Ensure using correct environment keys (paper vs live)
   - Regenerate keys if compromised

2. **Check Key Permissions**
   - Keys must have Trading (Read/Write) permission
   - Account (Read) permission required

3. **Environment Mismatch**
   - Paper keys only work with paper environment
   - Live keys only work with live environment
   - Verify correct base URL is being used

**Problem:** "Rate limit exceeded"

**Solutions:**
- Alpaca: 200 requests/minute limit
- Implement request throttling
- Check for loops or excessive polling

### General Issues

**Problem:** "Failed to encrypt credentials"

**Solutions:**
1. **AWS KMS Configuration**
   - Verify AWS credentials are configured
   - Check KMS key permissions
   - Ensure key is in supported region (us-east-1, us-west-2, eu-west-1)

2. **Environment Variables**
   ```bash
   # Check these are set:
   echo $AWS_ACCESS_KEY_ID
   echo $AWS_SECRET_ACCESS_KEY
   echo $AWS_REGION
   echo $KMS_KEY_ID
   ```

**Problem:** "Broker limit reached"

**Solutions:**
- Check your subscription tier limits:
  - Free: 1 broker
  - Basic: 2 brokers
  - Pro: 5 brokers
  - Premium: 10 brokers
- Disconnect unused brokers or upgrade tier

### Getting Help

If you continue experiencing issues:

1. **Check Logs**
   - Dashboard → Settings → System Logs
   - Look for detailed error messages

2. **Test Connection**
   - Use "Test Connection" button to diagnose issues
   - Error messages provide specific failure reasons

3. **Broker Status**
   - Check if broker is experiencing outages
   - IBKR: [status.interactivebrokers.com](https://status.interactivebrokers.com)
   - Schwab: [status.schwab.com](https://status.schwab.com)
   - Alpaca: [status.alpaca.markets](https://status.alpaca.markets)

4. **Support Resources**
   - IBKR: [interactivebrokers.com/support](https://www.interactivebrokers.com/support)
   - Schwab: [developer.schwab.com/support](https://developer.schwab.com/support)
   - Alpaca: [alpaca.markets/support](https://alpaca.markets/support)

5. **Platform Support**
   - Discord: Join our support server
   - GitHub: Open an issue with logs and error details
   - Email: support@tradingplatform.com

---

## Security Best Practices

### API Key Security

1. **Never Share Credentials**
   - Don't commit API keys to version control
   - Don't share keys in Discord/Slack/email
   - Don't screenshot credentials

2. **Use Strong Permissions**
   - Grant minimum required permissions
   - Disable withdrawals for trading-only keys
   - Enable IP whitelisting when possible

3. **Rotate Keys Regularly**
   - Rotate API keys every 90 days
   - Immediately rotate if potentially compromised
   - Keep audit log of key rotations

### Account Security

1. **Enable 2FA**
   - Required for all broker accounts
   - Use authenticator apps (not SMS)
   - Save backup codes securely

2. **Monitor Activity**
   - Review account activity daily
   - Set up email/SMS alerts for trades
   - Check for unauthorized access

3. **Use Strong Passwords**
   - Unique password per broker
   - Minimum 16 characters
   - Use password manager

### Network Security

1. **Secure Connections**
   - Always use HTTPS/TLS
   - Verify SSL certificates
   - Avoid public WiFi for trading

2. **Firewall Configuration**
   - Restrict access to trading systems
   - Use VPN for remote access
   - Enable IP whitelisting

---

## Next Steps

After connecting your broker:

1. **Configure Risk Management** → [docs/RISK-MANAGEMENT.md](./RISK-MANAGEMENT.md)
2. **Set Up Signal Providers** → [docs/SIGNAL-PROVIDERS.md](./SIGNAL-PROVIDERS.md)
3. **Test Paper Trading** → [docs/TESTING-GUIDE.md](./TESTING-GUIDE.md)
4. **Deploy to Production** → [docs/DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Appendix

### Broker Feature Comparison

| Feature | IBKR | Schwab | Alpaca |
|---------|------|--------|--------|
| **Commission** | $0.0035/share (min $0.35) | $0 | $0 |
| **Paper Trading** | ✅ Yes | ❌ No | ✅ Yes |
| **After Hours** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Options** | ✅ Yes | ✅ Yes | ❌ No |
| **Crypto** | ✅ Yes | ❌ No | ✅ Yes (partner) |
| **Global Markets** | ✅ 150+ countries | ❌ US only | ❌ US only |
| **API Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Documentation** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### Recommended Configurations

**For Beginners:**
- Start with Alpaca Paper Trading (free)
- Learn platform basics risk-free
- Upgrade to paid tier when ready

**For Active Traders:**
- IBKR for professional-grade features
- Alpaca for US stocks (commission-free)
- Enable both for redundancy

**For Crypto Traders:**
- Binance for high liquidity
- Coinbase Pro for USD on-ramp
- Alpaca for US stock diversification

---

**Last Updated:** 2025-01-17
**Version:** 1.0.0
