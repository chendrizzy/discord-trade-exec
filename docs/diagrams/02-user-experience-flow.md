# Discord Trade Executor - User Experience Flow

## Overview
This diagram maps the complete user journey from initial discovery to active trading and subscription management.

## User Journey Diagram

```mermaid
graph TB
    START([User Discovers Platform]) --> LANDING[Visit Landing Page]

    LANDING --> DECISION1{Interested in<br/>Auto-Trading?}
    DECISION1 -->|No| END1([Exit])
    DECISION1 -->|Yes| SIGNUP[Click 'Get Started']

    SIGNUP --> DISCORD_AUTH[Discord OAuth Login]
    DISCORD_AUTH --> AUTH_SUCCESS{Authentication<br/>Successful?}
    AUTH_SUCCESS -->|No| AUTH_ERROR[Show Error Message]
    AUTH_ERROR --> DISCORD_AUTH
    AUTH_SUCCESS -->|Yes| CREATE_ACCOUNT[Create User Account<br/>Free Tier 7-Day Trial]

    CREATE_ACCOUNT --> ONBOARDING_START[Dashboard Welcome Screen]
    ONBOARDING_START --> TOUR_DECISION{Take Product<br/>Tour?}
    TOUR_DECISION -->|Yes| PRODUCT_TOUR[Interactive Tutorial<br/>Feature Overview]
    TOUR_DECISION -->|No| DASHBOARD
    PRODUCT_TOUR --> DASHBOARD[Main Dashboard]

    DASHBOARD --> USER_ACTION{What does<br/>user want?}

    %% Bot Setup Flow
    USER_ACTION -->|Create Trading Bot| BOT_WIZARD[Bot Configuration Wizard]
    BOT_WIZARD --> BOT_STEP1[Step 1: Name Your Bot]
    BOT_STEP1 --> BOT_STEP2[Step 2: Select Signal Provider]
    BOT_STEP2 --> BOT_STEP3[Step 3: Configure Risk Settings<br/>• Position Size<br/>• Stop Loss %<br/>• Take Profit %<br/>• Daily Loss Limit]
    BOT_STEP3 --> BOT_STEP4[Step 4: Connect Exchange<br/>Add API Keys]
    BOT_STEP4 --> API_KEY_CHECK{API Keys<br/>Valid?}
    API_KEY_CHECK -->|No| API_ERROR[Invalid Keys Error]
    API_ERROR --> BOT_STEP4
    API_KEY_CHECK -->|Yes| BOT_STEP5[Step 5: Review & Activate]
    BOT_STEP5 --> BOT_CREATED[Bot Created Successfully]
    BOT_CREATED --> DASHBOARD

    %% API Key Management Flow
    USER_ACTION -->|Manage API Keys| API_SETTINGS[API Key Settings Page]
    API_SETTINGS --> API_ACTION{API Key<br/>Action?}
    API_ACTION -->|Add New| ADD_API[Enter Exchange Credentials<br/>• Exchange Type<br/>• API Key<br/>• API Secret<br/>• Testnet Toggle]
    API_ACTION -->|Edit Existing| EDIT_API[Update API Credentials]
    API_ACTION -->|Delete| DELETE_API[Confirm Deletion]
    ADD_API --> VALIDATE_API{Test<br/>Connection?}
    VALIDATE_API -->|Failed| API_ERROR2[Show Connection Error]
    API_ERROR2 --> ADD_API
    VALIDATE_API -->|Success| SAVE_API[Save Encrypted Keys]
    EDIT_API --> SAVE_API
    DELETE_API --> SAVE_API
    SAVE_API --> DASHBOARD

    %% Live Trading Flow
    USER_ACTION -->|Monitor Trades| ANALYTICS[Analytics & Trade History]
    ANALYTICS --> VIEW_TRADES[View Trade Table<br/>Filter & Sort]
    VIEW_TRADES --> TRADE_DETAILS{Select<br/>Trade?}
    TRADE_DETAILS -->|Yes| TRADE_MODAL[Trade Details Modal<br/>• Entry/Exit Price<br/>• P&L<br/>• Stop Loss/Take Profit<br/>• Fees]
    TRADE_MODAL --> MANUAL_CLOSE{Close Position<br/>Manually?}
    MANUAL_CLOSE -->|Yes| CLOSE_TRADE[Execute Close Order]
    MANUAL_CLOSE -->|No| ANALYTICS
    CLOSE_TRADE --> UPDATE_TRADE[Update Trade Record<br/>Calculate Final P&L]
    UPDATE_TRADE --> ANALYTICS
    TRADE_DETAILS -->|No| ANALYTICS

    %% Real-Time Signal Processing (Background)
    SIGNAL_RECEIVED([Discord Signal Received]) -.->|Background Process| PARSE_SIGNAL[NLP Parse Signal]
    PARSE_SIGNAL -.-> RISK_CHECK{Pass Risk<br/>Validation?}
    RISK_CHECK -.->|No| REJECT_SIGNAL[Reject Signal<br/>Log Reason]
    RISK_CHECK -.->|Yes| CHECK_LIMITS{Within Daily<br/>Limits?}
    CHECK_LIMITS -.->|No| LIMIT_ERROR[Daily Limit Reached<br/>Notify User]
    CHECK_LIMITS -.->|Yes| EXECUTE_TRADE[Execute Trade on Binance]
    EXECUTE_TRADE -.-> TRADE_SUCCESS{Order<br/>Successful?}
    TRADE_SUCCESS -.->|No| TRADE_ERROR[Log Error<br/>Notify User]
    TRADE_SUCCESS -.->|Yes| RECORD_TRADE[Save to Database<br/>Update Portfolio]
    RECORD_TRADE -.-> NOTIFY_USER[Push Notification<br/>Update Dashboard]
    NOTIFY_USER -.-> DASHBOARD

    %% Subscription Management Flow
    USER_ACTION -->|Upgrade Plan| SUBSCRIPTION[Subscription Management]
    SUBSCRIPTION --> CURRENT_PLAN[View Current Plan<br/>Usage Statistics]
    CURRENT_PLAN --> PLAN_DECISION{Change<br/>Plan?}
    PLAN_DECISION -->|No| DASHBOARD
    PLAN_DECISION -->|Yes| CHOOSE_PLAN[Select New Plan<br/>Free/Basic/Pro/Premium]
    CHOOSE_PLAN --> POLAR_CHECKOUT[Polar.sh Checkout Page]
    POLAR_CHECKOUT --> PAYMENT_SUCCESS{Payment<br/>Successful?}
    PAYMENT_SUCCESS -->|No| PAYMENT_ERROR[Payment Failed<br/>Try Again]
    PAYMENT_ERROR --> POLAR_CHECKOUT
    PAYMENT_SUCCESS -->|Yes| UPDATE_SUBSCRIPTION[Update User Tier via Webhook<br/>Increase Limits]
    UPDATE_SUBSCRIPTION --> SUBSCRIPTION_CONFIRM[Subscription Confirmed<br/>Show New Features]
    SUBSCRIPTION_CONFIRM --> DASHBOARD

    %% Settings & Configuration
    USER_ACTION -->|Configure Settings| SETTINGS[Settings Page]
    SETTINGS --> SETTINGS_OPTION{What to<br/>Configure?}
    SETTINGS_OPTION -->|Risk Parameters| RISK_SETTINGS[Edit Risk Settings<br/>• Position Sizing Method<br/>• Stop Loss %<br/>• Take Profit %<br/>• Daily Loss Limit<br/>• Max Open Positions<br/>• Trading Hours]
    SETTINGS_OPTION -->|Notifications| NOTIF_SETTINGS[Notification Preferences<br/>• Discord DM<br/>• Email Alerts<br/>• Trade Confirmations<br/>• Error Notifications]
    SETTINGS_OPTION -->|Security| SECURITY_SETTINGS[Security Settings<br/>• Change Password<br/>• 2FA Toggle<br/>• API Key Encryption]
    RISK_SETTINGS --> SAVE_SETTINGS[Save Configuration]
    NOTIF_SETTINGS --> SAVE_SETTINGS
    SECURITY_SETTINGS --> SAVE_SETTINGS
    SAVE_SETTINGS --> DASHBOARD

    %% Admin Flow (Admin Users Only)
    USER_ACTION -->|View Admin Panel| ADMIN_CHECK{Is Admin<br/>User?}
    ADMIN_CHECK -->|No| PERMISSION_ERROR[403 Forbidden]
    ADMIN_CHECK -->|Yes| ADMIN_DASH[Admin Dashboard]
    ADMIN_DASH --> ADMIN_ACTION{Admin<br/>Action?}
    ADMIN_ACTION -->|View User Stats| USER_STATS[User Statistics<br/>• Total Users<br/>• Active Users<br/>• By Tier]
    ADMIN_ACTION -->|View Revenue| REVENUE_STATS[Revenue Metrics<br/>• MRR<br/>• ARPU<br/>• Tier Breakdown]
    ADMIN_ACTION -->|View Platform Stats| PLATFORM_STATS[Platform Trading Stats<br/>• Total Trades<br/>• Total Volume<br/>• Success Rate]
    ADMIN_ACTION -->|Manage Users| USER_MGMT[User Management<br/>• View Details<br/>• Edit Subscription<br/>• Suspend Account]
    USER_STATS --> ADMIN_DASH
    REVENUE_STATS --> ADMIN_DASH
    PLATFORM_STATS --> ADMIN_DASH
    USER_MGMT --> ADMIN_DASH
    ADMIN_DASH --> DASHBOARD

    %% Logout Flow
    USER_ACTION -->|Logout| CONFIRM_LOGOUT{Confirm<br/>Logout?}
    CONFIRM_LOGOUT -->|No| DASHBOARD
    CONFIRM_LOGOUT -->|Yes| DESTROY_SESSION[Destroy Session]
    DESTROY_SESSION --> LOGOUT_SUCCESS([Logged Out Successfully])

    %% Styling
    classDef entrypoint fill:#667eea,stroke:#5568d3,stroke-width:3px,color:#fff
    classDef process fill:#48bb78,stroke:#38a169,stroke-width:2px,color:#fff
    classDef decision fill:#ed8936,stroke:#dd6b20,stroke-width:2px,color:#fff
    classDef error fill:#f56565,stroke:#e53e3e,stroke-width:2px,color:#fff
    classDef success fill:#4fd1c5,stroke:#38b2ac,stroke-width:2px,color:#fff
    classDef background fill:#a0aec0,stroke:#718096,stroke-width:1px,color:#fff,stroke-dasharray: 5 5

    class START,LANDING,DASHBOARD entrypoint
    class DISCORD_AUTH,CREATE_ACCOUNT,BOT_WIZARD,BOT_CREATED,SAVE_API,ANALYTICS,SUBSCRIPTION,SETTINGS,ADMIN_DASH process
    class DECISION1,AUTH_SUCCESS,TOUR_DECISION,USER_ACTION,API_KEY_CHECK,API_ACTION,TRADE_DETAILS,MANUAL_CLOSE,PLAN_DECISION,PAYMENT_SUCCESS,SETTINGS_OPTION,ADMIN_CHECK,ADMIN_ACTION,CONFIRM_LOGOUT decision
    class AUTH_ERROR,API_ERROR,API_ERROR2,TRADE_ERROR,PAYMENT_ERROR,LIMIT_ERROR,PERMISSION_ERROR error
    class UPDATE_SUBSCRIPTION,SUBSCRIPTION_CONFIRM,LOGOUT_SUCCESS success
    class SIGNAL_RECEIVED,PARSE_SIGNAL,RISK_CHECK,CHECK_LIMITS,EXECUTE_TRADE,TRADE_SUCCESS,RECORD_TRADE,NOTIFY_USER background
```

