# Cohort Analysis Best Practices Guide

## Overview

Cohort analysis tracks customer retention by grouping users who signed up in the same time period (cohort). This guide provides best practices for analyzing cohort retention to improve customer lifetime value and reduce churn.

**Primary Use Case**: Understanding how product changes, marketing campaigns, and user experience improvements impact long-term retention.

**Key Benefit**: Identify retention trends early, allowing proactive optimization before churn becomes widespread.

---

## What is Cohort Analysis?

### Definition

**Cohort**: A group of users who share a common characteristic (typically signup month).

**Retention**: Percentage of cohort still active after N periods.

**Example**:
```
October 2024 Cohort:
- 100 users signed up in October 2024
- 88 users still active in November 2024 (Month 1)
- 75 users still active in December 2024 (Month 2)
- Retention Rate: 88% (M1), 75% (M2)
```

### Why Cohort Analysis Matters

**Problem with Aggregate Metrics**:
```
Total Active Users: 1,500 (this month)
Total Active Users: 1,500 (last month)
Conclusion: "We're stable"
```

**Hidden Reality Revealed by Cohorts**:
```
October Cohort: 80% retention (good)
September Cohort: 65% retention at same stage (concerning)
August Cohort: 50% retention at same stage (poor)

Conclusion: "We're losing older cohorts faster than we're gaining new ones"
```

**Insight**: Cohort analysis reveals trends that aggregate metrics hide.

---

## Cohort Retention Table Structure

### Basic Table Format

```
Cohort     | M0   | M1   | M2   | M3   | M6   | M12
-----------|------|------|------|------|------|------
2024-10    | 100% | 88%  | 75%  | 68%  | ?    | ?
2024-09    | 100% | 84%  | 71%  | 65%  | 52%  | ?
2024-08    | 100% | 82%  | 69%  | 62%  | 48%  | 38%
2024-07    | 100% | 79%  | 66%  | 58%  | 45%  | 35%
```

### Column Definitions

| Column | Definition | Calculation | Use Case |
|--------|------------|-------------|----------|
| **Cohort** | Signup period | Year-Month (2024-10) | Identify which cohort |
| **M0** | Initial month | Always 100% | Baseline |
| **M1** | After 1 month | Active users ÷ Total cohort | Short-term retention |
| **M3** | After 3 months | Active users ÷ Total cohort | Medium-term retention |
| **M6** | After 6 months | Active users ÷ Total cohort | Long-term retention |
| **M12** | After 12 months | Active users ÷ Total cohort | Annual retention |

### Retention Metric Options

**1. Active Retention** (default):
```javascript
Active = User logged in OR executed trade
```
- Most forgiving metric
- Best for overall health monitoring

**2. Trade Retention**:
```javascript
Trade = User executed at least one trade
```
- Strictest engagement metric
- Best for product usage analysis

**3. Login Retention**:
```javascript
Login = User logged into platform
```
- Middle ground metric
- Best for activation campaigns

**When to Use Each**:
- **Monthly business reviews**: Use Active
- **Product team planning**: Use Trade
- **Activation campaigns**: Use Login

---

## Reading Cohort Tables

### Heat Map Interpretation

**Color Coding**:
- 🟢 **Green** (80-100%): Excellent retention
- 🟡 **Yellow** (60-79%): Acceptable retention
- 🟠 **Orange** (40-59%): Needs improvement
- 🔴 **Red** (<40%): Critical retention issue

### Key Patterns to Identify

#### Pattern 1: Healthy Retention (Example A)

```
Cohort     | M0   | M1   | M2   | M3   | M6   | M12
-----------|------|------|------|------|------|------
2024-10    | 100% | 88%  | 82%  | 78%  | ?    | ?
2024-09    | 100% | 87%  | 81%  | 76%  | 68%  | ?
2024-08    | 100% | 86%  | 80%  | 75%  | 67%  | 58%
```

**Characteristics**:
- High M1 retention (>85%)
- Gradual decline (not steep drop)
- Newer cohorts perform slightly better

