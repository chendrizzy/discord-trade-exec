import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';

/**
 * BrokerStatusBadge - Reusable broker connection status badge
 *
 * Displays broker connection status with color coding and tooltip.
 * Shows reconnect button for error states.
 *
 * @param {Object} props
 * @param {Object} props.broker - Broker connection data
 * @param {Function} props.onReconnect - Callback for reconnect button
 * @param {boolean} props.showReconnect - Whether to show reconnect button (default: true)
 */
export function BrokerStatusBadge({
  broker,
  onReconnect = null,
  showReconnect = true
}) {
  const {
    id,
    name,
    status = 'disconnected',
    lastValidated = null,
    error = null
  } = broker;

  // Determine status properties
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          variant: 'default',
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          icon: CheckCircle2,
          label: 'Connected',
          description: 'Broker is connected and ready'
        };
      case 'validating':
        return {
          variant: 'secondary',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          icon: Clock,
          label: 'Validating',
          description: 'Validating broker connection...'
        };
      case 'error':
        return {
          variant: 'destructive',
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          icon: XCircle,
          label: 'Error',
          description: error || 'Connection failed'
        };
      default:
        return {
          variant: 'outline',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: XCircle,
          label: 'Disconnected',
          description: 'Not connected'
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  const formatLastValidated = () => {
    if (!lastValidated) return 'Never validated';

    const date = new Date(lastValidated);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleReconnect = (e) => {
    e.stopPropagation();
    if (onReconnect) {
      onReconnect(broker);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={config.variant} className="cursor-help">
              <StatusIcon className={`h-3 w-3 mr-1 ${config.color}`} />
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-2">
              <div>
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </div>
              {lastValidated && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Last validated: {formatLastValidated()}
                </div>
              )}
              {error && status === 'error' && (
                <div className="text-xs text-red-600 border-t pt-2">
                  <p className="font-semibold">Error details:</p>
                  <p className="mt-1">{error}</p>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Reconnect Button (for error state) */}
      {showReconnect && status === 'error' && onReconnect && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReconnect}
          className="h-7 px-2"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reconnect
        </Button>
      )}
    </div>
  );
}

export default BrokerStatusBadge;
