import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Navigation } from '../components/Navigation';

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
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Community Overview</CardTitle>
                    <CardDescription>
                      Key metrics and activity for your trading community
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.1 - Implement CommunityOverview component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Community Overview</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
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
                    <CardTitle>Signal Management</CardTitle>
                    <CardDescription>
                      Configure signal providers and channels
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.2 - Implement SignalManagement component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Signal Management</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Member Management</CardTitle>
                    <CardDescription>
                      View and manage community members
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.3 - Implement MemberActivity component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Member Management</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Community Analytics</CardTitle>
                    <CardDescription>
                      Performance metrics and engagement data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.4 - Implement CommunityAnalytics component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Community Analytics</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Billing & Subscription</CardTitle>
                    <CardDescription>
                      Manage your community subscription and usage
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.5 - Implement BillingSettings component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Billing & Subscription</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
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
                    <CardTitle>Discord Integration</CardTitle>
                    <CardDescription>
                      Configure Discord webhooks and bot permissions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Phase 2.6 - Implement IntegrationSettings component */}
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-lg font-semibold mb-2">Discord Integration</p>
                      <p className="text-sm">Coming soon in Phase 2</p>
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
