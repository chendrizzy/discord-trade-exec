import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { TrendingDown, RefreshCw, AlertCircle, DollarSign, ExternalLink, Lightbulb, CheckCircle2 } from 'lucide-react';

/**
 * Fee Comparison Component
 *
 * Compares trading fees across user's connected crypto exchanges
 * for a given symbol and quantity
 *
 * @param {Object} props - Component props
 * @param {string} props.symbol - Trading symbol (e.g., 'BTC/USD', 'ETH/USD')
 * @param {number} props.quantity - Trade quantity
 */
export function FeeComparison({ symbol, quantity }) {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  /**
   * Fetch fee comparison data from API
   */
  const fetchComparison = async () => {
    if (!symbol || !quantity || quantity <= 0) {
      setError('Please provide a valid symbol and quantity');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        symbol: symbol,
        quantity: quantity.toString()
      });

      const response = await fetch(`/api/exchanges/compare-fees?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch fee comparison');
      }

      if (!data.success) {
        throw new Error(data.message || 'Failed to compare fees');
      }

      setComparison(data.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching fee comparison:', err);
      setError(err.message || 'Failed to compare exchange fees');
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-fetch when symbol or quantity changes
   * Debounce to avoid excessive API calls
   */
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (symbol && quantity && quantity > 0) {
        fetchComparison();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [symbol, quantity]);

  /**
   * Manual refresh handler
   */
  const handleRefresh = () => {
    fetchComparison();
  };

  /**
   * Format currency values
   */
  const formatCurrency = value => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /**
   * Format timestamp
   */
  const formatTimestamp = date => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fee Comparison</h2>
          <p className="text-muted-foreground mt-1">Compare fees across your connected exchanges</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || !symbol || !quantity}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && !comparison && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading fee comparison...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Results */}
      {!loading && comparison && (
        <>
          {/* Recommendation Card */}
          <Card className="border-2 border-gold-500/20 bg-gold-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-gold-500" />
                <CardTitle>Best Rate Recommendation</CardTitle>
              </div>
              <CardDescription>Trade on {comparison.recommendation.exchange} to save the most on fees</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Recommended Exchange:</span>
                  <Badge variant="default" className="bg-gold-500 hover:bg-gold-600">
                    {comparison.recommendation.exchange}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Estimated Fee:</span>
                  <span className="text-lg font-bold text-gold-500">
                    {formatCurrency(comparison.recommendation.estimatedFee)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Potential Savings:</span>
                  <span className="text-lg font-bold text-profit-text">
                    {formatCurrency(comparison.recommendation.savings)}
                    {comparison.recommendation.savingsPercent > 0 && (
                      <span className="text-sm ml-1">({comparison.recommendation.savingsPercent}%)</span>
                    )}
                  </span>
                </div>
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">{comparison.recommendation.reason}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>Fee Comparison</CardTitle>
              <CardDescription>
                Comparing {comparison.summary.totalExchangesCompared} exchange
                {comparison.summary.totalExchangesCompared !== 1 ? 's' : ''} for {comparison.quantity}{' '}
                {comparison.symbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Exchange</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Taker Fee</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                        Estimated Cost
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Savings</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.comparisons.map((comp, index) => (
                      <tr
                        key={comp.exchange}
                        className={`border-b border-border ${
                          comp.isCheapest ? 'bg-profit-bg/20 hover:bg-profit-bg/30' : 'hover:bg-accent'
                        } transition-colors`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{comp.displayName}</span>
                            {comp.isCheapest && (
                              <Badge variant="profit" className="text-xs">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Best Rate
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-mono text-sm">{comp.fees.takerPercent}%</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-mono font-medium">{formatCurrency(comp.estimatedFee)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          {comp.savingsVsMostExpensive > 0 ? (
                            <span className="font-mono text-sm text-profit-text">
                              {formatCurrency(comp.savingsVsMostExpensive)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <a
                            href={comp.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs text-primary hover:underline"
                          >
                            Visit
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer */}
              <div className="mt-6 pt-4 border-t border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Cheapest Exchange</p>
                    <p className="font-medium">{comparison.summary.cheapestExchange}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cheapest Fee</p>
                    <p className="font-medium font-mono text-profit-text">
                      {formatCurrency(comparison.summary.cheapestFee)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Most Expensive</p>
                    <p className="font-medium">{comparison.summary.mostExpensiveExchange}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max Savings</p>
                    <p className="font-medium font-mono text-profit-text">
                      {formatCurrency(comparison.summary.maxSavings)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Last Updated */}
              {lastUpdated && (
                <div className="mt-4 text-xs text-muted-foreground text-center">
                  Last updated: {formatTimestamp(lastUpdated)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Errors from individual exchanges (if any) */}
          {comparison.errors && comparison.errors.length > 0 && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">Some exchanges could not be compared:</p>
                <ul className="list-disc list-inside space-y-1">
                  {comparison.errors.map((err, idx) => (
                    <li key={idx}>
                      <span className="font-medium">{err.exchange}:</span> {err.error}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !comparison && !error && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingDown className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Comparison Yet</h3>
              <p className="text-muted-foreground mb-4">
                Enter a symbol and quantity to compare fees across your exchanges
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FeeComparison;
