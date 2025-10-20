# Discord Trade Executor - Unit Economics Model

**Date:** October 19, 2025
**Status:** Financial Model v1.0

---

## 1. Cost Structure Analysis

### Fixed Monthly Costs

| Category | Cost | Notes |
|----------|------|-------|
| **Infrastructure** | | |
| AWS/Railway (base) | $50 | Minimum compute instances |
| MongoDB Atlas | $30 | M10 Flex tier |
| Domain/SSL | $10 | Annual amortized |
| Monitoring (Datadog) | $30 | Basic APM |
| **Third-Party Services** | | |
| Stripe fees (base) | $0 | Usage-based only |
| Discord API | $0 | Free tier |
| **Support/Operations** | | |
| Customer support tools | $50 | Intercom/Zendesk |
| Development tools | $20 | GitHub, CI/CD |
| **Total Fixed Costs** | **$190/month** | Before scaling |

### Variable Costs (Per User)

| Category | Free User | Paid User | Notes |
|----------|-----------|-----------|-------|
| **Infrastructure** | | | |
| Compute | $0.15 | $0.75 | Based on signal volume |
| Database | $0.10 | $0.50 | Storage + operations |
| Bandwidth | $0.05 | $0.25 | WebSocket + API calls |
| **Payment Processing** | | | |
| Stripe fees | $0 | ~$3.50 | 3.5% of revenue |
| Chargebacks | $0 | $0.25 | 0.5% risk reserve |
| **Support** | | | |
| Support time | $0.20 | $1.00 | 10min/month avg |
| **Total Variable** | **$0.50** | **$6.25** | Per user per month |

### Cost Per Signal

```
Direct Costs:
- Broker API call: $0.0000 (free for retail)
- Compute processing: $0.0003
- Database write: $0.0002
- WebSocket broadcast: $0.0001
- Total: $0.0006

With Overhead:
- Support allocation: $0.0004
- Infrastructure buffer: $0.0001
- Total with overhead: $0.0011

Rounded for pricing: $0.001 per signal
```

---

## 2. Revenue Model

### Subscription Pricing Tiers

| Tier | Monthly Price | Annual Price | Annual Discount |
|------|---------------|--------------|-----------------|
| **Community** | | | |
| Free | $0 | $0 | N/A |
| Professional | $99 | $950 | 20% |
| Enterprise | $299 | $2,870 | 20% |
| **Trader** | | | |
| Free | $0 | $0 | N/A |
| Professional | $49 | $470 | 20% |
| Elite | $149 | $1,430 | 20% |

### Overage Revenue

```
Overage Rate: $0.01 per signal over limit
Expected overage revenue: 5-10% of subscription revenue

Example:
- User on $49 plan (100 signals/day limit)
- Uses 150 signals/day for 10 days
- Overage: 50 × 10 = 500 signals × $0.01 = $5
```

### Revenue Mix Projections

| User Segment | % of Paid Users | ARPU | Revenue Share |
|--------------|-----------------|------|---------------|
| Community Free | N/A | $0 | 0% |
| Community Pro | 15% | $99 | 20% |
| Community Enterprise | 5% | $299 | 20% |
| Trader Free | N/A | $0 | 0% |
| Trader Pro | 60% | $49 | 40% |
| Trader Elite | 20% | $149 | 40% |
| **Blended ARPU** | **100%** | **$74** | **100%** |

---

## 3. Customer Acquisition Cost (CAC)

### Channel-Specific CAC

| Channel | Cost per Acquisition | % of Acquisitions | Weighted CAC |
|---------|---------------------|-------------------|--------------|
| **Organic** | | | |
| SEO/Content | $25 | 30% | $7.50 |
| Discord partnerships | $30 | 25% | $7.50 |
| Word-of-mouth | $10 | 15% | $1.50 |
| **Paid** | | | |
| Google Ads | $150 | 15% | $22.50 |
| Social Media | $100 | 10% | $10.00 |
| Influencers | $75 | 5% | $3.75 |
| **Blended CAC** | **$52.75** | **100%** | **$52.75** |

### CAC Payback Period

| Tier | Monthly Revenue | CAC | Payback (Months) |
|------|-----------------|-----|------------------|
| Community Pro | $99 | $52.75 | 0.53 |
| Community Enterprise | $299 | $52.75 | 0.18 |
| Trader Pro | $49 | $52.75 | 1.08 |
| Trader Elite | $149 | $52.75 | 0.35 |
| **Blended Average** | **$74** | **$52.75** | **0.71** |

