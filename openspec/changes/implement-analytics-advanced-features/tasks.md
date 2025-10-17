# Analytics Platform Advanced Features - Implementation Tasks

**Status**: Planning Complete, Implementation Pending
**Estimated Effort**: 42-52 hours
**Priority**: Medium (deferred until production data validates need)

---

## 1. Customer Acquisition Cost (CAC) Tracking

**Total: 10-12 hours**

### 1.1 Integrate with Marketing Campaign Data (3-4 hours)
- [ ] 1.1.1 Create `MarketingCampaign` model
  - Schema fields: campaignId, campaignName, channel, spend, dates, UTM params
  - Indexes: channel, campaign dates
  - Location: `src/models/MarketingCampaign.js`

- [ ] 1.1.2 Add campaign attribution to User model
  - Add fields: `attribution.source`, `attribution.medium`, `attribution.campaign`
  - Add field: `attribution.campaignId` reference
  - Location: `src/models/User.js`

- [ ] 1.1.3 Create UTM parameter capture middleware
  - Capture UTM params on signup/login
  - Store in session for attribution
  - Location: `src/middleware/utm-tracker.js`

- [ ] 1.1.4 Create campaign CRUD API endpoints
  - POST `/api/analytics/campaigns` - Create campaign
  - GET `/api/analytics/campaigns` - List campaigns
  - PUT `/api/analytics/campaigns/:id` - Update campaign
  - DELETE `/api/analytics/campaigns/:id` - Delete campaign
  - Location: `src/routes/api/analytics/marketing.js`

### 1.2 Calculate CAC per Channel (2-3 hours)
- [ ] 1.2.1 Add `calculateCAC()` method to RevenueMetrics
  - Calculate total spend vs new users by channel
  - Support date range filtering
  - Handle edge cases (zero users, zero spend)
  - Location: `src/services/analytics/RevenueMetrics.js`

- [ ] 1.2.2 Add `calculateCACBreakdown()` method
  - Calculate CAC for all channels simultaneously
  - Return channel comparison data
  - Location: `src/services/analytics/RevenueMetrics.js`

- [ ] 1.2.3 Add `calculateLTVtoCACRatio()` method
  - Calculate LTV:CAC ratio by channel
  - Flag unhealthy ratios (<3:1)
  - Location: `src/services/analytics/RevenueMetrics.js`

### 1.3 Add CAC to Revenue Metrics API (2 hours)
- [ ] 1.3.1 Create CAC endpoint
  - GET `/api/analytics/cac?channel=X&startDate=Y&endDate=Z`
  - Return CAC, spend, new users, period
  - Location: `src/routes/api/analytics.js`

- [ ] 1.3.2 Create CAC breakdown endpoint
  - GET `/api/analytics/cac/breakdown`
  - Return all channels with CAC, LTV:CAC ratio
  - Location: `src/routes/api/analytics.js`

- [ ] 1.3.3 Add CAC metrics to dashboard summary
  - Include in GET `/api/analytics/summary`
  - Show overall CAC and top-performing channel
  - Location: `src/routes/api/analytics.js`

### 1.4 Visualize CAC vs LTV in Dashboard (3-4 hours)
- [ ] 1.4.1 Create `CACvsLTVChart` component
  - Dual-axis line chart (CAC vs LTV over time)
  - Channel selector dropdown
  - Color-coded profitability indicator
  - Tooltip with CAC, LTV, ratio, profitability
  - Location: `src/dashboard/components/analytics/CACvsLTVChart.jsx`

- [ ] 1.4.2 Create `ChannelPerformanceTable` component
  - Sortable table by channel
  - Columns: Channel, CAC, LTV, Ratio, New Users, Spend, ROI
  - Color-coded ROI indicators
  - Location: `src/dashboard/components/analytics/ChannelPerformanceTable.jsx`

