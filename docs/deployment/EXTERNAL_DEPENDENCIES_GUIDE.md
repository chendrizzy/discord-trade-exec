# External Dependencies Guide

**Last Updated**: 2025-11-05
**Purpose**: Document all external services, accounts, and user actions required for production deployment

---

## ⚠️ Overview

This document lists ALL external dependencies that **require user action** before the Discord Trade Executor SaaS can be deployed to production. These items **cannot be automated** and require manual setup, account creation, or business decisions.

**Source**: Derived from `docs/deployment/RELEASE_READY_CHECKLIST.md`

---

## 📊 Priority Classification

- **P0 (CRITICAL)**: Must be completed before production launch - blocks deployment
- **P1 (HIGH)**: Strongly recommended for production - affects core functionality
- **P2 (MEDIUM)**: Recommended but not blocking - improves user experience
- **P3 (LOW)**: Optional - can be added post-launch

---

## 🌐 Section 1: Domain & Hosting (P0 - CRITICAL)

### 1.1 Domain Purchase

**Status**: NOT STARTED
**Priority**: P0 - CRITICAL
**User Action Required**: YES

**What You Need to Do**:
1. **Purchase a domain name** for your SaaS platform
   - Recommended registrars: Namecheap, Cloudflare, Google Domains
   - Cost: $10-50/year depending on TLD
   - Considerations:
     - Choose `.com` or `.io` for SaaS credibility
     - Avoid hyphenated names
     - Keep it short and memorable

2. **Configure DNS records**
   - After Railway deployment, add CNAME/A records
   - Point domain to Railway-provided URL
   - Configure subdomain for dashboard (optional)

**Estimated Time**: 1-2 hours
**Cost**: $10-50/year
**Blocks**: Environment variable setup (DASHBOARD_URL, LANDING_PAGE_URL, DISCORD_CALLBACK_URL)

---

### 1.2 Railway Hosting Account

**Status**: NOT STARTED
**Priority**: P0 - CRITICAL
**User Action Required**: YES

**What You Need to Do**:
1. **Create Railway account**
   - Visit: https://railway.app/
   - Sign up with GitHub (recommended)
   - Verify email address

2. **Create new project**
   - Click "New Project"
   - Link GitHub repository
   - Configure services: Web, PostgreSQL, Redis

3. **Add payment method** (after trial)
   - Railway offers $5 free credit
   - Add credit card for production use
   - Production cost estimate: $5-20/month

**Estimated Time**: 1 hour
**Cost**: $5-20/month (estimate)
**Blocks**: Production deployment, database hosting, environment variables

**Resources**:
- Railway docs: https://docs.railway.app/
- Railway pricing: https://railway.app/pricing

---

## 💳 Section 2: Payment Processing (P1 - HIGH)

### 2.1 Polar.sh Billing Integration

**Status**: NOT STARTED
**Priority**: P1 - HIGH
**User Action Required**: YES

**What You Need to Do**:
1. **Create Polar.sh account**
   - Visit: https://polar.sh/
   - Sign up with GitHub
   - Complete merchant onboarding

2. **Set up subscription products**
   - Basic tier: $49/month (suggested)
   - Pro tier: $99/month (suggested)
   - Premium tier: $299/month (suggested)
   - Configure product features and limits

3. **Configure webhook endpoint**
   - Webhook URL: `https://yourdomain.com/webhooks/polar`
   - Get webhook secret from Polar dashboard
   - Test webhook delivery

4. **Get API credentials**
   - Access token from Polar dashboard
   - Product IDs for each tier
   - Checkout URL

**Estimated Time**: 3-4 hours
**Cost**: Polar takes 5% + Stripe fees (~2.9% + $0.30)
**Blocks**: Subscription management, payment processing

**Environment Variables Needed**:
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRODUCT_BASIC`
- `POLAR_PRODUCT_PRO`
- `POLAR_PRODUCT_PREMIUM`
- `POLAR_CHECKOUT_URL`

**Resources**:
- Polar.sh docs: https://docs.polar.sh/
- Polar.sh dashboard: https://polar.sh/dashboard

**Decision Point**: If you prefer Stripe/Paddle directly, you'll need to implement custom billing integration (estimated 20-40 hours of development).

---

## 🤖 Section 3: Discord Integration (P0 - CRITICAL)

### 3.1 Discord Developer Portal Setup

**Status**: PARTIALLY COMPLETE (OAuth credentials exist)
**Priority**: P0 - CRITICAL
**User Action Required**: YES

**What You Need to Do**:

#### OAuth2 Configuration
1. **Update OAuth2 settings**
   - Go to: https://discord.com/developers/applications
   - Select your application
   - Navigate to OAuth2 → General
   - Update **Redirect URLs**:
     - Add: `https://yourdomain.com/auth/discord/callback`
     - Remove development URLs before production

