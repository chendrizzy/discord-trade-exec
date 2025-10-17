import { useState, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

/**
 * Live Watchlist Component
 *
 * Features:
 * - Real-time quote updates via WebSocket
 * - Subscribe to 'quote:update' events
 * - Animated price changes (green up, red down)
 * - Add/remove symbols from watchlist
 * - Shows price, change %, volume
 */
export function LiveWatchlist() {
  const [watchlist, setWatchlist] = useState([
    // Default watchlist symbols
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' }
  ]);
  const [quotes, setQuotes] = useState({});
  const [priceChanges, setPriceChanges] = useState({});
  const { connected, subscribe, emit } = useWebSocketContext();
  const priceChangeTimeouts = useRef({});

  // Subscribe to real-time quote updates
  useEffect(() => {
    if (!connected) {
      console.log('📊 Not subscribing to quote updates: WebSocket not connected');
      return;
    }

    console.log('📊 Subscribing to quote updates...');

    // Subscribe to quote update events
    const unsubscribe = subscribe('quote:update', data => {
      console.log('📊 Received quote update:', data);

      const { symbol, price, change, changePercent, volume, timestamp } = data;

      // Update quotes state
      setQuotes(prev => {
        const prevQuote = prev[symbol];
        const priceIncreased = prevQuote && price > prevQuote.price;
        const priceDecreased = prevQuote && price < prevQuote.price;

        // Set price change animation
        if (priceIncreased || priceDecreased) {
          setPriceChanges(prevChanges => ({
            ...prevChanges,
            [symbol]: priceIncreased ? 'increase' : 'decrease'
          }));

          // Clear previous timeout
          if (priceChangeTimeouts.current[symbol]) {
            clearTimeout(priceChangeTimeouts.current[symbol]);
          }

          // Remove animation after 1 second
          priceChangeTimeouts.current[symbol] = setTimeout(() => {
            setPriceChanges(prevChanges => {
              const newChanges = { ...prevChanges };
              delete newChanges[symbol];
              return newChanges;
            });
          }, 1000);
        }

        return {
          ...prev,
          [symbol]: {
            symbol,
            price,
            change,
            changePercent,
            volume,
            timestamp: new Date(timestamp)
          }
        };
      });
    });

    // Request initial quotes for watchlist symbols
    if (emit) {
      watchlist.forEach(item => {
        emit('subscribe:quote', { symbol: item.symbol });
      });
    }

    // Cleanup subscriptions and timeouts
    return () => {
      console.log('📊 Unsubscribing from quote updates');
      unsubscribe();

      // Clear all price change timeouts
      Object.values(priceChangeTimeouts.current).forEach(timeout => {
        clearTimeout(timeout);
      });
      priceChangeTimeouts.current = {};
    };
  }, [connected, subscribe, emit, watchlist]);

  // Add symbol to watchlist
  const addSymbol = (symbol, name) => {
    if (watchlist.find(item => item.symbol === symbol)) {
      console.warn(`Symbol ${symbol} already in watchlist`);
      return;
    }

    setWatchlist(prev => [...prev, { symbol, name }]);

    // Subscribe to quotes for new symbol
    if (connected && emit) {
      emit('subscribe:quote', { symbol });
    }
  };

  // Remove symbol from watchlist
  const removeSymbol = symbol => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));

    // Unsubscribe from quotes for removed symbol
    if (connected && emit) {
      emit('unsubscribe:quote', { symbol });
    }

    // Remove quote data
    setQuotes(prev => {
      const newQuotes = { ...prev };
      delete newQuotes[symbol];
      return newQuotes;
    });

    // Clear price change animation
    setPriceChanges(prev => {
      const newChanges = { ...prev };
      delete newChanges[symbol];
      return newChanges;
    });
  };

  // Format number with commas
  const formatNumber = num => {
    if (!num) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  // Format price with $ and 2 decimals
  const formatPrice = price => {
    if (!price) return '$0.00';
    return `$${price.toFixed(2)}`;
  };

  return (
    <Card className="shadow-lg border-2 hover:border-primary/50 transition-all duration-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Live Watchlist</CardTitle>
            <CardDescription>Real-time market quotes for your watched symbols</CardDescription>
          </div>
          <ConnectionStatusIndicator />
        </div>
      </CardHeader>
      <CardContent>
        {watchlist.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-4">No symbols in watchlist</p>
            <Button variant="outline" size="sm">
              Add Symbol
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {watchlist.map(item => {
              const quote = quotes[item.symbol];
              const priceChange = priceChanges[item.symbol];
              const changePositive = quote?.changePercent >= 0;

              return (
                <div
                  key={item.symbol}
                  className={`
                                        p-4 rounded-lg border transition-all duration-300
                                        ${priceChange === 'increase' ? 'bg-profit-bg border-profit-border' : ''}
                                        ${priceChange === 'decrease' ? 'bg-loss-bg border-loss-border' : ''}
                                        ${!priceChange ? 'bg-card border-border/50 hover:border-primary/30' : ''}
                                    `}
                  role="article"
                  aria-label={`${item.symbol} quote`}
                >
                  <div className="flex items-center justify-between">
                    {/* Symbol and Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold font-mono">{item.symbol}</span>
                        {quote && (
                          <Badge variant={changePositive ? 'profit' : 'loss'} className="text-xs">
                            {changePositive ? '▲' : '▼'} {Math.abs(quote.changePercent).toFixed(2)}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                    </div>

                    {/* Price and Volume */}
                    <div className="text-right">
                      <div
                        className={`text-2xl font-black font-mono transition-colors duration-300 ${
                          priceChange === 'increase'
                            ? 'text-profit-text'
                            : priceChange === 'decrease'
                              ? 'text-loss-text'
                              : 'text-foreground'
                        }`}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {quote ? (
                          formatPrice(quote.price)
                        ) : (
                          <span className="text-muted-foreground text-base">Loading...</span>
                        )}
                      </div>
                      {quote && (
                        <div className="flex items-center gap-2 justify-end mt-1">
                          <span
                            className={`text-xs font-mono ${changePositive ? 'text-profit-text' : 'text-loss-text'}`}
                          >
                            {changePositive ? '+' : ''}
                            {formatPrice(quote.change)}
                          </span>
                          {quote.volume && (
                            <span className="text-xs text-muted-foreground">Vol: {formatNumber(quote.volume)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-4 h-8 w-8 p-0 opacity-0 hover:opacity-100 transition-opacity"
                      onClick={() => removeSymbol(item.symbol)}
                      aria-label={`Remove ${item.symbol} from watchlist`}
                    >
                      <span className="text-lg leading-none">×</span>
                    </Button>
                  </div>

                  {/* Last Update Timestamp */}
                  {quote?.timestamp && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Updated: {quote.timestamp.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Connection Status */}
        {!connected && (
          <div className="mt-4 p-3 rounded bg-warning-bg border border-warning-border text-warning-text text-sm">
            ⚠️ Not connected to live quotes. Reconnecting...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LiveWatchlist;
