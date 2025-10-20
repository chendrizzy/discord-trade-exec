import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowUpDown, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * TradeTable - Reusable trade table component
 *
 * Displays trade history with sorting, pagination, and formatting.
 * Supports both community-wide and individual user scope.
 *
 * @param {Object} props
 * @param {Array} props.trades - Trade data array
 * @param {'community'|'user'} props.scope - Data scope
 * @param {string} props.memberId - Optional member ID for filtering (community scope only)
 * @param {number} props.pageSize - Trades per page (default: 25)
 * @param {Function} props.onTradeClick - Callback when trade row is clicked
 */
export function TradeTable({
  trades = [],
  scope = 'user',
  memberId = null,
  pageSize = 25,
  onTradeClick = null
}) {
  const [sortColumn, setSortColumn] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter trades if memberId is provided
  const filteredTrades = useMemo(() => {
    if (scope === 'community' && memberId) {
      return trades.filter(trade => trade.userId === memberId);
    }
    return trades;
  }, [trades, scope, memberId]);

  // Sort trades
  const sortedTrades = useMemo(() => {
    const sorted = [...filteredTrades];
    sorted.sort((a, b) => {
      let aValue = a[sortColumn];
      let bValue = b[sortColumn];

      // Handle special cases
      if (sortColumn === 'timestamp') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTrades, sortColumn, sortDirection]);

  // Paginate trades
  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTrades.slice(startIndex, startIndex + pageSize);
  }, [sortedTrades, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedTrades.length / pageSize);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value) => {
    const num = parseFloat(value);
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const SortButton = ({ column, children }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 -ml-3 hover:bg-transparent"
      onClick={() => handleSort(column)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  if (sortedTrades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-semibold mb-2">No trades found</p>
        <p className="text-sm">Trades will appear here once executed</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton column="timestamp">Time</SortButton>
              </TableHead>
              <TableHead>
                <SortButton column="symbol">Symbol</SortButton>
              </TableHead>
              <TableHead>
                <SortButton column="side">Side</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="quantity">Quantity</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="entryPrice">Entry</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="exitPrice">Exit</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="pnl">P&L</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="pnlPercentage">P&L %</SortButton>
              </TableHead>
              {scope === 'community' && (
                <TableHead>
                  <SortButton column="userName">Trader</SortButton>
                </TableHead>
              )}
              <TableHead>
                <SortButton column="status">Status</SortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTrades.map((trade) => {
              const isProfitable = parseFloat(trade.pnl) >= 0;
              const PnLIcon = isProfitable ? TrendingUp : TrendingDown;

              return (
                <TableRow
                  key={trade.id}
                  className={onTradeClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onTradeClick && onTradeClick(trade)}
                >
                  <TableCell className="font-medium">
                    {formatTimestamp(trade.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono font-semibold">
                    {trade.symbol}
                  </TableCell>
                  <TableCell>
                    <Badge variant={trade.side === 'BUY' ? 'default' : 'secondary'}>
                      {trade.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {parseFloat(trade.quantity).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(trade.entryPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {trade.exitPrice ? formatCurrency(trade.exitPrice) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className={`flex items-center justify-end gap-1 ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                      <PnLIcon className="h-4 w-4" />
                      <span className="font-semibold">{formatCurrency(trade.pnl)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={isProfitable ? 'text-green-600' : 'text-red-600'}>
                      {formatPercentage(trade.pnlPercentage)}
                    </span>
                  </TableCell>
                  {scope === 'community' && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {trade.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm">{trade.userName}</span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge
                      variant={
                        trade.status === 'FILLED' ? 'default' :
                        trade.status === 'PENDING' ? 'secondary' :
                        'destructive'
                      }
                    >
                      {trade.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedTrades.length)} of {sortedTrades.length} trades
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeTable;
