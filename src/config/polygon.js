/**
 * Polygon Network Configuration for Polymarket Integration
 *
 * Verified contract addresses from PolygonScan:
 * - CTF Exchange: https://polygonscan.com/address/0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
 * - Conditional Tokens: https://polygonscan.com/address/0x4D97DCd97eC945f40cf65F87097ACe5EA0476045
 */

const polygon = {
  // Network configuration
  network: {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrls: {
      infura: process.env.POLYGON_RPC_INFURA,
      alchemy: process.env.POLYGON_RPC_ALCHEMY,
      quicknode: process.env.POLYGON_RPC_QUICKNODE,
      // Public fallback (rate-limited)
      public: 'https://polygon-rpc.com'
    }
  },

  // Verified Polymarket smart contract addresses (Polygon mainnet)
  contracts: {
    // CTF Exchange - Main trading contract
    ctfExchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',

    // Conditional Tokens Framework
    conditionalTokens: '0x4D97DCd97eC945f40cf65F87097ACe5EA0476045',

    // Neg Risk Fee Module
    negRiskFeeModule: '0x78769d50be1763ed1ca0d5e878d93f05aabff29e',

    // UMA CTF Adapter
    umaCtfAdapter: '0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74',

    // Proxy Wallet Factory
    proxyWalletFactory: '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052',

    // USDC on Polygon (used for pricing)
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
  },

  // Provider configuration
  providers: {
    // Health check interval (5 minutes)
    healthCheckInterval: 5 * 60 * 1000,

    // Request timeout (30 seconds)
    requestTimeout: 30000,

    // Max retries before failover
    maxRetries: 3,

    // Retry delay (exponential backoff base)
    retryDelay: 1000,

    // WebSocket reconnection settings
    websocket: {
      reconnectDelay: 5000,
      maxReconnectAttempts: 5,
      pingInterval: 30000
    }
  },

  // Events to monitor
  events: {
    // CTF Exchange events
    ctfExchange: [
      'OrderFilled',      // When a bet is placed/matched
      'OrdersMatched',    // When multiple orders match
      'OrderCancelled',   // When an order is cancelled
      'FeeCharged',       // Fee collection events
      'TokenRegistered'   // New token/market registration
    ]
  },

  // Data collection settings
  collection: {
    // Start collecting from this block (24 hours ago ~= 43,200 blocks)
    startBlock: 'latest-43200',

    // Batch size for historical queries
    batchSize: 1000,

    // Concurrent batch processing limit
    concurrency: 3
  }
};

module.exports = polygon;