#### Bot Permissions
2. **Configure bot permissions**
   - Navigate to Bot section
   - Set required permissions:
     - `applications.commands` (for slash commands)
     - `bot` (basic bot functionality)
   - Recommended permissions:
     - Send Messages
     - Embed Links
     - Attach Files
     - Read Message History
     - Manage Messages (for cleanup)

#### Bot Token Security
3. **Regenerate bot token** (recommended for production)
   - Regenerate token in Bot section
   - Update `DISCORD_BOT_TOKEN` environment variable
   - Never commit token to git

#### Bot Verification (Optional - P3)
4. **Bot verification** (only if >75 servers)
   - Required for 75+ servers or Discord-wide approval
   - Submit verification request
   - Provide privacy policy and terms of service
   - Wait 2-4 weeks for approval

**Estimated Time**: 2-3 hours (verification adds 2-4 weeks wait)
**Cost**: Free
**Blocks**: Discord OAuth login, bot functionality

**Environment Variables**:
- `DISCORD_CLIENT_ID` ✅ (already set)
- `DISCORD_CLIENT_SECRET` ✅ (already set)
- `DISCORD_BOT_TOKEN` ✅ (recommend regenerate for production)
- `DISCORD_CALLBACK_URL` ⚠️ (needs HTTPS production URL)

---

## 📊 Section 4: Monitoring & Error Tracking (P1 - HIGH)

### 4.1 Sentry Error Tracking

**Status**: NOT STARTED
**Priority**: P1 - HIGH
**User Action Required**: YES

**What You Need to Do**:
1. **Create Sentry account**
   - Visit: https://sentry.io/
   - Sign up (free tier available)
   - Create new project for Node.js

2. **Get Sentry DSN**
   - Copy DSN from project settings
   - Add to Railway environment variables

3. **Configure alerts**
   - Set up email/Slack notifications
   - Configure alert rules (e.g., >10 errors/hour)
   - Set up performance monitoring (optional)

**Estimated Time**: 1-2 hours
**Cost**: Free (up to 5,000 events/month), then $26/month for Team plan
**Blocks**: Production error tracking, debugging

**Environment Variables**:
- `SENTRY_DSN`
- `PIPELINE_ENABLE_MONITORING=true`

**Why It's Important**: Without Sentry, you won't know when production errors occur until users report them.

**Alternative**: Self-hosted error tracking (adds 10-20 hours of setup time).

---

## 📧 Section 5: Email Service (P2 - MEDIUM)

### 5.1 Transactional Email Provider

**Status**: NOT STARTED
**Priority**: P2 - MEDIUM
**User Action Required**: YES

**What You Need to Do**:
1. **Choose email provider** (pick one):
   - **Option A: SendGrid** (recommended)
     - Free tier: 100 emails/day
     - Cost: $19.95/month for 50k emails
     - Visit: https://sendgrid.com/
   - **Option B: Mailgun**
     - Free tier: 1,000 emails/month
     - Cost: $35/month for 50k emails
     - Visit: https://www.mailgun.com/
   - **Option C: Amazon SES**
     - $0.10 per 1,000 emails
     - Requires AWS account
     - More complex setup

2. **Get API credentials**
   - Create account
   - Verify domain (requires DNS TXT records)
   - Get API key
   - Add to environment variables

3. **Configure email templates** (optional)
   - Welcome email
   - Subscription confirmation
   - Payment receipts
   - Password reset (if implemented)

**Estimated Time**: 2-3 hours
**Cost**: Free - $35/month depending on volume
**Blocks**: Email notifications, user communications

**Environment Variables**:
- `EMAIL_SERVICE_API_KEY`

**Current Impact**: Limited - no critical emails required for launch. Can be added post-launch.

---

## ⚖️ Section 6: Legal & Compliance (P1 - HIGH)

### 6.1 Legal Review

**Status**: PARTIALLY COMPLETE (templates exist)
**Priority**: P1 - HIGH
**User Action Required**: YES

**What You Need to Do**:
1. **Review existing legal documents**
   - `src/dashboard/pages/TermsOfService.jsx` (template exists)
   - `src/dashboard/pages/PrivacyPolicy.jsx` (template exists)
   - Both contain placeholder text marked with `[YOUR COMPANY]`

