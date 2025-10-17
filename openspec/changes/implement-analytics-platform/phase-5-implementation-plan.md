# Phase 5: Advanced Features - Implementation Plan

## Overview

Phase 5 introduces advanced analytics capabilities that build upon the foundation established in Phases 1-4. This phase focuses on four major feature areas designed to enhance business intelligence, automate retention efforts, and provide real-time insights.

**Status**: Planning Complete, Implementation Pending
**Estimated Effort**: 40-50 hours
**Priority**: Medium (Phase 5 can be deferred until production data validates need)

## Implementation Strategy

### Recommended Sequencing

1. **CAC Tracking** (10-12 hours) - Foundation for marketing ROI analysis
2. **Automated Retention Campaigns** (12-15 hours) - High-value feature for reducing churn
3. **Advanced Cohort Features** (10-12 hours) - Enhanced analytics capabilities
4. **Real-time Updates** (8-10 hours) - UI enhancement, non-critical for MVP

### Dependencies

- **External Services Required**:
  - Email service (SendGrid/AWS SES) for retention campaigns
  - WebSocket server (already exists in codebase) for real-time updates
  - Marketing platform API (optional) for CAC integration

- **Data Requirements**:
  - Historical user data (3+ months) for accurate CAC calculations
  - Sufficient churn events for campaign effectiveness measurement
  - Active user base for real-time update validation

## Feature 1: Customer Acquisition Cost (CAC)

### Tasks Breakdown

#### Task 1.1: Integrate with Marketing Campaign Data
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Create `MarketingCampaign` model
   ```javascript
   // src/models/MarketingCampaign.js
   {
     campaignId: String,
     campaignName: String,
     channel: { type: String, enum: ['google_ads', 'facebook', 'twitter', 'reddit', 'organic', 'referral'] },
     spend: Number,
     startDate: Date,
     endDate: Date,
     utmSource: String,
     utmMedium: String,
     utmCampaign: String
   }
   ```

2. Track campaign attribution on user signup
   - Capture UTM parameters in signup event
   - Store campaign attribution in User model
   - Link users to campaigns via referral tracking

3. Create campaign CRUD endpoints
   - POST `/api/analytics/campaigns` - Create campaign
   - GET `/api/analytics/campaigns` - List campaigns
   - PUT `/api/analytics/campaigns/:id` - Update campaign
   - DELETE `/api/analytics/campaigns/:id` - Delete campaign

**Files to Create/Modify**:
- `src/models/MarketingCampaign.js` (new)
- `src/models/User.js` (add campaignSource field)
- `src/routes/api/analytics.js` (add campaign endpoints)
- `src/middleware/auth.js` (capture UTM params on signup)

#### Task 1.2: Calculate CAC per Channel
**Estimated Time**: 2-3 hours

**Implementation Steps**:
1. Add CAC calculation method to RevenueMetrics service
   ```javascript
   async calculateCAC(channel = null, startDate = null, endDate = null) {
     // Get total marketing spend for period/channel
     const campaigns = await MarketingCampaign.find({
       ...(channel && { channel }),
       ...(startDate && endDate && {
         startDate: { $gte: startDate },
         endDate: { $lte: endDate }
       })
     });

     const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

     // Get new users acquired in same period/channel
     const newUsers = await User.countDocuments({
       ...(channel && { 'attribution.channel': channel }),
       createdAt: { $gte: startDate, $lte: endDate }
     });

     return {
       channel: channel || 'all',
       totalSpend,
       newUsers,
       cac: newUsers > 0 ? totalSpend / newUsers : 0,
       period: { startDate, endDate }
     };
   }
   ```

2. Calculate CAC by channel breakdown
3. Handle edge cases (zero users, zero spend)

**Files to Modify**:
- `src/services/analytics/RevenueMetrics.js`

#### Task 1.3: Add CAC to Revenue Metrics API
**Estimated Time**: 2 hours

