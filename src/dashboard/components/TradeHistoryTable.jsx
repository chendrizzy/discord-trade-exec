import { useState, useMemo, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { SignalQualityIndicator } from './SignalQualityIndicator';

// Mock trade data
const mockTrades = [
  {
    id: '1',
    timestamp: new Date('2025-01-10T14:23:45Z'),
    symbol: 'BTC/USDT',
    side: 'BUY',
    price: 43250.5,
    quantity: 0.5,
    total: 21625.25,
    pnl: 1234.56,
    status: 'FILLED'
  },
  {
    id: '2',
    timestamp: new Date('2025-01-10T13:15:22Z'),
    symbol: 'ETH/USDT',
    side: 'SELL',
    price: 2345.75,
    quantity: 5.0,
    total: 11728.75,
    pnl: -432.1,
    status: 'FILLED'
  },
  {
    id: '3',
    timestamp: new Date('2025-01-10T12:08:33Z'),
    symbol: 'SOL/USDT',
    side: 'BUY',
    price: 102.45,
    quantity: 50.0,
    total: 5122.5,
    pnl: 876.3,
    status: 'FILLED'
  },
  {
    id: '4',
    timestamp: new Date('2025-01-10T11:42:18Z'),
    symbol: 'BTC/USDT',
    side: 'SELL',
    price: 43100.0,
    quantity: 0.25,
    total: 10775.0,
    pnl: 543.21,
    status: 'FILLED'
  },
  {
    id: '5',
    timestamp: new Date('2025-01-10T10:30:45Z'),
    symbol: 'AVAX/USDT',
    side: 'BUY',
    price: 38.92,
    quantity: 100.0,
    total: 3892.0,
    pnl: -156.78,
    status: 'FILLED'
  }
];

export function TradeHistoryTable() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalTrades, setTotalTrades] = useState(0);
  const [summary, setSummary] = useState(null);
  const [sorting, setSorting] = useState([{ id: 'entryTime', desc: true }]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [symbolFilter, setSymbolFilter] = useState('');

  // Fetch trades from API
  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      try {
        const sortField = sorting[0]?.id || 'entryTime';
        const sortOrder = sorting[0]?.desc ? 'desc' : 'asc';
        const page = pagination.pageIndex + 1;
        const limit = pagination.pageSize;

        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          sortBy: sortField,
          sortOrder
        });

        if (symbolFilter) {
          params.append('symbol', symbolFilter);
        }

        const response = await fetch(`/api/trades?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
          setTrades(data.data.trades);
          setTotalTrades(data.data.pagination.totalItems);
          setSummary(data.data.summary);
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, [pagination, sorting, symbolFilter]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'entryTime',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Time
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
          const date = new Date(row.getValue('entryTime'));
          return (
            <div className="text-xs">
              {date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          );
        }
      },
      {
        accessorKey: 'symbol',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Symbol
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => <div className="font-semibold">{row.getValue('symbol')}</div>
      },
      {
        id: 'quality',
        header: 'Quality',
        cell: ({ row }) => {
          const tradeId = row.original._id || row.original.id;
          return <SignalQualityIndicator tradeId={tradeId} compact={true} />;
        }
      },
      {
        accessorKey: 'side',
        header: 'Side',
        cell: ({ row }) => {
          const side = row.getValue('side');
          return (
            <Badge variant={side === 'BUY' ? 'profit' : 'loss'} className="font-bold">
              {side}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'entryPrice',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            Price
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <div>${row.getValue('entryPrice').toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        )
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        cell: ({ row }) => <div>{row.getValue('quantity').toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      },
      {
        accessorKey: 'profitLoss',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="hover:bg-accent -ml-4"
          >
            P&L
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
          const profitLoss = row.getValue('profitLoss');
          const isProfit = profitLoss >= 0;
          return (
            <div className={isProfit ? 'text-profit-text' : 'text-loss-text'}>
              {isProfit ? '+' : ''}${profitLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          );
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="info" className="text-xs">
            {row.getValue('status')}
          </Badge>
        )
      }
    ],
    []
  );

  const table = useReactTable({
    data: trades,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination
    },
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(totalTrades / pagination.pageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="space-y-4">
      {/* Search/Filter */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by symbol..."
          value={symbolFilter}
          onChange={event => setSymbolFilter(event.target.value)}
          className="max-w-sm"
          disabled={loading}
        />
        {loading && <span className="text-sm text-muted-foreground">Loading trades...</span>}
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
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No trades found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {totalTrades > 0 ? (
            <>
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                totalTrades
              )}{' '}
              of {totalTrades} trades
            </>
          ) : (
            'No trades found'
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
    </div>
  );
}
