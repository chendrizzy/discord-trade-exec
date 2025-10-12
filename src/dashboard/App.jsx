import { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Navigation } from './components/Navigation';

// Lazy load heavy components to reduce initial bundle size
const TradeHistoryTable = lazy(() => import('./components/TradeHistoryTable').then(mod => ({ default: mod.TradeHistoryTable })));
const PortfolioSparkline = lazy(() => import('./components/PortfolioChart').then(mod => ({ default: mod.PortfolioSparkline })));
const PortfolioChart = lazy(() => import('./components/PortfolioChart').then(mod => ({ default: mod.PortfolioChart })));
const PerformanceMetricsChart = lazy(() => import('./components/PortfolioChart').then(mod => ({ default: mod.PerformanceMetricsChart })));
const BotConfigWizard = lazy(() => import('./components/BotConfigWizard').then(mod => ({ default: mod.BotConfigWizard })));
const BrokerConfigWizard = lazy(() => import('./components/BrokerConfigWizard').then(mod => ({ default: mod.BrokerConfigWizard })));
const APIKeyManagement = lazy(() => import('./components/APIKeyManagement').then(mod => ({ default: mod.APIKeyManagement })));
const CommandPalette = lazy(() => import('./components/CommandPalette').then(mod => ({ default: mod.CommandPalette })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(mod => ({ default: mod.AdminDashboard })));

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  useEffect(() => {
    // Check authentication status
    fetch('/auth/status')
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to check auth status:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Fetch portfolio data when user is authenticated
    if (user) {
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
    }
  }, [user]);

  // Command Palette keyboard shortcut (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = () => {
    window.location.href = '/auth/discord';
  };

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  const handleCommandAction = (action) => {
    switch (action) {
      case 'create-bot':
        // Navigate to Bots tab and trigger bot creation
        setActiveTab('bots');
        break;
      case 'api-keys':
        // Navigate to Settings tab
        setActiveTab('settings');
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
        <div className="text-foreground text-xl" aria-label="Loading dashboard">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full" role="main" aria-labelledby="login-title">
          <CardHeader>
            <CardTitle id="login-title" className="text-3xl">Trading Bot Dashboard</CardTitle>
            <CardDescription>
              Connect your Discord account to access the trading dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="gold" className="w-full" onClick={handleLogin} aria-label="Login with Discord to access dashboard">
              Login with Discord
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Responsive Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={`${user.username}#${user.discriminator}`}
        onLogout={handleLogout}
        user={user}
      />

      {/* Main Content - Adjusted for sidebar and mobile nav */}
      <main className="pt-[192px] pb-32 md:pt-0 md:pb-0 md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Tab Content - Controlled by Navigation state */}
        <div className="space-y-10">
          {activeTab === 'overview' && (
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
              <div className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top" style={{ animationDelay: '0.1s' }} role="article" aria-labelledby="portfolio-value-title">
                <div className="flex items-center justify-between mb-3">
                  <h3 id="portfolio-value-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Portfolio Value
                  </h3>
                  <Badge variant="info" className="animate-pulse-glow text-xs" aria-label="Live data">Live</Badge>
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
                  <p className={`text-xs flex items-center gap-1 mt-1 mb-3 ${portfolioData?.portfolio.change24hPercent >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                     aria-label={`${portfolioData?.portfolio.change24hPercent >= 0 ? 'Up' : 'Down'} ${Math.abs(portfolioData?.portfolio.change24hPercent || 0).toFixed(2)}% today`}>
                    <span aria-hidden="true">{portfolioData?.portfolio.change24hPercent >= 0 ? '▲' : '▼'}</span>
                    <span>{portfolioData?.portfolio.change24hPercent >= 0 ? '+' : ''}{portfolioData?.portfolio.change24hPercent?.toFixed(2) || '0.00'}% today</span>
                  </p>
                  <Suspense fallback={<div className="h-12 flex items-center justify-center text-xs text-muted-foreground">Loading chart...</div>}>
                    <PortfolioSparkline />
                  </Suspense>
                </div>
              </div>

              {/* Active Bots - Clean stat block */}
              <div className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top" style={{ animationDelay: '0.2s' }} role="article" aria-labelledby="active-bots-title">
                <div className="flex items-center justify-between mb-3">
                  <h3 id="active-bots-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Active Bots
                  </h3>
                  <Badge
                    variant={portfolioData?.bots.active > 0 ? 'profit' : 'outline'}
                    className={`text-xs ${portfolioData?.bots.active > 0 ? 'animate-pulse-glow' : ''}`}
                    aria-label={portfolioData?.bots.active > 0 ? 'Bots are running' : 'Bots paused'}>
                    {portfolioData?.bots.status || 'paused'}
                  </Badge>
                </div>
                <div>
                  <div className="text-4xl font-black text-foreground font-mono mb-1" aria-label={`${portfolioData?.bots.active || 0} of ${portfolioData?.bots.total || 0} bots active`}>
                    {portfolioLoading ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : (
                      `${portfolioData?.bots.active || 0} / ${portfolioData?.bots.total || 0}`
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {portfolioData ? `${portfolioData.bots.total - portfolioData.bots.active} bot${portfolioData.bots.total - portfolioData.bots.active !== 1 ? 's' : ''} paused` : 'No bots configured'}
                  </p>
                </div>
              </div>

              {/* 24h P&L - Clean stat block */}
              <div className="p-6 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all duration-200 animate-slide-in-from-top" style={{ animationDelay: '0.3s' }} role="article" aria-labelledby="pnl-title">
                <div className="flex items-center justify-between mb-3">
                  <h3 id="pnl-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    24h P&L
                  </h3>
                  <Badge
                    variant={portfolioData?.performance.totalPnL >= 0 ? 'profit' : 'loss'}
                    className={`text-xs ${portfolioData?.performance.totalPnL >= 0 ? 'animate-pulse-glow' : ''}`}
                    aria-label={portfolioData?.performance.totalPnL >= 0 ? 'Profit status' : 'Loss status'}>
                    {portfolioData?.performance.totalPnL >= 0 ? 'Profit' : 'Loss'}
                  </Badge>
                </div>
                <div>
                  <div className={`text-4xl font-black font-mono mb-1 ${portfolioData?.performance.totalPnL >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                       aria-label={`${portfolioData?.performance.totalPnL >= 0 ? 'Profit' : 'Loss'} of $${Math.abs(portfolioData?.performance.totalPnL || 0).toFixed(2)}`}>
                    {portfolioLoading ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : portfolioData ? (
                      `${portfolioData.performance.totalPnL >= 0 ? '+' : ''}$${portfolioData.performance.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    ) : (
                      '$0.00'
                    )}
                  </div>
                  <p className={`text-xs flex items-center gap-1 mt-1 ${portfolioData?.performance.winRate >= 50 ? 'text-profit-text' : 'text-muted-foreground'}`}
                     aria-label={`${portfolioData?.performance.winRate?.toFixed(1) || 0}% win rate`}>
                    <span aria-hidden="true">{portfolioData?.performance.winRate >= 50 ? '▲' : '▼'}</span>
                    <span>{portfolioData?.performance.winRate?.toFixed(1) || '0.0'}% Win Rate</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8" role="region" aria-label="Quick Actions">
              {/* Risk Management Card */}
              <Card className="shadow-lg border-2 hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 animate-fade-in" style={{ animationDelay: '0.4s' }} role="article" aria-labelledby="risk-management-title">
                <CardHeader>
                  <CardTitle id="risk-management-title">Risk Management</CardTitle>
                  <CardDescription>
                    Configure your trading risk parameters
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" aria-label="Configure risk management settings">
                    Configure
                  </Button>
                </CardContent>
              </Card>

              {/* Exchange Connections Card */}
              <Card className="shadow-lg border-2 hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 animate-fade-in" style={{ animationDelay: '0.5s' }} role="article" aria-labelledby="exchange-connections-title">
                <CardHeader>
                  <CardTitle id="exchange-connections-title">Exchange Connections</CardTitle>
                  <CardDescription>
                    Manage your exchange API keys
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2" role="list" aria-label="Exchange connection status">
                    <div className="flex items-center justify-between" role="listitem">
                      <span className="text-sm">Binance</span>
                      <Badge variant="profit" aria-label="Binance connected">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between" role="listitem">
                      <span className="text-sm">Coinbase</span>
                      <Badge variant="outline" aria-label="Coinbase disconnected">Disconnected</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trade History Table */}
            <Card className="shadow-lg border-2">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Recent Trades</CardTitle>
                <CardDescription className="text-base">
                  Your trading activity with sorting and filtering
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading trade history...</div>}>
                  <TradeHistoryTable />
                </Suspense>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'bots' && (
            <div className="space-y-4">
            <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle>Bot Management</CardTitle>
                <CardDescription>
                  Configure and monitor your trading bots
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-96 flex items-center justify-center text-sm text-muted-foreground">Loading bot configuration...</div>}>
                  <BotConfigWizard />
                </Suspense>
              </CardContent>
            </Card>

            {/* Active Bots List */}
            <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }} role="region" aria-labelledby="active-bots-list-title">
              <CardHeader>
                <CardTitle id="active-bots-list-title">Active Bots</CardTitle>
                <CardDescription>
                  Your currently running trading bots
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3" role="list" aria-label="Trading bots list">
                  {/* Example bot entries */}
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-gold-600 transition-all duration-200 animate-fade-in" style={{ animationDelay: '0.3s' }} role="listitem" aria-label="BTC DCA Bot, Conservative strategy, BTC/USDT pair, Running, Profit $234.56">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">BTC DCA Bot</h4>
                      <p className="text-xs text-muted-foreground">BTC/USDT • Conservative</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-mono text-profit-text" aria-label="24 hour profit and loss">+$234.56</div>
                        <div className="text-xs text-muted-foreground" aria-hidden="true">24h P&L</div>
                      </div>
                      <Badge variant="profit" className="animate-pulse-glow" aria-label="Bot is running">Running</Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-gold-600 transition-all duration-200 animate-fade-in" style={{ animationDelay: '0.4s' }} role="listitem" aria-label="ETH Grid Bot, Moderate strategy, ETH/USDT pair, Running, Profit $89.12">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">ETH Grid Bot</h4>
                      <p className="text-xs text-muted-foreground">ETH/USDT • Moderate</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-mono text-profit-text" aria-label="24 hour profit and loss">+$89.12</div>
                        <div className="text-xs text-muted-foreground" aria-hidden="true">24h P&L</div>
                      </div>
                      <Badge variant="profit" className="animate-pulse-glow" aria-label="Bot is running">Running</Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-border rounded-lg opacity-60 transition-all duration-200 animate-fade-in" style={{ animationDelay: '0.5s' }} role="listitem" aria-label="SOL Trend Bot, Aggressive strategy, SOL/USDT pair, Paused, No trading activity">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">SOL Trend Bot</h4>
                      <p className="text-xs text-muted-foreground">SOL/USDT • Aggressive</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-mono text-muted-foreground" aria-label="24 hour profit and loss">$0.00</div>
                        <div className="text-xs text-muted-foreground" aria-hidden="true">24h P&L</div>
                      </div>
                      <Badge variant="outline" aria-label="Bot is paused">Paused</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-4">
            {/* Portfolio Performance Chart */}
            <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle>Portfolio Performance</CardTitle>
                <CardDescription>
                  30-day portfolio value history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading portfolio chart...</div>}>
                  <PortfolioChart />
                </Suspense>
              </CardContent>
            </Card>

            {/* Monthly Profit/Loss Chart */}
            <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <CardHeader>
                <CardTitle>Monthly P&L Analysis</CardTitle>
                <CardDescription>
                  Breakdown of profits and losses by month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading P&L chart...</div>}>
                  <PerformanceMetricsChart />
                </Suspense>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
            <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle>Broker Configuration</CardTitle>
                <CardDescription>
                  Configure stock and crypto brokers for automated trading
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-96 flex items-center justify-center text-sm text-muted-foreground">Loading broker configuration...</div>}>
                  <BrokerConfigWizard />
                </Suspense>
              </CardContent>
            </Card>

            <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <CardHeader>
                <CardTitle>API Key Management</CardTitle>
                <CardDescription>
                  Manage your exchange API keys for automated trading
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-96 flex items-center justify-center text-sm text-muted-foreground">Loading API key management...</div>}>
                  <APIKeyManagement />
                </Suspense>
              </CardContent>
            </Card>

            <Card className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Additional settings coming soon...
                </p>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'admin' && user?.isAdmin && (
            <div className="space-y-4">
              <Suspense fallback={<div className="h-96 flex items-center justify-center text-sm text-muted-foreground">Loading admin dashboard...</div>}>
                <AdminDashboard />
              </Suspense>
            </div>
          )}
        </div>
        </div>
      </main>

      {/* Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onNavigate={setActiveTab}
          onAction={handleCommandAction}
        />
      </Suspense>
    </div>
  );
}

export default App;
