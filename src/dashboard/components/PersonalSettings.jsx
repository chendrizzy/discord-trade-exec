import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Bell, Mail, MessageSquare, CheckCircle, AlertCircle, Send } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from './ui/table';

/**
 * PersonalSettings Component
 *
 * Notification and personal preferences management.
 *
 * Features:
 * - Discord DM notification toggle
 * - Email notification toggle
 * - Alert threshold configuration (daily loss limit, position size alerts)
 * - "Send Test Notification" buttons
 * - Notification history/log
 * - PUT to /api/trader/notifications
 *
 * API Endpoints:
 * - GET /api/trader/notifications - Fetches notification settings and history
 * - PUT /api/trader/notifications - Updates notification settings
 * - POST /api/trader/notifications/test - Sends test notification
 *
 * Usage:
 * import { PersonalSettings } from './components/PersonalSettings';
 * <PersonalSettings />
 */
export function PersonalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Notification settings state
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [notifyOnTrade, setNotifyOnTrade] = useState(true);
  const [notifyOnProfit, setNotifyOnProfit] = useState(true);
  const [notifyOnLoss, setNotifyOnLoss] = useState(true);
  const [notifyOnDailyLimit, setNotifyOnDailyLimit] = useState(true);
  const [notifyOnPositionSize, setNotifyOnPositionSize] = useState(false);

  // Alert thresholds
  const [dailyLossThreshold, setDailyLossThreshold] = useState(500);
  const [positionSizeThreshold, setPositionSizeThreshold] = useState(1000);
  const [profitThreshold, setProfitThreshold] = useState(100);

  // Notification history
  const [notificationHistory, setNotificationHistory] = useState([]);

  // Test notification state
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    fetchNotificationSettings();
  }, []);

  const fetchNotificationSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/trader/notifications');
      const data = await response.json();

      if (data.success) {
        const settings = data.data.settings;
        const history = data.data.history || [];

        setDiscordEnabled(settings.discordEnabled ?? true);
        setEmailEnabled(settings.emailEnabled ?? false);
        setNotifyOnTrade(settings.notifyOnTrade ?? true);
        setNotifyOnProfit(settings.notifyOnProfit ?? true);
        setNotifyOnLoss(settings.notifyOnLoss ?? true);
        setNotifyOnDailyLimit(settings.notifyOnDailyLimit ?? true);
        setNotifyOnPositionSize(settings.notifyOnPositionSize ?? false);
        setDailyLossThreshold(settings.dailyLossThreshold ?? 500);
        setPositionSizeThreshold(settings.positionSizeThreshold ?? 1000);
        setProfitThreshold(settings.profitThreshold ?? 100);
        setNotificationHistory(history);
      } else {
        setError(data.error || 'Failed to fetch notification settings');
      }
    } catch (err) {
      console.error('Notification settings fetch error:', err);
      setError('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage('');
    try {
      const response = await fetch('/api/trader/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordEnabled,
          emailEnabled,
          notifyOnTrade,
          notifyOnProfit,
          notifyOnLoss,
          notifyOnDailyLimit,
          notifyOnPositionSize,
          dailyLossThreshold,
          positionSizeThreshold,
          profitThreshold
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Notification settings saved successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to save notification settings');
      }
    } catch (err) {
      console.error('Notification settings save error:', err);
      setError('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async type => {
    const setTesting = type === 'discord' ? setTestingDiscord : setTestingEmail;
    setTesting(true);
    try {
      const response = await fetch('/api/trader/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(`Test ${type} notification sent!`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || `Failed to send test ${type} notification`);
      }
    } catch (err) {
      console.error('Test notification error:', err);
      setError(`Failed to send test ${type} notification`);
    } finally {
      setTesting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="text-muted-foreground">Loading notification settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <Alert className="border-profit-border bg-profit-bg">
          <CheckCircle className="h-4 w-4 text-profit-text" />
          <AlertTitle className="text-profit-text">Success</AlertTitle>
          <AlertDescription className="text-profit-text">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Notification Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>Choose how you want to receive notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Discord Notifications */}
            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-[#5865F2]" />
                <div>
                  <div className="font-semibold">Discord DMs</div>
                  <div className="text-sm text-muted-foreground">Receive notifications via Discord direct messages</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestNotification('discord')}
                  disabled={!discordEnabled || testingDiscord}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testingDiscord ? 'Sending...' : 'Test'}
                </Button>
                <Button
                  size="sm"
                  variant={discordEnabled ? 'profit' : 'outline'}
                  onClick={() => setDiscordEnabled(!discordEnabled)}
                >
                  {discordEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </div>

            {/* Email Notifications */}
            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-semibold">Email</div>
                  <div className="text-sm text-muted-foreground">Receive notifications via email</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestNotification('email')}
                  disabled={!emailEnabled || testingEmail}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testingEmail ? 'Sending...' : 'Test'}
                </Button>
                <Button
                  size="sm"
                  variant={emailEnabled ? 'profit' : 'outline'}
                  onClick={() => setEmailEnabled(!emailEnabled)}
                >
                  {emailEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Events</CardTitle>
          <CardDescription>Select which events trigger notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Trade Execution */}
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <div className="font-semibold text-sm">Trade Executions</div>
                <div className="text-xs text-muted-foreground">Notify when trades are executed</div>
              </div>
              <Button
                size="sm"
                variant={notifyOnTrade ? 'profit' : 'outline'}
                onClick={() => setNotifyOnTrade(!notifyOnTrade)}
              >
                {notifyOnTrade ? 'On' : 'Off'}
              </Button>
            </div>

            {/* Profitable Trades */}
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <div className="font-semibold text-sm">Profitable Trades</div>
                <div className="text-xs text-muted-foreground">Notify when a trade closes in profit</div>
              </div>
              <Button
                size="sm"
                variant={notifyOnProfit ? 'profit' : 'outline'}
                onClick={() => setNotifyOnProfit(!notifyOnProfit)}
              >
                {notifyOnProfit ? 'On' : 'Off'}
              </Button>
            </div>

            {/* Loss Trades */}
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <div className="font-semibold text-sm">Loss Trades</div>
                <div className="text-xs text-muted-foreground">Notify when a trade closes at a loss</div>
              </div>
              <Button
                size="sm"
                variant={notifyOnLoss ? 'profit' : 'outline'}
                onClick={() => setNotifyOnLoss(!notifyOnLoss)}
              >
                {notifyOnLoss ? 'On' : 'Off'}
              </Button>
            </div>

            {/* Daily Loss Limit */}
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <div className="font-semibold text-sm">Daily Loss Limit Reached</div>
                <div className="text-xs text-muted-foreground">Notify when daily loss limit is hit</div>
              </div>
              <Button
                size="sm"
                variant={notifyOnDailyLimit ? 'profit' : 'outline'}
                onClick={() => setNotifyOnDailyLimit(!notifyOnDailyLimit)}
              >
                {notifyOnDailyLimit ? 'On' : 'Off'}
              </Button>
            </div>

            {/* Large Position Size */}
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <div className="font-semibold text-sm">Large Position Size</div>
                <div className="text-xs text-muted-foreground">Notify when position exceeds threshold</div>
              </div>
              <Button
                size="sm"
                variant={notifyOnPositionSize ? 'profit' : 'outline'}
                onClick={() => setNotifyOnPositionSize(!notifyOnPositionSize)}
              >
                {notifyOnPositionSize ? 'On' : 'Off'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Alert Thresholds
          </CardTitle>
          <CardDescription>Configure when to receive alerts based on amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Daily Loss Threshold */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Loss Limit ($)</label>
              <Input
                type="number"
                min="50"
                step="50"
                value={dailyLossThreshold}
                onChange={e => setDailyLossThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Get notified when daily losses reach this amount</p>
            </div>

            {/* Position Size Threshold */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Large Position Alert ($)</label>
              <Input
                type="number"
                min="100"
                step="100"
                value={positionSizeThreshold}
                onChange={e => setPositionSizeThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Get notified when a position size exceeds this amount
              </p>
            </div>

            {/* Profit Threshold */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Profit Milestone ($)</label>
              <Input
                type="number"
                min="10"
                step="10"
                value={profitThreshold}
                onChange={e => setProfitThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Get notified when a single trade profit exceeds this amount
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>History of your last 10 notifications</CardDescription>
        </CardHeader>
        <CardContent>
          {notificationHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No notifications yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notificationHistory.slice(0, 10).map((notification, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {new Date(notification.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{notification.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {notification.channel === 'discord' ? (
                        <MessageSquare className="h-4 w-4 text-[#5865F2]" />
                      ) : (
                        <Mail className="h-4 w-4 text-blue-500" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{notification.message}</TableCell>
                    <TableCell>
                      <Badge variant={notification.status === 'sent' ? 'profit' : 'destructive'}>
                        {notification.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchNotificationSettings} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </div>
    </div>
  );
}

export default PersonalSettings;
