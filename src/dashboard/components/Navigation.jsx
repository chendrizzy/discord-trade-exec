import { useState } from 'react';
import { Home, Bot, BarChart3, Trophy, Settings, Menu, X, Shield, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const getNavItems = isAdmin => {
  const items = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'bots', label: 'Bots', icon: Bot },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  if (isAdmin) {
    items.push({ id: 'admin', label: 'Admin', icon: Shield });
    items.push({ id: 'business-analytics', label: 'Business Analytics', icon: TrendingUp });
  }

  return items;
};

export function Navigation({ activeTab, onTabChange, userName, onLogout, user }) {
  const navItems = getNavItems(user?.isAdmin);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 md:z-50 bg-card border-r border-border">
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-border">
            <h1 className="text-lg font-bold text-foreground">Trading Bot</h1>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gold-500/10 text-gold-500 border border-gold-500/20'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground">Trading Account</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onLogout}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-bold text-foreground">Trading Bot</h1>
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/80" onClick={() => setSidebarOpen(false)} />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border">
            <div className="flex flex-col h-full">
              {/* Mobile Header */}
              <div className="flex items-center justify-between h-14 px-4 border-b border-border">
                <h1 className="text-lg font-bold text-foreground">Trading Bot</h1>
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-gold-500/10 text-gold-500 border border-gold-500/20'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              {/* User Section */}
              <div className="p-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground">Trading Account</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={onLogout}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border">
        <nav className="flex items-center justify-around h-16 px-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                  isActive ? 'text-gold-500' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