**Interpretation**: Product-market fit validated, incremental improvements working

**Action**: Scale growth, maintain quality

---

#### Pattern 2: Improving Retention (Example B)

```
Cohort     | M0   | M1   | M2   | M3   | M6   | M12
-----------|------|------|------|------|------|------
2024-10    | 100% | 90%  | 85%  | 82%  | ?    | ?
2024-09    | 100% | 88%  | 82%  | 78%  | ?    | ?
2024-08    | 100% | 85%  | 78%  | 72%  | 62%  | ?
2024-07    | 100% | 82%  | 74%  | 68%  | 58%  | 48%
```

**Characteristics**:
- Each newer cohort performs better than previous
- Consistent improvement trend
- M1 retention increasing (+2-3% per cohort)

**Interpretation**: Recent product improvements are working

**Action**: Document what changed, scale successful initiatives

---

#### Pattern 3: Declining Retention (Example C) ⚠️

```
Cohort     | M0   | M1   | M2   | M3   | M6   | M12
-----------|------|------|------|------|------|------
2024-10    | 100% | 76%  | 62%  | 54%  | ?    | ?
2024-09    | 100% | 80%  | 68%  | 60%  | ?    | ?
2024-08    | 100% | 84%  | 74%  | 66%  | 58%  | ?
2024-07    | 100% | 86%  | 78%  | 70%  | 62%  | 52%
```

**Characteristics**:
- Each newer cohort performs worse than previous
- M1 retention declining (-2-4% per cohort)
- Concerning trend requiring immediate action

**Interpretation**: Recent changes negatively impacting retention

**Action**: Investigate product releases, bugs, competitor activity

---

#### Pattern 4: Steep Drop-Off (Example D) 🚨

```
Cohort     | M0   | M1   | M2   | M3   | M6   | M12
-----------|------|------|------|------|------|------
2024-10    | 100% | 58%  | 42%  | 35%  | ?    | ?
2024-09    | 100% | 62%  | 45%  | 38%  | 28%  | ?
2024-08    | 100% | 65%  | 48%  | 40%  | 32%  | 24%
```

**Characteristics**:
- Very low M1 retention (<70%)
- Rapid decline in first 3 months
- Poor long-term retention (<30% at M12)

**Interpretation**: Critical product-market fit issue or onboarding problem

**Action**: Investigate:
1. Onboarding experience (time to first value)
2. Product expectations vs reality mismatch
3. Competitive alternatives
4. Pricing concerns

---

## Industry Benchmarks

### SaaS Retention Benchmarks

| Cohort Age | Excellent | Good | Acceptable | Poor |
|------------|-----------|------|------------|------|
| **M1** | >85% | 75-85% | 65-75% | <65% |
| **M3** | >75% | 65-75% | 55-65% | <55% |
| **M6** | >65% | 55-65% | 45-55% | <45% |
| **M12** | >50% | 40-50% | 30-40% | <30% |

### Trading Platform Benchmarks

| Cohort Age | Excellent | Good | Acceptable | Poor |
|------------|-----------|------|------------|------|
| **M1** | >80% | 70-80% | 60-70% | <60% |
| **M3** | >65% | 55-65% | 45-55% | <45% |
| **M6** | >50% | 40-50% | 30-40% | <30% |
| **M12** | >40% | 30-40% | 20-30% | <20% |

**Why Lower**: Trading platforms face higher churn due to:
- Market volatility (users pause during downturns)
- Learning curve (steep for new traders)
- Profitability expectations (users quit if losing money)

---

## Key Metrics to Track

### 1. Month 1 Retention (Critical)

**Why It Matters**: First month determines if users find immediate value.

**Target**: >80% for trading platforms

**If Below 70%**: Indicates onboarding problem

**Diagnostic Questions**:
- Time to first trade? (should be <24 hours)
- Clear value proposition? (users understand benefits?)
- Onboarding friction? (too many steps, unclear instructions?)
- Initial user experience? (bugs, performance issues?)

