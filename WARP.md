# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Discord Trade Executor SaaS platform that automates cryptocurrency trading based on Discord signals. The system includes Discord bot integration, natural language processing for trading signals, multi-exchange trading execution, Polar.sh subscription billing (Merchant of Record), and automated marketing components.

**Key Revenue Model:**
- Basic Plan: $49/month (100 signals/day)
- Pro Plan: $99/month (unlimited signals)  
- Premium Plan: $299/month (multiple brokers + priority execution)

## Essential Commands

### Development
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Install dependencies (Node.js 22.18.0 required)
npm install
```

### Testing
```bash
# Run all tests
npm test

# Test secure setup automation
node test-secure-setup.js
```

### Build and Deploy
```bash
# Build for production
npm run build

# Deploy to Railway
npm run deploy
```

### Automated Setup
```bash
# FULLY AUTOMATED setup (creates all API keys automatically)
./auto-setup.sh

# Manual setup with guided prompts
./quickstart.sh
```

## Architecture Overview

### Core Components

**Main Application Entry (`src/index.js`):**
- Express server with health monitoring
- Graceful error handling and process management
- Initializes all major components with fallback error handling
- Provides heartbeat monitoring every 30 seconds

**Discord Bot (`src/discord-bot.js`):**
- Discord.js client with gateway intents for guilds
- Message parsing and trade signal detection
- Embedded responses for trade execution feedback

**Trading Engine (`src/trade-executor.js`):**
- CCXT integration for multiple exchanges (Binance primary)
- Risk management with position sizing and stop-loss logic
- Automatic sandbox/testnet detection based on NODE_ENV

**Signal Processing (`src/signal-parser.js`):**
- Natural language processing using regex patterns
- Extracts trading actions (buy/sell), symbols, prices, stop-loss, take-profit
- Validates messages contain trading keywords before processing

**Payment System (`src/subscription-manager.js`):**
- Polar.sh integration for subscription billing (Merchant of Record)
- Webhook handling for subscription lifecycle events
- Three-tier pricing structure with trial periods

**Marketing Automation (`src/marketing-automation.js`):**
- Automated social media posting and engagement
- Content generation for various platforms
- Email marketing sequence automation

### Data Flow

1. **Signal Detection:** Discord bot monitors channels for messages
2. **NLP Processing:** SignalParser extracts trading parameters from natural language
3. **Risk Assessment:** TradeExecutor applies risk management rules
4. **Trade Execution:** Orders sent to configured exchanges via CCXT
5. **User Management:** SubscriptionManager handles billing and access control
6. **Marketing:** Automated systems handle customer acquisition and retention

## Environment Configuration

### Required Environment Variables

**Discord Bot:**
- `DISCORD_BOT_TOKEN` - Bot token from Discord Developer Portal

**Trading APIs:**
- `BINANCE_API_KEY` / `BINANCE_SECRET` - Exchange API credentials
- `NODE_ENV` - Controls sandbox/production mode for trading

**Payment Processing (Polar.sh):**
- `POLAR_ACCESS_TOKEN` - Polar API access token
- `POLAR_ORGANIZATION_ID` - Polar organization identifier
- `POLAR_WEBHOOK_SECRET` - Webhook signature verification secret

**Database:**
- `MONGODB_URI` - MongoDB connection string (defaults to localhost)

**Marketing Automation:**
- `TWITTER_API_KEY` / `TWITTER_API_SECRET` - Twitter API credentials
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` - Reddit API credentials
- `EMAIL_SERVICE_API_KEY` - Email service integration
- Various social media and content management API keys

Copy `.env.example` to `.env` and populate with actual credentials.

### Node.js Version Requirement
- **Required:** Node.js 22.18.0
- **Package Manager:** npm with package-lock.json

## Development Workflow

### Setup Process

1. **Automated Setup (Recommended):**
   ```bash
   ./auto-setup.sh
   ```
   - Automatically creates Discord bot and retrieves token
   - Sets up Polar.sh billing and webhooks
   - Configures trading APIs (testnet mode)
   - Deploys MongoDB Atlas database
   - Configures marketing automation APIs

2. **Manual Setup:**
   ```bash
   ./quickstart.sh
   cp .env.example .env
   # Edit .env with your API keys
   npm start
   ```

### Key Routes and Endpoints

- `/` - API status and endpoint listing
- `/health` - Health check with system metrics
- `/dashboard` - Revenue dashboard UI
- `/webhook/polar` - Polar.sh subscription webhooks

### Trading Signal Format

The system parses natural language for trading signals with patterns like:
- Actions: "buy", "sell", "long", "short", "bull", "bear"
- Symbols: 3-5 character pairs (e.g., "BTC/USD", "ETHUSDT")
- Prices: Dollar amounts or decimal numbers
- Stop Loss: "sl", "stop loss" followed by price
- Take Profit: "tp", "take profit", "target" followed by price

### Risk Management

Built-in safety features:
- Maximum 2% position size per trade
- 2% stop-loss enforcement
- 5% daily loss limit
- Sandbox/testnet mode when NODE_ENV !== 'production'

### Error Handling Strategy

- Global uncaught exception and rejection handlers (non-terminating)
- Component-level error isolation with fallback functionality
- Graceful degradation when individual services fail
- Comprehensive logging for debugging

### Scripts and Automation

**`scripts/auto-setup.js`** - Automated API key configuration
**`scripts/auto-setup-secure.js`** - Enhanced security automation
**`demo-auto-setup.js`** - Demo version of automation setup

## Unique Considerations

### Discord Bot Permissions
- Bot needs permissions to read messages in target channels
- Requires Gateway Intents for Guilds to monitor messages
- Uses Discord.js v14 with modern syntax

### Trading Execution
- CCXT library handles multiple exchange integrations
- Automatic testnet detection prevents accidental live trading during development
- Position sizing calculations based on account balance and risk parameters

### Subscription Management
- 7-day free trial period for new subscriptions
- Three pricing tiers with different signal quotas
- Webhook-driven subscription state management

### Security Considerations
- API keys stored in environment variables only
- Webhook signature verification for Polar.sh events
- Sandbox mode enforcement for development trading

### Monitoring and Logging
- Heartbeat logging every 30 seconds
- Process metrics available at `/health` endpoint
- Winston logging framework integration
- Server error event handling

### Scaling Architecture
- Stateless design allows horizontal scaling
- MongoDB for persistent data storage
- Express server can be load balanced
- External API rate limiting handled per service

## Testing Approach

- Jest framework configured for unit testing
- Manual testing script: `test-secure-setup.js`
- No existing comprehensive test suite (opportunity for improvement)

## Deployment

- Configured for Railway deployment via `railway.toml`
- Environment variables must be configured in deployment environment
- MongoDB Atlas recommended for production database
- Webhook endpoints must be publicly accessible for Polar.sh integration
