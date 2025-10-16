import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

/**
 * WebSocket React Hook for Real-Time Updates
 *
 * Features:
 * - Automatic connection management
 * - Connection state tracking
 * - Automatic reconnection with exponential backoff
 * - Session-based authentication
 * - Memory leak prevention
 * - Event subscription/unsubscription helpers
 *
 * @param {Object} options - Configuration options
 * @param {string} options.sessionID - User session ID for authentication
 * @param {string} options.userId - User ID for authentication
 * @param {boolean} options.autoConnect - Auto-connect on mount (default: true)
 * @returns {Object} { socket, connected, error, connect, disconnect, subscribe, unsubscribe }
 */
export function useWebSocket({ sessionID, userId, autoConnect = true } = {}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // WebSocket server URL - uses environment variable or defaults to same origin
  const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

  /**
   * Initialize WebSocket connection
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    // Don't connect without authentication
    if (!sessionID) {
      console.warn('Cannot connect WebSocket: No session ID provided');
      setError('Authentication required');
      return;
    }

    try {
      console.log(`🔌 Connecting to WebSocket server at ${SOCKET_URL}`);

      // Create socket instance with authentication
      const socket = io(SOCKET_URL, {
        auth: {
          sessionID,
          userId,
          userName: 'User' // Can be enhanced with actual user data
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity
      });

      // Connection success
      socket.on('connect', () => {
        if (!mountedRef.current) return;
        console.log('✅ WebSocket connected:', socket.id);
        setConnected(true);
        setError(null);
        setReconnectAttempt(0);
      });

      // Connection error
      socket.on('connect_error', err => {
        if (!mountedRef.current) return;
        console.error('❌ WebSocket connection error:', err.message);
        setConnected(false);
        setError(err.message);
        setReconnectAttempt(prev => prev + 1);
      });

      // Disconnection
      socket.on('disconnect', reason => {
        if (!mountedRef.current) return;
        console.log('🔌 WebSocket disconnected:', reason);
        setConnected(false);

        // Handle different disconnect reasons
        if (reason === 'io server disconnect') {
          // Server initiated disconnect - reconnect manually
          console.log('Server disconnected client, attempting reconnect...');
          setTimeout(() => socket.connect(), 1000);
        } else if (reason === 'transport close' || reason === 'ping timeout') {
          // Network issues - socket.io will auto-reconnect
          console.log('Network issue detected, auto-reconnecting...');
        }
      });

      // Reconnection attempt
      socket.on('reconnect_attempt', attempt => {
        if (!mountedRef.current) return;
        console.log(`🔄 Reconnection attempt ${attempt}...`);
        setReconnectAttempt(attempt);
      });

      // Reconnection success
      socket.on('reconnect', attempt => {
        if (!mountedRef.current) return;
        console.log(`✅ Reconnected after ${attempt} attempts`);
        setConnected(true);
        setError(null);
        setReconnectAttempt(0);
      });

      // Reconnection failed
      socket.on('reconnect_failed', () => {
        if (!mountedRef.current) return;
        console.error('❌ Reconnection failed after maximum attempts');
        setError('Connection failed. Please refresh the page.');
      });

      // Server shutdown notification
      socket.on('server:shutdown', data => {
        console.warn('⚠️ Server shutting down:', data.message);
        setError('Server is shutting down. Please reconnect in a moment.');
      });

      // General error handler
      socket.on('error', err => {
        if (!mountedRef.current) return;
        console.error('WebSocket error:', err);
        setError(err.message || 'WebSocket error occurred');
      });

      socketRef.current = socket;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError(err.message);
    }
  }, [sessionID, userId, SOCKET_URL]);

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('Disconnecting WebSocket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  /**
   * Subscribe to a WebSocket event
   * @param {string} event - Event name
   * @param {function} handler - Event handler function
   * @returns {function} Unsubscribe function
   */
  const subscribe = useCallback((event, handler) => {
    if (!socketRef.current) {
      console.warn(`Cannot subscribe to ${event}: Socket not connected`);
      return () => {};
    }

    socketRef.current.on(event, handler);
    console.log(`📡 Subscribed to ${event}`);

    // Return unsubscribe function
    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, handler);
        console.log(`📡 Unsubscribed from ${event}`);
      }
    };
  }, []);

  /**
   * Emit an event to the server
   * @param {string} event - Event name
   * @param {*} data - Data to send
   */
  const emit = useCallback((event, data) => {
    if (!socketRef.current?.connected) {
      console.warn(`Cannot emit ${event}: Socket not connected`);
      return;
    }

    socketRef.current.emit(event, data);
    console.log(`📤 Emitted ${event}:`, data);
  }, []);

  /**
   * Subscribe to portfolio updates
   */
  const subscribeToPortfolio = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('Cannot subscribe to portfolio: Socket not connected');
      return;
    }
    emit('subscribe:portfolio');
  }, [emit]);

  /**
   * Subscribe to trade notifications
   */
  const subscribeToTrades = useCallback(() => {
    if (!socketRef.current?.connected) {
      console.warn('Cannot subscribe to trades: Socket not connected');
      return;
    }
    emit('subscribe:trades');
  }, [emit]);

  /**
   * Subscribe to watchlist quotes
   * @param {string[]} symbols - Array of symbols to watch
   */
  const subscribeToWatchlist = useCallback(
    symbols => {
      if (!socketRef.current?.connected) {
        console.warn('Cannot subscribe to watchlist: Socket not connected');
        return;
      }
      emit('subscribe:watchlist', symbols);
    },
    [emit]
  );

  /**
   * Unsubscribe from watchlist quotes
   * @param {string[]} symbols - Array of symbols to stop watching
   */
  const unsubscribeFromWatchlist = useCallback(
    symbols => {
      if (!socketRef.current?.connected) {
        console.warn('Cannot unsubscribe from watchlist: Socket not connected');
        return;
      }
      emit('unsubscribe:watchlist', symbols);
    },
    [emit]
  );

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && sessionID) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [autoConnect, sessionID, connect, disconnect]);

  return {
    socket: socketRef.current,
    connected,
    error,
    reconnectAttempt,
    connect,
    disconnect,
    subscribe,
    emit,
    subscribeToPortfolio,
    subscribeToTrades,
    subscribeToWatchlist,
    unsubscribeFromWatchlist
  };
}

export default useWebSocket;
