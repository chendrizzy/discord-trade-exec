'use strict';

/**
 * WebSocket Client Hook (Frontend Socket.IO Integration)
 *
 * React hook and service for managing Socket.IO connections to backend
 * with JWT authentication, automatic reconnection, and event handling.
 *
 * Task: T047 [P] [US3] - Frontend Socket.IO client hook
 * Story: US-003 (Real-Time Dashboard Updates)
 *
 * Constitutional Requirements:
 * - Principle IV: Real-Time Standards (exponential backoff, graceful degradation)
 * - Principle VI: Observability (connection state tracking)
 * - Principle VII: Error Handling (user-friendly error messages)
 *
 * Features:
 * - JWT authentication via query params
 * - Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)
 * - Event handlers for trade and portfolio updates
 * - Connection state management (connected/disconnected/error)
 * - Token refresh on connection errors
 *
 * @module websocket
 */

import { io } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:3000';

// Conditional debug logging (only in development)
const isDev = import.meta.env.DEV;
const debugLog = (...args) => isDev && console.log(...args);
const debugWarn = (...args) => isDev && console.warn(...args);

// Event types from backend handlers (src/websocket/handlers/*)
export const EVENTS = {
  // Trade events (TradeHandler)
  TRADE_CREATED: 'trade.created',
  TRADE_SUBMITTED: 'trade.submitted',
  TRADE_FILLED: 'trade.filled',
  TRADE_PARTIAL: 'trade.partial',
  TRADE_CANCELLED: 'trade.cancelled',
  TRADE_FAILED: 'trade.failed',
  TRADE_REJECTED: 'trade.rejected',
  TRADE_UPDATED: 'trade.updated',

  // Portfolio events (PortfolioHandler)
  PORTFOLIO_UPDATED: 'portfolio.updated',
  PORTFOLIO_BALANCE: 'portfolio.balance',
  PORTFOLIO_PNL: 'portfolio.pnl',
  PORTFOLIO_MARGIN: 'portfolio.margin',
  PORTFOLIO_SYNC: 'portfolio.sync',
  PORTFOLIO_POSITION_OPENED: 'portfolio.position.opened',
  PORTFOLIO_POSITION_CLOSED: 'portfolio.position.closed',
  PORTFOLIO_POSITION_MODIFIED: 'portfolio.position.modified',

  // Connection events (Socket.IO)
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt',
  RECONNECTING: 'reconnecting',
  RECONNECT_ERROR: 'reconnect_error',
  RECONNECT_FAILED: 'reconnect_failed',
  ERROR: 'error'
};

// Connection states
export const CONNECTION_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
  UNAUTHORIZED: 'unauthorized'
};

/**
 * WebSocket Service (Singleton Pattern)
 *
 * Manages Socket.IO connection lifecycle with JWT authentication.
 *
 * @class WebSocketService
 */