- [ ] 1.4.3 Integrate CAC visualizations into AnalyticsDashboard
  - Add new "Marketing Performance" section
  - Location: `src/dashboard/components/analytics/AnalyticsDashboard.jsx`

- [ ] 1.4.4 Write component tests
  - Test chart rendering with mock data
  - Test table sorting and filtering
  - Location: `src/dashboard/components/analytics/__tests__/`

---

## 2. Automated Retention Campaigns

**Total: 12-15 hours**

### 2.1 Create Email Templates for At-Risk Users (3-4 hours)
- [ ] 2.1.1 Design email template system
  - Template types: high_risk, low_win_rate, inactive
  - Handlebars/EJS for personalization
  - Mobile-responsive HTML design
  - Location: `src/templates/emails/retention-templates.js`

- [ ] 2.1.2 Create EmailTemplateService
  - Template rendering engine
  - Personalization token replacement
  - Template validation
  - Location: `src/services/EmailTemplateService.js`

- [ ] 2.1.3 Create template management API
  - GET `/api/analytics/retention/templates` - List templates
  - POST `/api/analytics/retention/templates` - Create template
  - PUT `/api/analytics/retention/templates/:id` - Update template
  - GET `/api/analytics/retention/templates/:id/preview` - Preview template
  - Location: `src/routes/api/retention-campaigns.js`

- [ ] 2.1.4 Create EmailTemplate model
  - Schema: templateId, name, subject, body, category, active
  - Track usage stats (sent, opened, clicked)
  - Location: `src/models/EmailTemplate.js`

### 2.2 Implement Automated Email Sending (4-5 hours)
- [ ] 2.2.1 Integrate SendGrid/AWS SES
  - SendGrid client configuration
  - Email sending with template rendering
  - Error handling and retry logic
  - Location: `src/services/EmailService.js`

- [ ] 2.2.2 Implement email delivery tracking
  - Pixel tracking for opens
  - Link tracking with UTM params for clicks
  - Bounce and spam handling
  - Location: `src/utils/email-tracking.js`

- [ ] 2.2.3 Add email preferences to User model
  - Fields: optedOut, lastRetentionEmail, emailFrequency
  - Opt-out functionality
  - Frequency capping (max 1 per 7 days)
  - Location: `src/models/User.js`

- [ ] 2.2.4 Create email analytics event tracking
  - Track: retention_email_sent, retention_email_opened, retention_email_clicked
  - Link to AnalyticsEvent collection
  - Location: `src/services/analytics/AnalyticsEventService.js`

### 2.3 Create Daily Churn Prevention Job (3-4 hours)
- [ ] 2.3.1 Create retention campaign scheduler
  - Cron job: Daily at 9:00 AM UTC
  - Query at-risk users (7+ days since last email)
  - Select template based on risk factors
  - Send emails with rate limiting
  - Location: `src/jobs/daily-retention-campaign.js`

- [ ] 2.3.2 Implement template selection logic
  - Map risk factors to appropriate templates
  - Personalize content based on user stats
  - Location: `src/utils/template-selector.js`

- [ ] 2.3.3 Add job monitoring and logging
  - Log campaign execution stats
  - Alert on failures
  - Track emails sent per job run
  - Location: `src/jobs/daily-retention-campaign.js`

- [ ] 2.3.4 Register cron job in application
  - Start cron on server initialization
  - Add manual trigger endpoint for testing
  - Location: `src/index.js`

### 2.4 Track Retention Campaign Effectiveness (2-3 hours)
- [ ] 2.4.1 Implement campaign outcome tracking
  - Track: sent, opened, clicked, returned, renewed
  - Calculate within 7-day window after email
  - Location: `src/services/analytics/RevenueMetrics.js`

- [ ] 2.4.2 Add `calculateCampaignEffectiveness()` method
  - Metrics: totalSent, openRate, clickRate, returnRate
  - Calculate estimatedChurnPrevented
  - Location: `src/services/analytics/RevenueMetrics.js`