## User Journey Stages

### 1. Discovery & Onboarding (15-30 minutes)
**Goal**: Get user from landing page to first bot setup

**Steps**:
1. **Landing Page** → Discover platform value proposition
2. **Discord OAuth** → Quick 1-click authentication
3. **Account Creation** → Automatic free tier (7-day trial, 10 signals/day)
4. **Welcome Screen** → Optional product tour
5. **Dashboard First View** → See example portfolio (demo data)

**Success Metrics**:
- Time to first login: <2 minutes
- Tour completion rate: Target 60%
- Bounce rate: <30%

### 2. Bot Setup & Configuration (10-20 minutes)
**Goal**: Create first automated trading bot

**Bot Configuration Wizard** (5 steps):
1. **Name Your Bot**
   - Input: Bot name (e.g., "BTC Scalper", "ETH Swing Trader")
   - Optional: Description/notes

2. **Select Signal Provider**
   - Browse available Discord signal providers
   - View provider stats (win rate, avg ROI, total signals)
   - Subscribe to provider channel

3. **Configure Risk Settings**
   - **Position Sizing Method**:
     - Fixed % of portfolio (default: 2%)
     - Risk-based (calculate from stop-loss distance)
     - Kelly Criterion (optimal bet sizing)
   - **Stop Loss**: Default 2%, adjustable 0.5%-10%
   - **Take Profit**: Default 4%, adjustable 1%-20%
   - **Daily Loss Limit**: Default 5%, max 10%
   - **Max Open Positions**: Default 3, max 10

