/**
 * Unit tests for Premium Gating Middleware
 */

const {
  checkBrokerAccess,
  requirePremiumBroker,
  checkBrokerLimit,
  requirePremium,
  requireTier,
  getBrokerCount,
  checkBrokerTierAccess,
  getBrokerAccessSummary,
  hasPremiumTier,
  hasMinimumTier,
  PREMIUM_ONLY_BROKERS,
  FREE_TIER_BROKERS
} = require('../premiumGating');

describe('Premium Gating Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: null,
      body: {},
      params: {},
      query: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('getBrokerCount', () => {
    it('should return 0 for user without tradingConfig', () => {
      const user = {};
      expect(getBrokerCount(user)).toBe(0);
    });

    it('should return 0 for user without brokerConfigs', () => {
      const user = { tradingConfig: {} };
      expect(getBrokerCount(user)).toBe(0);
    });

    it('should count brokers from Map object', () => {
      const user = {
        tradingConfig: {
          brokerConfigs: new Map([
            ['alpaca', {}],
            ['binance', {}]
          ])
        }
      };
      expect(getBrokerCount(user)).toBe(2);
    });

    it('should count brokers from plain object', () => {
      const user = {
        tradingConfig: {
          brokerConfigs: {
            alpaca: {},
            binance: {}
          }
        }
      };
      expect(getBrokerCount(user)).toBe(2);
    });
  });

  describe('checkBrokerAccess', () => {
    it('should return 401 if user not authenticated', () => {
      mockReq.body.brokerKey = 'alpaca';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow free tier user to access Alpaca', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };
      mockReq.body.brokerKey = 'alpaca';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockReq.brokerAccess).toEqual({
        brokerKey: 'alpaca',
        tier: 'free',
        isPremiumBroker: false
      });
    });

    it('should allow free tier user to access Binance', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };
      mockReq.body.brokerKey = 'binance';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block free tier user from accessing Coinbase', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };
      mockReq.body.brokerKey = 'coinbase';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'BROKER_ACCESS_DENIED',
          upgradeRequired: 'premium',
          upgradeCTA: 'Upgrade to Premium for advanced brokers'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block free tier user from accessing IBKR', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };
      mockReq.body.brokerKey = 'ibkr';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'BROKER_ACCESS_DENIED',
          message: expect.stringContaining('Premium tier subscription'),
          upgradeRequired: 'premium'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow premium tier user to access IBKR', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };
      mockReq.body.brokerKey = 'ibkr';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockReq.brokerAccess.isPremiumBroker).toBe(true);
    });

    it('should skip check if no brokerKey provided', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should extract brokerKey from params', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };
      mockReq.params.brokerKey = 'schwab';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.brokerAccess.brokerKey).toBe('schwab');
    });

    it('should extract brokerKey from query', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };
      mockReq.query.brokerKey = 'alpaca';

      checkBrokerAccess(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.brokerAccess.brokerKey).toBe('alpaca');
    });
  });

  describe('requirePremiumBroker', () => {
    it('should return 401 if user not authenticated', () => {
      mockReq.body.brokerKey = 'ibkr';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 400 if brokerKey missing', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Broker key is required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow non-premium brokers to pass through', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' }
      };
      mockReq.body.brokerKey = 'alpaca';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block non-premium users from IBKR', () => {
      mockReq.user = {
        subscription: { tier: 'basic', status: 'active' }
      };
      mockReq.body.brokerKey = 'ibkr';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'BROKER_ACCESS_DENIED',
          message: 'Premium tier required for IBKR/Schwab',
          upgradeRequired: 'premium',
          upgradeCTA: 'Upgrade to Premium for advanced brokers'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block non-premium users from Schwab', () => {
      mockReq.user = {
        subscription: { tier: 'pro', status: 'active' }
      };
      mockReq.body.brokerKey = 'schwab';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow premium users to access IBKR', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };
      mockReq.body.brokerKey = 'ibkr';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow premium trial users to access IBKR', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'trial' }
      };
      mockReq.body.brokerKey = 'ibkr';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block inactive premium users', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'cancelled' }
      };
      mockReq.body.brokerKey = 'ibkr';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive broker keys', () => {
      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' }
      };
      mockReq.body.brokerKey = 'IBKR';

      requirePremiumBroker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkBrokerLimit', () => {
    it('should return 401 if user not authenticated', () => {
      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow adding broker if under limit', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' },
        tradingConfig: { brokerConfigs: {} },
        limits: { maxBrokers: 1 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockReq.brokerLimit).toEqual({
        currentBrokerCount: 0,
        maxBrokers: 1,
        remainingSlots: 1,
        tier: 'free'
      });
    });

    it('should block if broker limit reached for free tier', () => {
      mockReq.user = {
        subscription: { tier: 'free', status: 'active' },
        tradingConfig: {
          brokerConfigs: {
            alpaca: {}
          }
        },
        limits: { maxBrokers: 1 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'BROKER_ACCESS_DENIED',
        message: 'Broker limit reached. You have 1/1 brokers',
        maxBrokers: 1,
        currentBrokerCount: 1,
        currentTier: 'free',
        upgradeRequired: 'basic'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block if broker limit reached for basic tier', () => {
      mockReq.user = {
        subscription: { tier: 'basic', status: 'active' },
        tradingConfig: {
          brokerConfigs: {
            alpaca: {},
            binance: {}
          }
        },
        limits: { maxBrokers: 2 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'BROKER_ACCESS_DENIED',
          maxBrokers: 2,
          currentBrokerCount: 2,
          upgradeRequired: 'pro'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow premium tier with 5 brokers to add more', () => {
      const brokers = new Map();
      brokers.set('alpaca', {});
      brokers.set('binance', {});
      brokers.set('coinbase', {});
      brokers.set('kraken', {});
      brokers.set('bybit', {});

      mockReq.user = {
        subscription: { tier: 'premium', status: 'active' },
        tradingConfig: { brokerConfigs: brokers },
        limits: { maxBrokers: 10 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.brokerLimit).toEqual({
        currentBrokerCount: 5,
        maxBrokers: 10,
        remainingSlots: 5,
        tier: 'premium'
      });
    });

    it('should use tier defaults if limits.maxBrokers not set', () => {
      mockReq.user = {
        subscription: { tier: 'pro', status: 'active' },
        tradingConfig: { brokerConfigs: {} },
        limits: {}
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.brokerLimit.maxBrokers).toBe(5); // Pro tier default
    });

    it('should suggest correct upgrade tier for pro users at limit', () => {
      const brokers = {};
      for (let i = 0; i < 5; i++) {
        brokers[`broker${i}`] = {};
      }

      mockReq.user = {
        subscription: { tier: 'pro', status: 'active' },
        tradingConfig: { brokerConfigs: brokers },
        limits: { maxBrokers: 5 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          upgradeRequired: 'premium'
        })
      );
    });

    it('should handle Map objects for broker configs', () => {
      const brokers = new Map();
      brokers.set('alpaca', {});

      mockReq.user = {
        subscription: { tier: 'basic', status: 'active' },
        tradingConfig: { brokerConfigs: brokers },
        limits: { maxBrokers: 2 }
      };

      checkBrokerLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.brokerLimit.currentBrokerCount).toBe(1);
    });
  });

  describe('checkBrokerTierAccess', () => {
    it('should return access denied for user without subscription', () => {
      const user = {};
      const result = checkBrokerTierAccess(user, 'alpaca');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No subscription found');
    });

    it('should return access denied for inactive subscription', () => {
      const user = {
        subscription: { tier: 'premium', status: 'cancelled' }
      };
      const result = checkBrokerTierAccess(user, 'ibkr');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Subscription is not active');
    });

    it('should allow free tier access to Alpaca', () => {
      const user = {
        subscription: { tier: 'free', status: 'active' }
      };
      const result = checkBrokerTierAccess(user, 'alpaca');

      expect(result.allowed).toBe(true);
    });

    it('should allow free tier access to Binance', () => {
      const user = {
        subscription: { tier: 'free', status: 'active' }
      };
      const result = checkBrokerTierAccess(user, 'binance');

      expect(result.allowed).toBe(true);
    });

    it('should deny free tier access to Kraken', () => {
      const user = {
        subscription: { tier: 'free', status: 'active' }
      };
      const result = checkBrokerTierAccess(user, 'kraken');

      expect(result.allowed).toBe(false);
      expect(result.upgradeRequired).toBe('premium');
    });

    it('should allow basic tier access to crypto exchanges', () => {
      const user = {
        subscription: { tier: 'basic', status: 'active' }
      };

      expect(checkBrokerTierAccess(user, 'binance').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'coinbase').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'kraken').allowed).toBe(true);
    });

    it('should deny basic tier access to premium brokers', () => {
      const user = {
        subscription: { tier: 'basic', status: 'active' }
      };

      const ibkrResult = checkBrokerTierAccess(user, 'ibkr');
      expect(ibkrResult.allowed).toBe(false);
      expect(ibkrResult.premiumBroker).toBe(true);

      const schwabResult = checkBrokerTierAccess(user, 'schwab');
      expect(schwabResult.allowed).toBe(false);
      expect(schwabResult.premiumBroker).toBe(true);
    });

    it('should allow premium tier access to all brokers', () => {
      const user = {
        subscription: { tier: 'premium', status: 'active' }
      };

      expect(checkBrokerTierAccess(user, 'alpaca').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'ibkr').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'schwab').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'binance').allowed).toBe(true);
    });

    it('should handle case-insensitive broker keys', () => {
      const user = {
        subscription: { tier: 'premium', status: 'active' }
      };

      expect(checkBrokerTierAccess(user, 'IBKR').allowed).toBe(true);
      expect(checkBrokerTierAccess(user, 'Schwab').allowed).toBe(true);
    });
  });

  describe('getBrokerAccessSummary', () => {
    it('should return free tier defaults for user without subscription', () => {
      const user = {};
      const summary = getBrokerAccessSummary(user);

      expect(summary).toEqual({
        tier: 'free',
        maxBrokers: 1,
        currentBrokers: 0,
        allowedBrokers: FREE_TIER_BROKERS,
        premiumBrokersAllowed: false
      });
    });

    it('should return correct summary for free tier', () => {
      const user = {
        subscription: { tier: 'free', status: 'active' },
        tradingConfig: { brokerConfigs: { alpaca: {} } }
      };
      const summary = getBrokerAccessSummary(user);

      expect(summary.tier).toBe('free');
      expect(summary.maxBrokers).toBe(1);
      expect(summary.currentBrokers).toBe(1);
      expect(summary.availableSlots).toBe(0);
      expect(summary.allowedBrokers).toEqual(FREE_TIER_BROKERS);
      expect(summary.premiumBrokersAllowed).toBe(false);
      expect(summary.canAddMoreBrokers).toBe(false);
    });

    it('should return correct summary for premium tier', () => {
      const brokers = new Map();
      brokers.set('alpaca', {});
      brokers.set('ibkr', {});

      const user = {
        subscription: { tier: 'premium', status: 'active' },
        tradingConfig: { brokerConfigs: brokers }
      };
      const summary = getBrokerAccessSummary(user);

      expect(summary.tier).toBe('premium');
      expect(summary.maxBrokers).toBe(10);
      expect(summary.currentBrokers).toBe(2);
      expect(summary.availableSlots).toBe(8);
      expect(summary.premiumBrokersAllowed).toBe(true);
      expect(summary.allowedBrokers).toContain('ibkr');
      expect(summary.allowedBrokers).toContain('schwab');
      expect(summary.canAddMoreBrokers).toBe(true);
    });

    it('should exclude premium brokers for basic/pro tiers', () => {
      const user = {
        subscription: { tier: 'basic', status: 'active' },
        tradingConfig: { brokerConfigs: {} }
      };
      const summary = getBrokerAccessSummary(user);

      expect(summary.allowedBrokers).not.toContain('ibkr');
      expect(summary.allowedBrokers).not.toContain('schwab');
      expect(summary.allowedBrokers).toContain('alpaca');
      expect(summary.allowedBrokers).toContain('binance');
    });
  });

  describe('Helper functions', () => {
    describe('hasPremiumTier', () => {
      it('should return true for active premium tier', () => {
        const user = { subscription: { tier: 'premium', status: 'active' } };
        expect(hasPremiumTier(user)).toBe(true);
      });

      it('should return true for trial premium tier', () => {
        const user = { subscription: { tier: 'premium', status: 'trial' } };
        expect(hasPremiumTier(user)).toBe(true);
      });

      it('should return false for non-premium tiers', () => {
        expect(hasPremiumTier({ subscription: { tier: 'free', status: 'active' } })).toBe(false);
        expect(hasPremiumTier({ subscription: { tier: 'basic', status: 'active' } })).toBe(false);
      });

      it('should return false for inactive premium', () => {
        const user = { subscription: { tier: 'premium', status: 'cancelled' } };
        expect(hasPremiumTier(user)).toBe(false);
      });
    });

    describe('hasMinimumTier', () => {
      it('should allow premium users to access basic features', () => {
        const user = { subscription: { tier: 'premium', status: 'active' } };
        expect(hasMinimumTier(user, 'basic')).toBe(true);
      });

      it('should block basic users from pro features', () => {
        const user = { subscription: { tier: 'basic', status: 'active' } };
        expect(hasMinimumTier(user, 'pro')).toBe(false);
      });
    });
  });

  describe('Constants', () => {
    it('should have correct premium-only brokers', () => {
      expect(PREMIUM_ONLY_BROKERS).toEqual(['ibkr', 'schwab']);
    });

    it('should have correct free tier brokers', () => {
      expect(FREE_TIER_BROKERS).toEqual(['alpaca', 'binance']);
    });
  });
});