- [ ] 2.4.3 Create campaign stats API endpoint
  - GET `/api/analytics/retention/campaigns/:id/stats`
  - Return campaign performance metrics
  - Location: `src/routes/api/analytics.js`

- [ ] 2.4.4 Create RetentionCampaigns dashboard component
  - Show campaign history and stats
  - Display effectiveness metrics
  - Location: `src/dashboard/components/analytics/RetentionCampaigns.jsx`

---

## 3. Real-time Analytics Updates

**Total: 8-10 hours**

### 3.1 Integrate Analytics with WebSocket Server (3-4 hours)
- [ ] 3.1.1 Create AnalyticsWebSocketService
  - Register admin clients
  - Broadcast metric updates
  - Handle client disconnections
  - Location: `src/services/analytics/AnalyticsWebSocketService.js`

- [ ] 3.1.2 Emit events on metric changes
  - MRR update (new subscription, cancellation)
  - Churn risk alert (user crosses threshold)
  - New cohort user (signup)
  - Location: `src/routes/api/analytics.js`

- [ ] 3.1.3 Implement WebSocket authentication
  - Admin-only access to analytics updates
  - JWT verification for WebSocket connections
  - Location: `src/websocket-server.js`

### 3.2 Push Real-time Metric Updates to Dashboard (3-4 hours)
- [ ] 3.2.1 Create useAnalyticsWebSocket hook
  - Connect to WebSocket server
  - Handle message parsing
  - Update local state on messages
  - Auto-reconnect on disconnection
  - Location: `src/dashboard/hooks/useAnalyticsWebSocket.js`

- [ ] 3.2.2 Update AnalyticsDashboard to use WebSocket
  - Show "Live" indicator when connected
  - Smooth transitions for metric updates
  - Fallback to polling if WebSocket fails
  - Debounce updates to 5-second intervals
  - Location: `src/dashboard/components/analytics/AnalyticsDashboard.jsx`

- [ ] 3.2.3 Optimize WebSocket message frequency
  - Batch updates when multiple metrics change
  - Rate limit to prevent flooding
  - Location: `src/services/analytics/AnalyticsWebSocketService.js`

### 3.3 Implement Live Churn Risk Notifications (2-3 hours)
- [ ] 3.3.1 Create NotificationCenter component
  - Display real-time churn alerts
  - Toast notifications for critical events
  - Notification history panel
  - Location: `src/dashboard/components/analytics/NotificationCenter.jsx`

- [ ] 3.3.2 Implement notification triggers
  - New critical-risk user alert
  - Churn spike detected (>5% increase in 1 hour)
  - MRR drop >10% alert
  - Location: `src/services/analytics/AnalyticsWebSocketService.js`

- [ ] 3.3.3 Add notification sound and visual indicators
  - Audio alert for critical notifications
  - Badge count on notification icon
  - Location: `src/dashboard/components/analytics/NotificationCenter.jsx`

---

## 4. Advanced Cohort Features

**Total: 10-12 hours**

### 4.1 Add Custom Cohort Segmentation (3-4 hours)
- [ ] 4.1.1 Create CohortSegment model
  - Schema: segmentName, filters, cohortPeriod, createdBy
  - Support complex filter logic
  - Location: `src/models/CohortSegment.js`

- [ ] 4.1.2 Create CohortSegmentService
  - Build MongoDB queries from segment filters
  - Validate filter syntax
  - Execute segment queries
  - Location: `src/services/analytics/CohortSegmentService.js`

- [ ] 4.1.3 Create segment management API
  - POST `/api/analytics/cohorts/segments` - Create segment
  - GET `/api/analytics/cohorts/segments` - List segments
  - PUT `/api/analytics/cohorts/segments/:id` - Update segment
  - DELETE `/api/analytics/cohorts/segments/:id` - Delete segment
  - Location: `src/routes/api/analytics.js`

