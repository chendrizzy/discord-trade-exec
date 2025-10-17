import { createContext, useContext } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

/**
 * WebSocket Context for Real-Time Updates
 *
 * Provides WebSocket connection and state to all components in the app
 */
const WebSocketContext = createContext(null);

/**
 * Hook to access WebSocket context
 * @returns {Object} WebSocket context value
 * @throws {Error} If used outside WebSocketProvider
 */
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

/**
 * WebSocket Provider Component
 *
 * Manages WebSocket connection lifecycle and provides context to children
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {string} props.sessionID - User session ID for authentication
 * @param {string} props.userId - User ID for authentication
 * @param {boolean} props.enabled - Enable WebSocket connection (default: true)
 */
export function WebSocketProvider({ children, sessionID, userId, enabled = true }) {
  // Initialize WebSocket hook
  const websocket = useWebSocket({
    sessionID,
    userId,
    autoConnect: enabled && Boolean(sessionID && userId)
  });

  const value = {
    // WebSocket instance and state
    socket: websocket.socket,
    connected: websocket.connected,
    error: websocket.error,
    reconnectAttempt: websocket.reconnectAttempt,

    // Connection management
    connect: websocket.connect,
    disconnect: websocket.disconnect,

    // Event management
    subscribe: websocket.subscribe,
    emit: websocket.emit,

    // Convenience subscription methods
    subscribeToPortfolio: websocket.subscribeToPortfolio,
    subscribeToTrades: websocket.subscribeToTrades,
    subscribeToWatchlist: websocket.subscribeToWatchlist,
    unsubscribeFromWatchlist: websocket.unsubscribeFromWatchlist
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export default WebSocketContext;