**Implementation Steps**:
1. Create CAC endpoint
   ```javascript
   // GET /api/analytics/cac?channel=google_ads&startDate=2024-01&endDate=2024-03
   router.get('/cac', requireAdmin, async (req, res) => {
     const { channel, startDate, endDate } = req.query;
     const cac = await revenueMetrics.calculateCAC(
       channel,
       startDate ? new Date(startDate) : null,
       endDate ? new Date(endDate) : null
     );
     res.json({ success: true, data: cac });
   });
   ```

2. Add CAC breakdown by channel endpoint
3. Include CAC in dashboard metrics

**Files to Modify**:
- `src/routes/api/analytics.js`

#### Task 1.4: Visualize CAC vs LTV in Dashboard
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Create `CACvsLTVChart` component
   - Dual-axis chart (CAC vs LTV over time)
   - Channel selector dropdown
   - Color-coded profitability indicator (LTV > 3x CAC = healthy)
   - Tooltip showing CAC, LTV, ratio, profitability status

2. Create `ChannelPerformanceTable` component
   - Sortable table by channel
   - Columns: Channel, CAC, LTV, Ratio, New Users, Spend, ROI
   - Color-coded ROI indicators

3. Integrate into AnalyticsDashboard

**Files to Create**:
- `src/dashboard/components/CACvsLTVChart.jsx`
- `src/dashboard/components/ChannelPerformanceTable.jsx`

**Files to Modify**:
- `src/dashboard/components/AnalyticsDashboard.jsx`

### CAC Feature Testing Strategy

- Unit tests for CAC calculation methods
- Integration tests for campaign CRUD endpoints
- Edge case testing (zero spend, zero users, null channels)
- UI component testing with React Testing Library

---

## Feature 2: Automated Retention Campaigns

### Tasks Breakdown

#### Task 2.1: Create Email Templates for At-Risk Users
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Design email template system
   ```javascript
   // src/templates/emails/retention-templates.js
   const templates = {
     high_risk: {
       subject: 'We miss you! 20% off to welcome you back',
       body: `...personalized content with user stats...`,
       cta: 'Claim Your Discount'
     },
     low_win_rate: {
       subject: 'Improve Your Trading Success Rate',
       body: `...risk management webinar invitation...`,
       cta: 'Join Free Webinar'
     },
     inactive: {
       subject: 'Top signals you missed this week',
       body: `...signal performance highlights...`,
       cta: 'View Latest Signals'
     }
   };
   ```

2. Create template rendering engine
   - Handlebars/EJS for dynamic content
   - Personalization tokens ({{username}}, {{winRate}}, etc.)
   - Mobile-responsive HTML design

3. Create template management API
   - GET `/api/analytics/templates` - List templates
   - POST `/api/analytics/templates` - Create template
   - PUT `/api/analytics/templates/:id` - Update template
   - Preview endpoint for testing

**Files to Create**:
- `src/templates/emails/retention-templates.js`
- `src/services/EmailTemplateService.js`
- `src/routes/api/retention-campaigns.js`

#### Task 2.2: Implement Automated Email Sending
**Estimated Time**: 4-5 hours

**Implementation Steps**:
1. Integrate SendGrid/AWS SES
   ```javascript
   // src/services/EmailService.js
   class EmailService {
     async sendRetentionEmail(user, template, context) {
       const html = this.renderTemplate(template, {
         username: user.discordUsername,
         ...context
       });

       await this.sendEmail({
         to: user.notifications.email,
         subject: template.subject,
         html
       });

       // Track email sent event
       await analyticsEventService.trackEvent({
         userId: user._id,
         eventType: 'retention_email_sent',
         eventData: { templateId: template._id, riskLevel: user.riskLevel }
       });
     }
   }
   ```

2. Add email delivery tracking
   - Track opens (pixel tracking)
   - Track clicks (link tracking with UTM params)
   - Bounce/spam handling

3. Implement email preferences
   - Opt-out functionality
   - Frequency capping (max 1 email per 7 days)
   - A/B test support

**Files to Create**:
- `src/services/EmailService.js`
- `src/utils/email-tracking.js`

