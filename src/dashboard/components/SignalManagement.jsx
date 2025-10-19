/**
 * Signal Management Component
 *
 * Manage signal providers, Discord channel configuration, and provider settings.
 * For community hosts (admin/moderator roles).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert } from './ui/alert';

const SignalManagement = () => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/community/signals');

      if (!response.ok) throw new Error('Failed to fetch signal providers');

      const data = await response.json();
      setProviders(data.providers);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleProvider = async (provider) => {
    try {
      const response = await fetch(`/api/community/signals/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !provider.enabled })
      });

      if (!response.ok) throw new Error('Failed to update provider');

      await fetchProviders();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveProvider = async (providerId) => {
    try {
      const response = await fetch(`/api/community/signals/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to save provider');

      setEditingId(null);
      setFormData({});
      await fetchProviders();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading signal providers...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <strong>Error:</strong> {error}
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Signal Providers</h2>
          <p className="text-muted-foreground">Manage Discord channels and signal provider settings</p>
        </div>
        <Button>Add Provider</Button>
      </div>

      {/* Providers List */}
      <div className="space-y-4">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{provider.name}</CardTitle>
                  <Badge variant={provider.enabled ? 'default' : 'secondary'}>
                    {provider.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleProvider(provider)}
                  >
                    {provider.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingId(provider.id)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              <CardDescription>Channel ID: {provider.channelId}</CardDescription>
            </CardHeader>
            <CardContent>
              {editingId === provider.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Provider Name</label>
                    <Input
                      placeholder="e.g., #crypto-signals"
                      defaultValue={provider.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Discord Channel ID</label>
                    <Input
                      placeholder="123456789012345678"
                      defaultValue={provider.channelId}
                      onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSaveProvider(provider.id)}>Save</Button>
                    <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Signals Today</div>
                    <div className="text-2xl font-bold">{provider.stats.signalsToday}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">This Week</div>
                    <div className="text-2xl font-bold">{provider.stats.signalsThisWeek}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Win Rate</div>
                    <div className="text-2xl font-bold text-green-600">{provider.stats.winRate}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Followers</div>
                    <div className="text-2xl font-bold">{provider.stats.followers}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* TODO: Implement Discord channel validation */}
      {/* TODO: Implement "Test Signal" functionality */}
      {/* TODO: Add provider performance charts */}
    </div>
  );
};

export default SignalManagement;
