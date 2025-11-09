# Discord Trade Executor

> **Automate trade execution from Discord trading signals with multi-broker support, real-time analytics, and intelligent risk management**

[![Node Version](https://img.shields.io/badge/node-%3E%3D22.11.0-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🚀 What is This?

Discord Trade Executor is a SaaS platform that automatically executes trades from Discord channel signals across multiple brokers. If you're in a trading Discord server that posts signals like "BUY AAPL @ $150", this bot captures those signals and executes them automatically on your connected brokerage account(s).

**Current Status: Alpha**
- ✅ **Alpaca broker fully supported**
- 🔄 Additional brokers (Schwab, E*TRADE, TD Ameritrade, WeBull) coming soon

---

## ✨ Features

### 🤖 Automated Trade Execution
- Real-time Discord signal detection and parsing
- Sub-second execution via WebSocket connections
- Support for stocks, options, and cryptocurrency
- Stop-loss and take-profit automation

### 🏦 Multi-Broker Support
- **Alpaca Markets** (Live - stocks, options, crypto)
- IBKR, Schwab, E*TRADE, TD Ameritrade (Coming soon)
- Binance, Kraken, Coinbase Pro (Coming soon)
- Secure OAuth2 broker authentication

### ⚡ Risk Management
- Intelligent position sizing (fixed, risk-based, Kelly Criterion)
- Daily loss limits and circuit breakers
- Real-time portfolio tracking
- Customizable risk parameters per signal source

### 📊 Analytics Dashboard
- Real-time performance metrics
- P&L tracking across all brokers
- Signal source performance analysis
- WebSocket live updates

### 🔐 Enterprise Security
- AWS KMS encryption for credentials
- Multi-factor authentication (TOTP)
- Session management with Redis
- Comprehensive audit logging

### 💳 SaaS Business Model
- Three subscription tiers ($49-$299/month)
- Polar.sh billing integration
- Free tier: 5 signals/day, 1 broker
- Pro tier: Unlimited signals, multi-broker support

---

## 📸 Screenshots

> Note: Screenshots coming soon - project currently in alpha testing phase

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 22.11.0
- MongoDB Atlas account (free tier works)
- Redis instance (required for queues/caching)
- Discord bot account
- Alpaca brokerage account (free sandbox available)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/discord-trade-exec.git
cd discord-trade-exec

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Configure required environment variables
# Edit .env with your:
# - MongoDB connection string
# - Redis URL
# - Discord bot credentials
# - Alpaca API keys

# 5. Run database migrations
npm run db:migrate

# 6. Start development server
npm run dev

# 7. Build dashboard (separate terminal)
npm run dev:dashboard
```

### Environment Setup

See [`.env.example`](.env.example) for all configuration options. Required variables:

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

# Alpaca (Sandbox for testing)
ALPACA_CLIENT_ID=your_alpaca_client_id
ALPACA_CLIENT_SECRET=your_alpaca_client_secret
```

### Deployment

One-click deployment to Railway:

```bash
# Deploy to production
npm run deploy

# Or use Railway CLI
railway up
```

Full deployment guide: [docs/deployment/RAILWAY_QUICK_START.md](docs/deployment/RAILWAY_QUICK_START.md)

---

## 📚 Documentation

### For Users
- **[Getting Started Guide](docs/guides/QUICK_SETUP_ALL_BROKERS.md)** - Complete setup walkthrough
- **[Broker Setup Guides](docs/guides/)** - Alpaca, IBKR, Schwab, and more
- **[FAQ](docs/FAQ.md)** - Common questions and troubleshooting

### For Developers
- **[API Documentation](docs/api/WEBSOCKET_API.md)** - WebSocket and REST API reference
- **[Architecture Overview](openspec/project.md)** - System design and tech stack
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Full Documentation Index](docs/INDEX.md)** - All guides and references

---

## 🏗️ Architecture

### Tech Stack
- **Backend:** Node.js, Express, MongoDB, Redis
- **Frontend:** React, Vite, Tailwind CSS
- **Real-time:** Socket.IO, WebSockets
- **Queue:** BullMQ (Redis-backed)
- **Security:** AWS KMS, bcrypt, JWT
- **Billing:** Polar.sh
- **Deployment:** Railway, MongoDB Atlas

### Key Components
```
src/
├── bot/              # Discord bot integration
├── brokers/          # Broker API adapters
│   ├── adapters/     # Alpaca, IBKR, Schwab, etc.
│   └── BrokerAdapter.js  # Base adapter class
├── services/         # Business logic
│   ├── TradeExecutionService.js
│   ├── RiskManagementService.js
│   ├── OAuth2Service.js
│   └── billing/      # Subscription management
├── routes/           # Express API routes
├── middleware/       # Auth, rate limiting, etc.
└── dashboard/        # React dashboard UI
```

---

## ⚠️ Disclaimers

### Trading Risks
**IMPORTANT:** Automated trading involves substantial risk and is not suitable for all investors. You may lose some or all of your initial investment. Never invest more than you can afford to lose.

### Not Financial Advice
This software is a technology tool for executing trades. It **does not provide investment advice, trading signals, or recommendations**. Users are solely responsible for their trading decisions.

### Broker Compliance
You are responsible for ensuring your use of broker APIs complies with their Terms of Service. This platform automates execution but does not bypass broker rules or regulations.

### Alpha Software
This is alpha-stage software. Bugs may exist. Use at your own risk. **Never connect production accounts with real money during alpha testing.**

---

## 🗺️ Roadmap

### Alpha Phase (Current - Q1 2025)
- [x] Discord bot with signal parsing
- [x] Alpaca broker integration
- [x] Risk management system
- [x] Analytics dashboard
- [x] Subscription billing
- [ ] Security hardening (MFA completion)
- [ ] Production testing with Alpaca sandbox

### Beta Phase (Q2 2025)
- [ ] IBKR integration
- [ ] Schwab integration
- [ ] Multi-broker portfolio view
- [ ] Advanced signal parsing (ML/NLP)
- [ ] Mobile app (React Native)

### Public Launch (Q3 2025)
- [ ] 5+ broker integrations
- [ ] Cryptocurrency exchange support
- [ ] White-label SaaS offering
- [ ] API for third-party developers

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Setup

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Run type checks
npm run typecheck
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Discord.js community for excellent documentation
- Alpaca Markets for developer-friendly API
- MongoDB Atlas for reliable database hosting
- Railway for simple deployment platform

---

## 📞 Support

- **Documentation:** [docs/](docs/INDEX.md)
- **Issues:** [GitHub Issues](https://github.com/yourusername/discord-trade-exec/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/discord-trade-exec/discussions)
- **Email:** support@yourdomain.com (update with your email)

---

## 🌟 Star History

If this project helps you, consider giving it a ⭐️!

---

**Built with ❤️ by the Discord Trade Executor Team**