**Files to Modify**:
- `src/models/User.js` (add emailPreferences field)

#### Task 2.3: Create Daily Churn Prevention Job
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Create retention campaign scheduler
   ```javascript
   // src/jobs/daily-retention-campaign.js
   const cron = require('node-cron');

   // Run daily at 9:00 AM UTC
   cron.schedule('0 9 * * *', async () => {
     console.log('Running daily retention campaign...');

     // Get high-risk users who haven't received email in 7 days
     const atRiskUsers = await User.find({
       'subscription.status': 'active',
       'emailPreferences.optedOut': false,
       'emailPreferences.lastRetentionEmail': {
         $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
       }
     });

     for (const user of atRiskUsers) {
       const riskAnalysis = churnPredictor.calculateChurnRisk(user);

       if (riskAnalysis.riskLevel === 'critical' || riskAnalysis.riskLevel === 'high') {
         // Select appropriate template based on risk factors
         const template = selectTemplate(riskAnalysis.factors);

         await emailService.sendRetentionEmail(user, template, {
           riskScore: riskAnalysis.riskScore,
           recommendations: riskAnalysis.recommendations
         });

         // Update last email sent timestamp
         user.emailPreferences.lastRetentionEmail = new Date();
         await user.save();
       }
     }
   });
   ```

2. Add job monitoring and logging
3. Implement job failure recovery
4. Create manual trigger endpoint for testing

**Files to Create**:
- `src/jobs/daily-retention-campaign.js`
- `src/utils/template-selector.js`

**Files to Modify**:
- `src/index.js` (register cron job)

#### Task 2.4: Track Retention Campaign Effectiveness
**Estimated Time**: 2-3 hours

**Implementation Steps**:
1. Track campaign outcomes
   - Email sent
   - Email opened
   - Email clicked
   - User returned (login within 7 days)
   - Subscription renewed

2. Calculate campaign metrics
   ```javascript
   async calculateCampaignEffectiveness(campaignId, startDate, endDate) {
     const events = await AnalyticsEvent.find({
       eventType: 'retention_email_sent',
       'eventData.campaignId': campaignId,
       timestamp: { $gte: startDate, $lte: endDate }
     });

     const totalSent = events.length;
     const opened = events.filter(e => e.eventData.opened).length;
     const clicked = events.filter(e => e.eventData.clicked).length;

     // Check if users returned after email
     const userIds = events.map(e => e.userId);
     const returned = await AnalyticsEvent.countDocuments({
       userId: { $in: userIds },
       eventType: 'login',
       timestamp: {
         $gte: startDate,
         $lte: new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000)
       }
     });

     return {
       totalSent,
       openRate: (opened / totalSent) * 100,
       clickRate: (clicked / totalSent) * 100,
       returnRate: (returned / totalSent) * 100,
       estimatedChurnPrevented: returned
     };
   }
   ```

3. Create campaign effectiveness dashboard
4. A/B test framework for template optimization

**Files to Modify**:
- `src/services/analytics/RevenueMetrics.js`
- `src/routes/api/analytics.js` (add campaign stats endpoint)

### Retention Campaigns Testing Strategy

- Unit tests for template rendering
- Integration tests for email sending
- Cron job testing with time mocking
- Email tracking pixel validation
- Campaign effectiveness calculation tests

---

## Feature 3: Real-time Updates

### Tasks Breakdown

#### Task 3.1: Integrate Analytics with WebSocket Server
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Leverage existing WebSocket server
   ```javascript
   // src/services/analytics/AnalyticsWebSocketService.js
   class AnalyticsWebSocketService {
     constructor(wss) {
       this.wss = wss;
       this.adminClients = new Set();
     }

     registerAdminClient(ws, userId) {
       this.adminClients.add({ ws, userId });

       ws.on('close', () => {
         this.adminClients.delete({ ws, userId });
       });
     }

     broadcastMetricUpdate(metricType, data) {
       this.adminClients.forEach(({ ws }) => {
         if (ws.readyState === WebSocket.OPEN) {
           ws.send(JSON.stringify({
             type: 'analytics:update',
             metricType,
             data,
             timestamp: new Date()
           }));
         }
       });
     }
   }
   ```

