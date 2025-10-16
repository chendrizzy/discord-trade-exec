/**
 * Integration Tests for Fee Comparison Logic
 *
 * Tests the fee comparison endpoint logic without full app startup.
 * Focuses on:
 * 1. Fee calculation accuracy
 * 2. Sorting by lowest fee
 * 3. Recommendation algorithm
 * 4. Savings calculations
 * 5. Error handling
 */

const BrokerFactory = require('../../src/brokers/BrokerFactory');

// Mock BrokerFactory to avoid real API calls
jest.mock('../../src/brokers/BrokerFactory');

describe('Fee Comparison Logic', () => {
  let mockCoinbaseAdapter;
  let mockKrakenAdapter;

  beforeEach(() => {
    // Mock Coinbase Pro adapter
    mockCoinbaseAdapter = {
      getFees: jest.fn().mockResolvedValue({
        maker: 0.005,
        taker: 0.005,
        withdrawal: 0
      }),
      getMarketPrice: jest.fn().mockResolvedValue({
        bid: 50000,
        ask: 50010,
        last: 50005
      }),
      getBrokerInfo: jest.fn().mockReturnValue({
        name: 'Coinbase Pro',
        websiteUrl: 'https://pro.coinbase.com'
      })
    };

    // Mock Kraken adapter
    mockKrakenAdapter = {
      getFees: jest.fn().mockResolvedValue({
        maker: 0.0016,
        taker: 0.0026,
        withdrawal: 0
      }),
      getMarketPrice: jest.fn().mockResolvedValue({
        bid: 49990,
        ask: 50000,
        last: 49995
      }),
      getBrokerInfo: jest.fn().mockReturnValue({
        name: 'Kraken',
        websiteUrl: 'https://www.kraken.com'
      })
    };

    BrokerFactory.createBroker = jest.fn((key, credentials) => {
      return key === 'coinbasepro' ? mockCoinbaseAdapter : mockKrakenAdapter;
    });

    BrokerFactory.getCryptoBrokers = jest.fn().mockReturnValue([
      { key: 'coinbasepro', name: 'Coinbase Pro', type: 'crypto' },
      { key: 'kraken', name: 'Kraken', type: 'crypto' }
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Fee Calculation', () => {
    test('should calculate fees correctly for given quantity', async () => {
      const symbol = 'BTC/USD';
      const quantity = 1.0;

      // Simulate the endpoint logic
      const coinbasePrice = await mockCoinbaseAdapter.getMarketPrice(symbol);
      const coinbaseFees = await mockCoinbaseAdapter.getFees();
      const tradeValue = quantity * coinbasePrice.last;
      const estimatedFee = tradeValue * coinbaseFees.taker;

      expect(tradeValue).toBe(50005);
      expect(estimatedFee).toBeCloseTo(250.025, 2); // 50005 * 0.005
    });

    test('should calculate different fees for different exchanges', async () => {
      const symbol = 'BTC/USD';
      const quantity = 0.5;

      const coinbasePrice = await mockCoinbaseAdapter.getMarketPrice(symbol);
      const coinbaseFees = await mockCoinbaseAdapter.getFees();
      const coinbaseTradeValue = quantity * coinbasePrice.last;
      const coinbaseFee = coinbaseTradeValue * coinbaseFees.taker;

      const krakenPrice = await mockKrakenAdapter.getMarketPrice(symbol);
      const krakenFees = await mockKrakenAdapter.getFees();
      const krakenTradeValue = quantity * krakenPrice.last;
      const krakenFee = krakenTradeValue * krakenFees.taker;

      expect(coinbaseFee).not.toBe(krakenFee);
      expect(krakenFee).toBeLessThan(coinbaseFee); // Kraken should be cheaper (0.26% vs 0.50%)
    });
  });

  describe('Fee Comparison Algorithm', () => {
    test('should create comparison objects for each exchange', async () => {
      const exchanges = [
        { name: 'coinbasepro', apiKey: 'test', apiSecret: 'test', password: 'test' },
        { name: 'kraken', apiKey: 'test', apiSecret: 'test' }
      ];
      const symbol = 'BTC/USD';
      const quantity = 1.0;

      const comparisons = [];

      for (const exchange of exchanges) {
        const adapter = BrokerFactory.createBroker(exchange.name, {});
        const price = await adapter.getMarketPrice(symbol);
        const fees = await adapter.getFees();
        const tradeValue = quantity * price.last;
        const estimatedFee = tradeValue * fees.taker;

        comparisons.push({
          exchange: exchange.name,
          symbol,
          quantity,
          currentPrice: price.last,
          tradeValue,
          fees,
          estimatedFee,
          estimatedFeePercent: fees.taker * 100
        });
      }

      expect(comparisons).toHaveLength(2);
      expect(comparisons[0]).toHaveProperty('exchange');
      expect(comparisons[0]).toHaveProperty('estimatedFee');
      expect(comparisons[1]).toHaveProperty('exchange');
      expect(comparisons[1]).toHaveProperty('estimatedFee');
    });

    test('should sort comparisons by lowest fee (ascending)', async () => {
      const symbol = 'BTC/USD';
      const quantity = 1.0;

      // Get fees from both exchanges
      const coinbasePrice = await mockCoinbaseAdapter.getMarketPrice(symbol);
      const coinbaseFees = await mockCoinbaseAdapter.getFees();
      const coinbaseFee = quantity * coinbasePrice.last * coinbaseFees.taker;

      const krakenPrice = await mockKrakenAdapter.getMarketPrice(symbol);
      const krakenFees = await mockKrakenAdapter.getFees();
      const krakenFee = quantity * krakenPrice.last * krakenFees.taker;

      const comparisons = [
        { exchange: 'coinbasepro', estimatedFee: coinbaseFee },
        { exchange: 'kraken', estimatedFee: krakenFee }
      ];

      // Sort by lowest fee
      comparisons.sort((a, b) => a.estimatedFee - b.estimatedFee);

      expect(comparisons[0].estimatedFee).toBeLessThanOrEqual(comparisons[1].estimatedFee);
      expect(comparisons[0].exchange).toBe('kraken'); // Kraken should be cheapest
    });

    test('should mark cheapest and most expensive exchanges', async () => {
      const comparisons = [
        { exchange: 'kraken', estimatedFee: 129.987 },
        { exchange: 'coinbasepro', estimatedFee: 250.025 }
      ];

      // Mark flags
      comparisons.forEach((comp, index) => {
        comp.isCheapest = index === 0;
        comp.isMostExpensive = index === comparisons.length - 1;
      });

      expect(comparisons[0].isCheapest).toBe(true);
      expect(comparisons[0].isMostExpensive).toBe(false);
      expect(comparisons[1].isCheapest).toBe(false);
      expect(comparisons[1].isMostExpensive).toBe(true);
    });
  });

  describe('Savings Calculation', () => {
    test('should calculate savings vs most expensive', async () => {
      const comparisons = [
        { exchange: 'kraken', estimatedFee: 129.987 },
        { exchange: 'coinbasepro', estimatedFee: 250.025 }
      ];

      const mostExpensiveFee = comparisons[comparisons.length - 1].estimatedFee;

      comparisons.forEach(comp => {
        comp.savingsVsMostExpensive = mostExpensiveFee - comp.estimatedFee;
      });

      expect(comparisons[0].savingsVsMostExpensive).toBeCloseTo(120.038, 2);
      expect(comparisons[1].savingsVsMostExpensive).toBeCloseTo(0, 2);
    });

    test('should calculate correct savings percentage', async () => {
      const cheapestFee = 129.987;
      const mostExpensiveFee = 250.025;
      const savings = mostExpensiveFee - cheapestFee;
      const savingsPercent = (savings / mostExpensiveFee) * 100;

      expect(savingsPercent).toBeCloseTo(48.01, 1); // ~48% savings
    });
  });

  describe('Recommendation Algorithm', () => {
    test('should recommend exchange with lowest fee', async () => {
      const comparisons = [
        { exchange: 'kraken', displayName: 'Kraken', estimatedFee: 129.987 },
        { exchange: 'coinbasepro', displayName: 'Coinbase Pro', estimatedFee: 250.025 }
      ];

      const cheapest = comparisons[0];
      const mostExpensive = comparisons[comparisons.length - 1];
      const savings = mostExpensive.estimatedFee - cheapest.estimatedFee;
      const savingsPercent = (savings / mostExpensive.estimatedFee) * 100;

      const recommendation = {
        exchange: cheapest.displayName,
        reason: `${cheapest.displayName} offers the lowest trading fee at ${cheapest.estimatedFee.toFixed(2)}`,
        estimatedFee: cheapest.estimatedFee,
        savings,
        savingsPercent
      };

      expect(recommendation.exchange).toBe('Kraken');
      expect(recommendation.estimatedFee).toBe(129.987);
      expect(recommendation.savings).toBeCloseTo(120.038, 2);
    });
  });

  describe('Error Handling', () => {
    test('should handle adapter errors gracefully', async () => {
      mockCoinbaseAdapter.getMarketPrice.mockRejectedValue(new Error('API Error'));

      const errors = [];
      const comparisons = [];

      try {
        const price = await mockCoinbaseAdapter.getMarketPrice('BTC/USD');
        const fees = await mockCoinbaseAdapter.getFees();
        comparisons.push({ exchange: 'coinbasepro', price, fees });
      } catch (error) {
        errors.push({
          exchange: 'coinbasepro',
          error: error.message
        });
      }

      // Kraken should still work
      try {
        const price = await mockKrakenAdapter.getMarketPrice('BTC/USD');
        const fees = await mockKrakenAdapter.getFees();
        comparisons.push({ exchange: 'kraken', price, fees });
      } catch (error) {
        errors.push({
          exchange: 'kraken',
          error: error.message
        });
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].exchange).toBe('coinbasepro');
      expect(comparisons).toHaveLength(1);
      expect(comparisons[0].exchange).toBe('kraken');
    });

    test('should handle symbol not supported error', async () => {
      mockCoinbaseAdapter.getMarketPrice.mockRejectedValue(
        new Error('Symbol not supported')
      );

      try {
        await mockCoinbaseAdapter.getMarketPrice('EXOTIC/USD');
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('not supported');
      }
    });
  });

  describe('Summary Statistics', () => {
    test('should calculate correct summary statistics', async () => {
      const comparisons = [
        { exchange: 'kraken', displayName: 'Kraken', estimatedFee: 129.987 },
        { exchange: 'coinbasepro', displayName: 'Coinbase Pro', estimatedFee: 250.025 }
      ];

      const summary = {
        totalExchangesCompared: comparisons.length,
        cheapestExchange: comparisons[0].displayName,
        cheapestFee: comparisons[0].estimatedFee,
        mostExpensiveExchange: comparisons[comparisons.length - 1].displayName,
        mostExpensiveFee: comparisons[comparisons.length - 1].estimatedFee,
        maxSavings: comparisons[comparisons.length - 1].estimatedFee - comparisons[0].estimatedFee
      };

      expect(summary.totalExchangesCompared).toBe(2);
      expect(summary.cheapestExchange).toBe('Kraken');
      expect(summary.cheapestFee).toBe(129.987);
      expect(summary.mostExpensiveExchange).toBe('Coinbase Pro');
      expect(summary.mostExpensiveFee).toBe(250.025);
      expect(summary.maxSavings).toBeCloseTo(120.038, 2);
    });
  });
});
