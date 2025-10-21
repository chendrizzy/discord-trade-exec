/**
 * Billing Settings Component
 *
 * Manage subscription tiers, usage limits, and billing information.
 * For community hosts (admin role only).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert } from './ui/alert';

const BillingSettings = () => {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBillingInfo();
  }, []);

  const fetchBillingInfo = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/community/billing');

      if (!response.ok) {
        throw new Error('Failed to fetch billing information');
      }

      const data = await response.json();
      setBilling(data);
      setError(null);
    } catch (err) {
      console.error('[BillingSettings] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      // TODO: Integrate with Polar customer portal
      // const response = await fetch('/api/community/billing/portal', {
      //   method: 'POST'
      // });
      // const { url } = await response.json();
      // window.location.href = url;

      console.log('Polar portal integration not yet implemented');
      alert('You will be redirected to the Polar portal to manage your subscription');
    } catch (err) {
      console.error('[BillingSettings] Portal error:', err);
      setError(err.message);
    }
  };

  const handleUpgrade = async (tier) => {
    try {
      // TODO: Integrate with Polar checkout
      // const response = await fetch('/api/community/billing/upgrade', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ tier })
      // });
      // const { url } = await response.json();
      // window.location.href = url;

      console.log(`Upgrade to ${tier} tier requested`);
      alert(`Upgrade to ${tier} tier will be available soon`);
    } catch (err) {
      console.error('[BillingSettings] Upgrade error:', err);
      setError(err.message);
    }
  };

  const getUsagePercentage = (current, limit) => {
    return Math.round((current / limit) * 100);
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading billing information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <strong>Error:</strong> {error}
      </Alert>
    );
  }

  if (!billing) return null;

  const { subscription, usage, pricing } = billing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Billing & Subscription</h2>
        <p className="text-muted-foreground">
          Manage your subscription plan and usage limits
        </p>
      </div>

      {/* Current Subscription */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your active subscription tier</CardDescription>
            </div>
            <Badge variant="default" className="text-lg px-4 py-1">
              {subscription.tier}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Monthly Price</div>
              <div className="text-2xl font-bold">${subscription.price}/mo</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Billing Cycle</div>
              <div className="text-2xl font-bold">{subscription.billingCycle}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Next Renewal</div>
              <div className="text-2xl font-bold">
                {new Date(subscription.renewalDate).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleManageSubscription}>
              Open Billing Portal
            </Button>
            <Button variant="outline">Cancel Subscription</Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
          <CardDescription>Current usage against your plan limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Members Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">Community Members</div>
                <div className="text-sm text-muted-foreground">
                  {usage.members.current} of {usage.members.limit} members
                </div>
              </div>
              <Badge variant={getUsagePercentage(usage.members.current, usage.members.limit) >= 90 ? 'destructive' : 'default'}>
                {getUsagePercentage(usage.members.current, usage.members.limit)}% used
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getUsageColor(getUsagePercentage(usage.members.current, usage.members.limit))}`}
                style={{ width: `${Math.min(100, getUsagePercentage(usage.members.current, usage.members.limit))}%` }}
              />
            </div>
          </div>

          {/* Signal Providers Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">Signal Providers</div>
                <div className="text-sm text-muted-foreground">
                  {usage.signalProviders.current} of {usage.signalProviders.limit} providers
                </div>
              </div>
              <Badge variant={getUsagePercentage(usage.signalProviders.current, usage.signalProviders.limit) >= 90 ? 'destructive' : 'default'}>
                {getUsagePercentage(usage.signalProviders.current, usage.signalProviders.limit)}% used
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getUsageColor(getUsagePercentage(usage.signalProviders.current, usage.signalProviders.limit))}`}
                style={{ width: `${Math.min(100, getUsagePercentage(usage.signalProviders.current, usage.signalProviders.limit))}%` }}
              />
            </div>
          </div>

          {/* Daily Signals Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">Signals per Day</div>
                <div className="text-sm text-muted-foreground">
                  {usage.signalsPerDay.current} of {usage.signalsPerDay.limit} signals/day
                </div>
              </div>
              <Badge variant={getUsagePercentage(usage.signalsPerDay.current, usage.signalsPerDay.limit) >= 90 ? 'destructive' : 'default'}>
                {getUsagePercentage(usage.signalsPerDay.current, usage.signalsPerDay.limit)}% used
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getUsageColor(getUsagePercentage(usage.signalsPerDay.current, usage.signalsPerDay.limit))}`}
                style={{ width: `${Math.min(100, getUsagePercentage(usage.signalsPerDay.current, usage.signalsPerDay.limit))}%` }}
              />
            </div>
          </div>

          {/* API Calls Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">API Calls</div>
                <div className="text-sm text-muted-foreground">
                  {usage.apiCalls.current.toLocaleString()} of {usage.apiCalls.limit.toLocaleString()} calls/month
                </div>
              </div>
              <Badge variant={getUsagePercentage(usage.apiCalls.current, usage.apiCalls.limit) >= 90 ? 'destructive' : 'default'}>
                {getUsagePercentage(usage.apiCalls.current, usage.apiCalls.limit)}% used
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getUsageColor(getUsagePercentage(usage.apiCalls.current, usage.apiCalls.limit))}`}
                style={{ width: `${Math.min(100, getUsagePercentage(usage.apiCalls.current, usage.apiCalls.limit))}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-xl font-bold mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pricing.tiers.map((tier) => (
            <Card key={tier.name} className={tier.name === subscription.tier ? 'border-blue-500 border-2' : ''}>
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-4">
                  ${tier.price}
                  <span className="text-lg font-normal text-muted-foreground">/mo</span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Members</span>
                    <span className="font-medium">{tier.limits.members}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Signal Providers</span>
                    <span className="font-medium">{tier.limits.signalProviders}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Signals/Day</span>
                    <span className="font-medium">{tier.limits.signalsPerDay}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">API Calls/Month</span>
                    <span className="font-medium">{tier.limits.apiCalls.toLocaleString()}</span>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  {tier.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="text-green-600">✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {tier.name === subscription.tier ? (
                  <Badge variant="default" className="w-full justify-center py-2">
                    Current Plan
                  </Badge>
                ) : tier.price > subscription.price ? (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(tier.name)}
                  >
                    Upgrade to {tier.name}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleUpgrade(tier.name)}
                  >
                    Downgrade to {tier.name}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>Recent invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {billing.invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">
                    {new Date(invoice.date).toLocaleDateString()} - {invoice.description}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Invoice #{invoice.number}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold">${invoice.amount}</div>
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'destructive'}>
                      {invoice.status}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm">
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* TODO: Integrate Polar customer portal for subscription management */}
      {/* TODO: Implement Polar checkout for plan upgrades/downgrades */}
      {/* TODO: Add webhook handlers for subscription events (renewal, cancellation, etc.) */}
      {/* TODO: Implement usage alerts when approaching limits */}
      {/* TODO: Add invoice PDF generation and email delivery */}
    </div>
  );
};

export default BillingSettings;
