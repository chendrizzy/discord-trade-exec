import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Crown, TrendingUp, Users, Radio, ExternalLink } from 'lucide-react';

/**
 * SubscriptionCard - Reusable subscription display component
 *
 * Displays subscription tier, usage, and upgrade options.
 * Supports both community and individual user subscription types.
 *
 * @param {Object} props
 * @param {'community'|'user'} props.type - Subscription type
 * @param {Function} props.onUpgrade - Callback for upgrade button
 * @param {Function} props.onManage - Callback for manage subscription (Stripe portal)
 */
export function SubscriptionCard({
  type = 'user',
  onUpgrade = null,
  onManage = null
}) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubscription();
  }, [type]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = type === 'community'
        ? '/api/community/subscription'
        : '/api/trader/subscription';

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch subscription data');
      }

      const data = await response.json();
      setSubscription(data);
    } catch (err) {
      console.error('[SubscriptionCard] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTierConfig = (tier) => {
    const configs = {
      free: {
        name: 'Free',
        icon: Radio,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100'
      },
      starter: {
        name: 'Starter',
        icon: TrendingUp,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100'
      },
      professional: {
        name: 'Professional',
        icon: Users,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100'
      },
      enterprise: {
        name: 'Enterprise',
        icon: Crown,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100'
      }
    };
    return configs[tier] || configs.free;
  };

  const formatRenewalDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateUsagePercentage = (current, max) => {
    if (!max) return 0;
    return Math.min((current / max) * 100, 100);
  };

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-20 bg-muted animate-pulse rounded" />
            <div className="h-20 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error || !subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Unable to load subscription information</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || 'No subscription data available'}</p>
        </CardContent>
      </Card>
    );
  }

  const tierConfig = getTierConfig(subscription.tier);
  const TierIcon = tierConfig.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Subscription Plan
              <Badge variant="default" className={`${tierConfig.bgColor} ${tierConfig.color}`}>
                <TierIcon className="h-3 w-3 mr-1" />
                {tierConfig.name}
              </Badge>
            </CardTitle>
            <CardDescription>
              {subscription.status === 'active' && subscription.currentPeriodEnd && (
                <span>Renews on {formatRenewalDate(subscription.currentPeriodEnd)}</span>
              )}
              {subscription.status === 'trialing' && (
                <span>Trial ends on {formatRenewalDate(subscription.currentPeriodEnd)}</span>
              )}
              {subscription.status === 'canceled' && (
                <span>Canceled - Access until {formatRenewalDate(subscription.currentPeriodEnd)}</span>
              )}
            </CardDescription>
          </div>
          {subscription.status !== 'active' && subscription.tier !== 'enterprise' && (
            <Badge variant="secondary">
              {subscription.status}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Usage Metrics */}
        {subscription.limits && subscription.usage && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Usage</h4>

            {/* Members (Community only) */}
            {type === 'community' && subscription.limits.maxMembers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Community Members</span>
                  <span className="font-medium">
                    {subscription.usage.members.toLocaleString()} / {subscription.limits.maxMembers.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={calculateUsagePercentage(subscription.usage.members, subscription.limits.maxMembers)}
                  className="h-2"
                />
              </div>
            )}

            {/* Signal Providers (Community only) */}
            {type === 'community' && subscription.limits.maxSignalProviders && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Signal Providers</span>
                  <span className="font-medium">
                    {subscription.usage.signalProviders} / {subscription.limits.maxSignalProviders}
                  </span>
                </div>
                <Progress
                  value={calculateUsagePercentage(subscription.usage.signalProviders, subscription.limits.maxSignalProviders)}
                  className="h-2"
                />
              </div>
            )}

            {/* Signals Per Day */}
            {subscription.limits.maxSignalsPerDay && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Signals Today</span>
                  <span className="font-medium">
                    {subscription.usage.signalsToday.toLocaleString()} / {subscription.limits.maxSignalsPerDay.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={calculateUsagePercentage(subscription.usage.signalsToday, subscription.limits.maxSignalsPerDay)}
                  className="h-2"
                />
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {subscription.usage && subscription.limits && (
          <>
            {type === 'community' && subscription.usage.members >= subscription.limits.maxMembers * 0.9 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  You're approaching your member limit. Consider upgrading to add more members.
                </p>
              </div>
            )}
            {subscription.usage.signalsToday >= subscription.limits.maxSignalsPerDay * 0.9 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  You're approaching your daily signal limit. Resets in {Math.ceil((new Date().setHours(24, 0, 0, 0) - Date.now()) / 3600000)} hours.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center gap-2">
        {/* Upgrade Button */}
        {subscription.tier !== 'enterprise' && onUpgrade && (
          <Button
            variant="default"
            onClick={() => onUpgrade(subscription)}
            className="flex-1"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Upgrade Plan
          </Button>
        )}

        {/* Manage Subscription Button */}
        {onManage && subscription.status !== 'inactive' && (
          <Button
            variant="outline"
            onClick={() => onManage(subscription)}
            className="flex-1"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Manage Billing
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default SubscriptionCard;
