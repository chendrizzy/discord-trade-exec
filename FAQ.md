# Frequently Asked Questions (FAQ)

## General Questions

### What is Discord Trade Executor?

Discord Trade Executor is an open-source platform that automatically executes trades from Discord channel signals on your connected brokerage account(s). If you're in a trading Discord server that posts signals like "BUY AAPL @ $150", this bot captures those signals and executes them automatically.

### Is this safe to use?

**Alpha Status:** This is currently alpha-stage software. We **strongly recommend** only connecting sandbox/paper trading accounts during alpha testing. Never connect production accounts with real money during alpha.

**Security Measures:**
- OAuth2 broker authentication
- AWS KMS encryption for credentials
- Multi-factor authentication (in development)
- Comprehensive audit logging
- Session management with Redis

**Your Responsibility:**
- Review all signals before they execute
- Set appropriate risk limits
- Monitor your account regularly
- Ensure broker API usage complies with their Terms of Service

### Which brokers are supported?

**Currently Supported (Alpha):**
- ✅ **Alpaca Markets** - Fully functional (stocks, options, crypto)

**Coming Soon (Beta):**
- 🔄 Interactive Brokers (IBKR)
- 🔄 Charles Schwab
- 🔄 E*TRADE
- 🔄 TD Ameritrade
- 🔄 WeBull

**Planned:**
- Binance, Kraken, Coinbase Pro (cryptocurrency)

### Is this free?

**Open Source:** The software is MIT licensed and free to use.

**SaaS Tiers (When Available):**
- **Free:** 5 signals/day, 1 broker connection
- **Basic ($49/month):** 50 signals/day, 2 brokers
- **Pro ($299/month):** Unlimited signals, unlimited brokers, priority support

**Current Status:** SaaS billing integration exists but is not yet active during alpha testing.

### Does this provide trading signals?

**NO.** This platform is a **technology tool** for executing trades based on signals from Discord channels you're already a member of.

**We do NOT:**
- Provide trading signals or recommendations
- Offer investment advice
- Guarantee profitability
- Recommend specific Discord channels

**You are responsible for:**
- Finding and vetting signal providers
- Understanding the signals being executed
- Managing your own trading strategy
- All trading decisions and outcomes

---

## Setup Questions

### How do I get started?

**Quick Start:**

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/discord-trade-exec.git
cd discord-trade-exec

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Run migrations
npm run db:migrate

# 5. Start servers
npm run dev                # Backend
npm run dev:dashboard      # Frontend
```

**Detailed Setup Guide:** See [docs/guides/QUICK_SETUP_ALL_BROKERS.md](docs/guides/QUICK_SETUP_ALL_BROKERS.md)

### What environment variables do I need?

**Required:**
```env
# Database
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://localhost:6379

# Discord Bot
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

# Security
SESSION_SECRET=generate_random_32_byte_string
JWT_SECRET=generate_random_32_byte_string
ENCRYPTION_KEY=generate_random_32_byte_string

# Broker (Alpaca)
ALPACA_CLIENT_ID=your_alpaca_client_id
ALPACA_CLIENT_SECRET=your_alpaca_client_secret
```

**See [.env.example](.env.example) for complete list.**

### Do I need a paid MongoDB/Redis account?

**No.** Both have free tiers that work for development and small-scale usage:

- **MongoDB Atlas:** Free M0 cluster (512MB storage, shared CPU)
- **Redis:** Free Redis Cloud tier (30MB) or run locally with Docker

### How do I get Discord bot credentials?

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" tab → "Add Bot"
4. Copy the bot token → `DISCORD_BOT_TOKEN`
5. Go to "OAuth2" tab → Copy Client ID and Secret
6. Enable "Message Content Intent" in Bot settings

**Detailed Guide:** [docs/guides/DISCORD_BOT_SETUP.md](docs/guides/DISCORD_BOT_SETUP.md)

### How do I get Alpaca API credentials?

1. Sign up at [Alpaca Markets](https://alpaca.markets/)
2. Use **Paper Trading** account for testing
3. Go to Dashboard → API Keys
4. Generate OAuth2 credentials
5. Add Client ID and Secret to `.env`

**Never use live trading credentials during alpha testing.**

---

## Broker Connection

### Why can't I connect my broker?

**Common Issues:**

1. **Invalid Credentials**
   - Verify API key/secret in broker dashboard
   - Ensure using OAuth2 credentials (not legacy API keys)
   - Check for typos in `.env` file

2. **OAuth2 Redirect URI Mismatch**
   - Add `http://localhost:3000/api/auth/callback` to broker's allowed redirect URIs
   - For production: Use your domain instead of localhost

