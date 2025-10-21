import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '../ui/button';
import { ScopeConsentDialog } from './ScopeConsentDialog';

/**
 * OAuth2ConnectButton
 *
 * Opens the OAuth2 authorization flow for a broker after prompting the user
 * with the requested scopes.
 */
export function OAuth2ConnectButton({
  brokerKey,
  brokerName,
  scopes,
  disabled,
  onStart,
  onError,
  buttonLabel = 'Connect'
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const handleConfirm = async () => {
    try {
      setRedirecting(true);
      onStart?.();

      const response = await fetch(`/api/auth/broker/${brokerKey}/authorize`);
      if (!response.ok) {
        throw new Error(`Failed to create authorization session (${response.status})`);
      }

      const data = await response.json();
      if (!data?.success || !data?.authorizationURL) {
        throw new Error(data?.error || 'Authorization URL was not returned');
      }

      window.location.href = data.authorizationURL;
    } catch (error) {
      console.error('[OAuth2] Failed to start authorization:', error);
      setRedirecting(false);
      setDialogOpen(false);
      onError?.(error);
    }
  };

  return (
    <>
      <Button
        variant="gold"
        size="sm"
        disabled={disabled || redirecting}
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-2"
      >
        {redirecting && <Loader2 className="h-4 w-4 animate-spin" />}
        {redirecting ? 'Redirecting…' : buttonLabel}
      </Button>

      <ScopeConsentDialog
        brokerKey={brokerKey}
        brokerName={brokerName}
        scopes={scopes}
        open={dialogOpen}
        onOpenChange={open => {
          if (!redirecting) {
            setDialogOpen(open);
          }
        }}
        onConfirm={handleConfirm}
        loading={redirecting}
      />
    </>
  );
}
