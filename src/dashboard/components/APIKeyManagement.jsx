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
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Key, Plus, Trash2, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

const exchanges = [
  { id: 'binance', name: 'Binance', logo: '🔶', connected: true },
  { id: 'coinbase', name: 'Coinbase', logo: '🔵', connected: false },
  { id: 'kraken', name: 'Kraken', logo: '🟣', connected: false },
  { id: 'kucoin', name: 'KuCoin', logo: '🟢', connected: false }
];

export function APIKeyManagement() {
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
    passphrase: ''
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const resetForm = () => {
    setFormData({ apiKey: '', apiSecret: '', passphrase: '' });
    setShowApiKey(false);
    setShowApiSecret(false);
    setTestResult(null);
  };

  const handleOpenDialog = exchange => {
    setSelectedExchange(exchange);
    if (exchange.connected) {
      // Load existing keys (masked)
      setFormData({
        apiKey: '••••••••••••••••••••••••••••••••',
        apiSecret: '••••••••••••••••••••••••••••••••',
        passphrase: ''
      });
    } else {
      resetForm();
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // Simulate API test
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock result
    const success = Math.random() > 0.3;
    setTestResult({
      success,
      message: success
        ? 'Connection successful! Your API keys are valid.'
        : 'Connection failed. Please check your API keys and try again.'
    });
    setTesting(false);
  };

  const handleSave = () => {
    console.log('Saving API keys for', selectedExchange.id, formData);
    setSelectedExchange(null);
    resetForm();
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedExchange.name} API keys?`)) {
      console.log('Deleting API keys for', selectedExchange.id);
      setSelectedExchange(null);
      resetForm();
    }
  };

  const maskValue = (value, show) => {
    if (!value) return '';
    if (show) return value;
    return value.replace(/./g, '•');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exchanges.map(exchange => (
          <Dialog
            key={exchange.id}
            onOpenChange={open => {
              if (!open) {
                setSelectedExchange(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <div
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:border-primary transition-colors cursor-pointer"
                onClick={() => handleOpenDialog(exchange)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{exchange.logo}</div>
                  <div>
                    <h4 className="text-sm font-semibold">{exchange.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {exchange.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                {exchange.connected ? (
                  <Badge variant="profit">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <Plus className="mr-1 h-3 w-3" />
                    Add Keys
                  </Badge>
                )}
              </div>
            </DialogTrigger>

            {selectedExchange?.id === exchange.id && (
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-2xl">{selectedExchange.logo}</span>
                    {selectedExchange.name} API Keys
                  </DialogTitle>
                  <DialogDescription>
                    {selectedExchange.connected
                      ? 'Update your API keys or test the connection'
                      : 'Enter your API keys to connect your exchange account'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <Alert variant="warning">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Never share your API keys. Enable only trading permissions, never withdrawal.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="Enter API key"
                        value={formData.apiKey}
                        onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Secret</label>
                    <div className="relative">
                      <Input
                        type={showApiSecret ? 'text' : 'password'}
                        placeholder="Enter API secret"
                        value={formData.apiSecret}
                        onChange={e => setFormData({ ...formData, apiSecret: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiSecret(!showApiSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {selectedExchange.id === 'kucoin' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Passphrase</label>
                      <Input
                        type="password"
                        placeholder="Enter passphrase"
                        value={formData.passphrase}
                        onChange={e => setFormData({ ...formData, passphrase: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        KuCoin requires a passphrase for API authentication
                      </p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleTestConnection}
                    disabled={testing || !formData.apiKey || !formData.apiSecret}
                  >
                    <Key className="mr-2 h-4 w-4" />
                    {testing ? 'Testing Connection...' : 'Test Connection'}
                  </Button>

                  {testResult && (
                    <Alert variant={testResult.success ? 'profit' : 'loss'}>
                      {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      <AlertDescription>{testResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <DialogFooter>
                  <div className="flex items-center justify-between w-full">
                    {selectedExchange.connected ? (
                      <Button variant="destructive" size="sm" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    ) : (
                      <div />
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setSelectedExchange(null)}>
                        Cancel
                      </Button>
                      <Button variant="gold" onClick={handleSave} disabled={!formData.apiKey || !formData.apiSecret}>
                        {selectedExchange.connected ? 'Update' : 'Save'}
                      </Button>
                    </div>
                  </div>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        ))}
      </div>
    </div>
  );
}
