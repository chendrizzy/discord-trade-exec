import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, Download, Calendar, AlertTriangle } from 'lucide-react';

// Get heat map color based on retention percentage
const getRetentionColor = percentage => {
  if (percentage === null || percentage === undefined) return 'bg-muted/20';
  if (percentage >= 80) return 'bg-profit/30 text-profit-text';
  if (percentage >= 60) return 'bg-green-500/20 text-green-700';
  if (percentage >= 40) return 'bg-yellow-500/20 text-yellow-700';
  if (percentage >= 20) return 'bg-orange-500/20 text-orange-700';
  return 'bg-destructive/20 text-destructive';
};

export function CohortRetentionTable() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState('login');
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    fetchRetentionTable();
  }, [metric, period]);

  const fetchRetentionTable = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        cohortPeriod: period,
        retentionMetric: metric
      });

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/analytics/cohorts/retention?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setCohorts(data.data.cohorts || []);
      } else {
        setError(data.error || 'Failed to fetch retention table');
      }
    } catch (err) {
      console.error('Retention table error:', err);
      setError('Failed to load cohort retention data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Export retention table');
    alert('Export functionality coming soon!');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading cohort retention table...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <div className="text-destructive">{error}</div>
              <Button onClick={fetchRetentionTable} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find the maximum number of periods across all cohorts
  const maxPeriods = Math.max(...cohorts.map(c => (c.retention || []).length), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gold-500" />
              Cohort Retention Analysis
            </CardTitle>
            <CardDescription>Track user retention over time by signup cohort</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={fetchRetentionTable} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Metric:</span>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent transition-colors"
            >
              <option value="login">Login Activity</option>
              <option value="trade">Trading Activity</option>
              <option value="active">Active Users</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Period:</span>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent transition-colors"
            >
              <option value="month">Monthly</option>
              <option value="week">Weekly</option>
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Retention Rate:</span>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded bg-profit/30"></div>
            <span>80%+</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded bg-green-500/20"></div>
            <span>60-79%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded bg-yellow-500/20"></div>
            <span>40-59%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded bg-orange-500/20"></div>
            <span>20-39%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded bg-destructive/20"></div>
            <span>&lt;20%</span>
          </div>
        </div>

        {/* Retention Table */}
        {cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden border rounded-lg">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-r border-border">
                        Cohort
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Size
                      </th>
                      {Array.from({ length: maxPeriods }, (_, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[80px]"
                        >
                          {period === 'month' ? `Month ${i}` : `Week ${i}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {cohorts.map(cohort => (
                      <tr key={cohort.cohortId} className="hover:bg-muted/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 whitespace-nowrap text-sm font-medium border-r border-border">
                          {cohort.cohortId}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono">
                          <Badge variant="outline" className="font-mono">
                            {cohort.cohortSize}
                          </Badge>
                        </td>
                        {Array.from({ length: maxPeriods }, (_, periodIndex) => {
                          const retentionData = (cohort.retention || [])[periodIndex];
                          const percentage = retentionData?.percentage;
                          const count = retentionData?.count;

                          return (
                            <td key={periodIndex} className="px-4 py-3 whitespace-nowrap text-sm text-center">
                              {percentage !== undefined && percentage !== null ? (
                                <div
                                  className={`inline-flex flex-col items-center justify-center px-3 py-2 rounded-md transition-all hover:scale-105 ${getRetentionColor(percentage)}`}
                                  title={`${count} of ${cohort.cohortSize} users (${percentage.toFixed(1)}%)`}
                                >
                                  <div className="text-sm font-bold">{percentage.toFixed(0)}%</div>
                                  <div className="text-xs opacity-70">{count}</div>
                                </div>
                              ) : (
                                <div className="inline-flex items-center justify-center px-3 py-2 text-muted-foreground">
                                  -
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No cohort data available for the selected criteria
          </div>
        )}

        {/* Summary Stats */}
        {cohorts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{cohorts.length}</div>
              <div className="text-xs text-muted-foreground">Total Cohorts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">
                {cohorts.reduce((sum, c) => sum + c.cohortSize, 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Total Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{maxPeriods}</div>
              <div className="text-xs text-muted-foreground">Tracking {period === 'month' ? 'Months' : 'Weeks'}</div>
            </div>
          </div>
        )}

        {/* Insights */}
        {cohorts.length > 0 && (
          <div className="p-4 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">Retention Insights</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Cohorts are grouped by {period === 'month' ? 'month' : 'week'} of user signup</li>
              <li>
                • Retention is tracked based on{' '}
                {metric === 'login' ? 'login activity' : metric === 'trade' ? 'trading activity' : 'active user status'}
              </li>
              <li>• Hover over cells to see detailed retention numbers</li>
              <li>• Green indicates healthy retention, red indicates high churn</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for dashboard cards
export function CohortRetentionSummary() {
  const [loading, setLoading] = useState(true);
  const [recentCohorts, setRecentCohorts] = useState([]);

  useEffect(() => {
    fetchRecentCohorts();
  }, []);

  const fetchRecentCohorts = async () => {
    try {
      const response = await fetch('/api/analytics/cohorts/retention?cohortPeriod=month&retentionMetric=login');
      const data = await response.json();

      if (data.success) {
        // Get the 3 most recent cohorts
        const cohorts = (data.data.cohorts || []).slice(-3);
        setRecentCohorts(cohorts);
      }
    } catch (err) {
      console.error('Recent cohorts error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || recentCohorts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">Recent Cohort Retention</h4>
      {recentCohorts.map(cohort => {
        const month0 = cohort.retention?.[0]?.percentage || 0;
        const month1 = cohort.retention?.[1]?.percentage || 0;
        return (
          <div key={cohort.cohortId} className="flex items-center justify-between">
            <span className="text-xs">{cohort.cohortId}</span>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs font-mono">
                {cohort.cohortSize}
              </Badge>
              <span className="text-xs text-muted-foreground">→</span>
              <span className={`text-xs font-mono ${month1 >= 50 ? 'text-profit-text' : 'text-loss-text'}`}>
                {month1.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
