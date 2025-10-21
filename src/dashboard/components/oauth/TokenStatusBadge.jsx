import { Badge } from '../ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

const STATUS_CONFIG = {
  connected: {
    icon: CheckCircle2,
    variant: 'info',
    label: 'Connected'
  },
  expiring: {
    icon: Clock,
    variant: 'warning',
    label: 'Expiring Soon'
  },
  expired: {
    icon: XCircle,
    variant: 'destructive',
    label: 'Expired'
  },
  revoked: {
    icon: XCircle,
    variant: 'destructive',
    label: 'Revoked'
  },
  disconnected: {
    icon: AlertTriangle,
    variant: 'outline',
    label: 'Not Connected'
  }
};

/**
 * TokenStatusBadge
 *
 * Displays a status badge for OAuth2 tokens (connected, expiring, expired, etc.)
 */
export function TokenStatusBadge({ status = 'disconnected', expiresAt }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  const Icon = config.icon;

  const expiryText =
    expiresAt && ['connected', 'expiring'].includes(status)
      ? ` · Expires ${new Date(expiresAt).toLocaleString()}`
      : '';

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium tracking-wide">
        {config.label}
        {expiryText}
      </span>
    </Badge>
  );
}