2. Emit events on metric changes
   - MRR update (new subscription, cancellation)
   - Churn risk alert (user crosses threshold)
   - New cohort user (signup)

3. Implement WebSocket authentication for admin clients

**Files to Create**:
- `src/services/analytics/AnalyticsWebSocketService.js`

**Files to Modify**:
- `src/websocket-server.js` (integrate analytics WS service)

#### Task 3.2: Push Real-time Metric Updates to Dashboard
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Create WebSocket hook in dashboard
   ```javascript
   // src/dashboard/hooks/useAnalyticsWebSocket.js
   function useAnalyticsWebSocket() {
     const [metrics, setMetrics] = useState({});

     useEffect(() => {
       const ws = new WebSocket('wss://...');

       ws.onmessage = (event) => {
         const { type, metricType, data } = JSON.parse(event.data);

         if (type === 'analytics:update') {
           setMetrics(prev => ({
             ...prev,
             [metricType]: data
           }));
         }
       };

       return () => ws.close();
     }, []);

     return metrics;
   }
   ```

2. Update dashboard components to use live data
   - Show "Live" indicator when connected
   - Smooth transitions for metric updates
   - Fallback to polling if WebSocket disconnects

3. Optimize update frequency (debounce to 5-second intervals)

**Files to Create**:
- `src/dashboard/hooks/useAnalyticsWebSocket.js`

**Files to Modify**:
- `src/dashboard/components/AnalyticsDashboard.jsx`

#### Task 3.3: Implement Live Churn Risk Notifications
**Estimated Time**: 2-3 hours

**Implementation Steps**:
1. Create notification system for dashboard
   ```javascript
   // Real-time churn risk alerts
   {
     type: 'churn_alert',
     severity: 'critical',
     message: 'User @alice crossed into critical risk (score: 85)',
     userId: '...',
     timestamp: new Date()
   }
   ```

2. Toast notifications for critical events
   - New critical-risk user
   - Churn spike detected (>5% increase in 1 hour)
   - MRR drop >10%

3. Notification center with history

**Files to Create**:
- `src/dashboard/components/NotificationCenter.jsx`

**Files to Modify**:
- `src/dashboard/components/AnalyticsDashboard.jsx`

### Real-time Updates Testing Strategy

- WebSocket connection testing
- Message delivery validation
- Reconnection logic testing
- UI update performance testing (large metric updates)

---

## Feature 4: Advanced Cohort Features

### Tasks Breakdown

#### Task 4.1: Add Custom Cohort Segmentation
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Create custom segment builder
   ```javascript
   // Custom segment definition
   {
     segmentName: 'High-value Early Adopters',
     filters: [
       { field: 'subscription.tier', operator: 'in', value: ['pro', 'premium'] },
       { field: 'createdAt', operator: '<', value: '2024-01-01' },
       { field: 'stats.totalProfit', operator: '>', value: 5000 }
     ],
     cohortPeriod: 'month'
   }
   ```

2. Implement segment query builder
3. Save and manage custom segments
4. Apply segments to retention analysis

**Files to Create**:
- `src/services/analytics/CohortSegmentService.js`
- `src/models/CohortSegment.js`

**Files to Modify**:
- `src/services/analytics/CohortAnalyzer.js`
- `src/routes/api/analytics.js`

#### Task 4.2: Implement Funnel Analysis
**Estimated Time**: 3-4 hours

**Implementation Steps**:
1. Define standard funnels
   ```javascript
   const signupFunnel = [
     { step: 'signup', eventType: 'signup' },
     { step: 'broker_connected', eventType: 'broker_connected' },
     { step: 'first_trade', eventType: 'trade_executed' },
     { step: 'subscription', eventType: 'subscription_created' }
   ];
   ```

