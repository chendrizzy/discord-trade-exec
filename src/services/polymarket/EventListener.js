/**
 * Polymarket Event Listener
 *
 * Subscribes to Polymarket CTF Exchange smart contract events via WebSocket
 * Handles real-time event monitoring with automatic reconnection
 */

const { ethers } = require('ethers');
const blockchainProvider = require('./BlockchainProvider');
const polygonConfig = require('../../config/polygon');
const CTFExchangeABI = require('./abi/CTFExchangeABI.json');

class EventListener {
  constructor() {
    if (EventListener.instance) {
      return EventListener.instance;
    }

    this.wsProvider = null;
    this.contract = null;
    this.isListening = false;
    this.eventHandlers = new Map();
    this.stats = {
      totalEvents: 0,
      eventCounts: {},
      errors: 0,
      reconnections: 0,
      lastEvent: null
    };

    // Reconnection state
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = polygonConfig.providers.websocket.maxReconnectAttempts;
    this.reconnectDelay = polygonConfig.providers.websocket.reconnectDelay;

    EventListener.instance = this;
  }

  /**
   * Initialize WebSocket provider and contract
   */
  async initialize() {
    try {
      console.log('[EventListener] Initializing WebSocket connection...');

      // Get WebSocket provider
      this.wsProvider = await blockchainProvider.getWebSocketProvider();

      // Create contract instance
      this.contract = new ethers.Contract(
        polygonConfig.contracts.ctfExchange,
        CTFExchangeABI,
        this.wsProvider
      );

      // Set up provider event handlers
      this._setupProviderHandlers();

      console.log('[EventListener] Initialization complete');
      console.log(`[EventListener] Contract: ${polygonConfig.contracts.ctfExchange}`);
    } catch (error) {
      console.error('[EventListener] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up WebSocket provider error handling
   */
  _setupProviderHandlers() {
    this.wsProvider.on('error', (error) => {
      console.error('[EventListener] WebSocket error:', error);
      this.stats.errors++;
      this._attemptReconnect();
    });

    this.wsProvider.on('close', (code) => {
      console.warn(`[EventListener] WebSocket closed (code: ${code})`);
      if (this.isListening) {
        this._attemptReconnect();
      }
    });

    // Optional: ping/keepalive
    this.wsProvider.on('network', (newNetwork, oldNetwork) => {
      if (oldNetwork) {
        console.log('[EventListener] Network changed, reconnecting...');
        this._attemptReconnect();
      }
    });
  }

  /**
   * Start listening to smart contract events
   */
  async startListening() {
    if (this.isListening) {
      console.warn('[EventListener] Already listening to events');
      return;
    }

    if (!this.contract) {
      await this.initialize();
    }

    console.log('[EventListener] Starting event listeners...');

    // Subscribe to all CTF Exchange events
    this.contract.on('OrderFilled', async (...args) => {
      await this._handleOrderFilled(args);
    });

    this.contract.on('OrdersMatched', async (...args) => {
      await this._handleOrdersMatched(args);
    });

    this.contract.on('OrderCancelled', async (...args) => {
      await this._handleOrderCancelled(args);
    });

    this.contract.on('FeeCharged', async (...args) => {
      await this._handleFeeCharged(args);
    });

    this.contract.on('TokenRegistered', async (...args) => {
      await this._handleTokenRegistered(args);
    });

    this.isListening = true;
    this.reconnectAttempts = 0;

    console.log('[EventListener] Now listening to events:');
    console.log('  - OrderFilled');
    console.log('  - OrdersMatched');
    console.log('  - OrderCancelled');
    console.log('  - FeeCharged');
    console.log('  - TokenRegistered');
  }

  /**
   * Stop listening to events
   */
  async stopListening() {
    if (!this.isListening) {
      return;
    }

    console.log('[EventListener] Stopping event listeners...');

    // Remove all listeners
    this.contract.removeAllListeners();

    // Close WebSocket connection
    if (this.wsProvider) {
      await this.wsProvider.destroy();
      this.wsProvider = null;
    }

    this.isListening = false;
    console.log('[EventListener] Event listeners stopped');
  }

  /**
   * Register custom event handler
   */
  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName).push(handler);
    console.log(`[EventListener] Registered handler for ${eventName}`);
  }

  /**
   * Call all registered handlers for an event
   */
  async _callHandlers(eventName, eventData) {
    const handlers = this.eventHandlers.get(eventName);
    if (!handlers || handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(eventData);
      } catch (error) {
        console.error(`[EventListener] Handler error for ${eventName}:`, error);
      }
    }
  }

  /**
   * Handle OrderFilled event
   */
  async _handleOrderFilled(args) {
    try {
      const event = args[args.length - 1]; // Last arg is the event object

      const eventData = {
        eventName: 'OrderFilled',
        orderHash: args[0],
        maker: args[1].toLowerCase(),
        taker: args[2].toLowerCase(),
        makerAssetId: args[3].toString(),
        takerAssetId: args[4].toString(),
        makerAmountFilled: ethers.formatUnits(args[5], 6), // USDC has 6 decimals
        takerAmountFilled: ethers.formatUnits(args[6], 6),
        fee: ethers.formatUnits(args[7], 6),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.index,
        timestamp: new Date()
      };

      this._updateStats('OrderFilled', eventData);
      await this._callHandlers('OrderFilled', eventData);

      console.log(`[EventListener] OrderFilled: ${eventData.maker.slice(0, 8)}... bet $${eventData.makerAmountFilled}`);
    } catch (error) {
      console.error('[EventListener] Error handling OrderFilled:', error);
      this.stats.errors++;
    }
  }

