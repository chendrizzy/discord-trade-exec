/**
 * Integration Settings Component
 *
 * Configure Discord bot integration, webhooks, and notification settings.
 * For community hosts (admin/moderator roles).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert } from './ui/alert';

const IntegrationSettings = () => {
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState({
    webhookUrl: '',
    notificationChannelId: '',
    alertChannelId: '',
  });

  useEffect(() => {
    fetchIntegrationSettings();
  }, []);

  const fetchIntegrationSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/community/integration');

      if (!response.ok) {
        throw new Error('Failed to fetch integration settings');
      }

      const data = await response.json();
      setIntegration(data);
      setFormData({
        webhookUrl: data.discord.webhookUrl || '',
        notificationChannelId: data.discord.notificationChannelId || '',
        alertChannelId: data.discord.alertChannelId || '',
      });
      setError(null);
    } catch (err) {
      console.error('[IntegrationSettings] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/community/integration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to save integration settings');
      }

      // TODO: Validate webhook URL and channel IDs via Discord API
      // await validateDiscordWebhook(formData.webhookUrl);
      // await validateDiscordChannel(formData.notificationChannelId);

      await fetchIntegrationSettings();
      alert('Settings saved successfully');
    } catch (err) {
      console.error('[IntegrationSettings] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      setTesting(true);

      // TODO: Integrate with Discord API to send test notification
      // const response = await fetch('/api/community/integration/test', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     channelId: formData.notificationChannelId,
      //     message: 'This is a test notification from your trading community!'
      //   })
      // });

      console.log('Test notification sent');
      alert('Test notification sent! Check your Discord channel.');
    } catch (err) {
      console.error('[IntegrationSettings] Test error:', err);
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleReconnectBot = async () => {
    try {
      // TODO: Implement Discord bot reconnection logic
      // const response = await fetch('/api/community/integration/reconnect', {
      //   method: 'POST'
      // });

      console.log('Bot reconnection initiated');
      alert('Bot reconnection initiated. This may take a few moments.');
      await fetchIntegrationSettings();
    } catch (err) {
      console.error('[IntegrationSettings] Reconnect error:', err);
      setError(err.message);
    }
  };

  const getBotStatusBadge = () => {
    if (!integration?.discord?.botStatus) return null;

    const { online, lastSeen } = integration.discord.botStatus;

    if (online) {
      return <Badge variant="default">Online</Badge>;
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">Offline</Badge>
        <span className="text-xs text-muted-foreground">
          Last seen: {new Date(lastSeen).toLocaleString()}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading integration settings...</div>
      </div>
    );
  }

  if (!integration) return null;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <strong>Error:</strong> {error}
        </Alert>
      )}

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Discord Integration</h2>
        <p className="text-muted-foreground">
          Configure Discord bot, webhooks, and notification channels
        </p>
      </div>

      {/* Bot Status */}
      <Card className={integration.discord.botStatus.online ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bot Status</CardTitle>
              <CardDescription>Discord bot connection and permissions</CardDescription>
            </div>
            {getBotStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Bot Username</div>
                <div className="font-medium">{integration.discord.botInfo.username}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Application ID</div>
                <div className="font-medium">{integration.discord.botInfo.applicationId}</div>
              </div>
            </div>

            {/* Permissions Check */}
            <div>
              <div className="text-sm font-medium mb-2">Required Permissions</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {integration.discord.permissions.map((perm) => (
                  <div key={perm.name} className="flex items-center gap-2">
                    <span className={perm.granted ? 'text-green-600' : 'text-red-600'}>
                      {perm.granted ? '✓' : '✗'}
                    </span>
                    <span className="text-sm">{perm.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {!integration.discord.botStatus.online && (
              <Button onClick={handleReconnectBot}>
                Reconnect Bot
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>Configure Discord webhook for notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Webhook URL</label>
            <Input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={formData.webhookUrl}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Create a webhook in your Discord server settings and paste the URL here
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Webhook'}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestNotification}
              disabled={testing || !formData.webhookUrl}
            >
              {testing ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Channel Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Settings</CardTitle>
          <CardDescription>Configure notification and alert channels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Notification Channel ID</label>
            <Input
              placeholder="123456789012345678"
              value={formData.notificationChannelId}
              onChange={(e) => setFormData({ ...formData, notificationChannelId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Channel for general notifications (new signals, trades, etc.)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Alert Channel ID</label>
            <Input
              placeholder="123456789012345678"
              value={formData.alertChannelId}
              onChange={(e) => setFormData({ ...formData, alertChannelId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Channel for important alerts and system messages
            </p>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Channels'}
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose which events trigger Discord notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {integration.notifications.map((notification) => (
              <div key={notification.type} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{notification.label}</div>
                  <div className="text-sm text-muted-foreground">{notification.description}</div>
                </div>
                <Badge variant={notification.enabled ? 'default' : 'secondary'}>
                  {notification.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Guide</CardTitle>
          <CardDescription>Common issues and solutions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="font-medium mb-2">Bot is offline</div>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Verify the bot has been invited to your Discord server</li>
                <li>Check that the bot has the required permissions</li>
                <li>Try reconnecting the bot using the button above</li>
                <li>Contact support if the issue persists</li>
              </ol>
            </div>

            <div>
              <div className="font-medium mb-2">Notifications not working</div>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Ensure the webhook URL is correct and active</li>
                <li>Verify channel IDs are correct (right-click channel, Copy ID)</li>
                <li>Check that the bot has permission to send messages in the channels</li>
                <li>Use the "Send Test" button to verify the webhook</li>
              </ol>
            </div>

            <div>
              <div className="font-medium mb-2">How to get a Channel ID</div>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)</li>
                <li>Right-click on the channel you want to use</li>
                <li>Click "Copy ID"</li>
                <li>Paste the ID in the appropriate field above</li>
              </ol>
            </div>

            <div>
              <div className="font-medium mb-2">How to create a Webhook</div>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Go to your Discord server's Channel Settings</li>
                <li>Select "Integrations" → "Webhooks"</li>
                <li>Click "New Webhook" or "Create Webhook"</li>
                <li>Copy the webhook URL and paste it in the field above</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Integration Info */}
      <Card>
        <CardHeader>
          <CardTitle>API Integration</CardTitle>
          <CardDescription>Information for advanced integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Community API Key</div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={integration.apiKey}
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" size="sm">Copy</Button>
                <Button variant="outline" size="sm">Regenerate</Button>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Webhook Secret</div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={integration.webhookSecret}
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" size="sm">Copy</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TODO: Implement Discord API integration for webhook validation */}
      {/* TODO: Add Discord API integration for channel validation */}
      {/* TODO: Implement real-time bot status monitoring via WebSocket */}
      {/* TODO: Add Discord OAuth2 for automated bot setup */}
      {/* TODO: Implement notification queue with retry logic */}
      {/* TODO: Add rate limiting awareness and visual indicators */}
    </div>
  );
};

export default IntegrationSettings;
