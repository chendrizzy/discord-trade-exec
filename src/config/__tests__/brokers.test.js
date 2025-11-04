const {
  BROKER_METADATA,
  getBrokersForDeploymentMode,
  getBrokersByType,
  validateBrokerDeploymentMode,
  requiresLocalGateway,
  getBrokerConfig,
  getAllBrokers,
  getMultiUserBrokers,
  getSingleUserOnlyBrokers
} = require('../brokers');

describe('Broker Configuration', () => {
  describe('BROKER_METADATA', () => {
    test('should contain all 10 brokers', () => {
      const brokers = Object.keys(BROKER_METADATA);
      expect(brokers).toHaveLength(10);
      expect(brokers).toEqual(expect.arrayContaining([
        'alpaca', 'ibkr', 'moomoo', 'schwab', 'binance',
        'kraken', 'coinbase', 'etrade', 'webull', 'tdameritrade'
      ]));
    });

    test('should mark 8 brokers as multi-user compatible', () => {
      const multiUserBrokers = Object.entries(BROKER_METADATA)
        .filter(([_, config]) => config.deploymentMode === 'multi-user');
      expect(multiUserBrokers).toHaveLength(8);
    });

    test('should mark 2 brokers as single-user only', () => {
      const singleUserBrokers = Object.entries(BROKER_METADATA)
        .filter(([_, config]) => config.deploymentMode === 'single-user-only');
      expect(singleUserBrokers).toHaveLength(2);
      expect(singleUserBrokers.map(([id]) => id)).toEqual(['ibkr', 'moomoo']);
    });

    test('single-user brokers should require local gateway', () => {
      expect(BROKER_METADATA.ibkr.requiresLocalGateway).toBe(true);
      expect(BROKER_METADATA.moomoo.requiresLocalGateway).toBe(true);
      expect(BROKER_METADATA.ibkr.gatewayProcess).toBe('TWS or IB Gateway');
      expect(BROKER_METADATA.moomoo.gatewayProcess).toBe('moomoo OpenD');
    });

    test('multi-user brokers should NOT require local gateway', () => {
      const multiUserBrokers = ['alpaca', 'schwab', 'binance', 'kraken', 'coinbase', 'etrade', 'webull', 'tdameritrade'];
      multiUserBrokers.forEach(broker => {
        expect(BROKER_METADATA[broker].requiresLocalGateway).toBe(false);
      });
    });

    test('should have warnings for single-user brokers', () => {
      expect(BROKER_METADATA.ibkr.warning).toContain('IB Gateway');
      expect(BROKER_METADATA.ibkr.warning).toContain('single-user');
      expect(BROKER_METADATA.moomoo.warning).toContain('OpenD Gateway');
      expect(BROKER_METADATA.moomoo.warning).toContain('single-user');
    });
  });

  describe('getBrokersForDeploymentMode', () => {
    test('should return 8 brokers for multi-user mode', () => {
      const brokers = getBrokersForDeploymentMode('multi-user');
      expect(brokers).toHaveLength(8);
      expect(brokers).not.toContain('ibkr');
      expect(brokers).not.toContain('moomoo');
    });

    test('should return all 10 brokers for single-user mode', () => {
      const brokers = getBrokersForDeploymentMode('single-user');
      expect(brokers).toHaveLength(10);
      expect(brokers).toContain('ibkr');
      expect(brokers).toContain('moomoo');
    });
  });

  describe('getBrokersByType', () => {
    test('should return stock brokers', () => {
      const stockBrokers = getBrokersByType('stock');
      expect(stockBrokers).toContain('alpaca');
      expect(stockBrokers).toContain('schwab');
      expect(stockBrokers).toContain('ibkr');
      expect(stockBrokers).not.toContain('binance');
    });

    test('should return crypto brokers', () => {
      const cryptoBrokers = getBrokersByType('crypto');
      expect(cryptoBrokers).toContain('binance');
      expect(cryptoBrokers).toContain('kraken');
      expect(cryptoBrokers).toContain('coinbase');
      expect(cryptoBrokers).not.toContain('alpaca');
    });

    test('should filter by deployment mode', () => {
      const multiUserStockBrokers = getBrokersByType('stock', 'multi-user');
      expect(multiUserStockBrokers).not.toContain('ibkr');
      expect(multiUserStockBrokers).not.toContain('moomoo');
      expect(multiUserStockBrokers).toContain('alpaca');
      expect(multiUserStockBrokers).toContain('schwab');
    });
  });

  describe('validateBrokerDeploymentMode', () => {
    test('should allow multi-user brokers in multi-user mode', () => {
      expect(() => {
        validateBrokerDeploymentMode('alpaca', 'multi-user');
      }).not.toThrow();

      expect(() => {
        validateBrokerDeploymentMode('schwab', 'multi-user');
      }).not.toThrow();
    });

    test('should block single-user brokers in multi-user mode', () => {
      expect(() => {
        validateBrokerDeploymentMode('ibkr', 'multi-user');
      }).toThrow(/requires local.*and only supports single-user/i);

      expect(() => {
        validateBrokerDeploymentMode('moomoo', 'multi-user');
      }).toThrow(/requires local.*and only supports single-user/i);
    });

    test('error should explain the architectural limitation', () => {
      try {
        validateBrokerDeploymentMode('ibkr', 'multi-user');
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('localhost:7496');
        expect(error.message).toContain('not scalable');
        expect(error.message).toContain('For multi-user Discord bots');
      }
    });

    test('error should suggest alternative brokers', () => {
      try {
        validateBrokerDeploymentMode('moomoo', 'multi-user');
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('alpaca');
        expect(error.message).toContain('schwab');
        expect(error.message).toContain('binance');
      }
    });

    test('should allow single-user brokers in single-user mode', () => {
      expect(() => {
        validateBrokerDeploymentMode('ibkr', 'single-user');
      }).not.toThrow();

      expect(() => {
        validateBrokerDeploymentMode('moomoo', 'single-user');
      }).not.toThrow();
    });

    test('should throw error for unknown broker', () => {
      expect(() => {
        validateBrokerDeploymentMode('unknown-broker', 'multi-user');
      }).toThrow('Unknown broker: unknown-broker');
    });
  });

  describe('requiresLocalGateway', () => {
    test('should return true for IBKR and Moomoo', () => {
      expect(requiresLocalGateway('ibkr')).toBe(true);
      expect(requiresLocalGateway('moomoo')).toBe(true);
    });

    test('should return false for all other brokers', () => {
      const cloudBrokers = ['alpaca', 'schwab', 'binance', 'kraken', 'coinbase', 'etrade', 'webull', 'tdameritrade'];
      cloudBrokers.forEach(broker => {
        expect(requiresLocalGateway(broker)).toBe(false);
      });
    });

    test('should return false for unknown broker', () => {
      expect(requiresLocalGateway('unknown')).toBe(false);
    });
  });

  describe('getBrokerConfig', () => {
    test('should return configuration for valid broker', () => {
      const config = getBrokerConfig('alpaca');
      expect(config).toBeDefined();
      expect(config.name).toBe('Alpaca');
      expect(config.type).toBe('stock');
    });

    test('should return null for unknown broker', () => {
      const config = getBrokerConfig('unknown');
      expect(config).toBeNull();
    });

    test('should include gateway details for single-user brokers', () => {
      const ibkrConfig = getBrokerConfig('ibkr');
      expect(ibkrConfig.gatewayPort).toBe(7496);
      expect(ibkrConfig.gatewayPortPaper).toBe(7497);
      expect(ibkrConfig.gatewayProcess).toBe('TWS or IB Gateway');

      const moomooConfig = getBrokerConfig('moomoo');
      expect(moomooConfig.gatewayPort).toBe(33333);
      expect(moomooConfig.gatewayProcess).toBe('moomoo OpenD');
    });
  });

  describe('getAllBrokers', () => {
    test('should return all 10 broker IDs', () => {
      const brokers = getAllBrokers();
      expect(brokers).toHaveLength(10);
    });
  });

  describe('getMultiUserBrokers', () => {
    test('should return 8 multi-user compatible brokers', () => {
      const brokers = getMultiUserBrokers();
      expect(brokers).toHaveLength(8);
      expect(brokers).toEqual(expect.arrayContaining([
        'alpaca', 'schwab', 'binance', 'kraken',
        'coinbase', 'etrade', 'webull', 'tdameritrade'
      ]));
    });

    test('should exclude IBKR and Moomoo', () => {
      const brokers = getMultiUserBrokers();
      expect(brokers).not.toContain('ibkr');
      expect(brokers).not.toContain('moomoo');
    });
  });

  describe('getSingleUserOnlyBrokers', () => {
    test('should return only IBKR and Moomoo', () => {
      const brokers = getSingleUserOnlyBrokers();
      expect(brokers).toEqual(['ibkr', 'moomoo']);
    });
  });

  describe('Broker Feature Sets', () => {
    test('stock brokers should have appropriate features', () => {
      expect(BROKER_METADATA.alpaca.features).toContain('stocks');
      expect(BROKER_METADATA.schwab.features).toContain('options');
      expect(BROKER_METADATA.ibkr.features).toContain('global-markets');
    });

    test('crypto brokers should have crypto features', () => {
      expect(BROKER_METADATA.binance.features).toContain('crypto-spot');
      expect(BROKER_METADATA.kraken.features).toContain('crypto-spot');
      expect(BROKER_METADATA.coinbase.features).toContain('crypto-spot');
    });
  });

  describe('API Approval Requirements', () => {
    test('should mark brokers requiring approval', () => {
      expect(BROKER_METADATA.etrade.approvalRequired).toBe(true);
      expect(BROKER_METADATA.schwab.approvalRequired).toBe(true);
      expect(BROKER_METADATA.webull.approvalRequired).toBe(true);
    });

    test('should mark instant-access brokers', () => {
      expect(BROKER_METADATA.binance.approvalRequired).toBe(false);
      expect(BROKER_METADATA.kraken.approvalRequired).toBe(false);
      expect(BROKER_METADATA.coinbase.approvalRequired).toBe(false);
    });

    test('should include approval timelines', () => {
      expect(BROKER_METADATA.schwab.approvalTimeline).toBe('3-7 business days');
      expect(BROKER_METADATA.webull.approvalTimeline).toBe('1-2 business days');
      expect(BROKER_METADATA.binance.approvalTimeline).toBe('Instant');
    });
  });
});
