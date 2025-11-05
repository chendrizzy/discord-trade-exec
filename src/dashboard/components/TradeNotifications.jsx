import { useState, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { debugLog } from '../utils/debug-logger';

/**
 * Trade Notifications Component
 *
 * Features:
 * - Real-time toast notifications for trade events
 * - Subscribe to 'trade:executed' and 'trade:failed' events
 * - Auto-dismiss after 5 seconds
 * - Manual dismiss option
 * - Different styling for success/failure
 * - Positioned in top-right corner
 */
export function TradeNotifications() {
  const [notifications, setNotifications] = useState([]);
  const { connected, subscribe } = useWebSocketContext();

  // Subscribe to trade events
  useEffect(() => {
    if (!connected) {
      debugLog('🔔 Not subscribing to trade notifications: WebSocket not connected');
      return;
    }

    debugLog('🔔 Subscribing to trade notifications...');

    // Subscribe to successful trade executions
    const unsubscribeExecuted = subscribe('trade:executed', data => {
      debugLog('🔔 Trade executed:', data);

      const notification = {
        id: Date.now() + Math.random(),
        type: 'success',
        title: 'Trade Executed',
        message: `${data.side?.toUpperCase()} ${data.quantity} ${data.symbol} @ $${data.price?.toFixed(2)}`,
        timestamp: new Date(),
        data
      };

      addNotification(notification);
    });

    // Subscribe to failed trade executions
    const unsubscribeFailed = subscribe('trade:failed', data => {
      debugLog('🔔 Trade failed:', data);

      const notification = {
        id: Date.now() + Math.random(),
        type: 'error',
        title: 'Trade Failed',
        message: data.reason || 'Unknown error occurred',
        timestamp: new Date(),
        data
      };

      addNotification(notification);
    });

    // Cleanup subscriptions
    return () => {
      debugLog('🔔 Unsubscribing from trade notifications');
      unsubscribeExecuted();
      unsubscribeFailed();
    };
  }, [connected, subscribe]);

  // Add notification and set auto-dismiss timer
  const addNotification = notification => {
    setNotifications(prev => [notification, ...prev]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissNotification(notification.id);
    }, 5000);
  };

  // Manually dismiss notification
  const dismissNotification = id => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Don't render if no notifications
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full"
      role="region"
      aria-label="Trade notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`
                        p-4 rounded-lg border-2 shadow-lg backdrop-blur-sm
                        animate-slide-in-from-right
                        ${
                          notification.type === 'success'
                            ? 'bg-green-950/90 border-green-600 text-green-100'
                            : 'bg-red-950/90 border-red-600 text-red-100'
                        }
                    `}
          role="alert"
          aria-labelledby={`notification-title-${notification.id}`}
          aria-describedby={`notification-message-${notification.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Notification Header */}
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={notification.type === 'success' ? 'profit' : 'loss'} className="text-xs">
                  {notification.type === 'success' ? '✓ Success' : '✗ Failed'}
                </Badge>
                <span className="text-xs opacity-70">{notification.timestamp.toLocaleTimeString()}</span>
              </div>

              {/* Notification Title */}
              <h4 id={`notification-title-${notification.id}`} className="font-semibold text-sm mb-1">
                {notification.title}
              </h4>

              {/* Notification Message */}
              <p id={`notification-message-${notification.id}`} className="text-xs opacity-90">
                {notification.message}
              </p>

              {/* Additional trade details for successful trades */}
              {notification.type === 'success' && notification.data && (
                <div className="mt-2 text-xs opacity-70 font-mono">
                  {notification.data.profit !== undefined && (
                    <div className={notification.data.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                      P&L: {notification.data.profit >= 0 ? '+' : ''}${notification.data.profit.toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dismiss Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-white/10"
              onClick={() => dismissNotification(notification.id)}
              aria-label="Dismiss notification"
            >
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TradeNotifications;