3. **Insufficient Permissions**
   - Enable "Trading" permission in broker API settings
   - Enable "Account Data" read permission

4. **Rate Limiting**
   - Broker API rate limits exceeded
   - Wait 60 seconds and try again

### How do I test with Alpaca sandbox?

Alpaca provides a paper trading environment:

```env
# Use paper trading credentials
ALPACA_CLIENT_ID=your_paper_trading_client_id
ALPACA_CLIENT_SECRET=your_paper_trading_secret

# Ensure using paper trading endpoint
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

**Paper trading features:**
- Real-time market data
- Simulated order execution
- No real money at risk
- Perfect for testing

### My broker connection keeps disconnecting

**Possible Causes:**

1. **Token Expiration**
   - OAuth2 tokens expire (typically 1-2 hours)
   - Solution: Implement token refresh (handled automatically)

2. **Network Issues**
   - VPN or firewall blocking broker API
   - Solution: Whitelist broker API endpoints

3. **Session Timeout**
   - Redis session expired
   - Solution: Increase `SESSION_TIMEOUT` in `.env`

---

## Trading & Signals

### How are Discord signals detected?

The bot monitors Discord channels for trading signals using pattern matching:

**Supported Formats:**
```
BUY AAPL @ $150
LONG TSLA 100 shares @ market
SHORT SPY $450 PUT 30DTE
SELL AAPL (close position)
```

**Signal Parser:**
- Detects ticker symbols (stocks, ETFs, options)
- Extracts action (BUY/SELL/LONG/SHORT)
- Parses price targets and quantities
- Identifies order types (market, limit, stop)

### Can I customize signal parsing?

**Yes.** You can configure signal patterns in `src/config/signalPatterns.js`:

```javascript
export const signalPatterns = [
  {
    pattern: /BUY (\w+) @ \$?([\d.]+)/i,
    action: 'buy',
    // ... more config
  },
  // Add your custom patterns
];
```

### How do risk limits work?

**Risk Management Features:**

1. **Position Sizing**
   - Fixed amount per trade
   - Risk-based (% of account)
   - Kelly Criterion (advanced)

2. **Daily Loss Limits**
   - Stop trading after X% daily loss
   - Circuit breaker protection

3. **Maximum Position Size**
   - Limit position to % of portfolio
   - Prevent over-concentration

**Configure in Dashboard:**
- Settings → Risk Management
- Set per signal source or globally

### What happens if a trade fails?

**Error Handling:**

1. **Order Rejected by Broker**
   - Logged to database
   - Notification sent (if configured)
   - Does not retry automatically

2. **Insufficient Funds**
   - Trade skipped
   - Alert logged
   - Next signal processed normally

3. **Network Failure**
   - Retries up to 3 times
   - Exponential backoff
   - Failure logged if all retries fail

**Check Logs:** Dashboard → Activity → Failed Trades

---

## Security & Privacy

### Is my broker login information secure?

**Yes. Security measures:**

1. **OAuth2 Authentication**
   - Never stores your broker password
   - Uses secure token-based authentication

2. **Encryption**
   - AWS KMS encryption for credentials
   - AES-256 encryption at rest
   - TLS 1.3 for data in transit

3. **No Third-Party Access**
   - Self-hosted deployment
   - Your data never leaves your infrastructure

### Should I use multi-factor authentication (MFA)?

**Absolutely.** MFA is highly recommended:

- Prevents unauthorized access
- Protects against password breaches
- Required for Pro tier

**Current Status:** MFA implementation in development (alpha phase).

### Can I audit what trades were executed?

**Yes.** Full audit trail available:

1. **Dashboard → Activity Log**
   - All executed trades
   - Signal source
   - Execution timestamp
   - P&L tracking

2. **Database Export**
   - Export trade history to CSV
   - Includes all order details

3. **Broker Confirmation**
   - Cross-reference with broker's trade history
   - Ensures no unauthorized trades

---

## Billing & Subscriptions

### Is billing active during alpha?

**No.** During alpha testing:
- No subscription charges
- Free access to all features
- Polar.sh integration exists but not activated

### When will paid tiers be available?

**Estimated Timeline:**
- **Beta Phase (Q2 2025):** Paid tiers available
- **Public Launch (Q3 2025):** Full SaaS offering

### What payment methods are accepted?

**Planned Payment Options:**
- Credit/debit cards (Stripe)
- PayPal
- Cryptocurrency (via Polar.sh)

---

## Troubleshooting

### The dashboard won't load

**Solutions:**

1. **Check backend server is running:**
   ```bash
   npm run dev
   ```

2. **Check dashboard server is running:**
   ```bash
   npm run dev:dashboard
   ```

3. **Verify ports:**
   - Backend: `http://localhost:3000`
   - Dashboard: `http://localhost:5173`

