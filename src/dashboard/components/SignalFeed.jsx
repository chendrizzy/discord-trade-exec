import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import { Users, TrendingUp, Activity, Filter, Star, UserPlus, UserMinus } from 'lucide-react';

/**
 * SignalFeed Component
 *
 * Signal provider discovery and management interface.
 * Allows traders to browse, filter, and follow signal providers.
 *
 * Features:
 * - Provider cards with stats (win rate, signals, followers)
 * - Follow/unfollow button for each provider
 * - Filter controls (min win rate, sort by performance)
 * - Saved filter presets
 * - Provider detail modal (triggered on click)
 *
 * API Endpoints:
 * - GET /api/trader/signals - Fetches available signal providers
 * - POST /api/trader/signals/:id/follow - Follow a provider
 * - DELETE /api/trader/signals/:id/follow - Unfollow a provider
 *
 * Usage:
 * import { SignalFeed } from './components/SignalFeed';
 * <SignalFeed />
 */
export function SignalFeed() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Filter states
  const [minWinRate, setMinWinRate] = useState(0);
  const [sortBy, setSortBy] = useState('performance');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/trader/signals');
      const data = await response.json();

      if (data.success) {
        setProviders(data.data);
      } else {
        setError(data.error || 'Failed to fetch signal providers');
      }
    } catch (err) {
      console.error('Signal feed fetch error:', err);
      setError('Failed to load signal providers');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async (providerId, isCurrentlyFollowing) => {
    try {
      const method = isCurrentlyFollowing ? 'DELETE' : 'POST';
      const response = await fetch(`/api/trader/signals/${providerId}/follow`, {
        method,
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        // Update local state
        setProviders(prev =>
          prev.map(p =>
            p.id === providerId
              ? {
                  ...p,
                  isFollowing: !isCurrentlyFollowing,
                  followers: isCurrentlyFollowing ? p.followers - 1 : p.followers + 1
                }
              : p
          )
        );
      } else {
        console.error('Follow toggle failed:', data.error);
      }
    } catch (err) {
      console.error('Follow toggle error:', err);
    }
  };

  const openProviderDetails = provider => {
    setSelectedProvider(provider);
    setShowDetailModal(true);
  };

  // Apply filters
  const filteredProviders = providers
    .filter(p => p.winRate >= minWinRate)
    .filter(p => (searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true))
    .sort((a, b) => {
      switch (sortBy) {
        case 'performance':
          return b.winRate - a.winRate;
        case 'signals':
          return b.totalSignals - a.totalSignals;
        case 'followers':
          return b.followers - a.followers;
        default:
          return 0;
      }
    });

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="text-muted-foreground">Loading signal providers...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4" role="alert">
        <div className="text-destructive">{error}</div>
        <Button onClick={fetchProviders} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Providers
              </CardTitle>
              <CardDescription>Refine your search for signal providers</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <Input
                type="text"
                placeholder="Provider name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Min Win Rate */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Min Win Rate: {minWinRate}%</label>
              <Input
                type="range"
                min="0"
                max="100"
                step="5"
                value={minWinRate}
                onChange={e => setMinWinRate(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Sort By */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="signals">Total Signals</SelectItem>
                  <SelectItem value="followers">Followers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filter Presets */}
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMinWinRate(60);
                setSortBy('performance');
              }}
            >
              High Performance
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMinWinRate(0);
                setSortBy('followers');
              }}
            >
              Most Popular
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMinWinRate(0);
                setSortBy('signals');
                setSearchTerm('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="region" aria-label="Signal Providers">
        {filteredProviders.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <p>No providers match your filters</p>
          </div>
        ) : (
          filteredProviders.map(provider => (
            <Card
              key={provider.id}
              className="hover:border-primary/50 transition-all cursor-pointer"
              onClick={() => openProviderDetails(provider)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {provider.name}
                      {provider.verified && <Star className="h-4 w-4 text-gold-600 fill-gold-600" />}
                    </CardTitle>
                    <CardDescription>{provider.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <div
                      className={`text-lg font-bold font-mono ${provider.winRate >= 60 ? 'text-profit-text' : 'text-foreground'}`}
                    >
                      {provider.winRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono">{provider.totalSignals}</div>
                    <div className="text-xs text-muted-foreground">Signals</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono">{provider.followers}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                </div>

                {/* Performance Badge */}
                <div className="flex items-center justify-between mb-4">
                  <Badge variant={provider.totalPnL >= 0 ? 'profit' : 'loss'}>
                    {provider.totalPnL >= 0 ? '+' : ''}${provider.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })} P&L
                  </Badge>
                  <Badge variant="outline">{provider.signals30d} signals (30d)</Badge>
                </div>

                {/* Follow Button */}
                <Button
                  className="w-full"
                  variant={provider.isFollowing ? 'outline' : 'default'}
                  onClick={e => {
                    e.stopPropagation();
                    handleFollowToggle(provider.id, provider.isFollowing);
                  }}
                >
                  {provider.isFollowing ? (
                    <>
                      <UserMinus className="h-4 w-4 mr-2" />
                      Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Provider Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl">
          {selectedProvider && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedProvider.name}
                  {selectedProvider.verified && <Star className="h-5 w-5 text-gold-600 fill-gold-600" />}
                </DialogTitle>
                <DialogDescription>{selectedProvider.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Detailed Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 border border-border rounded-lg text-center">
                    <div className="text-2xl font-bold font-mono text-profit-text">{selectedProvider.winRate}%</div>
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center">
                    <div className="text-2xl font-bold font-mono">{selectedProvider.totalSignals}</div>
                    <div className="text-xs text-muted-foreground">Total Signals</div>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center">
                    <div className="text-2xl font-bold font-mono">{selectedProvider.followers}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center">
                    <div
                      className={`text-2xl font-bold font-mono ${selectedProvider.totalPnL >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                    >
                      {selectedProvider.totalPnL >= 0 ? '+' : ''}${selectedProvider.totalPnL.toFixed(0)}
                    </div>
                    <div className="text-xs text-muted-foreground">Total P&L</div>
                  </div>
                </div>

                {/* Recent Performance */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Recent Performance</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last 7 days:</span>
                      <span
                        className={`font-mono ${selectedProvider.pnl7d >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                      >
                        {selectedProvider.pnl7d >= 0 ? '+' : ''}${selectedProvider.pnl7d?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last 30 days:</span>
                      <span
                        className={`font-mono ${selectedProvider.pnl30d >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                      >
                        {selectedProvider.pnl30d >= 0 ? '+' : ''}${selectedProvider.pnl30d?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Average profit per trade:</span>
                      <span className="font-mono">${selectedProvider.avgProfitPerTrade?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </div>

                {/* TODO: Phase 3.2.1 - Add performance chart */}
                {/* TODO: Phase 3.2.2 - Add recent signals list */}
              </div>

              <DialogFooter>
                <Button
                  variant={selectedProvider.isFollowing ? 'outline' : 'default'}
                  onClick={() => {
                    handleFollowToggle(selectedProvider.id, selectedProvider.isFollowing);
                    setShowDetailModal(false);
                  }}
                >
                  {selectedProvider.isFollowing ? (
                    <>
                      <UserMinus className="h-4 w-4 mr-2" />
                      Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SignalFeed;