class WebSocketService {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelays = [1000, 2000, 4000, 8000, 16000, 30000]; // Constitutional Principle IV
    this.eventHandlers = new Map();
    this.connectionState = CONNECTION_STATE.DISCONNECTED;
    this.onStateChange = null;
  }

  /**
   * Connect to WebSocket server with JWT authentication
   *
   * @param {string} token - JWT authentication token
   * @param {Function} onStateChange - Callback for connection state changes
   * @returns {Socket} Socket.IO client instance
   */
  connect(token, onStateChange) {
    if (this.socket?.connected) {
      debugLog('[WebSocket] Already connected');
      return this.socket;
    }

    this.onStateChange = onStateChange;

    // Initialize Socket.IO with JWT in query params (FR-031: JWT WebSocket Auth)
    this.socket = io(WEBSOCKET_URL, {
      auth: {
        token // Pass token in auth object (Socket.IO v3+ recommended approach)
      },
      query: {
        token // Fallback to query param for compatibility
      },
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelays[0],
      reconnectionDelayMax: this.reconnectDelays[this.reconnectDelays.length - 1],
      timeout: 20000,
      transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling (Principle IV)
      autoConnect: true
    });

    this._setupConnectionListeners();

    debugLog('[WebSocket] Connecting to', WEBSOCKET_URL);
    this._updateConnectionState(CONNECTION_STATE.CONNECTING);

    return this.socket;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      debugLog('[WebSocket] Disconnecting');
      this.socket.disconnect();
      this.socket = null;
      this._updateConnectionState(CONNECTION_STATE.DISCONNECTED);
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Setup connection lifecycle listeners
   * @private
   */
  _setupConnectionListeners() {
    // Connected successfully
    this.socket.on(EVENTS.CONNECT, () => {
      debugLog('[WebSocket] Connected', this.socket.id);
      this.reconnectAttempts = 0;
      this._updateConnectionState(CONNECTION_STATE.CONNECTED);
    });

    // Disconnected
    this.socket.on(EVENTS.DISCONNECT, reason => {
      debugLog('[WebSocket] Disconnected:', reason);
      this._updateConnectionState(CONNECTION_STATE.DISCONNECTED);

      // Auto-reconnect unless manual disconnect
      if (reason !== 'io client disconnect') {
        this._updateConnectionState(CONNECTION_STATE.RECONNECTING);
      }
    });

    // Connection error (JWT auth failure, network error)
    this.socket.on(EVENTS.CONNECT_ERROR, error => {
      console.error('[WebSocket] Connection error:', error.message);

      // Check if auth error (unauthorized)
      if (error.message.includes('unauthorized') || error.message.includes('Authentication')) {
        this._updateConnectionState(CONNECTION_STATE.UNAUTHORIZED);
      } else {
        this._updateConnectionState(CONNECTION_STATE.ERROR);
      }

      this.reconnectAttempts++;
    });

    // Reconnecting attempt
    this.socket.io.on(EVENTS.RECONNECT_ATTEMPT, attemptNumber => {
      debugLog('[WebSocket] Reconnect attempt', attemptNumber);
      this._updateConnectionState(CONNECTION_STATE.RECONNECTING);

      // Exponential backoff (Constitutional Principle IV)
      const delayIndex = Math.min(attemptNumber - 1, this.reconnectDelays.length - 1);
      const delay = this.reconnectDelays[delayIndex];
      debugLog('[WebSocket] Next attempt in', delay, 'ms');
    });

    // Successfully reconnected
    this.socket.on(EVENTS.RECONNECT, attemptNumber => {
      debugLog('[WebSocket] Reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
      this._updateConnectionState(CONNECTION_STATE.CONNECTED);
    });

    // Reconnection failed (max attempts exceeded)
    this.socket.io.on(EVENTS.RECONNECT_FAILED, () => {
      console.error('[WebSocket] Reconnection failed after max attempts');
      this._updateConnectionState(CONNECTION_STATE.ERROR);
    });

    // Generic error handler
    this.socket.on(EVENTS.ERROR, error => {
      console.error('[WebSocket] Error:', error);
      this._updateConnectionState(CONNECTION_STATE.ERROR);
    });
  }

  /**
   * Update connection state and notify listeners
   * @private
   * @param {string} newState - New connection state
   */
  _updateConnectionState(newState) {
    const oldState = this.connectionState;
    this.connectionState = newState;

    if (oldState !== newState && this.onStateChange) {
      this.onStateChange(newState, oldState);
    }
  }

  /**
   * Subscribe to a WebSocket event
   *
   * @param {string} event - Event name (e.g., EVENTS.TRADE_FILLED)
   * @param {Function} handler - Event handler callback
   */
  on(event, handler) {
    if (!this.socket) {
      debugWarn('[WebSocket] Cannot subscribe - not connected');
      return;
    }

    this.socket.on(event, handler);

    // Track handler for cleanup
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);

    debugLog('[WebSocket] Subscribed to', event);
  }

  /**
   * Unsubscribe from a WebSocket event
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   */
  off(event, handler) {
    if (!this.socket) {
      return;
    }

    this.socket.off(event, handler);

    // Remove from tracked handlers
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }

    debugLog('[WebSocket] Unsubscribed from', event);
  }

  /**
   * Emit event to server (if needed for future features)
   *
   * @param {string} event - Event name
   * @param {*} data - Event payload
   */
  emit(event, data) {
    if (!this.socket?.connected) {
      debugWarn('[WebSocket] Cannot emit - not connected');
      return;
    }

    this.socket.emit(event, data);
  }

  /**
   * Get current connection state
   *
   * @returns {string} Current connection state
   */
  getState() {
    return this.connectionState;
  }

  /**
   * Check if currently connected
   *
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.socket?.connected && this.connectionState === CONNECTION_STATE.CONNECTED;
  }
}

// Singleton instance
const websocketService = new WebSocketService();

/**
 * React Hook: useWebSocket
 *
 * Manages WebSocket connection lifecycle in React components.
 *
 * @param {string} token - JWT authentication token (from auth context)
 * @returns {Object} WebSocket state and methods
 *
 * @example
 * const { connectionState, subscribe, unsubscribe, isConnected } = useWebSocket(authToken);
 *
 * useEffect(() => {
 *   const handleTradeFilled = (data) => {
 *     console.log('Trade filled:', data);
 *   };
 *
 *   subscribe(EVENTS.TRADE_FILLED, handleTradeFilled);
 *
 *   return () => {
 *     unsubscribe(EVENTS.TRADE_FILLED, handleTradeFilled);
 *   };
 * }, [subscribe, unsubscribe]);
 */
