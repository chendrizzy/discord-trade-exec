# Analytics Platform - Advanced Features Delta

## ADDED Requirements

### Requirement: Customer Acquisition Cost (CAC) Tracking
The system SHALL track marketing campaign data and calculate Customer Acquisition Cost per acquisition channel to enable ROI analysis and marketing spend optimization.

#### Scenario: Record marketing campaign spend
- **WHEN** admin creates a marketing campaign with spend amount and channel
- **THEN** system stores campaign with UTM parameters
- **AND** campaign is available for CAC calculation

#### Scenario: Calculate CAC for channel
- **WHEN** admin requests CAC for a specific channel and date range
- **THEN** system calculates totalSpend / newUsers for that channel
- **AND** returns CAC, total spend, new users, and time period

#### Scenario: Track user attribution
- **WHEN** user signs up with UTM parameters
- **THEN** system captures utm_source, utm_medium, utm_campaign
- **AND** links user to corresponding marketing campaign
- **AND** stores attribution data for CAC calculation

#### Scenario: Visualize CAC vs LTV trends
- **WHEN** admin views marketing performance dashboard
- **THEN** system displays CAC vs LTV chart over time
- **AND** shows LTV:CAC ratio with profitability indicator
- **AND** provides channel-level performance breakdown

---

### Requirement: Automated Retention Campaigns
The system SHALL automatically send personalized retention emails to at-risk users based on churn risk analysis to reduce customer churn and improve retention rates.

#### Scenario: Send retention email to high-risk user
- **WHEN** daily retention job detects user with critical/high churn risk
- **AND** user has not received retention email in last 7 days
- **AND** user has not opted out of emails
- **THEN** system selects appropriate email template based on risk factors
- **AND** renders personalized email with user stats
- **AND** sends email via SendGrid/AWS SES
- **AND** tracks email sent event

#### Scenario: Track email campaign effectiveness
- **WHEN** admin requests retention campaign statistics
- **THEN** system calculates open rate, click rate, return rate
- **AND** estimates churn prevented by campaign
- **AND** provides campaign ROI analysis

#### Scenario: Respect email preferences
- **WHEN** user opts out of retention emails
- **THEN** system marks user as opted out
- **AND** excludes user from future retention campaigns
- **AND** user never receives automated retention emails

#### Scenario: A/B test email templates
- **WHEN** admin creates multiple templates for same risk category
- **THEN** system randomly assigns templates to users
- **AND** tracks performance metrics by template variant
- **AND** identifies winning template based on conversion rate

---

### Requirement: Real-time Analytics Updates
The system SHALL push real-time metric updates to the analytics dashboard via WebSocket connections to provide instant visibility into business performance changes.

#### Scenario: Broadcast MRR update in real-time
- **WHEN** new subscription is created or subscription is cancelled
- **THEN** system recalculates MRR
- **AND** broadcasts update to all connected admin WebSocket clients
- **AND** dashboard updates within 2 seconds

#### Scenario: Send churn risk alert
- **WHEN** user crosses into critical churn risk threshold
- **THEN** system broadcasts churn_alert event via WebSocket
- **AND** dashboard displays toast notification
- **AND** notification includes user details and risk score

#### Scenario: Handle WebSocket disconnection
- **WHEN** WebSocket connection is lost
- **THEN** dashboard shows "Disconnected" indicator
- **AND** attempts to reconnect automatically
- **AND** falls back to polling for metrics if WebSocket unavailable

#### Scenario: Live dashboard indicator
- **WHEN** admin opens analytics dashboard
- **AND** WebSocket connection is established
- **THEN** dashboard displays "Live" indicator
- **AND** all metric cards update in real-time as events occur

---

### Requirement: Advanced Cohort Analysis Features
The system SHALL provide custom cohort segmentation, funnel analysis, A/B test comparison, and data export capabilities to enable sophisticated user behavior analysis and data-driven decision making.

