import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  Building2,
  TrendingUp,
  Bitcoin,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Plus,
  AlertCircle
} from 'lucide-react';
import { BrokerConfigWizard } from './BrokerConfigWizard';

export function BrokerManagement() {
  const [configuredBrokers, setConfiguredBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingBroker, setTestingBroker] = useState(null);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    fetchConfiguredBrokers();
  }, []);

  const fetchConfiguredBrokers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/brokers/user/configured');
      const data = await response.json();

      if (data.success) {
        setConfiguredBrokers(data.brokers);
      }
    } catch (error) {
      console.error('Failed to fetch configured brokers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async brokerKey => {
    setTestingBroker(brokerKey);
    setTestResults({ ...testResults, [brokerKey]: null });

    try {
      // We can't test without credentials from the database
      // In production, backend should handle this by retrieving stored credentials
      const response = await fetch(`/api/brokers/test/${brokerKey}`, {
        method: 'POST'
      });
      const data = await response.json();

      setTestResults({
        ...testResults,
        [brokerKey]: {
          success: data.success,
          message: data.message,
          balance: data.balance
        }
      });
    } catch (error) {
      setTestResults({
        ...testResults,
        [brokerKey]: {
          success: false,
          message: `Test failed: ${error.message}`
        }
      });
    } finally {
      setTestingBroker(null);
    }
  };

  const handleDisconnect = async brokerKey => {
    if (!confirm(`Are you sure you want to disconnect ${brokerKey}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/brokers/user/${brokerKey}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        // Remove from list
        setConfiguredBrokers(configuredBrokers.filter(b => b.key !== brokerKey));
        // Clear test results
        const newTestResults = { ...testResults };
        delete newTestResults[brokerKey];
        setTestResults(newTestResults);
      }
    } catch (error) {
      console.error('Failed to disconnect broker:', error);
    }
  };

  const getBrokerIcon = type => {
    return type === 'stock' ? <TrendingUp className="h-5 w-5" /> : <Bitcoin className="h-5 w-5" />;
  };

  const getEnvironmentBadge = environment => {
    return environment === 'testnet' ? (
      <Badge variant="outline">Paper Trading</Badge>
    ) : (
      <Badge variant="warning">Live Trading</Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">Loading broker configurations...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Broker Connections</h2>
          <p className="text-muted-foreground">Manage your stock and crypto broker integrations</p>
        </div>
        {configuredBrokers.length > 0 && <BrokerConfigWizard />}
      </div>

      {/* Empty State */}
      {configuredBrokers.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold mb-2">No Brokers Connected</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Connect your first broker to start automated trading
                </p>
              </div>
              <div className="flex justify-center">
                <BrokerConfigWizard />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configured Brokers Grid */}
      {configuredBrokers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {configuredBrokers.map(broker => {
            const testResult = testResults[broker.key];
            const isTesting = testingBroker === broker.key;

            return (
              <Card key={broker.key} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">{getBrokerIcon(broker.type)}</div>
                      <div>
                        <CardTitle className="text-lg">{broker.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={broker.type === 'stock' ? 'info' : 'gold'}>
                            {broker.type === 'stock' ? 'Stocks' : 'Crypto'}
                          </Badge>
                          {getEnvironmentBadge(broker.environment)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Connection Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-muted-foreground">Auth Method:</span>
                      <Badge variant="outline">{broker.authMethod === 'oauth' ? 'OAuth 2.0' : 'API Key'}</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-muted-foreground">Configured:</span>
                      <span className="font-mono text-xs">{new Date(broker.configuredAt).toLocaleDateString()}</span>
                    </div>
                    {broker.lastVerified && (
                      <div className="flex justify-between items-center py-2 border-b border-border">
                        <span className="text-muted-foreground">Last Verified:</span>
                        <span className="font-mono text-xs">{new Date(broker.lastVerified).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <Alert variant={testResult.success ? 'profit' : 'loss'}>
                      {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      <AlertDescription>
                        <div className="text-sm">{testResult.message}</div>
                        {testResult.balance && (
                          <div className="mt-2 text-xs">
                            <strong>Balance:</strong> ${testResult.balance.available?.toLocaleString() || '0.00'}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleTestConnection(broker.key)}
                      disabled={isTesting}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDisconnect(broker.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info Alert */}
      {configuredBrokers.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Security:</strong> Your credentials are encrypted at rest using AES-256-GCM encryption. Always use
            paper trading (testnet) mode when testing new strategies.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
