/**
 * Community Analytics Component
 *
 * Display performance metrics, P&L analytics, and historical data visualization.
 * For community hosts (admin/moderator roles).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const CommunityAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/community/analytics?range=${dateRange}`);

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data);
      setError(null);

      // TODO: Integrate with Redis for caching analytics data
      // await RedisCache.set(`analytics:${communityId}:${dateRange}`, data, 300); // 5min TTL
    } catch (err) {
      console.error('[CommunityAnalytics] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      // TODO: Implement CSV export functionality
      // const response = await fetch(`/api/community/analytics/export?range=${dateRange}`);
      // const blob = await response.blob();
      // const url = window.URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = `analytics-${dateRange}-${Date.now()}.csv`;
      // a.click();

      console.log('Export functionality not yet implemented');
      alert('Export will be available soon');
    } catch (err) {
      console.error('[CommunityAnalytics] Export error:', err);
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      case 'custom': return 'Custom Range';
      default: return 'Last 7 Days';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <strong>Error:</strong> {error}
      </Alert>
    );
  }

  if (!analytics) return null;

  const { performance, trends, topTraders, breakdown } = analytics;

  return (
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Community Analytics</h2>
          <p className="text-muted-foreground">
            Performance metrics and insights for {getDateRangeLabel()}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${performance.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${performance.totalPnL.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {performance.pnlChange >= 0 ? '+' : ''}{performance.pnLChange}% vs previous period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Best Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${performance.bestDay.pnl.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(performance.bestDay.date).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Worst Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              ${performance.worstDay.pnl.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(performance.worstDay.date).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Daily P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${performance.avgDailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${performance.avgDailyPnL.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Based on {performance.tradingDays} trading days
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Over Time</CardTitle>
          <CardDescription>Daily P&L and cumulative returns</CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: Integrate Recharts for performance visualization */}
          {/*
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performance.dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pnl" stroke="#22c55e" name="Daily P&L" />
              <Line type="monotone" dataKey="cumulative" stroke="#3b82f6" name="Cumulative" />
            </LineChart>
          </ResponsiveContainer>
          */}
          <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-muted-foreground mb-2">Chart Visualization</div>
              <div className="text-sm text-muted-foreground">
                Performance chart will be integrated with Recharts library
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Trading Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Signals</span>
                <span className="font-bold">{performance.totalSignals}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Executed Trades</span>
                <span className="font-bold">{performance.executedTrades}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg per Day</span>
                <span className="font-bold">{performance.avgSignalsPerDay}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Execution Rate</span>
                <Badge variant="default">{performance.executionRate}%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Win/Loss Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Win Rate</span>
                <Badge variant="default">{performance.winRate}%</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Winning Trades</span>
                <span className="font-bold text-green-600">{performance.winningTrades}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Losing Trades</span>
                <span className="font-bold text-red-600">{performance.losingTrades}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Win</span>
                <span className="font-bold text-green-600">${performance.avgWin}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                <span className="font-bold">{performance.sharpeRatio}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Max Drawdown</span>
                <span className="font-bold text-red-600">{performance.maxDrawdown}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Profit Factor</span>
                <span className="font-bold">{performance.profitFactor}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk/Reward</span>
                <span className="font-bold">{performance.riskRewardRatio}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Traders</CardTitle>
          <CardDescription>Best performers in the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topTraders.map((trader, index) => (
              <div key={trader.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                    <span className="text-sm font-medium">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="font-medium">{trader.username}</div>
                    <div className="text-sm text-muted-foreground">
                      {trader.tradesCount} trades · {trader.winRate}% win rate
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${trader.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${trader.pnl.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">P&L</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>By Asset Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.byAssetType.map((item) => (
                <div key={item.type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{item.type}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {item.count} trades
                    </span>
                  </div>
                  <div className={`font-bold ${item.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${item.pnl.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Signal Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.byProvider.map((item) => (
                <div key={item.providerId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.providerName}</span>
                    <span className="text-sm text-muted-foreground">
                      {item.count} signals
                    </span>
                  </div>
                  <div className={`font-bold ${item.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${item.pnl.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TODO: Implement custom date range picker */}
      {/* TODO: Add comparison mode (compare periods) */}
      {/* TODO: Integrate Redis caching for analytics data */}
      {/* TODO: Add real-time updates via WebSocket */}
      {/* TODO: Implement CSV export with detailed breakdown */}
    </div>
  );
};

export default CommunityAnalytics;