  /**
   * Handle OrdersMatched event
   */
  async _handleOrdersMatched(args) {
    try {
      const event = args[args.length - 1];

      const eventData = {
        eventName: 'OrdersMatched',
        takerOrderHash: args[0],
        takerOrderMaker: args[1].toLowerCase(),
        makerAssetId: args[2].toString(),
        takerAssetId: args[3].toString(),
        makerAmountFilled: ethers.formatUnits(args[4], 6),
        takerAmountFilled: ethers.formatUnits(args[5], 6),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.index,
        timestamp: new Date()
      };

      this._updateStats('OrdersMatched', eventData);
      await this._callHandlers('OrdersMatched', eventData);

      console.log(`[EventListener] OrdersMatched: $${eventData.makerAmountFilled}`);
    } catch (error) {
      console.error('[EventListener] Error handling OrdersMatched:', error);
      this.stats.errors++;
    }
  }

  /**
   * Handle OrderCancelled event
   */
  async _handleOrderCancelled(args) {
    try {
      const event = args[args.length - 1];

      const eventData = {
        eventName: 'OrderCancelled',
        orderHash: args[0],
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.index,
        timestamp: new Date()
      };

      this._updateStats('OrderCancelled', eventData);
      await this._callHandlers('OrderCancelled', eventData);

      console.log(`[EventListener] OrderCancelled: ${eventData.orderHash}`);
    } catch (error) {
      console.error('[EventListener] Error handling OrderCancelled:', error);
      this.stats.errors++;
    }
  }

  /**
   * Handle FeeCharged event
   */
  async _handleFeeCharged(args) {
    try {
      const event = args[args.length - 1];

      const eventData = {
        eventName: 'FeeCharged',
        receiver: args[0].toLowerCase(),
        tokenId: args[1].toString(),
        amount: ethers.formatUnits(args[2], 6),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.index,
        timestamp: new Date()
      };

      this._updateStats('FeeCharged', eventData);
      await this._callHandlers('FeeCharged', eventData);

      console.log(`[EventListener] FeeCharged: $${eventData.amount} to ${eventData.receiver.slice(0, 8)}...`);
    } catch (error) {
      console.error('[EventListener] Error handling FeeCharged:', error);
      this.stats.errors++;
    }
  }

  /**
   * Handle TokenRegistered event
   */
  async _handleTokenRegistered(args) {
    try {
      const event = args[args.length - 1];

      const eventData = {
        eventName: 'TokenRegistered',
        token0: args[0].toString(),
        token1: args[1].toString(),
        conditionId: args[2],
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.index,
        timestamp: new Date()
      };

      this._updateStats('TokenRegistered', eventData);
      await this._callHandlers('TokenRegistered', eventData);

      console.log(`[EventListener] TokenRegistered: condition ${eventData.conditionId}`);
    } catch (error) {
      console.error('[EventListener] Error handling TokenRegistered:', error);
      this.stats.errors++;
    }
  }

  /**
   * Update event statistics
   */
  _updateStats(eventName, eventData) {
    this.stats.totalEvents++;
    this.stats.eventCounts[eventName] = (this.stats.eventCounts[eventName] || 0) + 1;
    this.stats.lastEvent = {
      name: eventName,
      timestamp: eventData.timestamp,
      txHash: eventData.transactionHash
    };
  }

  /**
   * Attempt to reconnect WebSocket
   */
  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[EventListener] Max reconnection attempts reached');
      this.isListening = false;
      return;
    }

    this.reconnectAttempts++;
    this.stats.reconnections++;

    console.log(`[EventListener] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      // Stop current listeners
      if (this.contract) {
        this.contract.removeAllListeners();
      }

      this.isListening = false;

      // Reinitialize and restart
      await this.initialize();
      await this.startListening();

      console.log('[EventListener] Reconnection successful');
    } catch (error) {
      console.error('[EventListener] Reconnection failed:', error);
      await this._attemptReconnect();
    }
  }

  /**
   * Query historical events
   */
  async queryHistoricalEvents(eventName, fromBlock, toBlock = 'latest') {
    try {
      console.log(`[EventListener] Querying ${eventName} events from block ${fromBlock} to ${toBlock}...`);

      const filter = this.contract.filters[eventName]();
      const events = await this.contract.queryFilter(filter, fromBlock, toBlock);

      console.log(`[EventListener] Found ${events.length} ${eventName} events`);
      return events;
    } catch (error) {
      console.error(`[EventListener] Error querying ${eventName} events:`, error);
      throw error;
    }
  }

  /**
   * Get event listener statistics
   */
  getStats() {
    return {
      ...this.stats,
      isListening: this.isListening,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
module.exports = new EventListener();
