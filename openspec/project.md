# Project Context

## Purpose
Discord Trade Executor is an automated trading bot SaaS platform that:
- Executes trades from Discord signals and TradingView webhooks in real-time
- Supports multiple brokers (stocks via Alpaca, crypto via Binance/CCXT)
- Provides subscription-based service ($49-$299/month tiers)
- Includes risk management, portfolio analytics, and signal provider marketplace
- Features automated marketing and customer acquisition systems

**Business Model:** Recurring revenue SaaS targeting Discord trading communities (2M+ active traders)

**Target Users:** Retail traders who want automated trade execution from signal providers

## Tech Stack

### Backend
- **Runtime:** Node.js >=22.11.0
- **Framework:** Express.js 4.18.2
- **Database:** MongoDB 8.0.4 with Mongoose ODM
- **Authentication:** Passport.js with Discord OAuth2
- **Session Management:** express-session with connect-mongo store
- **Discord Integration:** Discord.js 14.14.1
- **Trading APIs:**
  - CCXT 4.1.99 (multi-exchange crypto trading)
  - Alpaca Trade API 3.1.3 (stock trading)
- **NLP:** Natural.js 6.12.0 (signal parsing)
- **Payment Processing:** Stripe 14.12.0
- **Security:** Helmet 7.1.0, express-rate-limit, rate-limiter-flexible
- **Validation:** Validator 13.15.15, Zod 4.1.12
- **Logging:** Winston 3.11.0

### Frontend
- **Framework:** React 19.2.0
- **Build Tool:** Vite 6.0.5
- **Styling:** TailwindCSS 3.4.16 with PostCSS/Autoprefixer
- **UI Components:** Radix UI (dialog, dropdown, select, tabs, toast, tooltip)
- **Component Library:** shadcn/ui pattern (custom components in `src/dashboard/components/ui/`)
- **Forms:** React Hook Form 7.64.0 with @hookform/resolvers
- **Data Tables:** TanStack React Table 8.21.3
- **Charts:** Recharts 3.2.1
- **Icons:** Lucide React 0.545.0
- **Utilities:** clsx, tailwind-merge, class-variance-authority

### Testing & Quality
- **Unit Testing:** Jest 30.2.0 (Node.js environment)
- **E2E Testing:** Playwright 1.55.0
- **API Testing:** Supertest 7.1.4
- **Test Database:** MongoDB Memory Server 10.2.1
- **HTTP Mocking:** Nock 14.0.10
- **Stubbing:** Sinon 21.0.0
- **Assertions:** Chai 6.2.0

### Development Tools
- **Process Manager:** Nodemon 3.0.2
- **Bundler:** Webpack 5.89.0 (production builds)
- **CLI Tools:** Prompts 2.4.2, Ora 9.0.0, Chalk 4.1.2

## Project Conventions

### Code Style
- **Language:** JavaScript (ES6+), Node.js CommonJS modules
- **Frontend:** JSX with React functional components and hooks
- **Naming Conventions:**
  - Files: kebab-case for utilities, PascalCase for React components, lowercase for routes
  - Classes: PascalCase (e.g., `DiscordTradeBot`, `TradeExecutor`)
  - Functions/Methods: camelCase (e.g., `executeTrade`, `parseSignal`)
  - Constants: UPPER_SNAKE_CASE for environment variables
  - React Components: PascalCase files and exports
- **Formatting:** No explicit ESLint/Prettier config (use project defaults)
- **Path Aliases:** `@` aliased to `src/dashboard` in Vite config
- **Comments:** Use clear, concise comments; emoji prefixes for logs (✅ ❌ 🤖 💳 📈 🚀 ⚠️)

### Architecture Patterns

#### Backend Architecture
- **Modular Monolith:** Single Express app with distinct service modules
- **Service Layer Pattern:**
  - `DiscordTradeBot` - Discord integration and signal monitoring
  - `TradeExecutor` - Trade execution orchestration
  - `SignalParser` - NLP-based signal interpretation
  - `SubscriptionManager` - Stripe billing management
  - `MarketingAutomation` - Customer acquisition automation
  - `PaymentProcessor` - Payment webhook handling
  - `TradingViewParser` - TradingView webhook integration