4. **Check browser console for errors:**
   - Open Developer Tools (F12)
   - Look for network errors

### Tests are failing

**Common Causes:**

1. **MongoDB not running:**
   ```bash
   # Start local MongoDB
   mongod --dbpath /path/to/data
   ```

2. **Redis not running:**
   ```bash
   # Start Redis
   redis-server
   ```

3. **Environment variables missing:**
   - Ensure `.env` file exists
   - Check all required variables set

4. **Node version mismatch:**
   ```bash
   node --version  # Should be >= 22.11.0
   ```

### How do I report a bug?

**GitHub Issues:**

1. Check [existing issues](https://github.com/yourusername/discord-trade-exec/issues) first
2. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Logs/screenshots if applicable

**Template:** See [CONTRIBUTING.md](CONTRIBUTING.md#-bug-reports)

---

## Legal & Compliance

### Is automated trading legal?

**Yes, BUT:**
- Must comply with broker Terms of Service
- Some brokers prohibit automated trading
- Regulations vary by jurisdiction

**Your Responsibility:**
- Review your broker's ToS
- Ensure compliance with local laws
- Consult legal/financial advisor if needed

### Is this financial advice?

**NO.** This software is a **technology tool** only.

- We do NOT provide investment advice
- We do NOT recommend specific trades
- We do NOT guarantee profitability
- You are solely responsible for trading decisions

**See [LICENSE](LICENSE) for full disclaimer.**

### What are the trading risks?

**IMPORTANT:**
- Automated trading involves substantial risk
- You may lose some or all of your investment
- Never invest more than you can afford to lose
- Past performance does not guarantee future results

**Risk Factors:**
- Market volatility
- Signal quality from third parties
- Software bugs (alpha stage)
- Network failures
- Broker API changes

---

## Contributing

### How can I contribute?

**Ways to Contribute:**

1. **Code:** Submit pull requests
2. **Testing:** Report bugs and test features
3. **Documentation:** Improve guides and tutorials
4. **Broker Adapters:** Add support for new brokers
5. **Translations:** Localize the dashboard

**See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.**

### I want to add a new broker - where do I start?

**Broker Adapter Development:**

1. Read [CONTRIBUTING.md](CONTRIBUTING.md#-adding-new-broker-adapters)
2. Extend `BrokerAdapter` base class
3. Implement required methods:
   - `connect()`, `disconnect()`
   - `getAccountInfo()`, `getPositions()`
   - `placeOrder()`, `cancelOrder()`
4. Write comprehensive tests
5. Update documentation

**Example:** See `src/brokers/adapters/AlpacaAdapter.js`

---

## Support

### Where can I get help?

- **Documentation:** [docs/INDEX.md](docs/INDEX.md)
- **GitHub Issues:** [Report bugs/request features](https://github.com/yourusername/discord-trade-exec/issues)
- **GitHub Discussions:** [Ask questions](https://github.com/yourusername/discord-trade-exec/discussions)
- **Email:** support@yourdomain.com (update with actual email)

### How do I stay updated?

- ⭐ **Star the repository** on GitHub
- 👁️ **Watch releases** for notifications
- 📰 **Follow the changelog** for updates
- 💬 **Join Discord** (link TBD) for community updates

---

## Roadmap

### What features are planned?

**Alpha Phase (Current - Q1 2025):**
- ✅ Alpaca broker integration
- ✅ Risk management system
- ✅ Analytics dashboard
- 🔄 MFA completion
- 🔄 Security hardening

**Beta Phase (Q2 2025):**
- IBKR integration
- Schwab integration
- Multi-broker portfolio view
- Advanced signal parsing (ML/NLP)
- Mobile app (React Native)

**Public Launch (Q3 2025):**
- 5+ broker integrations
- Cryptocurrency exchange support
- White-label SaaS offering
- Public API for developers

**See [README.md](README.md#-roadmap) for detailed roadmap.**

---

**Have more questions?** [Open a discussion on GitHub](https://github.com/yourusername/discord-trade-exec/discussions) or check our [documentation](docs/INDEX.md).
