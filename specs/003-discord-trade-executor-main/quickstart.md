# Quickstart Guide

**Feature**: 003-discord-trade-executor-main  
**For**: Local development setup  
**Date**: 2025-10-22  
**Audience**: Developers onboarding to the project

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: 22.11.0 or higher (LTS recommended)
  ```bash
  node --version  # Should output v22.11.0 or higher
  ```

- **npm**: 10.x or higher (comes with Node.js)
  ```bash
  npm --version
  ```

- **Docker & Docker Compose**: For local MongoDB + Redis
  ```bash
  docker --version
  docker compose version
  ```

- **Git**: For cloning repository
  ```bash
  git --version
  ```

- **Recommended**: VS Code with extensions:
  - ESLint
  - Prettier
  - Jest
  - MongoDB for VS Code

---

## Quick Start (5 Minutes)

### Automated Setup

The fastest way to get started:

```bash
# Clone repository
git clone https://github.com/chendrizzy/discord-trade-exec.git
cd discord-trade-exec

# Run automated setup script
./auto-setup.sh

# Or use the quickstart script
./quickstart.sh
```

The automated setup will:
1. ✅ Check prerequisites (Node.js, Docker)
2. ✅ Install dependencies
3. ✅ Start Docker containers (MongoDB + Redis)
4. ✅ Copy `.env.example` to `.env`
5. ✅ Generate encryption keys
6. ✅ Run database migrations
7. ✅ Start development server