**Improvement Tactics**:
- Streamline onboarding (remove unnecessary steps)
- Add interactive tutorial (guide first trade)
- Set realistic expectations (don't overpromise)
- Provide quick wins (demo trades, educational content)

---

### 2. Month 3 Retention (Product-Market Fit)

**Why It Matters**: Indicates whether product delivers sustained value.

**Target**: >65% for trading platforms

**If Below 55%**: Product-market fit concern

**Diagnostic Questions**:
- Do users achieve their goals? (profitable trading?)
- Is product habit-forming? (daily/weekly use?)
- Are alternatives more compelling? (competitors?)
- Does pricing match value? (too expensive for results?)

**Improvement Tactics**:
- Add features that increase stickiness (alerts, automation)
- Improve win rate (better signals, education)
- Build community (social features, forums)
- Optimize pricing (align cost with value delivered)

---

### 3. Cohort Decay Rate

**Definition**: Rate at which retention drops per month.

**Calculation**:
```javascript
Decay_Rate = (M1 - M3) ÷ 2
```

**Example**:
```
M1: 85%
M3: 65%
Decay: (85% - 65%) ÷ 2 = 10% per month
```

**Benchmarks**:
- **Excellent**: <5% per month
- **Good**: 5-8% per month
- **Acceptable**: 8-12% per month
- **Poor**: >12% per month

**If Decay >12%**: Users dropping off too quickly, investigate engagement drivers

---

### 4. Retention Stability

**Definition**: How consistent retention is across cohorts.

**Calculation**:
```javascript
Stability = Standard_Deviation(M3_Retention across 6 cohorts)
```

**Example**:
```
Cohorts M3 Retention: [72%, 70%, 68%, 71%, 69%, 73%]
Mean: 70.5%
Std Dev: 1.87%
```

**Benchmarks**:
- **Excellent**: <3% standard deviation
- **Good**: 3-5%
- **Concerning**: 5-10%
- **Poor**: >10%

**If Stability >10%**: Inconsistent user experience, investigate what changed between cohorts

---

## Cohort Comparison Analysis

### Comparing Cohorts

**Purpose**: Identify trends by comparing retention of different cohorts at the same stage.

**Example Analysis**:
```
Question: "How does October 2024 cohort compare to September 2024 at Month 1?"

October 2024 M1: 88%
September 2024 M1: 84%
Delta: +4% improvement

Conclusion: Recent onboarding improvements are working
```

### Trend Detection

**Improving Trend** 📈:
```
Newer cohorts > Older cohorts at same stage
October M1 (88%) > September M1 (84%) > August M1 (80%)
```

**Declining Trend** 📉:
```
Newer cohorts < Older cohorts at same stage
October M1 (78%) < September M1 (82%) < August M1 (86%)
```

**Stable Trend** ➡️:
```
Minimal variance between cohorts (±2%)
October M1 (85%) ≈ September M1 (84%) ≈ August M1 (86%)
```

### Root Cause Analysis

**If Trend is Declining**:

**Step 1: Timeline Analysis**
```javascript
// What changed between cohorts?
- Product releases
- Marketing campaigns
- Pricing changes
- Competitor launches
- Market conditions (e.g., crypto crash)
```

**Step 2: Segment Analysis**
```javascript
// Does decline affect all segments equally?
- Basic vs Pro vs Premium tiers
- Organic vs paid acquisition
- Geographic regions
- User demographics
```

**Step 3: Correlation Analysis**
```javascript
// What correlates with retention?
- Time to first trade
- Initial win rate
- Feature usage (which features?)
- Support ticket volume
```

---

## Segmentation Strategies

### 1. By Acquisition Channel

**Purpose**: Identify which channels bring high-retention users.

**Segments**:
- Organic (SEO, social media)
- Paid (Google Ads, Facebook Ads)
- Referral (existing users)
- Affiliate (partner networks)

**Example Analysis**:
```
Organic M3: 72%
Paid M3: 58%
Referral M3: 80%

Conclusion: Referrals have best retention, prioritize referral program
```

---

### 2. By Subscription Tier

**Purpose**: Understand retention by pricing tier.

**Segments**:
- Basic ($49/month)
- Pro ($99/month)
- Premium ($299/month)

**Example Analysis**:
```
Basic M3: 62%
Pro M3: 70%
Premium M3: 85%

Conclusion: Higher-paying users have better retention (more invested)
```

**Implication**: Encourage upgrades early to improve lifetime retention

---

### 3. By Geographic Region

**Purpose**: Identify regional retention differences.

**Segments**:
- North America
- Europe
- Asia
- Other

**Example Analysis**:
```
North America M3: 75%
Europe M3: 68%
Asia M3: 52%

Conclusion: Asia cohorts underperforming, investigate localization issues
```

---

### 4. By User Behavior

**Purpose**: Understand what behaviors drive retention.

**Segments**:
- Fast Activators (traded within 24 hours)
- Slow Activators (traded after 7 days)
- Non-Activators (never traded)

**Example Analysis**:
```
Fast Activators M3: 85%
Slow Activators M3: 60%
Non-Activators M3: 15%

Conclusion: Time-to-first-trade is critical retention driver
```

**Action**: Optimize onboarding to encourage fast activation

---

## Actionable Insights from Cohorts

### Insight 1: Identify Best Cohort Ever

**Analysis**:
```
Which cohort has highest M3 retention?
September 2024: 78% M3

What was different about September 2024?
- Launched in-app tutorial
- Added Discord signal integration
- Ran Black Friday promotion
```

**Action**: Replicate September 2024 playbook for future cohorts

---

### Insight 2: Pinpoint Drop-Off Stages

**Analysis**:
```
October 2024 Cohort:
M0 → M1: -12% (100% → 88%)
M1 → M2: -13% (88% → 75%)
M2 → M3: -7% (75% → 68%)

Conclusion: Biggest drop happens M0 → M2 (first 60 days)
```

**Action**: Focus retention efforts on first 60 days (onboarding + activation)

---

### Insight 3: Cohort Maturity Pattern

**Analysis**:
```
Mature Cohorts (12+ months old):
Average M12: 38%

Recent Cohorts (3-6 months old):
Average M6: 52%

Conclusion: If recent cohorts maintain current decay rate, they'll reach 40% at M12 (better than mature cohorts)
```

**Action**: Recent improvements are working, continue current strategy

---

### Insight 4: Seasonal Patterns

**Analysis**:
```
Q4 2024 Cohorts M1: 86% average
Q3 2024 Cohorts M1: 78% average
Q2 2024 Cohorts M1: 74% average
Q1 2024 Cohorts M1: 80% average

Conclusion: Q4 (holiday season) brings higher-quality users
```

**Action**: Increase marketing spend in Q4, scale successful acquisition channels

---

## Common Pitfalls

### Pitfall 1: Comparing Cohorts at Different Ages

**Wrong**:
```
October 2024 M1: 88%
August 2024 M3: 68%
Conclusion: "October is better"
```

**Problem**: Comparing different cohort stages (M1 vs M3)

**Right**:
```
October 2024 M1: 88%
August 2024 M1 (historical): 82%
Conclusion: "October M1 is 6% better than August M1"
```

---

### Pitfall 2: Ignoring Small Cohorts

**Wrong**:
```
July 2024: 10 users, 90% M3 retention
August 2024: 100 users, 70% M3 retention
Conclusion: "July cohort is better"
```

**Problem**: Small sample size (10 users) not statistically significant

**Right**: Exclude cohorts with <30 users from trend analysis

---

### Pitfall 3: Not Accounting for Cohort Size

**Wrong**:
```
Cohort A: 1,000 users, 60% M3
Cohort B: 100 users, 80% M3
Conclusion: "Overall retention: (60% + 80%) ÷ 2 = 70%"
```

**Problem**: Weighted average ignores cohort size

**Right**:
```javascript
Weighted_Retention = ((1000 × 0.60) + (100 × 0.80)) ÷ 1100 = 61.8%
```

---

### Pitfall 4: Confusing Cohort with User Age

**Cohort**: When user signed up
**User Age**: How long user has been a customer

**Example**:
```
User A: Signed up October 2024 (cohort: 2024-10, age: 1 month)
User B: Signed up August 2024 (cohort: 2024-08, age: 3 months)
```

**Analysis**: Both are different ages, so they appear in different M columns

---

## Integration with Other Analytics

### Cohort + Churn Prediction

**Combined Analysis**:
```
October 2024 Cohort:
- M1: 88% retention
- At-Risk Users (M1): 12 users (12% of cohort)
- Churn Risk Level: High (average score: 68)

Action: Target October cohort at-risk users with retention campaign
```

---

### Cohort + Revenue Metrics

**Combined Analysis**:
```
October 2024 Cohort:
- Total Users: 100
- M3 Retention: 68%
- Average ARPU: $96.67
- Projected LTV: $96.67 × 24 months × 0.68 = $1,576

September 2024 Cohort:
- Projected LTV: $96.67 × 24 months × 0.65 = $1,508

Conclusion: October cohort will generate 4.5% more LTV
```

---

### Cohort + Feature Usage

**Combined Analysis**:
```
October 2024 Cohort (M3: 78%):
- 85% used automation feature
- 70% connected multiple brokers
- 60% joined Discord community

September 2024 Cohort (M3: 68%):
- 65% used automation feature
- 50% connected multiple brokers
- 45% joined Discord community

Conclusion: Automation + multi-broker + community correlate with retention
```

**Action**: Encourage these behaviors during onboarding

---

## Reporting Best Practices

### Monthly Cohort Report

**Template**:
```markdown
# Cohort Retention Report - October 2024

## Executive Summary
- Latest Cohort (Oct 2024): 88% M1 retention
- Trend: Improving (+4% vs Sep M1)
- Benchmark Status: Exceeds target (>80%)

## Key Insights
1. October cohort performing 4% better than September
2. Onboarding tutorial increased activation by 12%
3. Premium users have 15% higher retention than Basic

## Recommendations
1. Scale onboarding tutorial to all tiers
2. Increase Premium upsell campaigns
3. Monitor October cohort M2 retention next month

## Cohort Table
[Insert heat map]

## Next Review: November 15, 2024
```

---

### Quarterly Business Review

**Include**:
1. 12-month cohort comparison chart
2. Trend analysis (improving/declining/stable)
3. Benchmarking (vs industry standards)
4. Correlation analysis (features, channels, tiers)
5. LTV projections based on retention curves
6. Action items with owners and deadlines

---

## Tooling & Automation

### Automated Alerts

**Set Up Alerts** for:
1. **M1 retention drops below 75%** (critical threshold)
2. **Declining trend detected** (2+ consecutive cohorts worse)
3. **New cohort >5% worse** than previous cohort
4. **Cohort size <30 users** (insufficient sample size)

**Example Alert**:
```
🚨 ALERT: October 2024 M1 retention (72%) below threshold (75%)
Action Required: Investigate onboarding changes, review user feedback
```

---

### Cohort Projection Model

**Formula**:
```javascript
// Predict M12 retention based on M3 retention
Predicted_M12 = M3 × Decay_Factor

// Historical decay factor (M3 → M12)
Decay_Factor = Average(Historical_M12 ÷ Historical_M3)
```

**Example**:
```
October 2024 M3: 68%
Historical Decay Factor: 0.58 (M12 is typically 58% of M3)
Predicted M12: 68% × 0.58 = 39.4%
```

**Use Case**: Forecast long-term retention early (don't wait 12 months)

---

## Advanced Techniques

### 1. Survival Analysis

**Kaplan-Meier Curve**:
- Plots probability of survival over time
- Accounts for censored data (users still active)
- More accurate than simple retention percentages

**Use Case**: Predict churn probability at any point in customer lifecycle

---

### 2. Cohort Triangulation

**Technique**: View retention from multiple angles simultaneously.

**Example**:
```
Cohort: October 2024
Segment: Premium tier
Channel: Organic
Region: North America

M3 Retention: 88% (vs 68% overall)
```

**Insight**: Premium + Organic + North America = ideal customer profile

---

### 3. Predictive Cohort Modeling

**Machine Learning Model**:
- Features: M1 metrics (activation rate, feature usage, win rate)
- Target: M12 retention
- Algorithm: Logistic Regression or Random Forest

**Output**: Predict M12 retention based on M1 behavior (no need to wait 12 months)

---

## Case Study: Improving Retention

### Background

**Problem**:
```
Recent cohorts declining:
- Aug M1: 82%
- Sep M1: 78%
- Oct M1: 74%
```

---

### Step 1: Root Cause Analysis

**Timeline Investigation**:
```
What changed?
- August 15: Launched new UI (simplified dashboard)
- September 1: Increased pricing by 10%
- October 1: Added mandatory 2FA
```

---

### Step 2: Hypothesis Testing

**Hypothesis 1**: New UI confusing users

**Test**: Survey October cohort users
```
Result: 45% said "new UI harder to use"
```

**Hypothesis 2**: Pricing increase deterred users

**Test**: Analyze conversion rates
```
Result: Trial → Paid conversion dropped from 30% → 22%
```

**Hypothesis 3**: 2FA added friction

**Test**: Measure time-to-activation
```
Result: Time to first trade increased from 18 hours → 36 hours
```

---

### Step 3: Interventions

**Action 1**: Revert UI complexity
- Re-add simplified onboarding wizard
- Provide legacy UI option

**Action 2**: Grandfather pricing for existing users
- Freeze pricing for existing customers
- Add annual discount to offset increase

**Action 3**: Streamline 2FA
- Make 2FA optional for first 7 days
- Add SMS alternative to authenticator app

---

### Step 4: Measure Impact

**Results (November cohort)**:
```
November M1: 84%
Improvement: +10% vs October
```

**Conclusion**: All three interventions contributed to recovery

---

## Reference Materials

### Key Formulas

**Retention Rate**:
```javascript
Retention = (Active_Users_MN ÷ Total_Cohort_M0) × 100
```

**Decay Rate**:
```javascript
Decay = (M1 - M3) ÷ 2
```

**Cohort Size Minimum**:
```javascript
Min_Size = 30 users (for statistical significance)
```

**Weighted Retention**:
```javascript
Weighted = Σ(Cohort_Size × Retention) ÷ Total_Users
```

---

### Related Documentation

- **Admin Dashboard Guide**: `docs/ANALYTICS_DASHBOARD_GUIDE.md`
- **API Documentation**: `docs/ANALYTICS_API.md`
- **Churn Prediction**: `docs/CHURN_PREDICTION_ALGORITHM.md`
- **Service Implementation**: `src/services/CohortAnalyzer.js`

---

### External Resources

- **Amplitude Cohort Guide**: https://amplitude.com/blog/cohort-analysis
- **Mixpanel Retention Analysis**: https://mixpanel.com/topics/retention-analysis
- **Lenny's Newsletter on Cohorts**: https://www.lennysnewsletter.com/p/how-to-do-cohort-analysis

---

## Glossary

| Term | Definition |
|------|------------|
| **Cohort** | Group of users who signed up in the same period |
| **Retention** | % of cohort still active after N months |
| **M0** | Initial month (always 100%) |
| **M1** | Retention after 1 month |
| **M3** | Retention after 3 months |
| **M12** | Retention after 12 months |
| **Decay Rate** | Rate at which retention drops per month |
| **Churn** | Inverse of retention (100% - retention) |
| **Cohort Size** | Number of users in cohort |
| **Activation** | User completes key action (e.g., first trade) |

---

**Last Updated**: 2025-10-16
**Version**: 1.0
**Next Review**: After collecting 6 months of cohort data
