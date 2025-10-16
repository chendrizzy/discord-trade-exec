/**
 * Mock for moomoo-api package (ESM module)
 * Used in Jest tests to avoid ESM import issues
 */

class MockMoomooAPI {
  constructor(config) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return { success: true };
  }

  async disconnect() {
    this.connected = false;
    return { success: true };
  }

  async getAccountInfo() {
    return {
      cash: 10000,
      totalAssets: 15000,
      availableFunds: 10000
    };
  }

  async placeOrder(order) {
    return {
      orderId: 'MOCK_ORDER_123',
      status: 'submitted',
      timestamp: Date.now()
    };
  }

  async cancelOrder(orderId) {
    return {
      success: true,
      orderId
    };
  }

  async getPositions() {
    return [];
  }

  async getOrderHistory() {
    return [];
  }

  async getMarketData(symbol) {
    return {
      symbol,
      lastPrice: 50000,
      bid: 49999,
      ask: 50001
    };
  }
}

module.exports = {
  default: MockMoomooAPI,
  MoomooAPI: MockMoomooAPI
};