---

## 4. Lifetime Value (LTV) Calculations

### Churn & Retention Assumptions

| Metric | Free Users | Paid Users | Notes |
|--------|------------|------------|-------|
| Monthly Churn | N/A | 5% | Industry: 3-7% |
| Annual Churn | N/A | 46% | Compounded monthly |
| Avg Lifetime | N/A | 20 months | 1/0.05 |
| 6-Month Retention | N/A | 74% | (1-0.05)^6 |
| 12-Month Retention | N/A | 54% | (1-0.05)^12 |

### LTV by Customer Segment

| Segment | ARPU | Lifetime (months) | Gross Margin | LTV | LTV/CAC |
|---------|------|-------------------|--------------|-----|---------|
| Community Pro | $99 | 20 | 85% | $1,683 | 31.9x |
| Community Enterprise | $299 | 24 | 89% | $6,394 | 121.2x |
| Trader Pro | $49 | 18 | 87% | $767 | 14.5x |
| Trader Elite | $149 | 20 | 92% | $2,741 | 52.0x |
| **Blended** | **$74** | **20** | **88%** | **$1,302** | **24.7x** |

**Target LTV/CAC: >3:1** ✅ All segments exceed target by wide margin

---

## 5. Gross Margin Analysis

### Margin by Tier

| Tier | Revenue | Direct Costs | Gross Profit | Margin % |
|------|---------|--------------|--------------|----------|
| **Community Pro** | $99 | $14.85 | $84.15 | 85% |
| Stripe fees | | $3.47 | | |
| Infrastructure | | $8.00 | | |
| Support | | $3.00 | | |
| Chargebacks | | $0.38 | | |
| **Community Enterprise** | $299 | $32.44 | $266.56 | 89% |
| Stripe fees | | $10.47 | | |
| Infrastructure | | $18.00 | | |
| Support | | $3.50 | | |
| Chargebacks | | $0.47 | | |
| **Trader Pro** | $49 | $6.37 | $42.63 | 87% |
| Stripe fees | | $1.72 | | |
| Infrastructure | | $3.50 | | |
| Support | | $1.00 | | |
| Chargebacks | | $0.15 | | |
| **Trader Elite** | $149 | $11.72 | $137.28 | 92% |
| Stripe fees | | $5.22 | | |
| Infrastructure | | $5.00 | | |
| Support | | $1.25 | | |
| Chargebacks | | $0.25 | | |

---

## 6. Break-Even Analysis

### Monthly Break-Even Calculation

```
Fixed Costs: $190/month
Average Gross Margin: 88%
Contribution per user: $74 × 0.88 = $65.12

Break-even users = $190 / $65.12 = 2.9 users
Break-even MRR = 3 users × $74 = $222
```

### Growth to Break-Even

| Month | Free Users | Paid Users | MRR | Cumulative Loss | Status |
|-------|------------|------------|-----|-----------------|--------|
| 1 | 50 | 0 | $0 | -$215 | Pre-revenue |
| 2 | 100 | 2 | $148 | -$272 | Below break-even |
| 3 | 200 | 5 | $370 | -$82 | **Break-even** ✅ |
| 4 | 400 | 12 | $888 | +$616 | Profitable |
| 5 | 800 | 28 | $2,072 | +$2,440 | Scaling |
| 6 | 1,500 | 60 | $4,440 | +$6,347 | Growth |

---

## 7. Scenario Analysis

### Conservative Scenario (Pessimistic)

**Assumptions:**
- 3% free-to-paid conversion
- $60 blended ARPU
- 7% monthly churn
- $75 CAC

**Year 1 Results:**
- Month 12 users: 200 paid
- MRR: $12,000
- Annual Revenue: $144,000
- Gross Margin: 82%
- LTV/CAC: 10.3x

### Base Case Scenario (Realistic)

**Assumptions:**
- 5% free-to-paid conversion
- $74 blended ARPU
- 5% monthly churn
- $52.75 CAC

**Year 1 Results:**
- Month 12 users: 500 paid
- MRR: $37,000
- Annual Revenue: $444,000
- Gross Margin: 88%
- LTV/CAC: 24.7x

### Optimistic Scenario

**Assumptions:**
- 7% free-to-paid conversion
- $85 blended ARPU
- 4% monthly churn
- $40 CAC

