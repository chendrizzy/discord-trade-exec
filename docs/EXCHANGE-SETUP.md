# Crypto Exchange Setup Guide

## Overview

This guide walks you through connecting your crypto exchange accounts to the Discord Trade Executor. By connecting your exchanges, you can:

- ✅ **Automate trade execution** from Discord signals
- ✅ **Compare fees** across exchanges in real-time
- ✅ **Execute trades** on the cheapest exchange automatically
- ✅ **Track performance** across multiple exchanges

## 🔒 Security First

**CRITICAL SECURITY GUIDELINES:**

1. **Never share your API keys** - Treat them like passwords
2. **Use API key permissions** - Enable ONLY "Read" and "Trade" permissions
3. **NEVER enable withdrawal permissions** - This protects your funds
4. **Use IP whitelisting** - Restrict API access to your server IP (recommended)
5. **Enable 2FA** - Add extra security to your exchange account
6. **Store keys securely** - Keys are encrypted with AES-256-GCM in our database
7. **Rotate keys regularly** - Create new keys every 90 days
8. **Use testnet first** - Test with sandbox/testnet before using real funds

---

## Supported Exchanges

| Exchange | Trading Pairs | Fees | Setup Difficulty |
|----------|---------------|------|------------------|
| **Coinbase Pro** | 200+ | 0.5% maker/taker | Easy |
| **Kraken** | 150+ | 0.16% maker / 0.26% taker | Easy |
| **Binance** | 1000+ | Coming Soon | - |
| **Bybit** | 300+ | Coming Soon | - |

---

## Prerequisites

Before you begin, ensure you have:

- [ ] Verified exchange account (KYC completed)
- [ ] 2FA enabled on your exchange account
- [ ] Sufficient account level for API access
- [ ] Understanding of trading risks

### Account Verification Levels

**Coinbase Pro:**
- Level 1: Email verification (sufficient for API access)
- Level 2: Identity verification (required for higher limits)

**Kraken:**
- Starter: Email verification
- Intermediate: Identity verification (recommended)
- Pro: Address verification (required for API access)

---

## Coinbase Pro Setup

### Step 1: Log in to Coinbase Pro

