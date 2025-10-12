# Implement Analytics Platform (P1 - High Impact)

## Overview

**Priority**: P1 - High Impact
**Timeline**: 3-4 weeks
**Effort**: 180 hours
**Dependencies**: Real-time Infrastructure (WebSocket for live metrics)

Build comprehensive SaaS analytics dashboard with user cohort analysis, churn prediction, and revenue intelligence (MRR, ARR, LTV, CAC).

---

## Business Justification

**Critical for SaaS Success**:
- Data-driven pricing optimization
- Proactive churn prevention (identify at-risk users)
- Marketing ROI measurement
- Investor-grade metrics dashboard

**Current Blindspots**:
- ❌ No cohort retention tracking
- ❌ No churn prediction model
- ❌ No LTV calculations
- ❌ No automated retention campaigns

**Impact**:
- Reduce churn by 15-20% (proactive interventions)
- Optimize pricing based on LTV data
- Improve marketing spend efficiency

---

## Core Components

### 1. User Cohort Analysis

```javascript
// src/services/analytics/cohort-analysis.js
class CohortAnalyzer {
  async generateCohortReport(startDate, endDate) {
    // Group users by signup month
    const cohorts = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          users: { $push: '$_id' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate retention for each cohort
    const retentionData = await Promise.all(
      cohorts.map(async (cohort) => {
        const retentionByMonth = await this.calculateRetention(
          cohort.users,
          cohort._id
        );

        return {
          cohort: `${cohort._id.year}-${cohort._id.month}`,
          size: cohort.count,
          retention: retentionByMonth
        };
      })
    );

    return retentionData;
  }

  async calculateRetention(userIds, cohortDate) {
    const retention = [];

    for (let month = 0; month <= 12; month++) {
      const targetDate = new Date(cohortDate.year, cohortDate.month + month - 1);

      const activeUsers = await User.countDocuments({
        _id: { $in: userIds },
        'subscription.status': 'active',
        'subscription.lastPayment': {
          $gte: targetDate,
          $lt: new Date(targetDate.getFullYear(), targetDate.getMonth() + 1)
        }
      });

      retention.push({
        month,
        active: activeUsers,
        rate: (activeUsers / userIds.length * 100).toFixed(1)
      });
    }

    return retention;
  }
}
```

### 2. Churn Prediction Model