**After automated setup completes**, skip to [Step 6: Test the Setup](#step-6-test-the-setup).

---

## Manual Setup (Step-by-Step)

### Step 1: Clone Repository

```bash
git clone https://github.com/chendrizzy/discord-trade-exec.git
cd discord-trade-exec
```

---

### Step 2: Install Dependencies

```bash
npm install
```

This installs ~70 production and dev dependencies including:
- Express.js 4.18.2
- Mongoose 8.0.4
- Socket.IO 4.7.5
- React 19.2.0
- Jest 30.2.0
- Playwright 1.55.0

---

### Step 3: Start Local Infrastructure

Use Docker Compose to spin up MongoDB and Redis:

```bash
docker compose up -d
```

This starts:
- **MongoDB**: Port 27017 (database)
- **Redis**: Port 6379 (sessions + Socket.IO adapter)

Verify containers are running:
```bash
docker ps
# Should show mongo and redis containers
```

---

### Step 4: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in the following **required** variables:

#### Core Configuration
```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
MONGODB_URI=mongodb://localhost:27017/tradeexec
REDIS_URL=redis://localhost:6379

# Security
SESSION_SECRET=your_session_secret_minimum_32_characters_long
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
```

#### Discord Bot Configuration

Create a Discord application at https://discord.com/developers/applications:

1. Click "New Application"
2. Go to "Bot" tab → Click "Add Bot"
3. Copy the bot token

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
```

#### Test Broker API Keys (Paper Trading)

For development and testing, use paper trading accounts:

**Alpaca Paper Trading** (Recommended for initial testing):
1. Sign up at https://alpaca.markets
2. Get paper trading API keys
3. Add to `.env`:

```env
ALPACA_API_KEY=your_alpaca_paper_key
ALPACA_SECRET_KEY=your_alpaca_paper_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

**Optional: Other Brokers**

See [Test Broker Accounts Setup](#test-broker-accounts-setup) below for:
- Interactive Brokers (IBKR) paper account
- TD Ameritrade sandbox
- E*TRADE sandbox
- Coinbase Pro sandbox
- Kraken demo

---

### Step 5: Run Database Migrations

Initialize the database schema:

```bash
npm run migrate
```

This creates:
- User collection with indexes
- Trade collection
- Position collection
- AuditLog collection
- Subscription collection

Check migration status:
```bash
npm run migrate:status
```

---

### Step 6: Test the Setup

Run the test suite to verify everything is configured correctly:

```bash
# Run all tests
npm test

# Run only unit tests (faster)
npm run test:unit

# Run with coverage
npm test -- --coverage
```

Expected output:
```
PASS  tests/unit/services/RiskManagementService.test.js
PASS  tests/integration/api/trades.test.js
PASS  tests/integration/routes/auth.test.js

Test Suites: 35 passed, 35 total
Tests:       150 passed, 150 total
Coverage:    >95% critical paths
```

---

### Step 7: Start Development Server

Start the backend API and Discord bot:

```bash
npm run dev
```

In a separate terminal, start the frontend dashboard:

```bash
npm run dev:dashboard
```

Services running:
- **Backend API**: http://localhost:3000
- **Frontend Dashboard**: http://localhost:5173
- **WebSocket Server**: ws://localhost:3000
- **Discord Bot**: Connected to Discord gateway

---

## Test Broker Accounts Setup# Security
JWT_SECRET=your-random-256-bit-secret
ENCRYPTION_KEY=your-aes-256-key-base64
SESSION_SECRET=your-session-secret

# Discord OAuth2
DISCORD_CLIENT_ID=your-discord-app-client-id
DISCORD_CLIENT_SECRET=your-discord-app-client-secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
DISCORD_BOT_TOKEN=your-discord-bot-token

# Broker API Keys (for testing - use paper trading accounts)
ALPACA_API_KEY=your-alpaca-paper-key
ALPACA_API_SECRET=your-alpaca-paper-secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Billing Provider (optional for local dev)
BILLING_PROVIDER=polar
POLAR_API_KEY=your-polar-api-key

# Frontend
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### Generate Secrets

Generate secure random secrets:

```bash
# JWT_SECRET (256-bit)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Discord OAuth2 Setup

1. Go to https://discord.com/developers/applications
2. Create new application "Discord Trade Executor Dev"
3. OAuth2 → Add redirect: `http://localhost:3000/auth/discord/callback`
4. Copy Client ID and Client Secret to `.env`
5. Bot → Create bot, copy token to `.env`

### Alpaca Paper Trading Setup

1. Go to https://alpaca.markets/
2. Sign up for free paper trading account
3. Generate API keys (paper trading)
4. Copy keys to `.env` (ALPACA_API_KEY, ALPACA_API_SECRET)
5. Verify `ALPACA_BASE_URL=https://paper-api.alpaca.markets`

---

## Step 5: Initialize Database

Create MongoDB indexes:

```bash
npm run db:init
```

This runs `scripts/db/create_indexes.js` which creates indexes for:
- User (discordId, email, subscriptionTier)
- BrokerConnection (userId, brokerType, lastHealthCheck)
- Trade (userId, status, brokerOrderId)
- Position (userId, symbol)
- AuditLog (timestamp, userId, action)
- Subscription (userId, billingProviderSubscriptionId)

Optionally seed test data:

```bash
npm run db:seed
```

This creates:
- 3 test users (testuser1, testuser2, testuser3)
- 2 broker connections (Alpaca paper accounts)
- 10 sample trades (filled, pending, rejected)
- 5 positions

---

## Step 6: Run Backend

Start the Express server with hot-reload:

```bash
npm run dev
```

You should see:
```
[INFO] Server starting on port 3000...
[INFO] MongoDB connected: 45ms latency
[INFO] Redis connected: 12ms latency
[INFO] Socket.IO initialized with Redis adapter
[INFO] Health check endpoint: http://localhost:3000/health
[INFO] API ready: http://localhost:3000/api/v1
```

Verify health check:
```bash
curl http://localhost:3000/health
# Should return: {"status":"healthy","mongodb":"connected","redis":"connected"}
```

---

## Step 7: Run Frontend

In a **new terminal**, start the Vite dev server:

```bash
npm run dev:dashboard
```

You should see:
```
  VITE v6.0.5  ready in 892 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Open browser to http://localhost:5173 — you should see the login page.

---

## Step 8: Test OAuth2 Login

1. Click "Login with Discord" button
2. Authorize the app on Discord consent screen
3. You'll be redirected to dashboard at http://localhost:5173/dashboard
4. Dashboard shows empty portfolio (no trades yet)

---

## Step 9: Connect Test Broker

In the dashboard:

1. Navigate to **Settings → Brokers**
2. Click "Add Broker" → Select "Alpaca"
3. Enter your paper trading API keys from `.env`
4. Click "Connect"
5. System validates keys and displays "Alpaca connected: $100,000.00"

---

## Step 10: Execute Test Trade

### Via Dashboard

1. Go to **Portfolio** page
2. Click "New Trade" button
3. Fill form:
   - Symbol: `AAPL`
   - Quantity: `10`
   - Order Type: `market`
   - Side: `buy`
4. Click "Submit Order"
5. Watch WebSocket update trade status in real-time

### Via Discord Bot

1. Join your test Discord server (invite bot first)
2. In #signals channel, send message: `/buy AAPL 10 @market`
3. Bot parses signal and executes trade
4. Dashboard updates automatically via WebSocket

### Via TradingView Webhook

Send POST request to webhook endpoint:

```bash
curl -X POST http://localhost:3000/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "TSLA",
    "action": "buy",
    "quantity": 5,
    "type": "limit",
    "price": 250.00
  }'
```

---

## Step 11: Run Tests

### Unit Tests

```bash
npm test
```

This runs Jest with coverage report:
```
 PASS  tests/unit/services/TradeExecutionService.test.js
 PASS  tests/unit/brokers/AlpacaAdapter.test.js
 PASS  tests/unit/utils/encryption.test.js

Test Suites: 45 passed, 45 total
Tests:       187 passed, 187 total
Coverage:    82.4% (target: >80% global, >95% critical paths)
```

### Integration Tests

```bash
npm run test:integration
```

Runs integration tests with MongoDB Memory Server:
- API endpoint tests (Supertest)
- WebSocket tests (socket.io-client)
- Broker adapter tests (mocked APIs)

### E2E Tests

```bash
npm run test:e2e
```

Runs Playwright browser automation:
- Login flow
- Broker connection wizard
- Trade execution end-to-end

---

## Step 12: View Logs

Logs are written to console with Winston structured format:

```bash
npm run dev
```

Sample log output:
```json
{
  "timestamp": "2024-03-15T14:23:11.000Z",
  "level": "info",
  "message": "Trade executed",
  "context": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "tradeId": "trade_abc123",
    "symbol": "AAPL",
    "quantity": 10,
    "fillPrice": 180.50,
    "requestId": "req_xyz789"
  }
}
```

Filter logs by level:
```bash
# Errors only
LOG_LEVEL=error npm run dev

