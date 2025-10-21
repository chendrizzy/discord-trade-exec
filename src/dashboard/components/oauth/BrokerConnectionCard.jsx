import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { ExternalLink, RefreshCw, Unplug, ShieldCheck } from 'lucide-react';

import { TokenStatusBadge } from './TokenStatusBadge';
import { OAuth2ConnectButton } from './OAuth2ConnectButton';

function formatDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

const TYPE_BADGE_VARIANT = {
  stock: 'info',
  crypto: 'gold'
};

/**
 * BrokerConnectionCard
 *
 * Displays OAuth2 connection status for a broker with actions to connect,
 * refresh tokens, or disconnect.
 */
export function BrokerConnectionCard({
  broker,
  actionState,
  onRefresh,
  onDisconnect,
  onStartConnect,
  onError
}) {
  const status = broker.status || 'disconnected';
  const isRefreshPending = actionState?.type === 'refresh' && actionState?.broker === broker.key;
  const isDisconnectPending = actionState?.type === 'disconnect' && actionState?.broker === broker.key;

  const showReconnect = ['disconnected', 'expired', 'revoked'].includes(status);
  const showRefresh = broker.supportsManualRefresh && ['connected', 'expiring'].includes(status);
  const showDisconnect = status !== 'disconnected';

  return (
    <Card className="relative overflow-hidden border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-3 text-lg">
              {broker.name}
              <Badge variant={TYPE_BADGE_VARIANT[broker.type] || 'outline'} className="text-[10px] uppercase tracking-wide">
                {broker.type === 'stock' ? 'Stock Broker' : 'Crypto Broker'}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                OAuth2
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {broker.features?.includes('paper-trading')
                ? 'Supports paper trading and live trading via secure OAuth2.'
                : 'Secure OAuth2 connection for automated trading.'}
            </CardDescription>
          </div>
          <TokenStatusBadge status={status} expiresAt={broker.expiresAt} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {broker.connectedAt && status !== 'disconnected' && (
            <span>Connected {formatDate(broker.connectedAt)}</span>
          )}
          {broker.expiresAt && status !== 'disconnected' && (
            <span>Expires {formatDate(broker.expiresAt)}</span>
          )}
          <span className="flex items-center gap-1 text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> AES-256 encrypted
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {broker.lastRefreshError && (
          <Alert variant="loss">
            <AlertDescription className="text-xs">
              Last refresh failed: {broker.lastRefreshError}. Reconnect your {broker.name} account to restore trading
              capability.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(broker.scopes || []).map(scope => (
            <Badge key={`${broker.key}-${scope}`} variant="outline">
              {scope}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {showReconnect && (
            <OAuth2ConnectButton
              brokerKey={broker.key}
              brokerName={broker.name}
              scopes={broker.scopes}
              onStart={onStartConnect}
              onError={onError}
              buttonLabel={status === 'disconnected' ? 'Connect Broker' : 'Reconnect'}
            />
          )}

          {showRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => onRefresh?.(broker)}
              disabled={isRefreshPending}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshPending ? 'animate-spin' : ''}`} />
              {isRefreshPending ? 'Refreshing…' : 'Refresh Token'}
            </Button>
          )}

          {showDisconnect && (
            <Button
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => onDisconnect?.(broker)}
              disabled={isDisconnectPending}
            >
              <Unplug className="h-4 w-4" />
              {isDisconnectPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          )}

          {broker.docsUrl && (
            <Button asChild variant="ghost" size="sm" className="ml-auto gap-2 text-xs">
              <a href={broker.docsUrl} target="_blank" rel="noopener noreferrer">
                API Docs <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