2. **Customize legal documents**
   - **DIY Option** (free, higher risk):
     - Fill in company name, contact info
     - Review and understand all terms
     - Add trading-specific disclaimers
     - Estimated time: 3-4 hours

   - **Legal Review Option** (recommended):
     - Hire lawyer specializing in:
       - SaaS agreements
       - Financial services/trading compliance
       - Data privacy (GDPR, CCPA)
     - Cost: $500-2,000
     - Estimated time: 1-2 weeks

3. **Trading-specific disclaimers** (CRITICAL):
   - Risk disclosure statement
   - "Not financial advice" disclaimer
   - Liability limitations for trading losses
   - Broker relationship clarifications

**Estimated Time**: 3-4 hours (DIY) or 1-2 weeks (lawyer)
**Cost**: $0 (DIY) or $500-2,000 (legal review)
**Blocks**: Production launch, compliance

**Why It's Critical**: Trading-related services have higher legal liability. Improper terms could expose you to lawsuits if users lose money.

**Recommendation**: **STRONGLY RECOMMEND** professional legal review for trading services.

---

### 6.2 GDPR Compliance (if serving EU users)

**Status**: NOT STARTED
**Priority**: P1 - HIGH (if targeting EU)
**User Action Required**: YES

**What You Need to Do** (if serving EU users):
1. **Appoint Data Protection Officer** (if required)
   - Required if >5000 EU users/year
   - Can be outsourced ($100-500/month)

2. **Implement GDPR features**:
   - ✅ Data export (partially implemented)
   - ⚠️ Right to deletion (needs implementation)
   - ⚠️ Cookie consent banner (not implemented)
   - ⚠️ Data retention policies (not documented)

3. **Create GDPR documentation**:
   - Data processing agreements
   - Cookie policy
   - Data breach response plan

**Estimated Time**: 8-16 hours (technical implementation)
**Cost**: $0-500/month (DPO if required)
**Blocks**: EU market access

**Decision Point**: If NOT targeting EU users initially, this can be postponed.

---

## 📊 Section 7: Analytics (P3 - LOW, Optional)

### 7.1 Google Analytics

**Status**: NOT STARTED
**Priority**: P3 - LOW
**User Action Required**: YES (optional)

**What You Need to Do**:
1. Create Google Analytics 4 property
2. Get measurement ID (format: `G-XXXXXXXXXX`)
3. Add to environment variables

**Estimated Time**: 30 minutes
**Cost**: Free
**Environment Variables**: `GOOGLE_ANALYTICS_ID`

---

### 7.2 Mixpanel (Alternative)

**Status**: NOT STARTED
**Priority**: P3 - LOW
**User Action Required**: YES (optional)

**What You Need to Do**:
1. Create Mixpanel account
2. Get project token
3. Add to environment variables

**Estimated Time**: 30 minutes
**Cost**: Free (up to 20M events/month)
**Environment Variables**: `MIXPANEL_TOKEN`

---

## 🏦 Section 8: Broker API Accounts (P3 - LOW, Testing Only)

### 8.1 Alpaca Paper Trading

**Status**: PARTIALLY COMPLETE (API key exists)
**Priority**: P3 - LOW
**User Action Required**: NO (already configured)

✅ **Current Status**: Alpaca API key exists in environment
**Use Case**: Paper trading for testing only
**Cost**: Free

---

### 8.2 Tradier Sandbox

**Status**: NOT STARTED
**Priority**: P3 - LOW
**User Action Required**: YES (optional)

**What You Need to Do**:
1. Create Tradier developer account
2. Get sandbox access token
3. Test trade execution

**Estimated Time**: 1 hour
**Cost**: Free (sandbox)

---

## 🗄️ Section 9: Database Hosting Decision (P0 - CRITICAL)

### 9.1 Database Choice

**Status**: DECISION REQUIRED
**Priority**: P0 - CRITICAL
**User Action Required**: YES - **CRITICAL DECISION**

**Current Setup**: MongoDB (connection string configured)

**Decision Required**: Choose production database:

#### Option A: Railway PostgreSQL (RECOMMENDED)
- ✅ **Pros**:
  - Included with Railway hosting (no extra account)
  - Automatic backups
  - Easier scaling
  - Lower cost ($0-5/month)
- ❌ **Cons**:
  - Requires migration from MongoDB
  - Schema changes needed
  - Migration time: 8-16 hours