4. **Connect Exchange**
   - Select exchange (currently Binance only)
   - Add API Key & Secret
   - Toggle testnet mode (recommended for first bot)
   - Validate connection

5. **Review & Activate**
   - Summary of all settings
   - Risk disclaimer acknowledgment
   - Activate bot

**Success Metrics**:
- Wizard completion rate: Target 70%
- Time to first bot activation: <15 minutes
- Testnet usage rate: Target 80% for first bot

### 3. Active Trading & Monitoring (Ongoing)
**Goal**: Execute trades automatically and monitor performance

**Real-Time Signal Processing** (Background):
```
Discord Signal Posted
  ↓ (< 1 second)
NLP Parsing & Validation
  ↓ (< 500ms)
Risk Checks (daily limits, position size, trading hours)
  ↓ (< 200ms)
Binance Order Execution
  ↓ (1-2 seconds)
Database Record & Dashboard Update
  ↓ (< 500ms)
User Notification (Discord DM or Email)
```

**User Monitoring Options**:
1. **Portfolio Overview**:
   - Total balance & P&L
   - Open positions chart
   - Daily/weekly/monthly performance

2. **Trade History Table**:
   - Sortable columns (date, symbol, P&L, status)
   - Filterable (exchange, bot, date range)
   - Export to CSV

