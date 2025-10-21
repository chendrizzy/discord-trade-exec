import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Shield, Check } from 'lucide-react';

const SCOPE_DESCRIPTIONS = {
  'account:write': 'Read balances and manage account settings',
  trading: 'Execute trades and modify open orders',
  'PlaceTrades': 'Place and modify orders on your behalf',
  'AccountAccess': 'Read account balances, positions, and profile details',
  'account': 'Read account balances and positions',
  'options': 'Access options trading endpoints',
  'offline_access': 'Maintain access when you are offline'
};

const BROKER_HINTS = {
  alpaca: 'Alpaca requires trade permissions to execute strategy signals.',
  'alpaca-crypto': 'Alpaca Crypto shares scopes with the stock API for unified access.',
  ibkr: 'Interactive Brokers tokens expire every 24 hours and are refreshed automatically.',
  tdameritrade: 'TD Ameritrade tokens are short-lived (30 minutes) and refreshed proactively.',
  schwab: 'Schwab replaces TD Ameritrade and uses a similar OAuth2 flow.',
  etrade: 'E*TRADE uses OAuth 1.0a; you will be redirected to complete the flow.'
};

/**
 * ScopeConsentDialog
 *
 * Presents the OAuth2 scopes requested before redirecting the user.
 */
export function ScopeConsentDialog({
  brokerKey,
  brokerName,
  scopes = [],
  open,
  onOpenChange,
  onConfirm,
  loading
}) {
  const displayScopes = scopes.length > 0 ? scopes : ['trading'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Connect {brokerName || brokerKey}
          </DialogTitle>
          <DialogDescription>
            Authorize TradeBot AI to access your {brokerName || brokerKey} account using OAuth2. Tokens are encrypted with
            AES-256-GCM and refreshed automatically before expiration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Requested Permissions</h4>
            <ul className="space-y-2">
              {displayScopes.map(scope => (
                <li key={`${brokerKey}-${scope}`} className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{scope.replace(/[_:]/g, ' ')}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        Scope
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug mt-1">
                      {SCOPE_DESCRIPTIONS[scope] || 'Required to integrate with broker trading APIs.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {BROKER_HINTS[brokerKey] && (
            <div className="rounded-md border border-info-border bg-info-bg p-3 text-xs text-info-text">
              {BROKER_HINTS[brokerKey]}
            </div>
          )}

          <div className="rounded-md border border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
            Your credentials are never stored in plaintext. TradeBot AI only requests the minimum scopes required to read
            balances and execute trades you authorize.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Redirecting...' : `Continue to ${brokerName || brokerKey}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
