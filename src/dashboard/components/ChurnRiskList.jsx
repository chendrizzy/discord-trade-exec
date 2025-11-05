import { useState, useMemo, useEffect } from 'react';
import { debugLog, debugWarn } from '../utils/debug-logger';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronUp, AlertTriangle, Mail, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';

const getRiskBadgeVariant = riskLevel => {
  switch (riskLevel) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'loss';
    case 'medium':
      return 'outline';
    default:
      return 'outline';
  }
};

export function ChurnRiskList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sorting, setSorting] = useState([{ id: 'riskScore', desc: true }]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [usernameFilter, setUsernameFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');

  useEffect(() => {
    fetchChurnRisks();
  }, []);

  const fetchChurnRisks = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analytics/churn-risks');
      const data = await response.json();

      if (data.success) {
        setUsers(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch churn risks');
      }
    } catch (err) {
      console.error('Churn risks error:', err);
      setError('Failed to load churn risk data');
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'username',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            User
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => <div className="font-semibold">{row.getValue('username') || 'Unknown User'}</div>
      },
      {
        accessorKey: 'subscription',
        header: 'Tier',
        cell: ({ row }) => {
          const tier = row.getValue('subscription')?.tier || 'basic';
          return (
            <Badge variant={tier === 'premium' ? 'gold' : tier === 'pro' ? 'profit' : 'outline'} className="capitalize">
              {tier}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'riskScore',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Risk Score
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const score = row.getValue('riskScore');
          const riskLevel = row.getValue('riskLevel');
          return (
            <div className="flex items-center gap-2">
              <div className="text-sm font-mono font-bold">{score.toFixed(1)}</div>
              {riskLevel === 'critical' && <AlertTriangle className="h-4 w-4 text-destructive" />}
            </div>
          );
        }
      },
      {
        accessorKey: 'riskLevel',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Risk Level
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const riskLevel = row.getValue('riskLevel');
          return (
            <Badge variant={getRiskBadgeVariant(riskLevel)} className="capitalize">
              {riskLevel}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'stats',
        header: 'Activity',
        cell: ({ row }) => {
          const stats = row.getValue('stats');
          return (
            <div className="text-xs text-muted-foreground">
              {stats?.totalTrades || 0} trades • {stats?.lastTradeDays || 'N/A'} days ago
            </div>
          );
        }
      },
      {
        accessorKey: 'winRate',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Win Rate
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const winRate = row.getValue('winRate') || 0;
          const isGood = winRate >= 50;
          return (
            <div className={`text-sm font-mono ${isGood ? 'text-profit-text' : 'text-loss-text'}`}>
              {winRate.toFixed(1)}%
            </div>
          );
        }
      },
      {
        id: 'recommendations',
        header: 'Key Issues',
        cell: ({ row }) => {
          const recommendations = row.original.recommendations || [];
          const topTwo = recommendations.slice(0, 2);
          return <div className="text-xs text-muted-foreground max-w-xs">{topTwo.join(', ')}</div>;
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => handleSendRetentionEmail(user)} className="h-8">
                <Mail className="h-3 w-3 mr-1" />
                Email
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleViewProfile(user)} className="h-8">
                View
              </Button>
            </div>
          );
        }
      }
    ],
    []
  );

  const filteredData = useMemo(() => {
    let filtered = users;

    // Filter by username
    if (usernameFilter) {
      filtered = filtered.filter(user => (user.username || '').toLowerCase().includes(usernameFilter.toLowerCase()));
    }

    // Filter by risk level
    if (riskFilter !== 'all') {
      filtered = filtered.filter(user => user.riskLevel === riskFilter);
    }

    return filtered;
  }, [users, usernameFilter, riskFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const handleSendRetentionEmail = async user => {
    debugLog('Send retention email to:', user.username);
    // TODO: Implement retention email sending
    alert(`Would send retention email to ${user.username}`);
  };

  const handleViewProfile = user => {
    debugLog('View profile:', user.username);
    // TODO: Navigate to user profile
    alert(`Would navigate to profile for ${user.username}`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading churn risk data...</div>
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
              <Button onClick={fetchChurnRisks} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = users.filter(u => u.riskLevel === 'critical').length;
  const highCount = users.filter(u => u.riskLevel === 'high').length;
  const mediumCount = users.filter(u => u.riskLevel === 'medium').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Churn Risk Users
            </CardTitle>
            <CardDescription>Users at risk of canceling subscriptions</CardDescription>
          </div>
          <Button onClick={fetchChurnRisks} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk Summary */}
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-lg font-bold px-3 py-1">
              {criticalCount}
            </Badge>
            <span className="text-sm text-muted-foreground">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="loss" className="text-lg font-bold px-3 py-1">
              {highCount}
            </Badge>
            <span className="text-sm text-muted-foreground">High</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg font-bold px-3 py-1">
              {mediumCount}
            </Badge>
            <span className="text-sm text-muted-foreground">Medium</span>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">Total: {users.length} at-risk users</div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search by username..."
            value={usernameFilter}
            onChange={event => setUsernameFilter(event.target.value)}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Risk Level:</span>
            <select
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent transition-colors"
            >
              <option value="all">All Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={
                      row.original.riskLevel === 'critical'
                        ? 'bg-destructive/5 hover:bg-destructive/10'
                        : row.original.riskLevel === 'high'
                          ? 'bg-orange-500/5 hover:bg-orange-500/10'
                          : ''
                    }
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No at-risk users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {filteredData.length > 0 ? (
              <>
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  filteredData.length
                )}{' '}
                of {filteredData.length} users
              </>
            ) : (
              'No at-risk users'
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