3. **Live Trade Details**:
   - Entry/exit prices
   - Quantity & fees
   - Real-time P&L
   - Manual close option

**Success Metrics**:
- Trade execution latency: <3 seconds from signal
- Dashboard refresh rate: Every 10 seconds
- Manual intervention rate: <5% of trades

### 4. Subscription Upgrade (Conversion)
**Goal**: Convert free/trial users to paid plans

**Upgrade Triggers**:
- Daily signal limit reached (10 for free tier)
- 7-day trial expiring (3-day warning)
- User requests advanced features (multi-exchange, higher limits)

**Upgrade Flow**:
1. **Current Plan View**:
   - Usage statistics (signals used today)
   - Plan limits comparison table
   - "Upgrade Now" CTA

2. **Plan Selection**:
   - **Basic ($49/mo)**: 100 signals/day, 1 exchange
   - **Pro ($99/mo)**: Unlimited signals, multi-exchange
   - **Premium ($299/mo)**: Multi-broker (stocks), priority support

3. **Polar.sh Checkout**:
   - Secure payment processing
   - Credit card or bank account
   - Automatic billing
   - Webhook-based subscription activation

4. **Instant Activation**:
   - Immediate tier upgrade
   - Limits updated in real-time
   - Access to premium features

**Success Metrics**:
- Free → Paid conversion rate: Target 15%
- Average time to upgrade: <5 days
- Plan distribution: 40% Basic, 50% Pro, 10% Premium

### 5. Advanced Features & Settings
**Goal**: Power users customize platform for optimal results

**Risk Management Customization**:
- **Position Sizing**:
  - Fixed: Simple % of portfolio
  - Risk-based: Account for stop-loss distance
  - Kelly Criterion: Mathematically optimal sizing

- **Trading Hours**:
  - Enable/disable time-based trading
  - Set start/end hours (UTC)
  - Avoid overnight positions

- **Advanced Stops**:
  - Trailing stop-loss (auto-adjust with profit)
  - Trailing stop % (default 1.5%)
  - Multiple take-profit levels

**Notification Preferences**:
- Discord DM for trade confirmations
- Email for daily summaries
- SMS for critical alerts (Premium only)
- Webhook integrations (custom endpoints)

**API Key Management**:
- Add multiple exchanges (Pro/Premium)
- Testnet/live mode toggle
- Encrypted storage (AES-256)
- Permission scoping (spot only, no withdrawals)

