import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Navigation } from '../components/Navigation';
import TraderOverview from '../components/TraderOverview';
import SignalFeed from '../components/SignalFeed';
import TradeHistory from '../components/TradeHistory';
import RiskSettings from '../components/RiskSettings';
import PersonalSettings from '../components/PersonalSettings';
// TODO: Phase 3.3 - Import and adapt BrokerManagement component from existing dashboard

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
              <TraderOverview />
            </TabsContent>

            {/* Signals Tab */}
            <TabsContent value="signals">
              <SignalFeed />
            </TabsContent>

            {/* Brokers Tab */}
            <TabsContent value="brokers">
              {/* TODO: Phase 3.3 - Reuse existing BrokerManagement component */}
              <div className="text-center text-muted-foreground py-12">
                <p className="text-lg font-semibold mb-2">Broker Management</p>
                <p className="text-sm">Reuse existing BrokerManagement component (Phase 3.3)</p>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <TradeHistory />
            </TabsContent>

            {/* Risk Tab */}
            <TabsContent value="risk">
              <RiskSettings />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <PersonalSettings />
              {/* TODO: Phase 3.7 - Add SubscriptionCard component for personal subscription */}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
