import { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

// Lazy load chart component
const PortfolioSparkline = lazy(() => import('./PortfolioChart').then(mod => ({ default: mod.PortfolioSparkline })));

/**
 * Portfolio Overview Component with Real-Time Updates
 *
 * Features:
 * - Displays portfolio value, active bots, and 24h P&L
 * - Real-time updates via WebSocket subscription
 * - Connection status indicator
 * - Graceful fallback when disconnected
 */
export function PortfolioOverview() {
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const { connected, subscribe } = useWebSocketContext();

  // Initial portfolio data fetch
  useEffect(() => {
    setPortfolioLoading(true);
    fetch('/api/portfolio')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPortfolioData(data);
        }
        setPortfolioLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch portfolio data:', err);
        setPortfolioLoading(false);
      });
  }, []);

  // Subscribe to real-time portfolio updates
  useEffect(() => {
    if (!connected) {
      console.log('📊 Not subscribing to portfolio updates: WebSocket not connected');
      return;
    }

    console.log('📊 Subscribing to portfolio updates...');

    // Subscribe to portfolio update events
    const unsubscribe = subscribe('portfolio:update', data => {
      console.log('📊 Received portfolio update:', data);

      // Update portfolio state with new data
      setPortfolioData(prev => ({
        ...prev,
        success: true,
        portfolio: {
          ...prev?.portfolio,
          totalValue: data.totalValue,
          change24hPercent: data.change24hPercent,
          change24hValue: data.change24hValue
        },
        performance: {
          ...prev?.performance,
          totalPnL: data.totalPnL || prev?.performance?.totalPnL,
          winRate: data.winRate || prev?.performance?.winRate
        },
        bots: {
          ...prev?.bots,
          active: data.activeBots ?? prev?.bots?.active,
          total: data.totalBots ?? prev?.bots?.total,
          status: data.activeBots > 0 ? 'running' : 'paused'
        }
      }));
    });

    // Cleanup subscription on unmount or disconnect
    return () => {
      console.log('📊 Unsubscribing from portfolio updates');
      unsubscribe();
    };
  }, [connected, subscribe]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-5xl font-black tracking-tight">Portfolio Overview</h1>
          <p className="text-muted-foreground mt-3 text-lg">Monitor your trading performance and portfolio metrics</p>
        </div>
      </div>

      {/* KPI Stats - Clean sections without heavy card borders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="region" aria-label="Key Performance Indicators">
        {/* Portfolio Value - Clean stat block */}
        <div
          className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top"
          style={{ animationDelay: '0.1s' }}
          role="article"
          aria-labelledby="portfolio-value-title"
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              id="portfolio-value-title"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Portfolio Value
            </h3>
            <ConnectionStatusIndicator />
          </div>
          <div>
            <div className="text-4xl font-black text-foreground font-mono mb-1" aria-live="polite" aria-atomic="true">
              {portfolioLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : portfolioData ? (
                `$${portfolioData.portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                '$0.00'
              )}
            </div>
            <p
              className={`text-xs flex items-center gap-1 mt-1 mb-3 ${portfolioData?.portfolio.change24hPercent >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
              aria-label={`${portfolioData?.portfolio.change24hPercent >= 0 ? 'Up' : 'Down'} ${Math.abs(portfolioData?.portfolio.change24hPercent || 0).toFixed(2)}% today`}
            >
              <span aria-hidden="true">{portfolioData?.portfolio.change24hPercent >= 0 ? '▲' : '▼'}</span>
              <span>
                {portfolioData?.portfolio.change24hPercent >= 0 ? '+' : ''}
                {portfolioData?.portfolio.change24hPercent?.toFixed(2) || '0.00'}% today
              </span>
            </p>
            <Suspense
              fallback={
                <div className="h-12 flex items-center justify-center text-xs text-muted-foreground">
                  Loading chart...
                </div>
              }
            >
              <PortfolioSparkline />
            </Suspense>
          </div>
        </div>

        {/* Active Bots - Clean stat block */}
        <div
          className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top"
          style={{ animationDelay: '0.2s' }}
          role="article"
          aria-labelledby="active-bots-title"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 id="active-bots-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Bots
            </h3>
            <Badge
              variant={portfolioData?.bots.active > 0 ? 'profit' : 'outline'}
              className={`text-xs ${portfolioData?.bots.active > 0 ? 'animate-pulse-glow' : ''}`}
              aria-label={portfolioData?.bots.active > 0 ? 'Bots are running' : 'Bots paused'}
            >
              {portfolioData?.bots.status || 'paused'}
            </Badge>
          </div>
          <div>
            <div
              className="text-4xl font-black text-foreground font-mono mb-1"
              aria-label={`${portfolioData?.bots.active || 0} of ${portfolioData?.bots.total || 0} bots active`}
            >
              {portfolioLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                `${portfolioData?.bots.active || 0} / ${portfolioData?.bots.total || 0}`
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {portfolioData
                ? `${portfolioData.bots.total - portfolioData.bots.active} bot${portfolioData.bots.total - portfolioData.bots.active !== 1 ? 's' : ''} paused`
                : 'No bots configured'}
            </p>
          </div>
        </div>

        {/* 24h P&L - Clean stat block */}
        <div
          className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top"
          style={{ animationDelay: '0.3s' }}
          role="article"
          aria-labelledby="pnl-title"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 id="pnl-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              24h P&L
            </h3>
            <Badge
              variant={portfolioData?.performance.totalPnL >= 0 ? 'profit' : 'loss'}
              className={`text-xs ${portfolioData?.performance.totalPnL >= 0 ? 'animate-pulse-glow' : ''}`}
              aria-label={portfolioData?.performance.totalPnL >= 0 ? 'Profit status' : 'Loss status'}
            >
              {portfolioData?.performance.totalPnL >= 0 ? 'Profit' : 'Loss'}
            </Badge>
          </div>
          <div>
            <div
              className={`text-4xl font-black font-mono mb-1 ${portfolioData?.performance.totalPnL >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
              aria-label={`${portfolioData?.performance.totalPnL >= 0 ? 'Profit' : 'Loss'} of $${Math.abs(portfolioData?.performance.totalPnL || 0).toFixed(2)}`}
            >
              {portfolioLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : portfolioData ? (
                `${portfolioData.performance.totalPnL >= 0 ? '+' : ''}$${portfolioData.performance.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                '$0.00'
              )}
            </div>
            <p
              className={`text-xs flex items-center gap-1 mt-1 ${portfolioData?.performance.winRate >= 50 ? 'text-profit-text' : 'text-muted-foreground'}`}
              aria-label={`${portfolioData?.performance.winRate?.toFixed(1) || 0}% win rate`}
            >
              <span aria-hidden="true">{portfolioData?.performance.winRate >= 50 ? '▲' : '▼'}</span>
              <span>{portfolioData?.performance.winRate?.toFixed(1) || '0.0'}% Win Rate</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8" role="region" aria-label="Quick Actions">
        {/* Risk Management Card */}
        <Card
          className="shadow-lg border-2 hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 animate-fade-in"
          style={{ animationDelay: '0.4s' }}
          role="article"
          aria-labelledby="risk-management-title"
        >
          <CardHeader>
            <CardTitle id="risk-management-title">Risk Management</CardTitle>
            <CardDescription>Configure your trading risk parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" aria-label="Configure risk management settings">
              Configure
            </Button>
          </CardContent>
        </Card>

        {/* Exchange Connections Card */}
        <Card
          className="shadow-lg border-2 hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 animate-fade-in"
          style={{ animationDelay: '0.5s' }}
          role="article"
          aria-labelledby="exchange-connections-title"
        >
          <CardHeader>
            <CardTitle id="exchange-connections-title">Exchange Connections</CardTitle>
            <CardDescription>Manage your exchange API keys</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" role="list" aria-label="Exchange connection status">
              <div className="flex items-center justify-between" role="listitem">
                <span className="text-sm">Binance</span>
                <Badge variant="profit" aria-label="Binance connected">
                  Connected
                </Badge>
              </div>
              <div className="flex items-center justify-between" role="listitem">
                <span className="text-sm">Coinbase</span>
                <Badge variant="outline" aria-label="Coinbase disconnected">
                  Disconnected
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PortfolioOverview;