**Year 1 Results:**
- Month 12 users: 1,000 paid
- MRR: $85,000
- Annual Revenue: $1,020,000
- Gross Margin: 90%
- LTV/CAC: 47.8x

---

## 8. Key Metrics Dashboard

### SaaS Metrics Targets

| Metric | Target | Current Model | Status |
|--------|--------|---------------|--------|
| **Growth** | | | |
| MRR Growth Rate | >20% M/M | Projected 35% | ✅ |
| Logo Retention | >90% | 95% monthly | ✅ |
| Net Revenue Retention | >100% | 110% (expansion) | ✅ |
| **Unit Economics** | | | |
| LTV/CAC Ratio | >3:1 | 24.7:1 | ✅ |
| CAC Payback | <12 months | 0.71 months | ✅ |
| Gross Margin | >70% | 88% | ✅ |
| **Efficiency** | | | |
| Magic Number | >1.0 | 1.8 | ✅ |
| Quick Ratio | >4.0 | 5.2 | ✅ |
| Burn Multiple | <1.0 | 0.3 | ✅ |

### Quick Ratio Calculation

```
Quick Ratio = (New MRR + Expansion MRR) / (Churned MRR + Contraction MRR)

Example Month:
- New MRR: $5,000
- Expansion MRR: $500
- Churned MRR: $800
- Contraction MRR: $250

Quick Ratio = ($5,000 + $500) / ($800 + $250) = 5.24
```

---

## 9. Sensitivity Analysis

### Impact of Key Variables

| Variable | Base Case | -20% | +20% | Impact on LTV/CAC |
|----------|-----------|------|------|-------------------|
| **ARPU** | $74 | $59 | $89 | -20% / +20% |
| **Churn Rate** | 5% | 4% | 6% | +25% / -17% |
| **CAC** | $52.75 | $42 | $63 | +25% / -17% |
| **Gross Margin** | 88% | 70% | 95% | -20% / +8% |
| **Conversion Rate** | 5% | 4% | 6% | -20% / +20% |

### Break Points

- **Maximum sustainable churn:** 12% monthly (LTV/CAC = 3:1)
- **Minimum viable ARPU:** $25 (break-even at current CAC)
- **Maximum tolerable CAC:** $434 (at current LTV)
- **Minimum gross margin:** 60% (industry standard)

---

## 10. Investment & Funding Requirements

### Capital Requirements (Year 1)

| Category | Amount | Notes |
|----------|--------|-------|
| **Pre-Revenue (Months 1-3)** | | |
| Development | $15,000 | MVP completion |
| Infrastructure | $600 | Setup costs |
| Marketing | $2,000 | Initial campaigns |
| Operations | $3,000 | Legal, accounting |
| **Subtotal** | **$20,600** | |
| **Growth Phase (Months 4-12)** | | |
| Customer Acquisition | $26,375 | 500 customers @ $52.75 |
| Infrastructure scaling | $5,000 | Committed use discounts |
| Team (part-time) | $30,000 | Support + development |
| Marketing/Content | $10,000 | SEO, partnerships |
| **Subtotal** | **$71,375** | |
| **Total Year 1** | **$91,975** | |
| **Buffer (30%)** | **$27,593** | |
| **Total Funding Need** | **$120,000** | Round to $125k |

### Return on Investment

**At Month 12 (Base Case):**
- MRR: $37,000
- Annual Run Rate: $444,000
- Enterprise Value (5x ARR): $2,220,000
- ROI: 1,776% (18.8x)

---

## Conclusion

The unit economics model demonstrates exceptional financial viability:

1. **Strong Margins:** 88% gross margin exceeds SaaS benchmarks
2. **Rapid Payback:** <1 month CAC recovery is exceptional
3. **High LTV/CAC:** 24.7x ratio indicates efficient growth potential
4. **Low Break-Even:** Only 3 paying customers needed
5. **Capital Efficient:** $120k can fund to $450k ARR

**Key Risks:**
- Churn rate assumptions (5% monthly) need validation
- CAC may increase with competition
- Infrastructure costs could scale non-linearly

**Recommendations:**
1. Start with conservative pricing to validate model
2. Focus on organic growth channels (lowest CAC)
3. Monitor cohort retention closely
4. Optimize for gross margin above growth initially
5. Raise $125-150k seed round for 18-month runway

---

**Model Version:** 1.0
**Last Updated:** October 19, 2025
**Next Review:** Post 100 customers