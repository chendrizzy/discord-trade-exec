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
  DialogTitle
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from './ui/table';
import { Calendar, Download, ChevronUp, ChevronDown, Filter, ArrowUpDown } from 'lucide-react';

/**
 * TradeHistory Component
 *
 * Comprehensive trade history with filtering, sorting, and detailed views.
 *
 * Features:
 * - Sortable table (symbol, side, size, entry, exit, P&L, fee, status, date)
 * - Date range filters with presets (7d, 30d, 90d, custom)
 * - Symbol and side filters
 * - Pagination controls
 * - Export CSV button (with TODO for implementation)
 * - Trade detail modal (full execution data)
 *
 * API Endpoints:
 * - GET /api/trader/trades - Fetches trade history with filters
 *
 * Usage:
 * import { TradeHistory } from './components/TradeHistory';
 * <TradeHistory />
 */
export function TradeHistory() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Filter states
  const [dateRange, setDateRange] = useState('30d');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sorting states
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchTrades();
  }, [currentPage, dateRange, symbolFilter, sideFilter, statusFilter, sortColumn, sortDirection]);

  const fetchTrades = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
        dateRange,
        sortBy: sortColumn,
        sortDirection,
        ...(symbolFilter && { symbol: symbolFilter }),
        ...(sideFilter !== 'all' && { side: sideFilter }),
        ...(statusFilter !== 'all' && { status: statusFilter })
      });

      const response = await fetch(`/api/trader/trades?${params}`);
      const data = await response.json();

      if (data.success) {
        setTrades(data.data.trades);
        setTotalPages(data.data.totalPages);
        setTotalTrades(data.data.total);
      } else {
        setError(data.error || 'Failed to fetch trade history');
      }
    } catch (err) {
      console.error('Trade history fetch error:', err);
      setError('Failed to load trade history');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = column => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const handleExportCSV = () => {
    // TODO: Phase 3.4.1 - Implement CSV export functionality
    console.log('Exporting trade history to CSV...');
    alert('CSV export feature coming soon!');
  };

  const openTradeDetails = trade => {
    setSelectedTrade(trade);
    setShowDetailModal(true);
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 ml-1" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Trades
              </CardTitle>
              <CardDescription>
                Showing {totalTrades} trades
              </CardDescription>
            </div>
            <Button onClick={handleExportCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date Range
              </label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Symbol Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Symbol</label>
              <Input
                type="text"
                placeholder="e.g., BTC/USD"
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
              />
            </div>

            {/* Side Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Side</label>
              <Select value={sideFilter} onValueChange={setSideFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDateRange('7d');
                setSymbolFilter('');
                setSideFilter('all');
                setStatusFilter('completed');
              }}
            >
              Recent Completed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDateRange('30d');
                setSideFilter('BUY');
                setStatusFilter('all');
              }}
            >
              Buy Orders (30d)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDateRange('all');
                setSymbolFilter('');
                setSideFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trade Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
              <div className="text-muted-foreground">Loading trade history...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4" role="alert">
              <div className="text-destructive">{error}</div>
              <Button onClick={fetchTrades} variant="outline">
                Retry
              </Button>
            </div>
          ) : trades.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No trades match your filters
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => handleSort('date')} className="cursor-pointer">
                      <div className="flex items-center">
                        Date
                        <SortIcon column="date" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort('symbol')} className="cursor-pointer">
                      <div className="flex items-center">
                        Symbol
                        <SortIcon column="symbol" />
                      </div>
                    </TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead onClick={() => handleSort('quantity')} className="cursor-pointer text-right">
                      <div className="flex items-center justify-end">
                        Quantity
                        <SortIcon column="quantity" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort('entryPrice')} className="cursor-pointer text-right">
                      <div className="flex items-center justify-end">
                        Entry
                        <SortIcon column="entryPrice" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort('exitPrice')} className="cursor-pointer text-right">
                      <div className="flex items-center justify-end">
                        Exit
                        <SortIcon column="exitPrice" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort('pnl')} className="cursor-pointer text-right">
                      <div className="flex items-center justify-end">
                        P&L
                        <SortIcon column="pnl" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map(trade => (
                    <TableRow
                      key={trade.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openTradeDetails(trade)}
                    >
                      <TableCell>
                        {new Date(trade.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="font-semibold">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={trade.side === 'BUY' ? 'profit' : 'outline'}>{trade.side}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{trade.quantity}</TableCell>
                      <TableCell className="text-right">${trade.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {trade.pnl !== null ? (
                          <span className={trade.pnl >= 0 ? 'text-profit-text' : 'text-loss-text'}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">${trade.fee.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            trade.status === 'completed'
                              ? 'profit'
                              : trade.status === 'open'
                                ? 'info'
                                : 'outline'
                          }
                        >
                          {trade.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({totalTrades} total trades)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Trade Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl">
          {selectedTrade && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Trade Details: {selectedTrade.symbol}
                  <Badge variant={selectedTrade.side === 'BUY' ? 'profit' : 'outline'}>{selectedTrade.side}</Badge>
                </DialogTitle>
                <DialogDescription>
                  Executed on {new Date(selectedTrade.timestamp).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Trade Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-border rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">Quantity</div>
                    <div className="text-2xl font-bold font-mono">{selectedTrade.quantity}</div>
                  </div>
                  <div className="p-4 border border-border rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">P&L</div>
                    <div
                      className={`text-2xl font-bold font-mono ${selectedTrade.pnl >= 0 ? 'text-profit-text' : 'text-loss-text'}`}
                    >
                      {selectedTrade.pnl !== null
                        ? `${selectedTrade.pnl >= 0 ? '+' : ''}$${selectedTrade.pnl.toFixed(2)}`
                        : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Detailed Information */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Entry Price:</span>
                    <span className="font-mono">${selectedTrade.entryPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exit Price:</span>
                    <span className="font-mono">
                      {selectedTrade.exitPrice ? `$${selectedTrade.exitPrice.toFixed(2)}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Value:</span>
                    <span className="font-mono">
                      ${(selectedTrade.entryPrice * selectedTrade.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fee:</span>
                    <span className="font-mono">${selectedTrade.fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      variant={
                        selectedTrade.status === 'completed'
                          ? 'profit'
                          : selectedTrade.status === 'open'
                            ? 'info'
                            : 'outline'
                      }
                    >
                      {selectedTrade.status}
                    </Badge>
                  </div>
                  {selectedTrade.providerId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Signal Provider:</span>
                      <span className="font-semibold">{selectedTrade.providerName}</span>
                    </div>
                  )}
                  {selectedTrade.broker && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Broker:</span>
                      <span>{selectedTrade.broker}</span>
                    </div>
                  )}
                  {selectedTrade.orderId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order ID:</span>
                      <span className="font-mono text-xs">{selectedTrade.orderId}</span>
                    </div>
                  )}
                </div>

                {/* TODO: Phase 3.4.2 - Add execution timeline visualization */}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TradeHistory;