#### Option B: MongoDB Atlas (CURRENT)
- ✅ **Pros**:
  - No migration needed
  - Current code works as-is
  - Free tier available
- ❌ **Cons**:
  - Separate account/billing
  - Higher cost ($9-25/month)
  - Requires IP whitelisting setup

#### Option C: Self-Hosted (NOT RECOMMENDED)
- ❌ **Cons**:
  - Requires separate server
  - Manual backup setup
  - Higher maintenance burden
  - Security responsibilities

**Recommendation**: **Option A (Railway PostgreSQL)** for production simplicity, BUT requires migration work.

**Estimated Time**:
- Option A: 8-16 hours (migration)
- Option B: 2-3 hours (MongoDB Atlas setup)
- Option C: 20-40 hours (self-hosted setup)

**Cost**:
- Option A: $0-5/month (included in Railway)
- Option B: $9-25/month (MongoDB Atlas)
- Option C: $20-100/month (separate VPS)

**Blocks**: Production deployment, data storage

---

## ✅ Summary Checklist

### Critical Path (Must Complete Before Launch)

- [ ] **Domain Purchase** (P0) - $10-50/year, 1-2 hours
- [ ] **Railway Account Setup** (P0) - $5-20/month, 1 hour
- [ ] **Database Choice & Setup** (P0) - See Section 9
- [ ] **Discord OAuth Configuration** (P0) - Free, 2-3 hours
- [ ] **Environment Variables** (P0) - Run `npm run validate:env`
- [ ] **Legal Review** (P1) - $500-2,000, 1-2 weeks (RECOMMENDED)

### Strongly Recommended (Before Launch)

- [ ] **Polar.sh Billing** (P1) - 5% + Stripe fees, 3-4 hours
- [ ] **Sentry Error Tracking** (P1) - Free-$26/month, 1-2 hours
- [ ] **Bot Token Regeneration** (P1) - Free, 15 minutes
- [ ] **GDPR Compliance** (P1 if targeting EU) - 8-16 hours

### Optional (Can Be Added Post-Launch)

- [ ] **Email Service** (P2) - $0-35/month, 2-3 hours
- [ ] **Google Analytics** (P3) - Free, 30 minutes
- [ ] **Mixpanel** (P3) - Free, 30 minutes
- [ ] **Tradier Sandbox** (P3) - Free, 1 hour

---

## 💰 Total Cost Estimate

### Minimum (Critical Path Only)
- Domain: $10/year
- Railway hosting: $5-20/month
- Database (MongoDB Atlas): $9/month OR Railway PostgreSQL (included)
- **Total Minimum**: ~$15-30/month + $500-2,000 one-time (legal)

### Recommended (With All P1 Services)
- Everything above +
- Polar.sh fees: 5% of revenue
- Sentry: $0-26/month
- **Total Recommended**: ~$20-55/month + transaction fees

### Full Stack (All Services)
- Everything above +
- Email service: $20-35/month
- Analytics: Free
- **Total Full Stack**: ~$40-90/month

---

## 🎯 Recommended Launch Sequence

### Week 1: Critical Infrastructure
1. Purchase domain
2. Set up Railway account
3. Make database decision
4. Configure Discord OAuth for production
5. Run environment variable validation

### Week 2: Billing & Legal
1. Set up Polar.sh billing
2. Engage lawyer for legal review (start 2-week process)
3. Set up Sentry error tracking
4. Configure production environment variables

### Week 3: Testing & Final Prep
1. Deploy to Railway staging
2. Run security scans (OWASP ZAP)
3. Test end-to-end workflows
4. Final legal review completion

### Week 4: Launch Preparation
1. Update legal documents with lawyer feedback
2. Configure custom domain DNS
3. Test production deployment
4. Prepare rollback plan
5. GO LIVE 🚀

---

## 📞 Support & Resources

### Documentation
- Main checklist: `docs/deployment/RELEASE_READY_CHECKLIST.md`
- Environment validation: `npm run validate:env`
- Security configuration: Already verified ✅
- Rate limiting: Already configured ✅

### External Resources
- Railway docs: https://docs.railway.app/
- Polar.sh docs: https://docs.polar.sh/
- Discord Developer Portal: https://discord.com/developers/
- Sentry docs: https://docs.sentry.io/

### Questions or Issues?
Review the release checklist for detailed step-by-step instructions for each item.

---

**Last Updated**: 2025-11-05
**Maintained By**: Claude (Autonomous Release Preparation Agent)
**Version**: 1.0