```javascript
// src/services/analytics/churn-prediction.js
class ChurnPredictor {
  calculateChurnRisk(user) {
    const features = this.extractFeatures(user);
    const riskScore = this.computeRiskScore(features);

    return {
      userId: user.id,
      riskScore, // 0-100
      riskLevel: this.getRiskLevel(riskScore),
      factors: this.identifyRiskFactors(features),
      recommendations: this.getRetentionRecommendations(riskScore, features)
    };
  }

  extractFeatures(user) {
    return {
      daysSinceSignup: Math.floor(
        (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24)
      ),
      tradeCount: user.stats.totalTrades || 0,
      lastTradeDate: user.stats.lastTrade,
      daysSinceLastTrade: user.stats.lastTrade
        ? Math.floor((Date.now() - user.stats.lastTrade) / (1000 * 60 * 60 * 24))
        : null,
      winRate: user.stats.winRate || 0,
      totalProfit: user.stats.totalProfit || 0,
      subscriptionTier: user.subscription.tier,
      lastLoginDate: user.lastLogin,
      daysSinceLastLogin: Math.floor(
        (Date.now() - user.lastLogin) / (1000 * 60 * 60 * 24)
      ),
      supportTickets: user.supportTickets?.length || 0,
      brokerConnectionIssues: user.brokerConnections.filter(c => c.status === 'error').length
    };
  }

  computeRiskScore(features) {
    let score = 0;

    // Days since last trade (35% weight)
    if (features.daysSinceLastTrade > 30) score += 35;
    else if (features.daysSinceLastTrade > 14) score += 25;
    else if (features.daysSinceLastTrade > 7) score += 15;

    // Low win rate (25% weight)
    if (features.winRate < 30) score += 25;
    else if (features.winRate < 45) score += 15;

    // Days since last login (20% weight)
    if (features.daysSinceLastLogin > 14) score += 20;
    else if (features.daysSinceLastLogin > 7) score += 10;

    // Broker connection issues (10% weight)
    if (features.brokerConnectionIssues > 0) score += 10;

    // Negative profit (10% weight)
    if (features.totalProfit < -1000) score += 10;
    else if (features.totalProfit < 0) score += 5;

    return Math.min(score, 100);
  }

  getRiskLevel(score) {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  identifyRiskFactors(features) {
    const factors = [];

    if (features.daysSinceLastTrade > 14) {
      factors.push({ factor: 'Inactive trading', severity: 'high' });
    }

    if (features.winRate < 45) {
      factors.push({ factor: 'Low win rate', severity: 'medium' });
    }

    if (features.daysSinceLastLogin > 7) {
      factors.push({ factor: 'Low engagement', severity: 'medium' });
    }

    if (features.brokerConnectionIssues > 0) {
      factors.push({ factor: 'Technical issues', severity: 'high' });
    }

    return factors;
  }

  getRetentionRecommendations(riskScore, features) {
    const recommendations = [];

    if (riskScore >= 70) {
      recommendations.push('Send personalized win-back email with 20% discount');
      recommendations.push('Schedule customer success call');
    }

    if (features.daysSinceLastTrade > 14) {
      recommendations.push('Send signal performance highlight email');
      recommendations.push('Offer free trial of premium signals');
    }

    if (features.winRate < 45) {
      recommendations.push('Suggest risk management webinar');
      recommendations.push('Offer portfolio review by expert');
    }

    if (features.brokerConnectionIssues > 0) {
      recommendations.push('Proactive tech support outreach');
    }

    return recommendations;
  }
}
```

### 3. Revenue Intelligence Dashboard

```javascript
// src/services/analytics/revenue-intelligence.js
class RevenueIntelligence {
  async calculateMetrics(startDate, endDate) {
    const subscriptions = await User.find({
      'subscription.status': { $in: ['active', 'canceled'] },
      createdAt: { $gte: startDate, $lte: endDate }
    });

    return {
      mrr: this.calculateMRR(subscriptions),
      arr: this.calculateARR(subscriptions),
      ltv: await this.calculateLTV(),
      cac: await this.calculateCAC(startDate, endDate),
      churnRate: await this.calculateChurnRate(startDate, endDate),
      netRevenue: await this.calculateNetRevenue(startDate, endDate)
    };
  }

  calculateMRR(subscriptions) {
    const activeSubscriptions = subscriptions.filter(
      sub => sub.subscription.status === 'active'
    );

    const monthlyRevenue = activeSubscriptions.reduce((sum, sub) => {
      const tierPricing = { basic: 49, pro: 99, premium: 299 };
      return sum + tierPricing[sub.subscription.tier];
    }, 0);

    return {
      current: monthlyRevenue,
      growth: this.calculateMRRGrowth(monthlyRevenue),
      byTier: this.breakdownByTier(activeSubscriptions)
    };
  }

  calculateARR(subscriptions) {
    const mrr = this.calculateMRR(subscriptions);
    return {
      current: mrr.current * 12,
      projected: this.projectARR(mrr.current, mrr.growth)
    };
  }

  async calculateLTV() {
    // LTV = Average Revenue Per User × Average Customer Lifetime
    const avgMonthlyRevenue = await this.getAverageMonthlyRevenue();
    const avgLifetimeMonths = await this.getAverageLifetimeMonths();

    return {
      perUser: avgMonthlyRevenue * avgLifetimeMonths,
      byTier: await this.calculateLTVByTier()
    };
  }

  async calculateCAC(startDate, endDate) {
    // CAC = Total Marketing Spend / New Customers Acquired
    const marketingSpend = await MarketingCampaign.aggregate([
      {
        $match: { date: { $gte: startDate, $lte: endDate } }
      },
      {
        $group: { _id: null, total: { $sum: '$spend' } }
      }
    ]);

    const newCustomers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    return {
      total: marketingSpend[0].total / newCustomers,
      byChannel: await this.calculateCACByChannel(startDate, endDate)
    };
  }
}
```

