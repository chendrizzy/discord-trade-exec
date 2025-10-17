# Analytics Platform Advanced Features Proposal

## Why

With Phases 1-4 & 6 of the analytics platform deployed and production data flowing in, we can now implement advanced analytics features that require real production data to validate effectiveness. These features will significantly improve customer acquisition efficiency, reduce churn through automated retention campaigns, provide real-time visibility into business metrics, and enable sophisticated cohort analysis for data-driven product decisions.

Current limitations:
- No tracking of Customer Acquisition Cost (CAC) or marketing channel ROI
- Manual retention outreach to at-risk users is reactive and inefficient
- Analytics dashboard requires manual refresh to see latest metrics
- Limited cohort analysis capabilities - no custom segments, funnels, or A/B testing comparison
- No CSV/PDF export for stakeholder reporting

## What Changes

### 1. CAC Tracking & Marketing Analytics (10-12 hours)
- **NEW** MarketingCampaign model to track campaign data, spend, and conversions
- **NEW** UTM parameter tracking middleware for attribution
- **NEW** CAC calculation per channel and campaign
- **NEW** LTV:CAC ratio tracking and trending
- **NEW** CACvsLTVChart and ChannelPerformanceTable React components
- **NEW** GET /api/analytics/marketing/* endpoints

### 2. Automated Retention Campaigns (12-15 hours)
- **NEW** Email template system for at-risk users
- **NEW** SendGrid/AWS SES integration for transactional emails
- **NEW** Daily cron job for retention campaign execution
- **NEW** Campaign effectiveness tracking (open rate, click rate, conversion)
- **NEW** RetentionCampaignManager service
- **NEW** POST /api/analytics/retention/campaigns endpoint

### 3. Real-time Analytics Updates (8-10 hours)
- **NEW** WebSocket integration for live metric streaming
- **NEW** Real-time dashboard updates via socket.io
- **NEW** Live churn risk notifications
- **NEW** Real-time MRR/user count updates
- **MODIFIED** AnalyticsDashboard to subscribe to WebSocket events

### 4. Advanced Cohort Features (10-12 hours)
- **NEW** Custom segment builder UI with drag-and-drop filters
- **NEW** Funnel analysis for conversion tracking
- **NEW** A/B test cohort comparison
- **NEW** CSV/PDF export functionality
- **NEW** CohortSegmentBuilder, FunnelAnalysis, ExportManager components
- **NEW** POST /api/analytics/cohorts/custom endpoint

## Impact

**Affected Specs:**
- `specs/analytics/spec.md` - Add 4 new requirement sections

**Affected Code:**
- **New Models:** `src/models/MarketingCampaign.js`
- **New Services:**
  - `src/services/analytics/MarketingAnalytics.js`
  - `src/services/analytics/RetentionCampaignManager.js`
  - `src/services/analytics/FunnelAnalyzer.js`
  - `src/services/analytics/ExportManager.js`
- **Modified Services:**
  - `src/services/analytics/RevenueMetrics.js` - Add LTV:CAC methods
  - `src/services/analytics/CohortAnalyzer.js` - Add custom segment support
- **New Middleware:** `src/middleware/utm-tracker.js`
- **New Routes:**
  - `src/routes/api/analytics/marketing.js`
  - `src/routes/api/analytics/retention.js`
  - `src/routes/api/analytics/export.js`
- **Modified Routes:**
  - `src/routes/api/analytics.js` - Add WebSocket emit events
- **New Components:**
  - `src/dashboard/components/analytics/CACvsLTVChart.jsx`
  - `src/dashboard/components/analytics/ChannelPerformanceTable.jsx`
  - `src/dashboard/components/analytics/CohortSegmentBuilder.jsx`
  - `src/dashboard/components/analytics/FunnelAnalysis.jsx`
  - `src/dashboard/components/analytics/RetentionCampaigns.jsx`
- **Modified Components:**
  - `src/dashboard/components/analytics/AnalyticsDashboard.jsx` - Add WebSocket subscriptions
- **New Utilities:**
  - `src/utils/email-templates.js`
  - `src/utils/sendgrid-client.js`
  - `src/utils/pdf-generator.js`
- **New Cron Jobs:**
  - `src/jobs/daily-retention-campaigns.js`

**Database Changes:**
- New collection: `marketing_campaigns`
- New collection: `retention_campaigns`
- New collection: `user_segments`
- Modified User model: Add `utmSource`, `utmMedium`, `utmCampaign` fields

**Configuration:**
- `.env`: Add `SENDGRID_API_KEY`, `RETENTION_EMAIL_FROM`

**Testing:**
- ~40-50 new test files covering all features
- E2E tests for real-time updates with Playwright
- Integration tests for email campaigns (mock SendGrid)

**Timeline:**
- **Week 1-2:** CAC Tracking (10-12 hours)
- **Week 2-4:** Retention Campaigns (12-15 hours)
- **Week 4-5:** Real-time Updates (8-10 hours)
- **Week 5-6:** Advanced Cohorts (10-12 hours)
- **Total:** 42-52 hours (5-6 week rollout)

**Dependencies:**
- Production data flowing from Phases 1-4
- SendGrid account for email delivery
- Socket.io already integrated

**Risks:**
- Email deliverability requires proper SPF/DKIM configuration
- Real-time WebSocket connections may require Redis adapter at scale
- PDF generation may be resource-intensive for large exports

**Success Metrics:**
- CAC < $50 per user, LTV:CAC > 3.0
- Retention campaigns reduce churn by 15-20%
- Dashboard updates < 2s latency via WebSocket
- Custom segment creation < 30s, export < 10s
