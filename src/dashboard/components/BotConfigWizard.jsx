import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle, Bot, CheckCircle2 } from 'lucide-react';

const steps = [
  { id: 1, name: 'Bot Type', description: 'Choose your trading bot type' },
  { id: 2, name: 'Trading Pairs', description: 'Select trading pairs' },
  { id: 3, name: 'Risk Parameters', description: 'Configure risk management' },
  { id: 4, name: 'Strategy', description: 'Set strategy parameters' },
  { id: 5, name: 'Review', description: 'Review and confirm' }
];

export function BotConfigWizard() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState({
    botType: '',
    tradingPair: '',
    maxPositionSize: '',
    stopLoss: '',
    takeProfit: '',
    strategyType: '',
    indicator1: '',
    indicator2: ''
  });

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setConfig({
      botType: '',
      tradingPair: '',
      maxPositionSize: '',
      stopLoss: '',
      takeProfit: '',
      strategyType: '',
      indicator1: '',
      indicator2: ''
    });
  };

  const handleComplete = () => {
    // WCAG 3.3.4 Error Prevention - Require confirmation for financial transactions
    const confirmMessage = `Are you sure you want to create this trading bot?\n\nBot Type: ${config.botType}\nTrading Pair: ${config.tradingPair}\nMax Position: $${config.maxPositionSize}\nStop Loss: ${config.stopLoss}%\nTake Profit: ${config.takeProfit}%\n\nThis bot will execute real trades. Confirm to proceed.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    console.log('Bot configuration:', config);
    setOpen(false);
    resetWizard();
  };

  const isStepValid = step => {
    switch (step) {
      case 1:
        return config.botType !== '';
      case 2:
        return config.tradingPair !== '';
      case 3:
        return config.maxPositionSize !== '' && config.stopLoss !== '' && config.takeProfit !== '';
      case 4:
        return config.strategyType !== '';
      case 5:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="bot-type-select" className="text-sm font-medium">Bot Type</label>
              <Select value={config.botType} onValueChange={value => updateConfig('botType', value)}>
                <SelectTrigger id="bot-type-select" aria-describedby="bot-type-help">
                  <SelectValue placeholder="Select bot type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dca">DCA (Dollar Cost Averaging)</SelectItem>
                  <SelectItem value="grid">Grid Trading</SelectItem>
                  <SelectItem value="trend">Trend Following</SelectItem>
                  <SelectItem value="scalping">Scalping</SelectItem>
                  <SelectItem value="arbitrage">Arbitrage</SelectItem>
                </SelectContent>
              </Select>
              <p id="bot-type-help" className="text-xs text-muted-foreground">Choose the type of trading strategy your bot will use</p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="trading-pair-select" className="text-sm font-medium">Trading Pair</label>
              <Select value={config.tradingPair} onValueChange={value => updateConfig('tradingPair', value)}>
                <SelectTrigger id="trading-pair-select" aria-describedby="trading-pair-help">
                  <SelectValue placeholder="Select trading pair" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
                  <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
                  <SelectItem value="SOL/USDT">SOL/USDT</SelectItem>
                  <SelectItem value="AVAX/USDT">AVAX/USDT</SelectItem>
                  <SelectItem value="MATIC/USDT">MATIC/USDT</SelectItem>
                </SelectContent>
              </Select>
              <p id="trading-pair-help" className="text-xs text-muted-foreground">Select the cryptocurrency pair you want to trade</p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Alert variant="info">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Risk management is crucial for protecting your capital. Set conservative limits when starting.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label htmlFor="max-position-size" className="text-sm font-medium">Max Position Size ($)</label>
              <Input
                id="max-position-size"
                type="number"
                placeholder="1000"
                value={config.maxPositionSize}
                onChange={e => updateConfig('maxPositionSize', e.target.value)}
                aria-describedby="max-position-help"
                aria-required="true"
                autoComplete="transaction-amount"
              />
              <p id="max-position-help" className="text-xs text-muted-foreground">Maximum amount to invest in a single position</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="stop-loss" className="text-sm font-medium">Stop Loss (%)</label>
              <Input
                id="stop-loss"
                type="number"
                placeholder="5"
                value={config.stopLoss}
                onChange={e => updateConfig('stopLoss', e.target.value)}
                aria-describedby="stop-loss-help"
                aria-required="true"
              />
              <p id="stop-loss-help" className="text-xs text-muted-foreground">Percentage loss at which to automatically exit position</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="take-profit" className="text-sm font-medium">Take Profit (%)</label>
              <Input
                id="take-profit"
                type="number"
                placeholder="10"
                value={config.takeProfit}
                onChange={e => updateConfig('takeProfit', e.target.value)}
                aria-describedby="take-profit-help"
                aria-required="true"
              />
              <p id="take-profit-help" className="text-xs text-muted-foreground">Percentage gain at which to automatically take profits</p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="strategy-type-select" className="text-sm font-medium">Strategy Type</label>
              <Select value={config.strategyType} onValueChange={value => updateConfig('strategyType', value)}>
                <SelectTrigger id="strategy-type-select" aria-required="true">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="indicator-1-select" className="text-sm font-medium">Primary Indicator</label>
              <Select value={config.indicator1} onValueChange={value => updateConfig('indicator1', value)}>
                <SelectTrigger id="indicator-1-select">
                  <SelectValue placeholder="Select indicator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rsi">RSI (Relative Strength Index)</SelectItem>
                  <SelectItem value="macd">MACD</SelectItem>
                  <SelectItem value="ema">EMA (Exponential Moving Average)</SelectItem>
                  <SelectItem value="bollinger">Bollinger Bands</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="indicator-2-select" className="text-sm font-medium">Secondary Indicator (Optional)</label>
              <Select value={config.indicator2} onValueChange={value => updateConfig('indicator2', value)}>
                <SelectTrigger id="indicator-2-select">
                  <SelectValue placeholder="Select indicator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="volume">Volume</SelectItem>
                  <SelectItem value="stochastic">Stochastic</SelectItem>
                  <SelectItem value="atr">ATR (Average True Range)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <Alert variant="profit">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Configuration complete! Review your settings before creating the bot.</AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Bot Type:</span>
                <Badge variant="gold">{config.botType || 'Not set'}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Trading Pair:</span>
                <span className="text-sm font-mono">{config.tradingPair || 'Not set'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Max Position:</span>
                <span className="text-sm font-mono">${config.maxPositionSize || '0'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Stop Loss:</span>
                <span className="text-sm font-mono text-loss-text">{config.stopLoss || '0'}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Take Profit:</span>
                <span className="text-sm font-mono text-profit-text">{config.takeProfit || '0'}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Strategy:</span>
                <Badge variant="info">{config.strategyType || 'Not set'}</Badge>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" className="w-full">
          <Bot className="mr-2 h-4 w-4" />
          Create New Bot
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Bot Configuration Wizard
          </DialogTitle>
          <DialogDescription>{steps[currentStep - 1].description}</DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <nav aria-label="Bot configuration progress" className="mb-6">
          <ol className="flex items-center justify-between">
            {steps.map((step, index) => (
              <li key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    currentStep === step.id
                      ? 'border-gold-500 bg-gold-500 text-black font-bold'
                      : currentStep > step.id
                        ? 'border-profit bg-profit text-black'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                  aria-label={`Step ${step.id}: ${step.name}${currentStep === step.id ? ' (current)' : currentStep > step.id ? ' (complete)' : ''}`}
                  aria-current={currentStep === step.id ? 'step' : undefined}
                >
                  {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={`h-0.5 w-12 mx-2 ${currentStep > step.id ? 'bg-profit' : 'bg-border'}`} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* Step content */}
        <div className="min-h-[300px]">{renderStep()}</div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              aria-label="Go to previous step"
            >
              Previous
            </Button>
            <div className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
              Step {currentStep} of {steps.length}
            </div>
            {currentStep < steps.length ? (
              <Button
                type="button"
                variant="gold"
                onClick={nextStep}
                disabled={!isStepValid(currentStep)}
                aria-label="Go to next step"
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                variant="profit"
                onClick={handleComplete}
                aria-label="Create trading bot (requires confirmation)"
              >
                Create Bot
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