2. Calculate funnel conversion rates
   ```javascript
   async calculateFunnelMetrics(funnelSteps, cohortDate) {
     const cohortUsers = await this.getCohortUsers(cohortDate);
     const results = [];

     for (let i = 0; i < funnelSteps.length; i++) {
       const step = funnelSteps[i];
       const completedUsers = await AnalyticsEvent.distinct('userId', {
         userId: { $in: cohortUsers.map(u => u._id) },
         eventType: step.eventType
       });

       results.push({
         step: step.step,
         completed: completedUsers.length,
         conversionRate: (completedUsers.length / cohortUsers.length) * 100,
         dropOff: i > 0 ? results[i-1].completed - completedUsers.length : 0
       });
     }

     return results;
   }
   ```

3. Visualize funnel with drop-off rates

**Files to Modify**:
- `src/services/analytics/CohortAnalyzer.js`
- `src/routes/api/analytics.js`

**Files to Create**:
- `src/dashboard/components/FunnelAnalysisChart.jsx`

#### Task 4.3: Add A/B Test Cohort Comparison
**Estimated Time**: 2-3 hours

**Implementation Steps**:
1. Track experiment assignments
   ```javascript
   // User model extension
   experiments: [{
     experimentId: String,
     variant: String,
     assignedAt: Date
   }]
   ```

2. Compare cohorts by experiment variant
3. Calculate statistical significance
4. Visualize A/B test results

**Files to Modify**:
- `src/models/User.js`
- `src/services/analytics/CohortAnalyzer.js`

#### Task 4.4: Create Cohort Export Functionality
**Estimated Time**: 2-3 hours

**Implementation Steps**:
1. CSV export for retention tables
   ```javascript
   router.get('/cohorts/retention/export', requireAdmin, async (req, res) => {
     const retentionData = await cohortAnalyzer.generateRetentionTable(req.query);
     const csv = convertToCSV(retentionData);

     res.setHeader('Content-Type', 'text/csv');
     res.setHeader('Content-Disposition', 'attachment; filename=retention-table.csv');
     res.send(csv);
   });
   ```

2. PDF export for executive summaries
3. JSON export for external analysis tools
4. Schedule automated reports (weekly/monthly)

**Files to Modify**:
- `src/routes/api/analytics.js`

**Files to Create**:
- `src/utils/export-helpers.js`

### Advanced Cohort Features Testing Strategy

- Segment filter logic testing
- Funnel calculation accuracy tests
- A/B test statistical significance validation
- Export format validation (CSV, PDF, JSON)

---

## Production Readiness Checklist

Before deploying Phase 5 features to production:

### Configuration
- [ ] SendGrid/AWS SES API keys configured
- [ ] Email sender domain verified and warmed up
- [ ] WebSocket server scaled for concurrent admin connections
- [ ] Marketing campaign tracking URLs configured
- [ ] Rate limiting configured for email sending

### Data Requirements
- [ ] Minimum 3 months of historical user data
- [ ] At least 100 churn events for campaign validation
- [ ] UTM parameter tracking enabled on all marketing channels
- [ ] Email addresses verified for 80%+ of active users

### Monitoring
- [ ] Email delivery rate monitoring (SendGrid/SES dashboard)
- [ ] WebSocket connection health checks
- [ ] Campaign effectiveness metrics dashboard
- [ ] Alert thresholds configured for email bounce rates

### Security
- [ ] Email opt-out compliance (GDPR, CAN-SPAM)
- [ ] Unsubscribe link in all retention emails
- [ ] Admin-only access to campaign management endpoints
- [ ] WebSocket authentication for analytics updates

### Testing
- [ ] Load testing for email job (1000+ users)
- [ ] WebSocket connection limit testing
- [ ] Email template rendering across clients (Gmail, Outlook, Apple Mail)
- [ ] Campaign A/B test framework validation

---

## Rollout Strategy

### Phase 5.1: CAC Tracking (Week 1)
- Deploy marketing campaign model and endpoints
- Begin tracking UTM parameters on signups
- Integrate with existing ad platforms (Google Ads, Facebook)
- Validate CAC calculations against manual spreadsheets