# Debug (verbose)
LOG_LEVEL=debug npm run dev
```

---

## Troubleshooting

### MongoDB Connection Errors

**Problem**: `MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017`

**Solution**:
```bash
# Check if container is running
docker ps | grep mongo

# If not, restart
docker compose up -d mongo

# Test connection
mongosh mongodb://localhost:27017/tradeexec
```

### Redis Connection Errors

**Problem**: `Error: Redis connection to localhost:6379 failed`

**Solution**:
```bash
# Check if container is running
docker ps | grep redis

# Restart Redis
docker compose restart redis

# Test connection
redis-cli -h localhost -p 6379 ping
# Should return: PONG
```

### Broker API Authentication Failures

**Problem**: `BrokerAuthError: Alpaca authentication failed`

**Solution**:
1. Verify API keys in `.env` are correct (copy/paste from Alpaca dashboard)
2. Confirm using **paper trading** URL: `https://paper-api.alpaca.markets`
3. Check API key permissions: must have "Trading" enabled
4. Test keys manually:
   ```bash
   curl -H "APCA-API-KEY-ID: YOUR_KEY" \
        -H "APCA-API-SECRET-KEY: YOUR_SECRET" \
        https://paper-api.alpaca.markets/v2/account
   ```

### WebSocket Connection Issues

