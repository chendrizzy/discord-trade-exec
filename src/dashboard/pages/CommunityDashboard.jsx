import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Navigation } from '../components/Navigation';
import CommunityOverview from '../components/CommunityOverview';
import SignalManagement from '../components/SignalManagement';
import MemberActivity from '../components/MemberActivity';
import CommunityAnalytics from '../components/CommunityAnalytics';
import BillingSettings from '../components/BillingSettings';
import IntegrationSettings from '../components/IntegrationSettings';

/**
 * Community Host Dashboard
 *
 * Dashboard for community admins and moderators.
 * Focused on community management, signal providers, and member oversight.
 *
 * Features:
 * - Community overview (KPIs)
 * - Signal management
 * - Member activity monitoring
 * - Community analytics
 * - Billing and subscription
 * - Discord integration settings
 */
export function CommunityDashboard({ user, onLogout }) {
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
        dashboardType="community"
      />

      {/* Main Content */}
      <main className="pt-[192px] pb-32 md:pt-0 md:pb-0 md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Tab Navigation */}
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <CommunityOverview />
            </TabsContent>

            {/* Signals Tab */}
            <TabsContent value="signals">
              <SignalManagement />
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members">
              <MemberActivity />
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <CommunityAnalytics />
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing">
              <BillingSettings />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <IntegrationSettings />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
