import { useState, useEffect, useCallback } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { BrokerConfigWizard } from './BrokerConfigWizard';
import { BrokerConnectionCard } from './oauth/BrokerConnectionCard';

export function BrokerManagement() {
  const [configuredBrokers, setConfiguredBrokers] = useState([]);
  const [configuredError, setConfiguredError] = useState(null);
  const [loadingConfigured, setLoadingConfigured] = useState(true);
  const [testingBroker, setTestingBroker] = useState(null);
  const [testResults, setTestResults] = useState({});

  const [oauthBrokers, setOAuthBrokers] = useState([]);
  const [loadingOAuth, setLoadingOAuth] = useState(true);
  const [oauthError, setOAuthError] = useState(null);
  const [oauthAction, setOAuthAction] = useState(null);
  const [callbackNotice, setCallbackNotice] = useState(null);

  const fetchConfiguredBrokers = useCallback(async () => {
    try {
      setLoadingConfigured(true);
      setConfiguredError(null);
      const response = await fetch('/api/brokers/user/configured');
      if (!response.ok) {
        throw new Error(`Failed to load configured brokers (${response.status})`);
      }
      const data = await response.json();

      if (data.success) {
        setConfiguredBrokers(data.brokers);
      } else {
        throw new Error(data.error || 'Unable to load broker configurations.');
      }
    } catch (error) {
      console.error('Failed to fetch configured brokers:', error);
      setConfiguredError(error.message);
    } finally {
      setLoadingConfigured(false);
    }
  }, []);

  const fetchOAuthStatus = useCallback(async () => {
    try {
      setLoadingOAuth(true);
      setOAuthError(null);
      const response = await fetch('/api/auth/brokers/status');
      if (!response.ok) {
        throw new Error(`Failed to load OAuth2 broker status (${response.status})`);
      }
      const data = await response.json();

      if (data.success) {
        const sorted = (data.brokers || []).sort((a, b) => a.name.localeCompare(b.name));
        setOAuthBrokers(sorted);
      } else {
        throw new Error(data.error || 'Unable to load OAuth2 connections.');
      }
    } catch (error) {
      console.error('Failed to fetch OAuth brokers:', error);
      setOAuthError(error.message);
    } finally {
      setLoadingOAuth(false);
    }
  }, []);

  useEffect(() => {
    fetchConfiguredBrokers();
    fetchOAuthStatus();
  }, [fetchConfiguredBrokers, fetchOAuthStatus]);

  const handleRefreshOAuth = async broker => {
    try {
      setOAuthError(null);
      setOAuthAction({ type: 'refresh', broker: broker.key });
      const response = await fetch(`/api/brokers/${broker.key}/oauth/refresh`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to refresh access token.');
      }
      await fetchOAuthStatus();
    } catch (error) {
      console.error('Failed to refresh OAuth token:', error);
      setOAuthError(error.message);
    } finally {
      setOAuthAction(null);
    }
  };

  const handleDisconnectOAuth = async broker => {
    if (!confirm(`Disconnect ${broker.name}? You can reconnect at any time.`)) {
      return;
    }

    try {
      setOAuthError(null);
      setOAuthAction({ type: 'disconnect', broker: broker.key });
      const response = await fetch(`/api/brokers/${broker.key}/oauth`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect broker.');
      }
      await fetchOAuthStatus();
    } catch (error) {
      console.error('Failed to disconnect OAuth broker:', error);
      setOAuthError(error.message);
    } finally {
      setOAuthAction(null);
    }
  };

  const handleTestConnection = async brokerKey => {
    setTestingBroker(brokerKey);
    setConfiguredError(null);
    setTestResults(prev => ({ ...prev, [brokerKey]: null }));

    try {
      const response = await fetch(`/api/brokers/test/${brokerKey}`, {
        method: 'POST'
      });
      const data = await response.json();

      setTestResults(prev => ({
        ...prev,
        [brokerKey]: {
          success: data.success,
          message: data.message,
          balance: data.balance
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [brokerKey]: {
          success: false,
          message: `Test failed: ${error.message}`
        }
      }));
    } finally {
      setTestingBroker(null);
    }
  };

  const handleDisconnectConfigured = async brokerKey => {
    if (!confirm(`Are you sure you want to disconnect ${brokerKey}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/brokers/user/${brokerKey}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        setConfiguredBrokers(prev => prev.filter(b => b.key !== brokerKey));
        setTestResults(prev => {
          const updated = { ...prev };
          delete updated[brokerKey];
          return updated;
        });
      } else {
        throw new Error(data.error || 'Failed to disconnect broker.');
      }
    } catch (error) {
      console.error('Failed to disconnect broker:', error);
      setConfiguredError(error.message);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let shouldUpdateUrl = false;

    if (params.has('connection')) {
      const brokerParam = params.get('broker');
      setCallbackNotice({
        type: 'success',
        message: `${(brokerParam || 'Broker').toUpperCase()} connected successfully.`
      });
      setOAuthAction(null);
      fetchOAuthStatus();
      params.delete('connection');
      params.delete('broker');
      shouldUpdateUrl = true;
    }

    if (params.has('oauth_error')) {
      const errorMessage = params.get('oauth_error');
      setCallbackNotice({
        type: 'error',
        message: errorMessage || 'Authorization failed. Please try connecting again.'
      });
      params.delete('oauth_error');
      shouldUpdateUrl = true;
    }

    if (shouldUpdateUrl) {
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [fetchOAuthStatus]);

  return (
    <div className="space-y-10">
      {/* OAuth2 Connections Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">OAuth2 Broker Connections</h2>
            <p className="text-muted-foreground text-sm">
              Securely connect supported brokers using short-lived OAuth2 tokens. Tokens are encrypted with AES-256-GCM
              and refreshed automatically.
            </p>
          </div>
        </div>

        {callbackNotice && (
          <Alert variant={callbackNotice.type === 'success' ? 'profit' : 'loss'}>
            {callbackNotice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{callbackNotice.message}</AlertDescription>
          </Alert>
        )}

        {oauthError && (
          <Alert variant="loss">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{oauthError}</AlertDescription>
          </Alert>
        )}

        {loadingOAuth ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">Loading OAuth2 broker status…</div>
            </CardContent>
          </Card>
        ) : oauthBrokers.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">No OAuth2 Brokers Connected</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Connect your broker account securely through their official login portal.
                  </p>
                </div>
                <div className="flex justify-center">
                  <BrokerConfigWizard onSuccess={fetchOAuthStatus} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {oauthBrokers.map(broker => (
              <BrokerConnectionCard
                key={broker.key}
                broker={broker}
                actionState={oauthAction}
                onRefresh={() => handleRefreshOAuth(broker)}
                onDisconnect={() => handleDisconnectOAuth(broker)}
                onStartConnect={() => {
                  setOAuthError(null);
                  setOAuthAction({ type: 'connect', broker: broker.key });
                }}
                onError={error => {
                  setOAuthAction(null);
                  setOAuthError(error?.message || 'Unable to start authorization flow.');
                }}
              />
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-border/60" />

      {/* API Key / Legacy Broker Configurations */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">API Key Broker Configurations</h2>
          <p className="text-muted-foreground text-sm">
            Manage brokers that use API keys or other credential-based authentication.
          </p>
        </div>

        {configuredError && (
          <Alert variant="loss">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{configuredError}</AlertDescription>
          </Alert>
        )}

        {loadingConfigured ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">Loading broker configurations…</div>
            </CardContent>
          </Card>
        ) : configuredBrokers.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">No API Key Brokers Connected</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Use the broker wizard to add exchanges that require API keys.
                  </p>
                </div>
                <div className="flex justify-center">
                  <BrokerConfigWizard onSuccess={fetchConfiguredBrokers} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
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

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleTestConnection(broker.key)}
                        disabled={isTesting}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
                        {isTesting ? 'Testing…' : 'Test Connection'}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDisconnectConfigured(broker.key)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {configuredBrokers.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security:</strong> API keys are encrypted with AWS KMS before storage. Always regenerate keys if you
              suspect a compromise.
            </AlertDescription>
          </Alert>
        )}
      </section>
    </div>
  );
}