- **Adapter Pattern:** Broker abstraction layer
  - Base: `BrokerAdapter` (abstract interface)
  - Factory: `BrokerFactory` (broker instantiation)
  - Implementations:
    - **Crypto**: `BinanceAdapter`, `CoinbaseProAdapter`, `KrakenAdapter` (via CCXT)
    - **Stocks**: `AlpacaAdapter`, `IBKRAdapter` (Interactive Brokers), `SchwabAdapter` (Charles Schwab)
  - Location: `src/brokers/adapters/`

- **Middleware Stack:**
  - Security: Helmet (CSP, HSTS, XSS protection)
  - Authentication: Passport.js with Discord Strategy
  - Authorization: Custom auth middleware (`src/middleware/auth.js`)
  - Rate Limiting: Express rate limiter + rate-limiter-flexible
  - Validation: Custom validation middleware
  - Encryption: Sensitive data encryption middleware
  - Admin: Admin role checking middleware

- **API Structure:**
  - RESTful endpoints in `src/routes/api/`
  - Webhook endpoints: `/webhook/stripe`, `/webhook/tradingview`
  - Auth routes: `/auth/*` (Discord OAuth flow)
  - API documentation: `/api` (endpoint listing)

#### Frontend Architecture
- **Component Structure:**
  - UI primitives: `src/dashboard/components/ui/` (shadcn/ui pattern)
  - Feature components: `src/dashboard/components/`
  - Pages: `src/dashboard/pages/`
  - Hooks: `src/dashboard/hooks/`
  - Utils: `src/dashboard/utils/`
  - Config: `src/dashboard/lib/`

- **State Management:** React hooks (useState, useEffect, custom hooks)
- **Routing:** Client-side routing (React Router implied by SPA structure)
- **API Communication:** Axios 1.12.2 with proxy config in Vite
- **Form Handling:** React Hook Form with Zod schema validation

#### Data Models
- **User Model:** `src/models/User.js` - User accounts, subscriptions, API keys
- **Trade Model:** `src/models/Trade.js` - Trade history, execution records
- **SignalProvider Model:** `src/models/SignalProvider.js` - Signal source tracking

### Testing Strategy

#### Coverage Requirements
- **Global Threshold:** 80% (branches, functions, lines, statements)
- **Critical Files:**
  - `signal-parser.js`: 95% coverage (mission-critical parsing logic)
  - `trade-executor.js`: 90% coverage (high-risk trade execution)

#### Test Organization
- **Colocated Tests:** Tests live in `__tests__/` subdirectories next to source
  - Example: `src/brokers/adapters/__tests__/AlpacaAdapter.test.js`
- **Integration Tests:** `tests/` directory in project root
- **E2E Tests:** Playwright tests for dashboard workflows
- **Setup:** `tests/setup.js` for global test configuration

#### Test Configuration
- **Environment:** Node.js (Jest config)
- **Timeout:** 30 seconds per test
- **Database:** MongoDB Memory Server for isolated testing
- **HTTP Mocking:** Nock for external API calls
- **Coverage Reports:** Text, LCOV, HTML formats in `coverage/` directory

#### Testing Approach
- **Unit Tests:** Service classes, adapters, parsers, utilities
- **Integration Tests:** API endpoints, database operations, webhook handling
- **E2E Tests:** User authentication flow, trade execution, dashboard interactions
- **Mocking Strategy:** Mock external APIs (Discord, Stripe, trading exchanges)

### Git Workflow
- **Branch Strategy:** Currently using `main` branch (no documented branching model)
- **Commit Style:** Descriptive commits (refer to git log for project patterns)
- **Recent Convention:** See `d074da8 Initial commit: Discord Trade Executor SaaS Platform`
- **Best Practice:** Use clear, action-oriented commit messages describing what changed and why

## Domain Context

### Trading Domain
- **Signal Formats:** Natural language Discord messages (e.g., "BUY AAPL @ $150, SL $145, TP $160")
- **TradingView Webhooks:** JSON alerts from TradingView strategies
- **Supported Asset Types:**
  - **Stocks**: via Alpaca API
  - **Cryptocurrencies**: via Binance, Coinbase Pro, Kraken (CCXT-based adapters)
  - **Futures**: Planned via TD Ameritrade

- **Risk Management:**
  - Position sizing based on account percentage
  - Stop-loss and take-profit automation
  - Daily loss limits per user
  - Maximum position limits

### Business Domain
- **Subscription Tiers:**
  - Basic: $49/month, 100 signals/day
  - Pro: $99/month, unlimited signals
  - Premium: $299/month, multi-broker + priority execution