#### Scenario: Create custom user segment
- **WHEN** admin creates custom segment with filters
- **AND** filters include subscription.tier = 'pro' AND createdAt < '2024-01-01'
- **THEN** system validates filter syntax
- **AND** builds MongoDB aggregation query
- **AND** shows real-time count of matching users
- **AND** saves segment for future use

#### Scenario: Analyze conversion funnel
- **WHEN** admin requests funnel analysis for signup funnel
- **THEN** system calculates completion rate for each step
- **AND** calculates drop-off percentage between steps
- **AND** visualizes funnel with step-by-step breakdown
- **AND** highlights steps with >50% drop-off

#### Scenario: Compare A/B test variants
- **WHEN** admin compares retention between experiment variants A and B
- **THEN** system generates retention curves for each variant
- **AND** calculates statistical significance of difference
- **AND** recommends winning variant if significance >95%

#### Scenario: Export cohort data to CSV
- **WHEN** admin requests CSV export of retention table
- **THEN** system generates CSV with cohort rows and retention percentages
- **AND** sets proper content headers for download
- **AND** filename includes date range and export timestamp
- **AND** download completes within 10 seconds for <10,000 users

#### Scenario: Export executive summary to PDF
- **WHEN** admin requests PDF export of cohort analysis
- **THEN** system generates PDF with retention charts and tables
- **AND** includes key metrics summary (overall retention, best/worst cohorts)
- **AND** PDF is formatted for presentation to stakeholders
- **AND** generation completes within 30 seconds

---

## MODIFIED Requirements

### Requirement: Revenue Metrics Calculation
The system SHALL calculate key revenue metrics (MRR, ARR, LTV, churn rate) with support for CAC integration and LTV:CAC ratio analysis to provide comprehensive financial performance insights.

*(This requirement is modified to add CAC-related calculations)*

#### Scenario: Calculate MRR (unchanged)
- **WHEN** admin requests current Monthly Recurring Revenue
- **THEN** system sums all active subscription values
- **AND** calculates MRR growth vs previous month
- **AND** returns MRR breakdown by tier

#### Scenario: Calculate Customer Lifetime Value (unchanged)
- **WHEN** admin requests LTV calculation
- **THEN** system calculates ARPU / churn rate
- **AND** returns LTV for each subscription tier
- **AND** provides historical LTV trend

#### Scenario: Calculate LTV:CAC ratio by channel (NEW)
- **WHEN** admin requests LTV:CAC ratio for acquisition channel
- **THEN** system calculates average LTV for users from that channel
- **AND** divides by CAC for that channel
- **AND** returns ratio with profitability assessment (healthy if >3:1)
- **AND** provides recommendations if ratio is unhealthy

---

## ADDED API Endpoints

### Marketing Analytics Endpoints
- POST `/api/analytics/campaigns` - Create marketing campaign
- GET `/api/analytics/campaigns` - List all campaigns
- PUT `/api/analytics/campaigns/:id` - Update campaign
- DELETE `/api/analytics/campaigns/:id` - Delete campaign
- GET `/api/analytics/cac` - Calculate CAC by channel
- GET `/api/analytics/cac/breakdown` - CAC breakdown for all channels

### Retention Campaign Endpoints
- GET `/api/analytics/retention/templates` - List email templates
- POST `/api/analytics/retention/templates` - Create email template
- PUT `/api/analytics/retention/templates/:id` - Update template
- GET `/api/analytics/retention/templates/:id/preview` - Preview template
- GET `/api/analytics/retention/campaigns/:id/stats` - Campaign effectiveness stats
- POST `/api/analytics/retention/test-send` - Send test email

### Advanced Cohort Endpoints
- POST `/api/analytics/cohorts/segments` - Create custom segment
- GET `/api/analytics/cohorts/segments` - List saved segments
- PUT `/api/analytics/cohorts/segments/:id` - Update segment
- DELETE `/api/analytics/cohorts/segments/:id` - Delete segment
- GET `/api/analytics/cohorts/funnel` - Funnel analysis
- POST `/api/analytics/cohorts/ab-compare` - A/B test comparison
- GET `/api/analytics/cohorts/retention/export` - Export retention data (CSV/PDF/JSON)