1. Go to [https://pro.coinbase.com](https://pro.coinbase.com)
2. Log in with your Coinbase credentials
3. Complete 2FA verification

### Step 2: Navigate to API Settings

1. Click your **profile icon** in the top-right corner
2. Select **API** from the dropdown menu
3. Click **+ New API Key** button

### Step 3: Configure API Key Permissions

⚠️ **CRITICAL: Select ONLY these permissions:**

- ✅ **View** - Allows reading account balances and orders
- ✅ **Trade** - Allows placing and canceling orders
- ❌ **Transfer** - NEVER enable this permission

### Step 4: Generate API Key

1. Enter your 2FA code
2. Click **Create API Key**
3. **IMMEDIATELY COPY** these three values:
   - **API Key** (starts with alphanumeric characters)
   - **API Secret** (long base64 string)
   - **Passphrase** (the passphrase you entered)

⚠️ **WARNING:** The API Secret is shown ONLY ONCE. If you lose it, you must create a new API key.

### Step 5: (Optional) IP Whitelist

For extra security:
1. Find your server's public IP address
2. Add it to the **IP Whitelist** section
3. Save changes

### Step 6: Add to Discord Trade Executor

1. Navigate to your **Dashboard** → **Exchange API Keys**
2. Click **Add Exchange** → **Coinbase Pro**
3. Paste your credentials:
   ```
   API Key:     [Your API Key]
   API Secret:  [Your API Secret]
   Passphrase:  [Your Passphrase]
   ```
4. Select **Environment**: Production (or Sandbox for testing)
5. Click **Connect Exchange**
6. Verify connection status shows ✅ **Connected**

---

## Kraken Setup

### Step 1: Log in to Kraken

1. Go to [https://www.kraken.com](https://www.kraken.com)
2. Log in with your credentials
3. Complete 2FA verification

### Step 2: Navigate to API Settings

1. Click your **name** in the top-right corner
2. Select **Settings** → **API**
3. Click **Generate New Key** button

### Step 3: Configure API Key Permissions

⚠️ **CRITICAL: Select ONLY these permissions:**

- ✅ **Query Funds** - View account balances
- ✅ **Query Open Orders & Trades** - View orders
- ✅ **Query Closed Orders & Trades** - View trade history
- ✅ **Create & Modify Orders** - Place and cancel orders
- ❌ **Withdraw Funds** - NEVER enable this permission
- ❌ **Export Data** - Not required
- ❌ **Close/Cancel Positions** - Not required

### Step 4: Generate API Key

1. **Key Description**: Enter a descriptive name (e.g., "Discord Trade Executor")
2. **Nonce Window**: Leave default (0)
3. Click **Generate Key**
4. **IMMEDIATELY COPY** these two values:
   - **API Key** (alphanumeric string)
   - **Private Key** (long base64 string)

⚠️ **WARNING:** The Private Key is shown ONLY ONCE. Store it securely.

### Step 5: (Optional) IP Whitelist

For extra security:
1. In the API settings, find **Restrict API to specific IPs**
2. Enter your server's public IP address
3. Click **Update Settings**

### Step 6: Add to Discord Trade Executor

1. Navigate to your **Dashboard** → **Exchange API Keys**
2. Click **Add Exchange** → **Kraken**
3. Paste your credentials:
   ```
   API Key:     [Your API Key]
   API Secret:  [Your Private Key]
   ```
4. Select **Environment**: Production (or Demo for testing)
5. Click **Connect Exchange**
6. Verify connection status shows ✅ **Connected**

---

## Testing Your Connection

### Verify Exchange Connection

1. Navigate to **Dashboard** → **Exchange API Keys**
2. Find your connected exchange
3. Click **Test Connection**
4. Verify you see:
   - ✅ Connection successful
   - Account balance displayed
   - Trading permissions confirmed

### Test Fee Comparison

1. Navigate to **Dashboard** → **Fee Comparison**
2. Enter a trading pair (e.g., **BTC/USD**)
3. Enter a quantity (e.g., **0.5**)
4. Click **Compare Fees**
5. Verify you see:
   - Fee comparison across your connected exchanges
   - Recommendation for cheapest exchange
   - Estimated savings

---

## Testnet / Sandbox Setup

### Coinbase Pro Sandbox

1. Go to [https://public.sandbox.pro.coinbase.com](https://public.sandbox.pro.coinbase.com)
2. Create a sandbox account (separate from production)
3. Follow the same API key creation steps
4. In Discord Trade Executor, select **Sandbox** environment

**Sandbox Benefits:**
- Test with fake funds
- No real money at risk
- Practice trade execution

### Kraken Demo Account

Kraken doesn't offer a public testnet, but you can:
1. Create a new account with minimal funds
2. Test with small trade sizes
3. Monitor closely before scaling up

---

## Troubleshooting

### Issue: "Invalid API Key"

**Causes:**
- API key copied incorrectly (extra spaces)
- API key expired or deleted
- Wrong environment (production vs sandbox)

**Solutions:**
1. Re-copy the API key (ensure no leading/trailing spaces)
2. Verify the API key exists in your exchange settings
3. Double-check you're using the correct environment
4. Create a new API key if the old one was deleted

---

### Issue: "Insufficient Permissions"

**Causes:**
- API key doesn't have "Trade" permission
- API key only has "View" permission

**Solutions:**
1. Go to exchange API settings
2. Edit the API key permissions
3. Enable "Trade" permission
4. Re-connect in Discord Trade Executor

---

### Issue: "IP Not Whitelisted"

**Causes:**
- Your server IP is not in the API key's whitelist
- IP changed (dynamic IP)

**Solutions:**
1. Find your server's current public IP: `curl ifconfig.me`
2. Add the IP to exchange API whitelist
3. Re-test connection

---

### Issue: "Rate Limit Exceeded"

**Causes:**
- Too many API requests in short time
- Hitting exchange rate limits

**Solutions:**
1. Wait 60 seconds and retry
2. Reduce trading frequency
3. Enable caching in settings (if available)
4. Upgrade exchange API tier (if available)

---

### Issue: "Symbol Not Supported"

**Causes:**
- Trading pair not available on exchange
- Incorrect symbol format

**Solutions:**
1. Verify symbol format (use "BTC/USD" not "BTCUSD")
2. Check exchange website for supported pairs
3. Try alternative trading pair

---

### Issue: "Connection Timeout"

**Causes:**
- Network issues
- Exchange API downtime
- Firewall blocking requests

**Solutions:**
1. Check exchange status page
2. Verify your server can reach exchange API:
   ```bash
   curl -I https://api.pro.coinbase.com
   curl -I https://api.kraken.com
   ```
3. Check firewall rules
4. Contact exchange support if issue persists

---

## FAQ

### Q: Can I use the same API key for multiple bots?
**A:** Yes, but it's recommended to create separate API keys for each application for better security and tracking.

### Q: What happens if I enable withdrawal permissions?
**A:** **NEVER DO THIS.** If your API key is compromised, attackers can withdraw all your funds. We recommend withdrawal permissions are ALWAYS disabled.

### Q: Can I change API permissions after creation?
**A:** Yes, but you'll need to re-connect the exchange in Discord Trade Executor after changing permissions.

### Q: How often should I rotate API keys?
**A:** We recommend rotating API keys every 90 days or immediately if you suspect compromise.

### Q: Can I test without real money?
**A:** Yes! Use Coinbase Pro Sandbox or start with very small trade sizes on Kraken.

### Q: What happens if my exchange API key expires?
**A:** You'll receive an error notification. Simply create a new API key and re-connect.

### Q: Do API keys have expiration dates?
**A:** Coinbase Pro keys don't expire (unless deleted). Kraken keys are permanent until revoked.

### Q: Can I use multiple exchanges simultaneously?
**A:** Yes! Connect multiple exchanges and use fee comparison to execute on the cheapest one automatically.

### Q: What are the exchange rate limits?
**A:**
- **Coinbase Pro**: 10 requests/second
- **Kraken**: 15-20 requests/second (tier-dependent)

Our rate limiting automatically handles this for you.

---

## Security Best Practices

### 1. API Key Storage
- ✅ Keys encrypted with AES-256-GCM
- ✅ Stored in secure database
- ✅ Never logged in plaintext
- ✅ Never transmitted over unencrypted connections

### 2. Access Control
- ✅ Use IP whitelisting when possible
- ✅ Limit permissions to minimum required
- ✅ Enable 2FA on exchange accounts
- ✅ Use strong passwords

### 3. Monitoring
- ✅ Monitor API key usage in exchange settings
- ✅ Set up alerts for unusual activity
- ✅ Review trade history regularly
- ✅ Immediately revoke suspicious keys

### 4. Incident Response
If you suspect your API key is compromised:
1. **Immediately revoke** the API key on the exchange
2. **Delete** the key from Discord Trade Executor
3. **Change your exchange password**
4. **Review** recent trades for unauthorized activity
5. **Create** a new API key with fresh permissions
6. **Enable** additional security measures (IP whitelist, 2FA)

---

## Additional Resources

### Official Documentation
- [Coinbase Pro API Docs](https://docs.cloud.coinbase.com/exchange/docs)
- [Kraken API Docs](https://docs.kraken.com/rest/)

### Exchange Status Pages
- [Coinbase Status](https://status.coinbase.com/)
- [Kraken Status](https://status.kraken.com/)

### Support
- **Discord Trade Executor Support**: See README.md
- **Coinbase Support**: https://help.coinbase.com
- **Kraken Support**: https://support.kraken.com

---

## Changelog

**Version 1.0** (January 2025)
- Initial guide for Coinbase Pro and Kraken
- Security best practices
- Troubleshooting section
- FAQ

---

**Last Updated**: January 2025

**Maintained By**: Discord Trade Executor Team

**Need Help?** Open an issue on GitHub or contact support.
