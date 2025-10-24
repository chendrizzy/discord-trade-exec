/**
 * Brokers Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for broker configuration and management endpoints
 */

const { z } = require('zod');

/**
 * Get Broker Details
 * GET /api/brokers/:brokerKey
 */
const getBrokerParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken'], {
    errorMap: () => ({ message: 'Invalid broker key' })
  })
});

/**
 * Test Broker Connection
 * POST /api/brokers/test
 */
const testBrokerBody = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken']),
  credentials: z.object({
    apiKey: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API key contains invalid characters'),
    apiSecret: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API secret contains invalid characters'),
    sandbox: z.boolean().optional().default(false)
  })
});

/**
 * Test Specific Broker Connection
 * POST /api/brokers/test/:brokerKey
 */
const testSpecificBrokerParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken'])
});

const testSpecificBrokerBody = z.object({
  credentials: z.object({
    apiKey: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API key contains invalid characters'),
    apiSecret: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API secret contains invalid characters'),
    sandbox: z.boolean().optional().default(false)
  })
});

/**
 * Configure Broker
 * POST /api/brokers/configure
 */
const configureBrokerBody = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken']),
  credentials: z.object({
    apiKey: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API key contains invalid characters'),
    apiSecret: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API secret contains invalid characters'),
    sandbox: z.boolean().optional().default(false),
    accountId: z.string().optional()
  }),
  nickname: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional().default(false)
});

/**
 * Delete User Broker
 * DELETE /api/brokers/user/:brokerKey
 */
const deleteUserBrokerParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken'])
});

/**
 * Compare Brokers
 * POST /api/brokers/compare
 */
const compareBrokersBody = z.object({
  brokers: z
    .array(z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo', 'binance', 'coinbase', 'kraken']))
    .min(2, 'Must compare at least 2 brokers')
    .max(5, 'Cannot compare more than 5 brokers')
});

/**
 * Recommend Broker
 * POST /api/brokers/recommend
 */
const recommendBrokerBody = z.object({
  tradingStyle: z.enum(['day_trading', 'swing_trading', 'long_term', 'algorithmic']).optional(),
  assetTypes: z.array(z.enum(['stocks', 'options', 'crypto', 'forex', 'futures'])).optional(),
  budget: z.number().min(0).max(10000000).optional(),
  experience: z.enum(['beginner', 'intermediate', 'advanced']).optional()
});

module.exports = {
  getBrokerParams,
  testBrokerBody,
  testSpecificBrokerParams,
  testSpecificBrokerBody,
  configureBrokerBody,
  deleteUserBrokerParams,
  compareBrokersBody,
  recommendBrokerBody
};
