/**
 * Community Overview Component
 *
 * Displays community KPIs, member activity, signal providers, and health metrics.
 * For community hosts (admin/moderator roles).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert } from './ui/alert';

const CommunityOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/community/overview');

      if (!response.ok) {
        throw new Error('Failed to fetch community overview');
      }

      const overview = await response.json();
      setData(overview);
      setError(null);
    } catch (err) {
      console.error('[CommunityOverview] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading community overview...</div>
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

  if (!data) return null;

  const { members, signals, performance, activity, health } = data;

  return (
    <div className="space-y-6">
      {/* Health Score Banner */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Community Health Score</CardTitle>
              <CardDescription>Overall community performance and engagement</CardDescription>
            </div>
            <div className="text-4xl font-bold text-green-600">{health.score}/100</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Engagement</div>
              <Badge variant={health.indicators.engagement === 'high' ? 'default' : 'secondary'}>
                {health.indicators.engagement}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Retention</div>
              <Badge variant={health.indicators.retention === 'high' ? 'default' : 'secondary'}>
                {health.indicators.retention}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Growth</div>
              <Badge variant={health.indicators.growth === 'high' ? 'default' : 'secondary'}>
                {health.indicators.growth}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Satisfaction</div>
              <Badge variant={health.indicators.satisfaction === 'high' ? 'default' : 'secondary'}>
                {health.indicators.satisfaction}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Members Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{members.total}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {members.activeToday} active today
              </Badge>
              <span className="text-xs text-green-600">+{members.growth.monthly}% this month</span>
            </div>
          </CardContent>
        </Card>

        {/* Signals Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Signals Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{signals.totalToday}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                Avg: {signals.avgPerDay}/day
              </Badge>
              <span className="text-xs text-muted-foreground">
                {signals.totalThisWeek} this week
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Performance Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${performance.totalPnL.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {performance.winRate}% win rate
              </Badge>
              <span className="text-xs text-muted-foreground">
                {performance.totalTrades} trades
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Avg P&L Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg P&L/Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${performance.avgPnLPerMember.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {performance.successfulTrades} successful
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Signal Providers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Signal Providers</CardTitle>
              <CardDescription>Best performing providers by signals and win rate</CardDescription>
            </div>
            <Button variant="outline" size="sm">View All</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {signals.topProviders.map((provider, index) => (
              <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                    <span className="text-sm font-medium">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="font-medium">{provider.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {provider.signalsToday} signals today · {provider.followers} followers
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-green-600">{provider.winRate}%</div>
                  <div className="text-xs text-muted-foreground">win rate</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events in your community</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activity.recentEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-3 border-l-2 border-l-muted">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {event.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">{event.description}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Manage Members</Button>
            <Button variant="outline">Configure Signals</Button>
            <Button variant="outline">View Analytics</Button>
            <Button variant="outline">Billing Settings</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CommunityOverview;
