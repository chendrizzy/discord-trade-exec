import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { TrendingUp, TrendingDown, Radio, Bell, Settings } from 'lucide-react';

/**
 * SignalCard - Reusable signal provider card component
 *
 * Displays signal provider information with performance metrics.
 * Supports both admin (enable/disable, configure) and trader (follow/unfollow) view modes.
 *
 * @param {Object} props
 * @param {Object} props.provider - Signal provider data
 * @param {'admin'|'trader'} props.viewMode - Determines which actions to show
 * @param {Function} props.onToggle - Callback for enable/disable or follow/unfollow
 * @param {Function} props.onConfigure - Callback for configure button (admin only)
 * @param {Function} props.onClick - Callback when card is clicked
 */
export function SignalCard({
  provider,
  viewMode = 'trader',
  onToggle = null,
  onConfigure = null,
  onClick = null
}) {
  const {
    id,
    name,
    description,
    channelId,
    enabled = false,
    following = false,
    performance = {}
  } = provider;

  const {
    winRate = 0,
    totalSignals = 0,
    avgPnL = 0,
    trend = 'neutral' // 'up', 'down', 'neutral'
  } = performance;

  const isPositivePnL = avgPnL >= 0;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Radio;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (onToggle) {
      onToggle(provider, viewMode === 'admin' ? !enabled : !following);
    }
  };

  const handleConfigure = (e) => {
    e.stopPropagation();
    if (onConfigure) {
      onConfigure(provider);
    }
  };

  return (
    <Card
      className={`transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              {name}
              {viewMode === 'admin' && (
                <Badge variant={enabled ? 'default' : 'secondary'}>
                  {enabled ? 'Active' : 'Disabled'}
                </Badge>
              )}
              {viewMode === 'trader' && following && (
                <Badge variant="default">
                  <Bell className="h-3 w-3 mr-1" />
                  Following
                </Badge>
              )}
            </CardTitle>
            {description && (
              <CardDescription className="mt-2">
                {description}
              </CardDescription>
            )}
            {viewMode === 'admin' && channelId && (
              <p className="text-xs text-muted-foreground mt-2">
                Channel: <span className="font-mono">{channelId}</span>
              </p>
            )}
          </div>

          {/* Trend Indicator */}
          <div className={`p-2 rounded-lg ${
            trend === 'up' ? 'bg-green-100 text-green-700' :
            trend === 'down' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            <TrendIcon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Performance Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
            <p className="text-lg font-bold">
              {winRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Signals</p>
            <p className="text-lg font-bold">
              {totalSignals.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Avg P&L</p>
            <p className={`text-lg font-bold ${isPositivePnL ? 'text-green-600' : 'text-red-600'}`}>
              {isPositivePnL ? '+' : ''}${avgPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        {/* Admin View Actions */}
        {viewMode === 'admin' && (
          <>
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={handleToggle}
              />
              <span className="text-sm font-medium">
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfigure}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </>
        )}

        {/* Trader View Actions */}
        {viewMode === 'trader' && (
          <Button
            variant={following ? 'outline' : 'default'}
            size="sm"
            className="w-full"
            onClick={handleToggle}
          >
            <Bell className={`h-4 w-4 mr-2 ${following ? 'fill-current' : ''}`} />
            {following ? 'Unfollow' : 'Follow'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default SignalCard;