export function useWebSocket(token) {
  const [connectionState, setConnectionState] = useState(CONNECTION_STATE.DISCONNECTED);
  const [error, setError] = useState(null);
  const tokenRef = useRef(token);

  // Update token ref on change
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Connect/disconnect lifecycle
  useEffect(() => {
    if (!token) {
      debugLog('[useWebSocket] No token provided, skipping connection');
      return;
    }

    debugLog('[useWebSocket] Initializing connection');

    const handleStateChange = (newState, oldState) => {
      debugLog('[useWebSocket] State change:', oldState, '->', newState);
      setConnectionState(newState);

      // Handle unauthorized (token expired/invalid)
      if (newState === CONNECTION_STATE.UNAUTHORIZED) {
        setError('Authentication failed. Please refresh your session.');
      } else if (newState === CONNECTION_STATE.ERROR) {
        setError('Connection error. Retrying...');
      } else if (newState === CONNECTION_STATE.CONNECTED) {
        setError(null); // Clear errors on successful connection
      }
    };

    websocketService.connect(token, handleStateChange);

    // Cleanup on unmount
    return () => {
      debugLog('[useWebSocket] Cleaning up');
      websocketService.disconnect();
    };
  }, [token]);

  /**
   * Subscribe to event
   */
  const subscribe = useCallback((event, handler) => {
    websocketService.on(event, handler);
  }, []);

  /**
   * Unsubscribe from event
   */
  const unsubscribe = useCallback((event, handler) => {
    websocketService.off(event, handler);
  }, []);

  /**
   * Emit event to server
   */
  const emit = useCallback((event, data) => {
    websocketService.emit(event, data);
  }, []);

  return {
    connectionState,
    error,
    isConnected: connectionState === CONNECTION_STATE.CONNECTED,
    subscribe,
    unsubscribe,
    emit,
    EVENTS,
    CONNECTION_STATE
  };
}

/**
 * React Hook: useTrades
 *
 * Convenience hook for subscribing to trade events.
 *
 * @param {Function} onTradeUpdate - Callback for all trade events
 * @returns {Object} Trade event handlers
 *
 * @example
 * const { onTradeFilled, onTradeRejected } = useTrades((event, data) => {
 *   console.log('Trade event:', event, data);
 * });
 */
export function useTrades(onTradeUpdate) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !onTradeUpdate) return;

    const tradeEvents = [
      EVENTS.TRADE_CREATED,
      EVENTS.TRADE_SUBMITTED,
      EVENTS.TRADE_FILLED,
      EVENTS.TRADE_PARTIAL,
      EVENTS.TRADE_CANCELLED,
      EVENTS.TRADE_FAILED,
      EVENTS.TRADE_REJECTED,
      EVENTS.TRADE_UPDATED
    ];

    // Subscribe to all trade events
    tradeEvents.forEach(event => {
      const handler = data => onTradeUpdate(event, data);
      subscribe(event, handler);
    });

    // Cleanup
    return () => {
      tradeEvents.forEach(event => {
        const handler = data => onTradeUpdate(event, data);
        unsubscribe(event, handler);
      });
    };
  }, [isConnected, onTradeUpdate, subscribe, unsubscribe]);
}

/**
 * React Hook: usePortfolio
 *
 * Convenience hook for subscribing to portfolio events.
 *
 * @param {Function} onPortfolioUpdate - Callback for all portfolio events
 * @returns {Object} Portfolio event handlers
 *
 * @example
 * const { onPositionOpened, onMarginWarning } = usePortfolio((event, data) => {
 *   console.log('Portfolio event:', event, data);
 * });
 */
export function usePortfolio(onPortfolioUpdate) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !onPortfolioUpdate) return;

    const portfolioEvents = [
      EVENTS.PORTFOLIO_UPDATED,
      EVENTS.PORTFOLIO_BALANCE,
      EVENTS.PORTFOLIO_PNL,
      EVENTS.PORTFOLIO_MARGIN,
      EVENTS.PORTFOLIO_SYNC,
      EVENTS.PORTFOLIO_POSITION_OPENED,
      EVENTS.PORTFOLIO_POSITION_CLOSED,
      EVENTS.PORTFOLIO_POSITION_MODIFIED
    ];

    // Subscribe to all portfolio events
    portfolioEvents.forEach(event => {
      const handler = data => onPortfolioUpdate(event, data);
      subscribe(event, handler);
    });

    // Cleanup
    return () => {
      portfolioEvents.forEach(event => {
        const handler = data => onPortfolioUpdate(event, data);
        unsubscribe(event, handler);
      });
    };
  }, [isConnected, onPortfolioUpdate, subscribe, unsubscribe]);
}

// Export service for direct access
export default websocketService;
