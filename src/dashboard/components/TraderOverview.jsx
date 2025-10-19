import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Activity, Users, DollarSign, BarChart3 } from 'lucide-react';

/**
 * TraderOverview Component
 *
 * Personal trader overview displaying P&L metrics, active positions,
 * execution rates, followed providers, and recent trades.
 *
 * Features:
 * - Personal P&L cards (today, week, month, total)
 * - Active positions count
 * - Execution rate metrics
 * - Top followed providers list
 * - Recent trades widget
 * - Empty state with onboarding guide (for new users)
 *
 * API Endpoints:
 * - GET /api/trader/overview - Fetches personal trading overview data
 *
 * Usage:
 * import { TraderOverview } from './components/TraderOverview';
 * <TraderOverview />
 */
export function TraderOverview() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/trader/overview');
      const data = await response.json();

      if (data.success) {
        setOverview(data.data);
      } else {
        setError(data.error || 'Failed to fetch overview data');
      }
    } catch (err) {
      console.error('Overview fetch error:', err);
      setError('Failed to load trading overview');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="text-muted-foreground">Loading your trading overview...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4" role="alert">
        <div className="text-destructive">{error}</div>
        <Button onClick={fetchOverview} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  // Empty state - New user onboarding
  if (!overview || overview.isEmpty) {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Welcome to Trading!</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Get started by following signal providers and connecting your broker to begin automated trading.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button>Browse Signal Providers</Button>
                <Button variant="outline">Connect Broker</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Onboarding checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started Checklist</CardTitle>
            <CardDescription>Complete these steps to start trading</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                <span className="text-sm">Connect your broker account</span>
              </div>
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                <span className="text-sm">Configure risk management settings</span>
              </div>
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                <span className="text-sm">Follow your first signal provider</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* P&L Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Profit and Loss Overview">
        {/* Today P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${overview.pnl.today >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
            >
              {overview.pnl.today >= 0 ? '+' : ''}${overview.pnl.today.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {overview.pnl.today >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(overview.pnl.todayPercent).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Week P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Week P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${overview.pnl.week >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
            >
              {overview.pnl.week >= 0 ? '+' : ''}${overview.pnl.week.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {overview.pnl.week >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(overview.pnl.weekPercent).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Month P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Month P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${overview.pnl.month >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
            >
              {overview.pnl.month >= 0 ? '+' : ''}${overview.pnl.month.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {overview.pnl.month >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(overview.pnl.monthPercent).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Total P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${overview.pnl.total >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
            >
              {overview.pnl.total >= 0 ? '+' : ''}${overview.pnl.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="region" aria-label="Trading Statistics">
        {/* Active Positions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{overview.activePositions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ${overview.totalPositionValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} total value
            </p>
          </CardContent>
        </Card>

        {/* Execution Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Execution Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{overview.executionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview.executedSignals} / {overview.totalSignals} signals executed
            </p>
          </CardContent>
        </Card>

        {/* Followed Providers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Following
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{overview.followedProviders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Signal providers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Followed Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Followed Providers</CardTitle>
            <CardDescription>Your top signal providers by performance</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.followedProviders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-3">You're not following any providers yet</p>
                <Button size="sm" variant="outline">
                  Browse Providers
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.followedProviders.slice(0, 5).map(provider => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">{provider.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {provider.signalsFollowed} signals • {provider.winRate}% win rate
                      </p>
                    </div>
                    <Badge variant={provider.pnl >= 0 ? 'profit' : 'loss'}>
                      {provider.pnl >= 0 ? '+' : ''}${provider.pnl.toFixed(2)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
            <CardDescription>Your latest trade executions</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentTrades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No trades executed yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.recentTrades.slice(0, 5).map(trade => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold font-mono">{trade.symbol}</h4>
                        <Badge variant={trade.side === 'BUY' ? 'profit' : 'outline'} className="text-xs">
                          {trade.side}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(trade.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">${trade.price.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">{trade.quantity} units</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TraderOverview;