---

## Admin Dashboard UI

```jsx
// src/dashboard/pages/AdminAnalytics.jsx
const AdminAnalytics = () => {
  const [metrics, setMetrics] = useState(null);
  const [cohortData, setCohortData] = useState(null);
  const [churnRisks, setChurnRisks] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    const [metricsRes, cohortRes, churnRes] = await Promise.all([
      axios.get('/api/admin/analytics/revenue'),
      axios.get('/api/admin/analytics/cohorts'),
      axios.get('/api/admin/analytics/churn-risks')
    ]);

    setMetrics(metricsRes.data);
    setCohortData(cohortRes.data);
    setChurnRisks(churnRes.data);
  };

  return (
    <div className="admin-analytics">
      <h1>Business Intelligence Dashboard</h1>

      {/* Revenue Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="MRR"
          value={`$${metrics?.mrr.current.toLocaleString()}`}
          growth={metrics?.mrr.growth}
          icon="💰"
        />
        <MetricCard
          title="ARR"
          value={`$${metrics?.arr.current.toLocaleString()}`}
          icon="📈"
        />
        <MetricCard
          title="Average LTV"
          value={`$${metrics?.ltv.perUser.toFixed(0)}`}
          icon="⭐"
        />
        <MetricCard
          title="CAC"
          value={`$${metrics?.cac.total.toFixed(0)}`}
          ratio={metrics?.ltv.perUser / metrics?.cac.total}
          icon="📊"
        />
      </div>

      {/* Cohort Analysis */}
      <div className="cohort-section">
        <h2>Cohort Retention Analysis</h2>
        <CohortTable data={cohortData} />
      </div>

      {/* Churn Risk */}
      <div className="churn-section">
        <h2>High Churn Risk Users</h2>
        <ChurnRiskTable users={churnRisks.filter(u => u.riskLevel === 'critical')} />
      </div>
    </div>
  );
};
```

---

## Automated Retention Campaigns

```javascript
// src/services/marketing/retention-automation.js
class RetentionAutomation {
  async runDailyChurnPrevention() {
    // Identify high-risk users
    const highRiskUsers = await User.find({
      'analytics.churnRisk': { $gte: 70 },
      'subscription.status': 'active'
    });

    for (const user of highRiskUsers) {
      const prediction = churnPredictor.calculateChurnRisk(user);

      // Execute retention strategy
      if (prediction.riskScore >= 80) {
        await this.sendWinbackEmail(user, prediction);
        await this.scheduleSuccessCall(user);
      } else if (prediction.riskScore >= 70) {
        await this.offerDiscount(user, 20);
        await this.sendEngagementEmail(user);
      }

      // Log intervention
      await this.logRetentionAction(user, prediction);
    }
  }

  async sendWinbackEmail(user, prediction) {
    await emailService.send({
      to: user.email,
      template: 'winback',
      data: {
        name: user.name,
        factors: prediction.factors,
        discount: 20
      }
    });
  }
}
```

---

## Success Criteria

- [ ] Cohort retention tracked for 12+ months
- [ ] Churn prediction accuracy >75%
- [ ] MRR/ARR/LTV calculated daily
- [ ] Automated retention campaigns reduce churn by 15%
- [ ] Admin dashboard shows real-time metrics
- [ ] LTV:CAC ratio >3:1
- [ ] 80% test coverage

---

**Document Status**: 🚀 Ready for Implementation
