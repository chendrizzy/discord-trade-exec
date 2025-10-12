import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  Building2,
  Key,
  TestTube,
  Eye,
  EyeOff,
  TrendingUp,
  Bitcoin,
  Filter
} from 'lucide-react';

const steps = [
  { id: 1, name: 'Broker Type', description: 'Choose stock or crypto broker' },
  { id: 2, name: 'Select Broker', description: 'Pick your preferred broker' },
  { id: 3, name: 'Authentication', description: 'Choose authentication method' },
  { id: 4, name: 'Credentials', description: 'Enter your API credentials' },
  { id: 5, name: 'Test Connection', description: 'Verify broker connection' },
  { id: 6, name: 'Review', description: 'Review and save configuration' },
];

export function BrokerConfigWizard() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [availableBrokers, setAvailableBrokers] = useState([]);
  const [selectedBrokerInfo, setSelectedBrokerInfo] = useState(null);

  const [config, setConfig] = useState({
    brokerType: '', // 'stock' or 'crypto'
    brokerKey: '', // e.g., 'alpaca', 'ibkr'
    authMethod: '', // 'oauth' or 'api-key'
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    environment: 'testnet', // 'testnet' or 'live'
    showApiKey: false,
    showApiSecret: false,
  });

  // Fetch available brokers when dialog opens
  useEffect(() => {
    if (open) {
      fetchAvailableBrokers();
    }
  }, [open]);

  // Fetch broker info when broker is selected
  useEffect(() => {
    if (config.brokerKey) {
      fetchBrokerInfo(config.brokerKey);
    }
  }, [config.brokerKey]);

  const fetchAvailableBrokers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/brokers');
      const data = await response.json();

      if (data.success) {
        setAvailableBrokers(data.brokers);
      }
    } catch (error) {
      console.error('Failed to fetch brokers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrokerInfo = async (brokerKey) => {
    try {
      const response = await fetch(`/api/brokers/${brokerKey}`);
      const data = await response.json();

      if (data.success) {
        setSelectedBrokerInfo(data.broker);
      }
    } catch (error) {
      console.error('Failed to fetch broker info:', error);
    }
  };

  const updateConfig = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));

    // Reset dependent fields when broker type changes
    if (key === 'brokerType') {
      setConfig(prev => ({ ...prev, brokerKey: '', authMethod: '' }));
      setSelectedBrokerInfo(null);
    }

    // Reset auth-specific fields when auth method changes
    if (key === 'authMethod') {
      setConfig(prev => ({
        ...prev,
        apiKey: '',
        apiSecret: '',
        accessToken: ''
      }));
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
      setTestResult(null); // Clear test results when moving forward
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      setTestResult(null);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setConfig({
      brokerType: '',
      brokerKey: '',
      authMethod: '',
      apiKey: '',
      apiSecret: '',
      accessToken: '',
      environment: 'testnet',
      showApiKey: false,
      showApiSecret: false,
    });
    setSelectedBrokerInfo(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const credentials = config.authMethod === 'oauth'
        ? { accessToken: config.accessToken }
        : { apiKey: config.apiKey, apiSecret: config.apiSecret };

      const response = await fetch('/api/brokers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerKey: config.brokerKey,
          credentials,
          options: { isTestnet: config.environment === 'testnet' }
        }),
      });

      const data = await response.json();

      setTestResult({
        success: data.success,
        message: data.message,
        balance: data.balance,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection failed: ${error.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      const credentials = config.authMethod === 'oauth'
        ? { accessToken: config.accessToken }
        : { apiKey: config.apiKey, apiSecret: config.apiSecret };

      const response = await fetch('/api/brokers/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerKey: config.brokerKey,
          brokerType: config.brokerType,
          authMethod: config.authMethod,
          credentials,
          environment: config.environment,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOpen(false);
        resetWizard();
        // Could trigger a success toast here
      } else {
        console.error('Failed to save broker configuration:', data.error);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = (step) => {
    switch (step) {
      case 1:
        return config.brokerType !== '';
      case 2:
        return config.brokerKey !== '';
      case 3:
        return config.authMethod !== '';
      case 4:
        if (config.authMethod === 'oauth') {
          return config.accessToken !== '';
        }
        return config.apiKey !== '' && config.apiSecret !== '';
      case 5:
        return testResult?.success === true;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const getFilteredBrokers = () => {
    return availableBrokers.filter(b =>
      b.type === config.brokerType && b.status === 'available'
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        // Broker Type Selection
        return (
          <div className="space-y-4">
            <Alert variant="info">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Choose whether you want to trade stocks or cryptocurrencies.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => updateConfig('brokerType', 'stock')}
                className={`p-6 border-2 rounded-lg transition-all ${
                  config.brokerType === 'stock'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-border hover:border-primary'
                }`}
              >
                <TrendingUp className="h-8 w-8 mb-2 mx-auto" />
                <div className="text-sm font-semibold">Stock Brokers</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Trade stocks and ETFs
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateConfig('brokerType', 'crypto')}
                className={`p-6 border-2 rounded-lg transition-all ${
                  config.brokerType === 'crypto'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-border hover:border-primary'
                }`}
              >
                <Bitcoin className="h-8 w-8 mb-2 mx-auto" />
                <div className="text-sm font-semibold">Crypto Exchanges</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Trade cryptocurrencies
                </div>
              </button>
            </div>
          </div>
        );

      case 2:
        // Broker Selection
        return (
          <div className="space-y-4">
            <Alert variant="info">
              <Filter className="h-4 w-4" />
              <AlertDescription>
                Select your preferred {config.brokerType} broker from available options.
              </AlertDescription>
            </Alert>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading brokers...
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {getFilteredBrokers().map((broker) => (
                  <button
                    key={broker.key}
                    type="button"
                    onClick={() => updateConfig('brokerKey', broker.key)}
                    className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                      config.brokerKey === broker.key
                        ? 'border-gold-500 bg-gold-500/10'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 className="h-4 w-4" />
                          <span className="font-semibold">{broker.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {broker.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {broker.features.slice(0, 4).map((feature) => (
                            <Badge key={feature} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {config.brokerKey === broker.key && (
                        <CheckCircle2 className="h-5 w-5 text-gold-500 flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 3:
        // Authentication Method
        return (
          <div className="space-y-4">
            <Alert variant="info">
              <Key className="h-4 w-4" />
              <AlertDescription>
                Choose how you want to authenticate with {selectedBrokerInfo?.name}.
              </AlertDescription>
            </Alert>

            {selectedBrokerInfo?.authMethods.includes('oauth') && (
              <button
                type="button"
                onClick={() => updateConfig('authMethod', 'oauth')}
                className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                  config.authMethod === 'oauth'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-border hover:border-primary'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold mb-1">OAuth 2.0</div>
                    <p className="text-xs text-muted-foreground">
                      Secure authentication through {selectedBrokerInfo?.name}'s login portal.
                      More secure and easier to set up.
                    </p>
                  </div>
                  {config.authMethod === 'oauth' && (
                    <CheckCircle2 className="h-5 w-5 text-gold-500 flex-shrink-0 ml-2" />
                  )}
                </div>
              </button>
            )}

            {selectedBrokerInfo?.authMethods.includes('api-key') && (
              <button
                type="button"
                onClick={() => updateConfig('authMethod', 'api-key')}
                className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                  config.authMethod === 'api-key'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-border hover:border-primary'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold mb-1">API Key</div>
                    <p className="text-xs text-muted-foreground">
                      Traditional API key and secret authentication. You'll need to generate
                      these from your {selectedBrokerInfo?.name} account.
                    </p>
                  </div>
                  {config.authMethod === 'api-key' && (
                    <CheckCircle2 className="h-5 w-5 text-gold-500 flex-shrink-0 ml-2" />
                  )}
                </div>
              </button>
            )}
          </div>
        );

      case 4:
        // Credentials Input
        return (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Never share your credentials. Enable only trading permissions, never withdrawal.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">Environment</label>
              <Select
                value={config.environment}
                onValueChange={(value) => updateConfig('environment', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="testnet">
                    Testnet / Paper Trading (Recommended)
                  </SelectItem>
                  <SelectItem value="live">
                    Live Trading (Real Money)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Start with testnet to practice without risking real money
              </p>
            </div>

            {config.authMethod === 'oauth' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Access Token</label>
                <Input
                  type="password"
                  placeholder="Enter OAuth access token"
                  value={config.accessToken}
                  onChange={(e) => updateConfig('accessToken', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Complete OAuth flow in {selectedBrokerInfo?.name} to get your access token
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <div className="relative">
                    <Input
                      type={config.showApiKey ? 'text' : 'password'}
                      placeholder="Enter API key"
                      value={config.apiKey}
                      onChange={(e) => updateConfig('apiKey', e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => updateConfig('showApiKey', !config.showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {config.showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Secret</label>
                  <div className="relative">
                    <Input
                      type={config.showApiSecret ? 'text' : 'password'}
                      placeholder="Enter API secret"
                      value={config.apiSecret}
                      onChange={(e) => updateConfig('apiSecret', e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => updateConfig('showApiSecret', !config.showApiSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {config.showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );

      case 5:
        // Connection Testing
        return (
          <div className="space-y-4">
            <Alert variant="info">
              <TestTube className="h-4 w-4" />
              <AlertDescription>
                Test your connection to verify your credentials are working correctly.
              </AlertDescription>
            </Alert>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleTestConnection}
              disabled={testing || !isStepValid(4)}
            >
              <TestTube className="mr-2 h-4 w-4" />
              {testing ? 'Testing Connection...' : 'Test Connection'}
            </Button>

            {testResult && (
              <Alert variant={testResult.success ? 'profit' : 'loss'}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <div>{testResult.message}</div>
                  {testResult.balance && (
                    <div className="mt-2 text-sm">
                      <strong>Available Balance:</strong> ${testResult.balance.available?.toLocaleString() || '0.00'}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {testResult?.success && (
              <div className="p-4 border border-profit rounded-lg bg-profit/10">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-profit-text" />
                  <span className="font-semibold">Connection Successful!</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your broker is configured correctly. Click Next to review and save.
                </p>
              </div>
            )}
          </div>
        );

      case 6:
        // Review & Save
        return (
          <div className="space-y-4">
            <Alert variant="profit">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Configuration complete! Review your settings before saving.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Broker Type:</span>
                <Badge variant="gold">{config.brokerType === 'stock' ? 'Stocks' : 'Crypto'}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Broker:</span>
                <span className="text-sm font-semibold">{selectedBrokerInfo?.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Auth Method:</span>
                <Badge variant="info">
                  {config.authMethod === 'oauth' ? 'OAuth 2.0' : 'API Key'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Environment:</span>
                <Badge variant={config.environment === 'testnet' ? 'outline' : 'warning'}>
                  {config.environment === 'testnet' ? 'Paper Trading' : 'Live Trading'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Connection:</span>
                <Badge variant="profit">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Verified
                </Badge>
              </div>

              {selectedBrokerInfo && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <div className="text-xs font-semibold mb-2">Supported Features:</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedBrokerInfo.features.map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
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
          <Building2 className="mr-2 h-4 w-4" />
          Add Broker Connection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Broker Configuration Wizard
          </DialogTitle>
          <DialogDescription>{steps[currentStep - 1].description}</DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  currentStep === step.id
                    ? 'border-gold-500 bg-gold-500 text-black font-bold'
                    : currentStep > step.id
                    ? 'border-profit bg-profit text-black'
                    : 'border-border bg-background text-muted-foreground'
                }`}
              >
                {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 w-8 mx-1 ${
                    currentStep > step.id ? 'bg-profit' : 'bg-border'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[350px]">{renderStep()}</div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1 || loading}
            >
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Step {currentStep} of {steps.length}
            </div>
            {currentStep < steps.length ? (
              <Button
                variant="gold"
                onClick={nextStep}
                disabled={!isStepValid(currentStep)}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="profit"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