- [ ] 4.1.4 Create CohortSegmentBuilder component
  - Drag-and-drop filter builder UI
  - Field selector (subscription.tier, createdAt, stats.*, etc.)
  - Operator selector (=, !=, >, <, in, etc.)
  - Value input with type validation
  - Real-time segment size preview
  - Location: `src/dashboard/components/analytics/CohortSegmentBuilder.jsx`

### 4.2 Implement Funnel Analysis (3-4 hours)
- [ ] 4.2.1 Define standard funnels
  - Signup funnel: signup → broker_connected → first_trade → subscription
  - Retention funnel: signup → first_week → second_week → first_month
  - Location: `src/config/funnel-definitions.js`

- [ ] 4.2.2 Add `calculateFunnelMetrics()` to CohortAnalyzer
  - Calculate completion rate for each step
  - Calculate drop-off between steps
  - Support custom funnel definitions
  - Location: `src/services/analytics/CohortAnalyzer.js`

- [ ] 4.2.3 Create funnel API endpoint
  - GET `/api/analytics/cohorts/funnel?funnelId=X&cohortDate=Y`
  - Return step completion and drop-off rates
  - Location: `src/routes/api/analytics.js`

- [ ] 4.2.4 Create FunnelAnalysisChart component
  - Visualize funnel with drop-off rates
  - Show conversion percentages
  - Highlight problematic steps (high drop-off)
  - Location: `src/dashboard/components/analytics/FunnelAnalysisChart.jsx`

### 4.3 Add A/B Test Cohort Comparison (2-3 hours)
- [ ] 4.3.1 Add experiment tracking to User model
  - Field: `experiments[{experimentId, variant, assignedAt}]`
  - Location: `src/models/User.js`

- [ ] 4.3.2 Add `compareExperimentCohorts()` to CohortAnalyzer
  - Compare retention by experiment variant
  - Calculate statistical significance
  - Location: `src/services/analytics/CohortAnalyzer.js`

- [ ] 4.3.3 Create A/B comparison API endpoint
  - POST `/api/analytics/cohorts/ab-compare`
  - Return variant performance comparison
  - Location: `src/routes/api/analytics.js`

- [ ] 4.3.4 Create ABTestComparison component
  - Side-by-side variant comparison
  - Statistical significance indicator
  - Winner recommendation
  - Location: `src/dashboard/components/analytics/ABTestComparison.jsx`

### 4.4 Create Cohort Export Functionality (2-3 hours)
- [ ] 4.4.1 Implement CSV export
  - GET `/api/analytics/cohorts/retention/export?format=csv`
  - Convert retention table to CSV format
  - Location: `src/routes/api/analytics.js`

- [ ] 4.4.2 Implement PDF export
  - GET `/api/analytics/cohorts/retention/export?format=pdf`
  - Generate PDF with charts and tables
  - Use PDFKit or Puppeteer for generation
  - Location: `src/utils/pdf-generator.js`

- [ ] 4.4.3 Implement JSON export
  - GET `/api/analytics/cohorts/retention/export?format=json`
  - Return structured JSON for external tools
  - Location: `src/routes/api/analytics.js`

- [ ] 4.4.4 Add export buttons to dashboard
  - Export dropdown with format options
  - Progress indicator for large exports
  - Download link generation
  - Location: `src/dashboard/components/analytics/CohortRetentionTable.jsx`

---

## 5. Testing & Quality Assurance

**Total: 8-10 hours**

### 5.1 Unit Tests (4-5 hours)
- [ ] 5.1.1 CAC calculation tests
  - Test calculateCAC() with various scenarios
  - Test edge cases (zero users, zero spend)
  - Location: `src/services/analytics/__tests__/RevenueMetrics.cac.test.js`

- [ ] 5.1.2 Email template rendering tests
  - Test template personalization
  - Test token replacement
  - Location: `src/services/__tests__/EmailTemplateService.test.js`

- [ ] 5.1.3 WebSocket service tests
  - Test client registration
  - Test message broadcasting
  - Test disconnect handling
  - Location: `src/services/analytics/__tests__/AnalyticsWebSocketService.test.js`