### WebSocket Events
- `analytics:update` - Real-time metric updates (MRR, user count, etc.)
- `analytics:churn_alert` - Churn risk notifications
- `analytics:campaign_result` - Retention campaign outcome notifications

---

## ADDED Data Models

### MarketingCampaign Model
```javascript
{
  campaignId: String,
  campaignName: String,
  channel: { type: String, enum: ['google_ads', 'facebook', 'twitter', 'reddit', 'organic', 'referral'] },
  spend: Number,
  startDate: Date,
  endDate: Date,
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  timestamps: true
}
```

### EmailTemplate Model
```javascript
{
  templateId: String,
  name: String,
  category: { type: String, enum: ['high_risk', 'low_win_rate', 'inactive'] },
  subject: String,
  body: String, // Handlebars template
  active: Boolean,
  stats: {
    sent: Number,
    opened: Number,
    clicked: Number
  },
  timestamps: true
}
```

### CohortSegment Model
```javascript
{
  segmentName: String,
  filters: [{
    field: String,
    operator: { type: String, enum: ['=', '!=', '>', '<', '>=', '<=', 'in', 'not_in'] },
    value: mongoose.Schema.Types.Mixed
  }],
  cohortPeriod: { type: String, enum: ['day', 'week', 'month'], default: 'month' },
  createdBy: { type: ObjectId, ref: 'User' },
  lastUsed: Date,
  timestamps: true
}
```

---

## MODIFIED Data Models

### User Model - Attribution Fields
Add fields to support marketing attribution and retention campaigns:

```javascript
// New fields in User schema
{
  attribution: {
    source: String,      // UTM source
    medium: String,      // UTM medium
    campaign: String,    // UTM campaign
    campaignId: { type: ObjectId, ref: 'MarketingCampaign' }
  },
  emailPreferences: {
    optedOut: { type: Boolean, default: false },
    lastRetentionEmail: Date,
    emailFrequency: { type: String, enum: ['daily', 'weekly', 'never'], default: 'weekly' }
  },
  experiments: [{
    experimentId: String,
    variant: String,
    assignedAt: Date
  }]
}
```

---

## Performance Expectations

- **CAC Calculation**: < 500ms for channel-specific, < 2s for all channels breakdown
- **Email Sending**: < 100ms per email (async processing)
- **WebSocket Updates**: < 2s latency from event to dashboard update
- **Custom Segment Query**: < 1s for segments with <100K users
- **Funnel Analysis**: < 3s for standard funnels
- **CSV Export**: < 10s for <10K users
- **PDF Export**: < 30s for executive summaries

---

## Security & Compliance

### Email Compliance
- All retention emails MUST include unsubscribe link
- System SHALL honor opt-out preferences immediately
- System SHALL comply with GDPR/CAN-SPAM requirements
- Email frequency capped at maximum 1 per 7 days per user

### Data Access
- CAC and marketing data accessible only to admin users
- WebSocket analytics updates restricted to admin clients
- Custom segments can only be created by admin users
- Email template management requires admin role

### Rate Limiting
- Email sending: Max 100 emails per minute (configurable)
- WebSocket connections: Max 10 concurrent admin connections
- Export endpoints: Max 5 requests per minute per user

---

## Dependencies

### External Services
- **SendGrid or AWS SES**: Email delivery service for retention campaigns
- **WebSocket Server**: Already exists in codebase (socket.io)
- **PDF Generator**: PDFKit or Puppeteer for PDF exports

### Data Requirements
- **Historical Data**: Minimum 3 months for accurate CAC calculations
- **Email Addresses**: 80%+ of active users must have verified email
- **UTM Tracking**: All marketing campaigns must use consistent UTM parameters

### Configuration
- `SENDGRID_API_KEY` or `AWS_SES_*` environment variables
- `RETENTION_EMAIL_FROM` for email sender address
- `WEBSOCKET_ADMIN_AUTH_SECRET` for WebSocket authentication
