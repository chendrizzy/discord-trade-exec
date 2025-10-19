import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Navigation } from '../components/Navigation';

/**
 * Trader Dashboard
 *
 * Dashboard for individual traders and viewers.
 * Focused on personal trading, broker management, and trade history.
 *
 * Features:
 * - Personal trading overview (P&L, positions)
 * - Signal feed and provider discovery
 * - Broker management
 * - Trade history
 * - Risk settings
 * - Notifications
 * - Personal subscription
 */
export function TraderDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={`${user.username}#${user.discriminator}`}
        onLogout={onLogout}
        user={user}
        dashboardType="trader"
      />

      {/* Main Content */}
      <main className="pt-[192px] pb-32 md:pt-0 md:pb-0 md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Tab Navigation */}
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="brokers">Brokers</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Trading Overview</CardTitle>
                    <CardDescription>
                      Your personal trading performance and metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.1 - Implement TraderOverview component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Trading Overview</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Signals Tab */}
            <TabsContent value="signals">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Signal Feed</CardTitle>
                    <CardDescription>
                      Discover and follow signal providers
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.2 - Implement SignalFeed component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Signal Feed</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Brokers Tab */}
            <TabsContent value="brokers">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Broker Management</CardTitle>
                    <CardDescription>
                      Manage your broker connections and credentials
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.3 - Reuse existing BrokerManagement component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Broker Management</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Trade History</CardTitle>
                    <CardDescription>
                      View your complete trading history with analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.4 - Implement TradeHistory component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Trade History</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Risk Tab */}
            <TabsContent value="risk">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Risk Management</CardTitle>
                    <CardDescription>
                      Configure position sizing and risk parameters
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.5 - Implement RiskSettings component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Risk Management</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Personal Settings</CardTitle>
                    <CardDescription>
                      Manage notifications and preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.6 - Implement PersonalSettings component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Personal Settings</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Subscription</CardTitle>
                    <CardDescription>
                      Manage your personal subscription and usage
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 3.7 - Reuse SubscriptionCard component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Subscription</p>
                      <p className="text-sm">Coming soon in Phase 3</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
