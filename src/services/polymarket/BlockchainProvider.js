/**
 * Polygon Blockchain Provider with Multi-Provider Failover
 *
 * Manages RPC connections with automatic health checking and failover
 * between Infura, Alchemy, QuickNode, and public providers.
 */

const { ethers } = require('ethers');
const polygonConfig = require('../../config/polygon');

class BlockchainProvider {
  constructor() {
    if (BlockchainProvider.instance) {
      return BlockchainProvider.instance;
    }

    this.providers = this._initializeProviders();
    this.activeProviderIndex = 0;
    this.activeProvider = this.providers[this.activeProviderIndex];
    this.healthCheckInterval = null;
    this.stats = {
      requests: 0,
      errors: 0,
      failovers: 0,
      lastHealthCheck: null
    };

    BlockchainProvider.instance = this;
  }

  /**
   * Initialize all available providers
   */
  _initializeProviders() {
    const providers = [];
    const { rpcUrls } = polygonConfig.network;

    // Infura provider
    if (rpcUrls.infura) {
      providers.push({
        name: 'Infura',
        url: rpcUrls.infura,
        provider: new ethers.JsonRpcProvider(rpcUrls.infura, {
          chainId: polygonConfig.network.chainId,
          name: polygonConfig.network.name
        }),
        healthy: true,
        lastChecked: null
      });
    }

    // Alchemy provider
    if (rpcUrls.alchemy) {
      providers.push({
        name: 'Alchemy',
        url: rpcUrls.alchemy,
        provider: new ethers.JsonRpcProvider(rpcUrls.alchemy, {
          chainId: polygonConfig.network.chainId,
          name: polygonConfig.network.name
        }),
        healthy: true,
        lastChecked: null
      });
    }

    // QuickNode provider
    if (rpcUrls.quicknode) {
      providers.push({
        name: 'QuickNode',
        url: rpcUrls.quicknode,
        provider: new ethers.JsonRpcProvider(rpcUrls.quicknode, {
          chainId: polygonConfig.network.chainId,
          name: polygonConfig.network.name
        }),
        healthy: true,
        lastChecked: null
      });
    }

    // Public fallback provider
    providers.push({
      name: 'Public',
      url: rpcUrls.public,
      provider: new ethers.JsonRpcProvider(rpcUrls.public, {
        chainId: polygonConfig.network.chainId,
        name: polygonConfig.network.name
      }),
      healthy: true,
      lastChecked: null
    });

    if (providers.length === 0) {
      throw new Error('No RPC providers configured. Set POLYGON_RPC_* environment variables.');
    }

    console.log(`[BlockchainProvider] Initialized ${providers.length} provider(s):`,
      providers.map(p => p.name).join(', '));

    return providers;
  }

  /**
   * Get active JSON-RPC provider instance
   */
  async getProvider() {
    // Check if current provider is healthy
    const isHealthy = await this._checkProviderHealth(this.activeProvider);

    if (!isHealthy) {
      console.warn(`[BlockchainProvider] Active provider ${this.activeProvider.name} unhealthy, failing over...`);
      await this._failover();
    }

    this.stats.requests++;
    return this.activeProvider.provider;
  }

  /**
   * Get WebSocket provider for real-time events
   */
  async getWebSocketProvider() {
    const httpUrl = this.activeProvider.url;

    // Convert HTTP(S) URL to WebSocket URL
    const wsUrl = httpUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    console.log(`[BlockchainProvider] Creating WebSocket connection to ${this.activeProvider.name}`);

    return new ethers.WebSocketProvider(wsUrl, {
      chainId: polygonConfig.network.chainId,
      name: polygonConfig.network.name
    });
  }

  /**
   * Get current block number
   */
  async getCurrentBlock() {
    try {
      const provider = await this.getProvider();
      const blockNumber = await provider.getBlockNumber();
      return blockNumber;
    } catch (error) {
      console.error('[BlockchainProvider] Error getting current block:', error.message);
      throw error;
    }
  }

  /**
   * Check provider health
   */
  async _checkProviderHealth(providerInfo) {
    try {
      const startTime = Date.now();
      const blockNumber = await providerInfo.provider.getBlockNumber();
      const latency = Date.now() - startTime;

      providerInfo.healthy = true;
      providerInfo.lastChecked = new Date();
      providerInfo.latency = latency;

      this.stats.lastHealthCheck = new Date();

      console.log(`[BlockchainProvider] Health check passed for ${providerInfo.name} ` +
        `(block: ${blockNumber}, latency: ${latency}ms)`);

      return true;
    } catch (error) {
      console.error(`[BlockchainProvider] Health check failed for ${providerInfo.name}:`, error.message);
      providerInfo.healthy = false;
      providerInfo.lastChecked = new Date();
      return false;
    }
  }

  /**
   * Failover to next available provider
   */
  async _failover() {
    this.stats.failovers++;
    const startIndex = this.activeProviderIndex;

    // Try next providers in sequence
    for (let i = 1; i < this.providers.length; i++) {
      const nextIndex = (startIndex + i) % this.providers.length;
      const nextProvider = this.providers[nextIndex];

      console.log(`[BlockchainProvider] Attempting failover to ${nextProvider.name}...`);

      const isHealthy = await this._checkProviderHealth(nextProvider);

      if (isHealthy) {
        this.activeProviderIndex = nextIndex;
        this.activeProvider = nextProvider;
        console.log(`[BlockchainProvider] Failover successful to ${nextProvider.name}`);
        return;
      }
    }

    // All providers failed
    throw new Error('All RPC providers are unavailable');
  }

  /**
   * Start automatic health checking
   */
  startHealthChecks() {
    if (this.healthCheckInterval) {
      return;
    }

    const interval = polygonConfig.providers.healthCheckInterval;

    this.healthCheckInterval = setInterval(async () => {
      console.log('[BlockchainProvider] Running scheduled health check...');
      await this._checkProviderHealth(this.activeProvider);
    }, interval);

    console.log(`[BlockchainProvider] Health checks started (interval: ${interval}ms)`);
  }

  /**
   * Stop health checking
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[BlockchainProvider] Health checks stopped');
    }
  }

  /**
   * Get provider statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeProvider: this.activeProvider.name,
      totalProviders: this.providers.length,
      healthyProviders: this.providers.filter(p => p.healthy).length,
      providers: this.providers.map(p => ({
        name: p.name,
        healthy: p.healthy,
        lastChecked: p.lastChecked,
        latency: p.latency
      }))
    };
  }

  /**
   * Test connection to blockchain
   */
  async testConnection() {
    try {
      console.log('[BlockchainProvider] Testing connection...');

      const provider = await this.getProvider();
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      const balance = await provider.getBalance('0x0000000000000000000000000000000000000000');

      console.log('[BlockchainProvider] Connection test successful:');
      console.log(`  Network: ${network.name} (chainId: ${network.chainId})`);
      console.log(`  Current Block: ${blockNumber}`);
      console.log(`  Provider: ${this.activeProvider.name}`);

      return {
        success: true,
        network: network.name,
        chainId: Number(network.chainId),
        blockNumber,
        provider: this.activeProvider.name
      };
    } catch (error) {
      console.error('[BlockchainProvider] Connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new BlockchainProvider();
