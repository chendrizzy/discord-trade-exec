import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertCircle, Shield, TrendingDown, DollarSign, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

/**
 * RiskSettings Component
 *
 * Risk management configuration for position sizing and risk controls.
 *
 * Features:
 * - Position sizing configuration (percentage or fixed)
 * - Default stop-loss/take-profit inputs
 * - Risk profile presets (conservative, moderate, aggressive)
 * - Position size calculator with live preview
 * - Save button that PUTs to /api/trader/risk-profile
 *
 * API Endpoints:
 * - GET /api/trader/risk-profile - Fetches current risk settings
 * - PUT /api/trader/risk-profile - Updates risk settings
 *
 * Usage:
 * import { RiskSettings } from './components/RiskSettings';
 * <RiskSettings />
 */
export function RiskSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Risk profile state
  const [positionSizingMode, setPositionSizingMode] = useState('percentage'); // 'percentage' or 'fixed'
  const [positionSizePercent, setPositionSizePercent] = useState(5);
  const [positionSizeFixed, setPositionSizeFixed] = useState(1000);
  const [maxPositionSize, setMaxPositionSize] = useState(5);
  const [defaultStopLoss, setDefaultStopLoss] = useState(2);
  const [defaultTakeProfit, setDefaultTakeProfit] = useState(5);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  const [maxOpenPositions, setMaxOpenPositions] = useState(5);

  // Calculator state
  const [accountBalance, setAccountBalance] = useState(10000);
  const [entryPrice, setEntryPrice] = useState(100);

  useEffect(() => {
    fetchRiskProfile();
  }, []);

  const fetchRiskProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/trader/risk-profile');
      const data = await response.json();

      if (data.success) {
        const profile = data.data;
        setPositionSizingMode(profile.positionSizingMode || 'percentage');
        setPositionSizePercent(Number(profile.positionSizePercent ?? 5));
        setPositionSizeFixed(Number(profile.positionSizeFixed ?? 1000));
        setMaxPositionSize(Number(profile.maxPositionSize ?? 5));
        setDefaultStopLoss(Number(profile.defaultStopLoss ?? 2));
        setDefaultTakeProfit(Number(profile.defaultTakeProfit ?? 5));
        setMaxDailyLoss(Number(profile.maxDailyLoss ?? 5));
        setMaxOpenPositions(Number(profile.maxOpenPositions ?? 5));
        setAccountBalance(profile.accountBalance ? Number(profile.accountBalance) : 10000);
      } else {
        setError(data.error || 'Failed to fetch risk profile');
      }
    } catch (err) {
      console.error('Risk profile fetch error:', err);
      setError('Failed to load risk settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage('');
    try {
      const response = await fetch('/api/trader/risk-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionSizingMode,
          positionSizePercent,
          positionSizeFixed,
          maxPositionSize,
          defaultStopLoss,
          defaultTakeProfit,
          maxDailyLoss,
          maxOpenPositions
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Risk settings saved successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to save risk settings');
      }
    } catch (err) {
      console.error('Risk profile save error:', err);
      setError('Failed to save risk settings');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = preset => {
    switch (preset) {
      case 'conservative':
        setPositionSizingMode('percentage');
        setPositionSizePercent(2);
        setMaxPositionSize(500);
        setDefaultStopLoss(1);
        setDefaultTakeProfit(3);
        setMaxDailyLoss(200);
        setMaxOpenPositions(3);
        break;
      case 'moderate':
        setPositionSizingMode('percentage');
        setPositionSizePercent(5);
        setMaxPositionSize(1000);
        setDefaultStopLoss(2);
        setDefaultTakeProfit(5);
        setMaxDailyLoss(500);
        setMaxOpenPositions(5);
        break;
      case 'aggressive':
        setPositionSizingMode('percentage');
        setPositionSizePercent(10);
        setMaxPositionSize(2000);
        setDefaultStopLoss(3);
        setDefaultTakeProfit(8);
        setMaxDailyLoss(1000);
        setMaxOpenPositions(8);
        break;
    }
  };

  // Calculate position size based on current settings
  const calculatePositionSize = () => {
    if (positionSizingMode === 'percentage') {
      return (accountBalance * positionSizePercent) / 100;
    }
    return positionSizeFixed;
  };

  const calculatedPositionSize = calculatePositionSize();
  const calculatedQuantity = entryPrice > 0 ? (calculatedPositionSize / entryPrice).toFixed(4) : 0;
  const stopLossPrice = entryPrice * (1 - defaultStopLoss / 100);
  const takeProfitPrice = entryPrice * (1 + defaultTakeProfit / 100);
  const riskAmount = calculatedPositionSize * (defaultStopLoss / 100);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="text-muted-foreground">Loading risk settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <Alert className="border-profit-border bg-profit-bg">
          <Shield className="h-4 w-4 text-profit-text" />
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

      {/* Risk Profile Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Risk Profile Presets
          </CardTitle>
          <CardDescription>Quick presets for different risk tolerances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start"
              onClick={() => applyPreset('conservative')}
            >
              <div className="font-semibold mb-1">Conservative</div>
              <div className="text-xs text-muted-foreground text-left">
                2% position size, 1% stop-loss, max 3 positions
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start"
              onClick={() => applyPreset('moderate')}
            >
              <div className="font-semibold mb-1">Moderate</div>
              <div className="text-xs text-muted-foreground text-left">
                5% position size, 2% stop-loss, max 5 positions
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start"
              onClick={() => applyPreset('aggressive')}
            >
              <div className="font-semibold mb-1">Aggressive</div>
              <div className="text-xs text-muted-foreground text-left">
                10% position size, 3% stop-loss, max 8 positions
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Position Sizing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Position Sizing
          </CardTitle>
          <CardDescription>Configure how position sizes are calculated</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Sizing Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Position Sizing Mode</label>
              <Select value={positionSizingMode} onValueChange={setPositionSizingMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of Account</SelectItem>
                  <SelectItem value="fixed">Fixed Dollar Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Percentage Mode */}
            {positionSizingMode === 'percentage' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Position Size: {positionSizePercent}% of account</label>
                <Input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={positionSizePercent}
                  onChange={e => setPositionSizePercent(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: 2-5% for conservative, 5-10% for moderate, 10-15% for aggressive
                </p>
              </div>
            )}

            {/* Fixed Mode */}
            {positionSizingMode === 'fixed' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Fixed Position Size ($)</label>
                <Input
                  type="number"
                  min="10"
                  step="10"
                  value={positionSizeFixed}
                  onChange={e => setPositionSizeFixed(Number(e.target.value))}
                />
              </div>
            )}

            {/* Max Position Size */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Maximum Position Size (% of account)</label>
              <Input
                type="number"
                min="1"
                max="25"
                step="0.5"
                value={maxPositionSize}
                onChange={e => setMaxPositionSize(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Hard cap on position risk relative to current balance</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stop Loss & Take Profit */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Stop Loss & Take Profit
          </CardTitle>
          <CardDescription>Default risk and reward targets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stop Loss */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Stop Loss: {defaultStopLoss}%</label>
              <Input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={defaultStopLoss}
                onChange={e => setDefaultStopLoss(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Maximum loss per trade</p>
            </div>

            {/* Take Profit */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Take Profit: {defaultTakeProfit}%</label>
              <Input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={defaultTakeProfit}
                onChange={e => setDefaultTakeProfit(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Target profit per trade</p>
            </div>
          </div>

          {/* Risk/Reward Ratio */}
          <div className="mt-4 p-3 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Risk/Reward Ratio:</span>
              <Badge variant={defaultTakeProfit / defaultStopLoss >= 2 ? 'profit' : 'warning'}>
                1:{(defaultTakeProfit / defaultStopLoss).toFixed(2)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Recommended minimum: 1:2 (risk $1 to potentially gain $2)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Risk Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Risk Limits
          </CardTitle>
          <CardDescription>Daily and position limits to protect your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Max Daily Loss */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Maximum Daily Loss (% of account)</label>
              <Input
                type="number"
                min="1"
                max="20"
                step="0.5"
                value={maxDailyLoss}
                onChange={e => setMaxDailyLoss(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Trading stops when cumulative daily drawdown exceeds this percentage</p>
            </div>

            {/* Max Open Positions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Maximum Open Positions</label>
              <Input
                type="number"
                min="1"
                max="20"
                value={maxOpenPositions}
                onChange={e => setMaxOpenPositions(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Limit concurrent positions for diversification</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Position Size Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Position Size Calculator
          </CardTitle>
          <CardDescription>Preview how your settings affect position sizing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Input Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Account Balance ($)</label>
                <Input
                  type="number"
                  min="100"
                  step="100"
                  value={accountBalance}
                  onChange={e => setAccountBalance(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Entry Price ($)</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={entryPrice}
                  onChange={e => setEntryPrice(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Calculated Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Position Size</div>
                <div className="text-lg font-bold font-mono">${calculatedPositionSize.toFixed(2)}</div>
              </div>
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                <div className="text-lg font-bold font-mono">{calculatedQuantity}</div>
              </div>
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Stop Loss</div>
                <div className="text-lg font-bold font-mono text-loss-text">${stopLossPrice.toFixed(2)}</div>
              </div>
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Take Profit</div>
                <div className="text-lg font-bold font-mono text-profit-text">${takeProfitPrice.toFixed(2)}</div>
              </div>
            </div>

            {/* Risk Summary */}
            <div className="p-4 border border-border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Risk per Trade:</span>
                <span className="text-lg font-bold font-mono text-loss-text">${riskAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Potential Profit:</span>
                <span className="font-mono text-profit-text">
                  ${(calculatedPositionSize * (defaultTakeProfit / 100)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchRiskProfile} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Risk Settings'}
        </Button>
      </div>
    </div>
  );
}

export default RiskSettings;