**Problem**: Dashboard shows "WebSocket disconnected"

**Solution**:
1. Check backend is running on port 3000
2. Verify `VITE_WS_URL=ws://localhost:3000` in `.env`
3. Check browser console for JWT token errors
4. Ensure JWT_SECRET matches between backend and frontend
5. Test WebSocket manually:
   ```javascript
   const socket = io('http://localhost:3000', {
     query: { token: 'your-jwt-token' }
   });
   socket.on('connection.authorized', (data) => console.log('Connected', data));
   ```

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### Discord Bot Not Responding

**Problem**: Bot online but doesn't respond to `/buy` commands

**Solution**:
1. Verify bot has "Message Content Intent" enabled in Discord Developer Portal
2. Check bot permissions: "Send Messages", "Read Message History"
3. Ensure bot is in the correct channel (#signals)
4. Test bot token:
   ```bash
   curl -H "Authorization: Bot YOUR_BOT_TOKEN" \
        https://discord.com/api/v10/users/@me
   ```

---

## Development Workflow

### Making Changes

1. Create feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make changes to code

3. Run tests:
   ```bash
   npm test
   npm run lint
   ```

4. Commit with conventional commit format:
   ```bash
   git commit -m "feat: add stop-loss automation"
   ```

5. Push and create PR:
   ```bash
   git push origin feature/your-feature-name
   ```

### Hot Reload

Backend and frontend support hot-reload:

- **Backend**: Nodemon watches `src/**/*.js` and restarts server
- **Frontend**: Vite HMR updates UI without page refresh

Make changes and save — changes appear automatically.

### Database Migrations

When adding new fields to models:

1. Update Mongoose schema in `src/models/*.js`
2. Create migration script in `scripts/db/migrations/`
3. Run migration:
   ```bash
   npm run db:migrate
   ```

Example migration (`scripts/db/migrations/001_add_subscription_tier.js`):
```javascript
module.exports = {
  async up(db) {
    await db.collection('users').updateMany(
      { subscriptionTier: { $exists: false } },
      { $set: { subscriptionTier: 'Free' } }
    );
  },
  async down(db) {
    await db.collection('users').updateMany(
      {},
      { $unset: { subscriptionTier: '' } }
    );
  }
};
```

---

## Next Steps

Now that you have the development environment running:

1. **Read the architecture docs**: `docs/ARCHITECTURE.md`
2. **Review the data model**: `specs/003-discord-trade-executor-main/data-model.md`
3. **Check API contracts**: `specs/003-discord-trade-executor-main/contracts/api-spec.yaml`
4. **Implement tasks**: `specs/003-discord-trade-executor-main/tasks.md`
5. **Follow constitution**: `.specify/memory/constitution.md`

---

## Useful Commands

```bash
# Development
npm run dev                  # Start backend with hot-reload
npm run dev:dashboard        # Start frontend with Vite HMR
npm run dev:all             # Start both backend + frontend

# Testing
npm test                     # Run all unit tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Generate coverage report
npm run test:integration     # Integration tests
npm run test:e2e             # Playwright E2E tests

# Building
npm run build                # Build backend (Webpack)
npm run build:dashboard      # Build frontend (Vite)

# Linting & Formatting
npm run lint                 # ESLint check
npm run lint:fix             # Auto-fix linting issues
npm run format               # Prettier format all files

# Database
npm run db:init              # Create indexes
npm run db:seed              # Seed test data
npm run db:migrate           # Run migrations
npm run db:drop              # Drop all collections (dev only)

# Deployment
npm run deploy               # Deploy to Railway (requires auth)
npm run health-check         # Test production health endpoint
```

---

## Support

- **Documentation**: `docs/` directory
- **Specification**: `specs/003-discord-trade-executor-main/spec.md`
- **Constitution**: `.specify/memory/constitution.md`
- **Issues**: https://github.com/chendrizzy/discord-trade-exec/issues

---

**Last Updated**: 2025-10-22  
**Status**: Production-ready local development guide