### Phase 5.2: Retention Campaigns (Week 2-3)
- Deploy email templates and SendGrid integration
- Run test campaigns to small user segments (10-50 users)
- Monitor email deliverability and open rates
- Tune template personalization based on early results
- Full rollout to all at-risk users

### Phase 5.3: Real-time & Cohorts (Week 4)
- Deploy WebSocket analytics updates
- Implement custom cohort segmentation
- Add funnel analysis capabilities
- Enable A/B testing framework

### Phase 5.4: Iteration & Optimization (Ongoing)
- Analyze retention campaign effectiveness
- Optimize email templates based on A/B tests
- Refine churn prediction weights with actual outcomes
- Expand funnel definitions based on product evolution

---

## Success Metrics

Phase 5 will be considered successful when:

1. **CAC Tracking**:
   - CAC calculated for all acquisition channels
   - CAC:LTV ratio monitored and optimized (target: 1:3 or better)
   - Attribution accuracy >90% for paid channels

2. **Retention Campaigns**:
   - Email open rate >25%
   - Click-through rate >10%
   - Churn reduction >15% for targeted users
   - Campaign ROI >300% (value of retained subscriptions vs. campaign cost)

3. **Real-time Updates**:
   - Dashboard updates within 5 seconds of metric changes
   - WebSocket uptime >99.5%
   - Zero missed critical alerts

4. **Advanced Cohorts**:
   - 5+ custom segments actively used by admins
   - Funnel conversion rates tracked for all critical paths
   - A/B tests drive 2+ product improvements per quarter

---

## Appendix: API Endpoints Summary

### New Endpoints (Phase 5)

**CAC & Campaigns**:
- POST `/api/analytics/campaigns` - Create marketing campaign
- GET `/api/analytics/campaigns` - List campaigns
- GET `/api/analytics/cac` - Calculate CAC by channel
- GET `/api/analytics/cac/breakdown` - CAC breakdown by channel

**Retention Campaigns**:
- GET `/api/analytics/retention/templates` - List email templates
- POST `/api/analytics/retention/templates` - Create template
- GET `/api/analytics/retention/campaigns/:id/stats` - Campaign effectiveness
- POST `/api/analytics/retention/test-send` - Test email template

**Cohorts Advanced**:
- POST `/api/analytics/cohorts/segments` - Create custom segment
- GET `/api/analytics/cohorts/funnel` - Funnel analysis
- GET `/api/analytics/cohorts/export` - Export retention data
- POST `/api/analytics/cohorts/ab-compare` - A/B test comparison

**WebSocket Events**:
- `analytics:update` - Metric updates
- `analytics:churn_alert` - Churn risk notifications
- `analytics:campaign_result` - Retention campaign results

---

## Estimated Timeline

| Week | Focus Area | Hours | Deliverables |
|------|------------|-------|--------------|
| 1 | CAC Tracking | 10-12 | Campaign model, UTM tracking, CAC calculations, dashboard charts |
| 2 | Retention Setup | 8-10 | Email templates, SendGrid integration, template management |
| 3 | Retention Automation | 6-8 | Cron jobs, campaign scheduler, effectiveness tracking |
| 4 | Real-time Updates | 8-10 | WebSocket integration, live dashboard, notifications |
| 5 | Advanced Cohorts | 10-12 | Custom segments, funnels, A/B tests, export |
| **Total** | **5 weeks** | **42-52 hours** | **Complete Phase 5** |

---

## Next Steps

1. **Review & Approve**: Product team reviews this plan and prioritizes features
2. **Resource Allocation**: Assign developers to Phase 5 implementation
3. **Infrastructure Setup**: Provision SendGrid account, configure email domain
4. **Marketing Alignment**: Coordinate with marketing team on UTM standards
5. **Begin Implementation**: Start with CAC tracking (highest business value)

**Recommendation**: Defer Phase 5 until production data (3+ months) validates the need. Current analytics platform (Phases 1-4 & 6) provides sufficient insights for MVP validation.