- **Revenue Streams:**
  - Recurring subscriptions (primary)
  - Signal provider marketplace fees (planned)
  - Premium broker integrations (planned)

### Technical Domain
- **Rate Limiting:** Protect against API abuse and manage broker rate limits
- **Webhook Verification:** Signature validation for Stripe and TradingView
- **Session Management:** 7-day cookie lifetime, MongoDB-backed sessions
- **Encryption:** Sensitive API keys encrypted at rest (ENCRYPTION_KEY in .env)
- **Demo Mode:** Simulate trades without real API calls (DEMO_MODE flag)

## Important Constraints

### Technical Constraints
- **Node.js Version:** Requires >=22.11.0 (specified in package.json engines)
- **Exchange Rate Limits:** Must respect broker API rate limits
  - Alpaca: 200 requests/minute
  - Binance: Weight-based system
  - Use rate-limiter-flexible for client-side throttling

- **WebSocket Connections:** Discord bot maintains persistent connection
- **Database:** MongoDB required (no other DB support)
- **Production Requirements:**
  - HTTPS enforced (secure cookies, Helmet HSTS)
  - Environment-based configuration (NODE_ENV=production)
  - Trust proxy for Railway/Heroku deployment

### Business Constraints
- **Compliance:** Must comply with financial trading regulations
- **Broker Requirements:** Users must have their own broker accounts
- **Risk Disclosure:** Platform does not provide financial advice
- **API Key Security:** User API keys must be encrypted at rest
- **Data Retention:** Trade history retained for compliance/analytics

### Regulatory Constraints
- **Financial Services:** Not a registered broker-dealer
- **User Responsibility:** Users responsible for their own trading decisions
- **KYC/AML:** Delegated to broker partners (Alpaca, Binance)
- **Payment Processing:** PCI compliance via Stripe

## External Dependencies

### Critical Services
- **Discord API:**
  - Bot Token (DISCORD_BOT_TOKEN)
  - OAuth2 (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET)
  - Used for: Bot functionality, user authentication
  - Docs: https://discord.com/developers/docs

- **Stripe:**
  - Secret Key (STRIPE_SECRET_KEY)
  - Webhook Secret (STRIPE_WEBHOOK_SECRET)
  - Used for: Subscription billing, payment processing
  - Webhooks: `/webhook/stripe`

- **MongoDB:**
  - Connection URI (MONGODB_URI)
  - Used for: User data, trades, sessions, analytics
  - Hosted: MongoDB Atlas (recommended) or self-hosted

- **Alpaca Trading API:**
  - Paper Trading: ALPACA_PAPER_KEY, ALPACA_PAPER_SECRET
  - Live Trading: ALPACA_LIVE_KEY, ALPACA_LIVE_SECRET
  - Used for: Stock/ETF trading execution
  - Docs: https://alpaca.markets/docs/

- **Binance API:**
  - BINANCE_API_KEY, BINANCE_SECRET
  - Used for: Cryptocurrency trading
  - Rate limits: Weight-based system

### Optional Services
- **TradingView:**
  - Webhook Secret (TRADINGVIEW_WEBHOOK_SECRET)
  - Used for: Strategy alerts → automated trading
  - Endpoint: `/webhook/tradingview`

- **Marketing Automation:**
  - Twitter API (TWITTER_API_KEY, TWITTER_API_SECRET, tokens)
  - Reddit API (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, credentials)
  - Email Service (EMAIL_SERVICE_API_KEY)
  - WordPress (WORDPRESS_API_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD)
  - Used for: Automated customer acquisition, content marketing

### Deployment Platforms
- **Recommended:** Railway (WebSocket support, long-running processes, Nixpacks builder)
- **Alternative:** Heroku (fully supported, traditional platform)
- **Historical:** Vercel (archived, see `openspec/archive/vercel/migration-guide.md`)
- **Database:** MongoDB Atlas (managed, recommended)
- **CDN:** Not required (self-hosted static assets via Express)
- **Domain:** Custom domain required for production OAuth callbacks

**Why Railway?**
- Native WebSocket support for Discord bot persistent connection
- No serverless timeouts for long-running webhook listeners
- Stateful Express session management works seamlessly
- Build flexibility with Nixpacks (configured in `railway.toml`)
- Automatic restarts with configurable retry policies

### Development Dependencies
- **No external dev services required**
- **Local MongoDB:** Can use docker or local install
- **Testing:** MongoDB Memory Server (no external DB needed)
