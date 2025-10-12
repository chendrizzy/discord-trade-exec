import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Users, DollarSign, TrendingUp, Activity, Crown } from 'lucide-react';

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAdminStats();
  }, []);

  const fetchAdminStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error || 'Failed to fetch admin statistics');
      }
    } catch (err) {
      console.error('Admin stats error:', err);
      setError('Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">No data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-gold-500" />
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <Badge variant="gold">Owner Access</Badge>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {stats.users.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.users.activeSubscribers} active subscribers
            </p>
          </CardContent>
        </Card>

        {/* MRR */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated MRR
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-profit-text">
              ${stats.revenue.estimatedMRR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${stats.revenue.averageRevenuePerUser}/user
            </p>
          </CardContent>
        </Card>

        {/* Platform Trades */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Trades
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {stats.platform.totalTrades.toLocaleString()}
            </div>
            <p className="text-xs text-profit-text mt-1">
              {stats.platform.winRate} win rate
            </p>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active (7d)
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {stats.activity.activeUsers7Days}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.activity.activityRate7d}% of total users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown by Tier</CardTitle>
          <CardDescription>
            Monthly recurring revenue by subscription tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.revenue.breakdown).map(([tier, data]) => (
              <div key={tier} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold capitalize">{tier} Tier</h4>
                  <p className="text-xs text-muted-foreground">
                    {data.subscribers} subscriber{data.subscribers !== 1 ? 's' : ''} × ${data.pricePerMonth}/mo
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-profit-text">
                    ${data.monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">per month</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>User Distribution</CardTitle>
            <CardDescription>
              Users by subscription tier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.users.byTier).map(([tier, count]) => (
                <div key={tier} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={tier === 'free' ? 'outline' : 'profit'} className="capitalize">
                      {tier}
                    </Badge>
                  </div>
                  <div className="text-sm font-mono">
                    {count} user{count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Platform Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Trading Stats</CardTitle>
            <CardDescription>
              Aggregated trading performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Volume</span>
                <span className="text-sm font-mono">${stats.platform.totalVolume}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Net P&L</span>
                <span className={`text-sm font-mono ${parseFloat(stats.platform.totalProfitLoss) >= 0 ? 'text-profit-text' : 'text-loss-text'}`}>
                  {parseFloat(stats.platform.totalProfitLoss) >= 0 ? '+' : ''}${stats.platform.totalProfitLoss}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Winning Trades</span>
                <span className="text-sm font-mono text-profit-text">{stats.platform.winningTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Losing Trades</span>
                <span className="text-sm font-mono text-loss-text">{stats.platform.losingTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Fees</span>
                <span className="text-sm font-mono">${stats.platform.totalFees}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Traders */}
      <Card>
        <CardHeader>
          <CardTitle>Top Traders</CardTitle>
          <CardDescription>
            Most active users by trade volume
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.topTraders.map((trader, index) => (
              <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-gold-600 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-muted-foreground">#{index + 1}</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold">{trader.username}</h4>
                    <p className="text-xs text-muted-foreground">
                      {trader.totalTrades} trades • {trader.winRate}% win rate
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={trader.tier === 'premium' ? 'gold' : trader.tier === 'pro' ? 'profit' : 'outline'} className="capitalize mb-1">
                    {trader.tier}
                  </Badge>
                  <div className={`text-sm font-mono ${parseFloat(trader.netPL) >= 0 ? 'text-profit-text' : 'text-loss-text'}`}>
                    {parseFloat(trader.netPL) >= 0 ? '+' : ''}${trader.netPL}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Signups */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Signups (Last 7 Days)</CardTitle>
          <CardDescription>
            {stats.users.recentSignups} new users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.users.recentSignupsList.slice(0, 10).map((user) => (
              <div key={user._id} className="flex items-center justify-between p-2 border border-border rounded">
                <span className="text-sm">{user.discordUsername}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{user.subscription.tier}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