- [ ] 5.1.4 Segment filter logic tests
  - Test query builder with complex filters
  - Test filter validation
  - Location: `src/services/analytics/__tests__/CohortSegmentService.test.js`

- [ ] 5.1.5 Funnel calculation tests
  - Test funnel metrics accuracy
  - Test drop-off rate calculations
  - Location: `src/services/analytics/__tests__/CohortAnalyzer.funnel.test.js`

### 5.2 Integration Tests (2-3 hours)
- [ ] 5.2.1 Campaign CRUD API tests
  - Test campaign creation, update, deletion
  - Test UTM parameter capture
  - Location: `tests/integration/marketing-campaigns.test.js`

- [ ] 5.2.2 Retention email flow tests
  - Mock SendGrid API
  - Test email sending pipeline
  - Test campaign effectiveness tracking
  - Location: `tests/integration/retention-campaigns.test.js`

- [ ] 5.2.3 Export functionality tests
  - Test CSV, PDF, JSON export formats
  - Validate export data accuracy
  - Location: `tests/integration/cohort-export.test.js`

### 5.3 E2E Tests (2-3 hours)
- [ ] 5.3.1 Real-time dashboard updates test
  - Use Playwright to verify WebSocket updates
  - Test live indicator and metric transitions
  - Location: `tests/e2e/realtime-analytics.spec.js`

- [ ] 5.3.2 Custom segment builder test
  - Test drag-and-drop filter creation
  - Test segment preview
  - Location: `tests/e2e/segment-builder.spec.js`

- [ ] 5.3.3 Funnel visualization test
  - Verify funnel chart rendering
  - Test step-by-step breakdown
  - Location: `tests/e2e/funnel-analysis.spec.js`

---

## 6. Documentation

**Total: 2-3 hours**

- [ ] 6.1 Update ANALYTICS_API.md with Phase 5 endpoints
- [ ] 6.2 Create RETENTION_CAMPAIGNS_GUIDE.md
- [ ] 6.3 Create COHORT_SEGMENTATION_GUIDE.md
- [ ] 6.4 Update ANALYTICS_DASHBOARD_GUIDE.md with new features

---

## 7. Production Deployment

**Total: 2-3 hours**

### 7.1 Pre-Deployment
- [ ] 7.1.1 Configure SendGrid/AWS SES API keys
- [ ] 7.1.2 Verify email sender domain and warm up
- [ ] 7.1.3 Set up WebSocket server scaling (if needed)
- [ ] 7.1.4 Configure marketing campaign tracking URLs
- [ ] 7.1.5 Validate email addresses for active users

### 7.2 Deployment
- [ ] 7.2.1 Deploy database migrations (new models)
- [ ] 7.2.2 Deploy backend services
- [ ] 7.2.3 Deploy frontend dashboard updates
- [ ] 7.2.4 Start retention campaign cron job
- [ ] 7.2.5 Verify WebSocket connectivity

### 7.3 Post-Deployment Validation
- [ ] 7.3.1 Test CAC calculation with real data
- [ ] 7.3.2 Send test retention email to admins
- [ ] 7.3.3 Verify WebSocket updates in dashboard
- [ ] 7.3.4 Validate export functionality with production data
- [ ] 7.3.5 Monitor email delivery rates and bounce rates

---

## Estimated Hours Summary

| Section | Hours |
|---------|-------|
| 1. CAC Tracking | 10-12 |
| 2. Retention Campaigns | 12-15 |
| 3. Real-time Updates | 8-10 |
| 4. Advanced Cohorts | 10-12 |
| 5. Testing & QA | 8-10 |
| 6. Documentation | 2-3 |
| 7. Production Deployment | 2-3 |
| **Total** | **52-65 hours** |

**Note**: This is a more conservative estimate including comprehensive testing. Core implementation is 42-52 hours as specified in the proposal.