### 6. Admin Operations (Platform Operators)
**Goal**: Monitor platform health and user engagement

**Admin Dashboard Sections**:
1. **User Statistics**:
   - Total users by tier
   - Daily/weekly active users
   - Recent signups list

2. **Revenue Metrics**:
   - MRR (Monthly Recurring Revenue)
   - ARPU (Average Revenue Per User)
   - Revenue breakdown by tier

3. **Platform Trading Stats**:
   - Total trades executed today
   - Total trading volume (USD)
   - Overall success rate %

4. **Top Traders Leaderboard**:
   - Ranked by ROI %
   - Total P&L
   - Number of trades

5. **User Management**:
   - Search users by Discord ID/email
   - View detailed user profile
   - Manual subscription adjustments
   - Account suspension (ToS violations)

**Admin-Only Access**:
- Protected by `isAdmin` flag in User model
- Middleware check on all admin routes
- Audit log for admin actions

## Pain Points & Solutions

### Common User Friction Points

1. **API Key Setup Confusion**
   - **Problem**: Users don't know how to generate Binance API keys
   - **Solution**: Step-by-step visual guide with screenshots
   - **Enhancement**: Video tutorial embedded in wizard

2. **Risk Settings Overwhelm**
   - **Problem**: Too many options for beginners
   - **Solution**: Preset profiles (Conservative, Moderate, Aggressive)
   - **Enhancement**: AI-suggested settings based on portfolio size

3. **Signal Provider Selection**
   - **Problem**: Hard to choose from many providers
   - **Solution**: Show performance metrics (win rate, avg ROI)
   - **Enhancement**: Filter by strategy type (scalping, swing, long-term)

4. **Trade Execution Failures**
   - **Problem**: Trades fail due to insufficient balance or API errors
   - **Solution**: Pre-flight balance check, clear error messages
   - **Enhancement**: Retry logic with exponential backoff

5. **Daily Limit Reached**
   - **Problem**: Free users hit 10 signal limit, frustrated
   - **Solution**: Clear limit warning at 8/10 signals
   - **Enhancement**: One-click upgrade flow from warning

## Mobile Experience Considerations

### Current Mobile Support
- ✅ **Responsive Design**: Tailwind CSS breakpoints
- ✅ **Mobile Navigation**: Bottom tab bar
- ✅ **Touch-Optimized**: Larger tap targets
- ✅ **Fast Loading**: Vite optimized bundle

### Mobile-Specific Flows
1. **Login**: OAuth works seamlessly on mobile browsers
2. **Bot Setup**: Wizard adapts to vertical layout
3. **Monitoring**: Swipe gestures for trade details
4. **Charts**: Touch-responsive Recharts

### Future Mobile Enhancements
- ❌ **Native App** (iOS/Android): Planned for future
- ❌ **Push Notifications**: Native mobile alerts
- ❌ **Biometric Auth**: Face ID/Touch ID
- ❌ **Offline Mode**: Cache recent trades

## Accessibility Features

### Current Implementation
- ✅ **Keyboard Navigation**: Full keyboard support
- ✅ **Color Contrast**: WCAG AA compliant (dark theme)
- ✅ **Focus Indicators**: Visible focus rings
- ✅ **Screen Reader**: Semantic HTML, ARIA labels

### Future Enhancements
- ❌ **Voice Control**: Hands-free trading commands
- ❌ **High Contrast Mode**: Accessibility theme toggle
- ❌ **Text Scaling**: Respect browser font size preferences

## Source Code References
- Bot Wizard: `src/dashboard/components/BotConfigWizard.jsx:1`
- API Key Management: `src/dashboard/components/APIKeyManagement.jsx:1`
- Trade History: `src/dashboard/components/TradeHistoryTable.jsx:1`
- Analytics: `src/dashboard/components/AnalyticsView.jsx:1`
- Subscription: `src/routes/subscription.js:1`
- Admin Dashboard: `src/dashboard/components/AdminDashboard.jsx:1`
- User Model: `src/models/User.js:1`
- Risk Validation: `src/trade-executor.js:45-120`

## Next Diagram
See [Trade Execution Data Flow](./03-trade-execution-dataflow.md) for detailed technical flow of signal → trade processing.
