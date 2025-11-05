import { useState, useEffect } from 'react';
import { debugLog, debugWarn } from '../utils/debug-logger';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { debugLog, debugWarn } from '../utils/debug-logger';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { LoadingSpinner, EmptyState } from './ui';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  RefreshCw,
  Calendar,
  BarChart3
} from 'lucide-react';

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [churnRisks, setChurnRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [metricsRes, risksRes] = await Promise.all([
        fetch('/api/analytics/dashboard'),
        fetch('/api/analytics/churn-risks')
      ]);

      const metricsData = await metricsRes.json();
      const risksData = await risksRes.json();

      if (metricsData.success) {
        setMetrics(metricsData.data);
        setLastUpdated(new Date());
      } else {
        setError(metricsData.error || 'Failed to fetch analytics');
      }

      if (risksData.success) {
        setChurnRisks(risksData.data || []);
      }
    } catch (err) {
      console.error('Analytics error:', err);
      setError('Failed to load analytics dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen text="Loading analytics..." />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to Load Analytics"
        description={error}
        icon={<AlertTriangle className="h-12 w-12" />}
        action={{
          label: "Try Again",
          onClick: fetchAnalytics
        }}
      />
    );
  }

  if (!metrics) {
    return (
      <EmptyState
        title="No Analytics Available"
        description="Analytics data is not available at this time. Try refreshing or come back later."
        icon={<BarChart3 className="h-12 w-12" />}
        action={{
          label: "Refresh",
          onClick: fetchAnalytics
        }}
      />
    );
  }

  const highRiskCount = churnRisks.filter(u => u.riskLevel === 'critical').length;
  const mediumRiskCount = churnRisks.filter(u => u.riskLevel === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-gold-500" />
          <h2 className="text-2xl font-bold">Business Analytics</h2>
          <Badge variant="gold">SaaS Metrics</Badge>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Button onClick={fetchAnalytics} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-profit-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-profit-text">
              ${metrics.revenue.mrr.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.revenue.mrr.subscriberCount} active subscribers
            </p>
          </CardContent>
        </Card>

        {/* ARR */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Annual Recurring Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-profit-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-profit-text">
              ${metrics.revenue.arr.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">MRR × 12 months</p>
          </CardContent>
        </Card>

        {/* LTV */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Customer Lifetime Value</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              ${metrics.revenue.ltv.perUser.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.revenue.ltv.avgLifetimeMonths.toFixed(1)} months avg
            </p>
          </CardContent>
        </Card>

        {/* Churn Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Churn Rate</CardTitle>
            {metrics.churn ? (
              <TrendingDown className="h-4 w-4 text-loss-text" />
            ) : (
              <Calendar className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            {metrics.churn ? (
              <>
                <div
                  className={`text-2xl font-bold font-mono ${metrics.churn.churnRate > 5 ? 'text-loss-text' : 'text-foreground'}`}
                >
                  {metrics.churn.churnRate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.churn.churned} of {metrics.churn.startSubscribers} churned
                </p>
              </>
            ) : (
              <>
                <div className="text-xl text-muted-foreground">N/A</div>
                <p className="text-xs text-muted-foreground mt-1">No period specified</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown by Tier */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown by Tier</CardTitle>
          <CardDescription>Monthly recurring revenue and subscriber distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(metrics.revenue.mrr.byTier).map(([tier, data]) => (
              <div
                key={tier}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-gold-500/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold capitalize">{tier}</h4>
                    <Badge
                      variant={tier === 'premium' ? 'gold' : tier === 'pro' ? 'profit' : 'outline'}
                      className="text-xs"
                    >
                      {data.count} subscriber{data.count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.count > 0 ? `$${(data.revenue / data.count).toFixed(2)} per subscriber` : 'No subscribers'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-profit-text">
                    ${data.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">per month</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscriber Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Subscriber Metrics</CardTitle>
            <CardDescription>Current subscriber distribution and status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Subscribers</span>
                <span className="text-2xl font-bold font-mono">{metrics.subscribers.active}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">Basic Tier</span>
                <span className="text-sm font-mono">{metrics.revenue.mrr.byTier.basic.count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pro Tier</span>
                <span className="text-sm font-mono">{metrics.revenue.mrr.byTier.pro.count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Premium Tier</span>
                <span className="text-sm font-mono">{metrics.revenue.mrr.byTier.premium.count}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Churn Risk Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Churn Risk Overview</CardTitle>
            <CardDescription>Users at risk of canceling subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium">Critical Risk</span>
                </div>
                <Badge variant="destructive" className="text-lg font-bold px-3">
                  {highRiskCount}
                </Badge>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">High Risk</span>
                </div>
                <span className="text-sm font-mono">{mediumRiskCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total At-Risk</span>
                <span className="text-sm font-mono">{churnRisks.length}</span>
              </div>
              {churnRisks.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    // TODO: Navigate to churn risk list
                    debugLog('Navigate to churn risk list');
                  }}
                >
                  View At-Risk Users
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical At-Risk Users Preview */}
      {highRiskCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Critical Risk Users
            </CardTitle>
            <CardDescription>Users with highest probability of churning - immediate action required</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {churnRisks
                .filter(u => u.riskLevel === 'critical')
                .slice(0, 5)
                .map(user => (
                  <div
                    key={user.userId}
                    className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5 hover:border-destructive/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">{user.username || 'Unknown User'}</h4>
                      <p className="text-xs text-muted-foreground">
                        Risk Score: {user.riskScore.toFixed(1)} •{user.recommendations.slice(0, 2).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Critical</Badge>
                      <Button size="sm" variant="outline">
                        Take Action
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            {highRiskCount > 5 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                + {highRiskCount - 5} more critical risk user{highRiskCount - 5 !== 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-profit-text">
                ${metrics.revenue.ltv.avgMonthlyRevenue.toFixed(2)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">Average Revenue Per User (ARPU)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono">{metrics.revenue.ltv.avgLifetimeMonths.toFixed(1)}</div>
              <p className="text-sm text-muted-foreground mt-2">Average Customer Lifetime (months)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-foreground">
                {((churnRisks.length / metrics.subscribers.active) * 100).toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground mt-2">At-Risk Subscriber Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
