import { useState, useEffect } from 'react';
import { debugLog, debugWarn } from '../utils/debug-logger';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { debugLog, debugWarn } from '../utils/debug-logger';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp, Trophy, Award, Medal, Target, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useWebSocketContext } from '../contexts/WebSocketContext';

/**
 * ProviderLeaderboard
 *
 * Displays ranked signal providers based on quality metrics, performance, and smart money indicators
 * Implements prediction market concepts with rare information scoring
 * Now with real-time WebSocket updates!
 */
export function ProviderLeaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');
  const [minSignals, setMinSignals] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const websocket = useWebSocketContext();

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timeRange,
        minSignals: minSignals.toString(),
        limit: '50'
      });

      const response = await fetch(`/api/signals/providers/leaderboard?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setLeaderboard(data.data.leaderboard);
      } else {
        setError(data.error || 'Failed to load leaderboard');
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [timeRange, minSignals]);

  // Subscribe to real-time signal quality updates
  useEffect(() => {
    if (!websocket) return;

    const handleQualityUpdate = data => {
      debugLog('📡 Signal quality updated, refreshing leaderboard');
      fetchLeaderboard();
    };

    const unsubscribe = websocket.subscribe('signal:quality', handleQualityUpdate);
    debugLog('📡 ProviderLeaderboard subscribed to real-time quality updates');

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [websocket]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  const getTierIcon = rank => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-gold-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <Target className="h-5 w-5 text-muted-foreground" />;
  };

  const getTierVariant = tierName => {
    switch (tierName) {
      case 'ELITE':
        return 'default';
      case 'VERIFIED':
        return 'profit';
      case 'STANDARD':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <Card className="animate-fade-in">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Trophy className="h-6 w-6 text-gold-400" />
                Signal Provider Leaderboard
              </CardTitle>
              <CardDescription className="mt-2">
                Top-performing signal providers ranked by quality, accuracy, and smart money indicators
              </CardDescription>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              size="sm"
              variant="outline"
              className="ml-4"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Time Range Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Time Range:</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="90d">90 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Signals Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Min Signals:</label>
              <Select value={minSignals.toString()} onValueChange={val => setMinSignals(parseInt(val))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results Count */}
            {!loading && leaderboard.length > 0 && (
              <div className="ml-auto text-sm text-muted-foreground">
                Showing {leaderboard.length} provider{leaderboard.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard Table */}
      <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading leaderboard...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No providers found matching your criteria</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Signals</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                    <TableHead className="text-right">Total Return</TableHead>
                    <TableHead className="text-right">Avg Return</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map(provider => (
                    <TableRow
                      key={provider.providerId}
                      className={`${provider.rank <= 3 ? 'bg-accent/30' : ''} hover:bg-accent transition-colors`}
                    >
                      {/* Rank */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTierIcon(provider.rank)}
                          <span className="font-bold text-sm">{provider.rank}</span>
                        </div>
                      </TableCell>

                      {/* Provider ID */}
                      <TableCell>
                        <div className="font-mono text-sm truncate max-w-[150px]">{provider.providerId}</div>
                      </TableCell>

                      {/* Quality Tier */}
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={getTierVariant(provider.tier)} className="font-bold cursor-help">
                                {provider.tierSymbol} {provider.tier}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Quality Tier: {provider.tier}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      {/* Confidence */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-secondary rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${provider.confidence >= 85 ? 'bg-gold-500' : provider.confidence >= 70 ? 'bg-profit' : 'bg-muted-foreground'}`}
                              style={{ width: `${provider.confidence}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{provider.confidence}%</span>
                        </div>
                      </TableCell>

                      {/* Total Signals */}
                      <TableCell className="text-right">
                        <span className="font-mono text-sm">{provider.totalSignals}</span>
                      </TableCell>

                      {/* Win Rate */}
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`font-mono text-sm cursor-help ${provider.winRate >= 70 ? 'text-profit-text' : provider.winRate >= 60 ? 'text-foreground' : 'text-muted-foreground'}`}
                              >
                                {formatNumber(provider.winRate)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Win Rate: {formatNumber(provider.winRate)}%</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      {/* Accuracy */}
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`font-mono text-sm cursor-help ${provider.accuracy >= 75 ? 'text-profit-text' : provider.accuracy >= 65 ? 'text-foreground' : 'text-muted-foreground'}`}
                              >
                                {formatNumber(provider.accuracy)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Prediction Accuracy: {formatNumber(provider.accuracy)}%</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      {/* Total Return */}
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm font-bold ${provider.totalReturn >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                        >
                          {provider.totalReturn >= 0 ? '+' : ''}${formatNumber(provider.totalReturn)}
                        </span>
                      </TableCell>

                      {/* Avg Return */}
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm ${provider.avgReturn >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                        >
                          {provider.avgReturn >= 0 ? '+' : ''}${formatNumber(provider.avgReturn)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Summary */}
      {!loading && leaderboard.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-gold-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Elite Providers</p>
                  <p className="text-2xl font-bold">{leaderboard.filter(p => p.tier === 'ELITE').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-profit-text" />
                <div>
                  <p className="text-sm text-muted-foreground">Avg Win Rate</p>
                  <p className="text-2xl font-bold">
                    {formatNumber(leaderboard.reduce((sum, p) => sum + p.winRate, 0) / leaderboard.length)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Target className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Signals</p>
                  <p className="text-2xl font-bold">
                    {leaderboard.reduce((sum, p) => sum + p.totalSignals, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
