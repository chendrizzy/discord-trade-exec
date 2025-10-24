/**
 * Risk Management Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for risk management and position sizing endpoints
 */

const { z } = require('zod');

/**
 * Update Risk Settings
 * PUT /api/risk/settings
 */
const updateRiskSettingsBody = z.object({
  maxPositionSize: z.number().min(1).max(1000000, 'Max position size too large').optional(),
  maxDailyLoss: z.number().min(1).max(1000000, 'Max daily loss too large').optional(),
  maxDrawdown: z.number().min(0.1).max(100, 'Max drawdown must be between 0.1% and 100%').optional(),
  riskPerTrade: z.number().min(0.1).max(100, 'Risk per trade must be between 0.1% and 100%').optional(),
  maxOpenPositions: z.coerce.number().int().min(1).max(100, 'Max open positions must be between 1 and 100').optional(),
  stopLossPercent: z.number().min(0.1).max(100, 'Stop loss must be between 0.1% and 100%').optional(),
  takeProfitPercent: z.number().min(0.1).max(1000, 'Take profit must be between 0.1% and 1000%').optional(),
  useTrailingStop: z.boolean().optional(),
  trailingStopPercent: z.number().min(0.1).max(100, 'Trailing stop must be between 0.1% and 100%').optional(),
  riskRewardRatio: z.number().min(0.1).max(10, 'Risk/reward ratio must be between 0.1 and 10').optional()
});

/**
 * Calculate Position Size
 * POST /api/risk/calculate-position
 */
const calculatePositionBody = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/, 'Invalid symbol format. Expected: BASE/QUOTE'),
  entryPrice: z.number().positive('Entry price must be positive'),
  stopLoss: z.number().positive('Stop loss must be positive'),
  accountBalance: z.number().positive('Account balance must be positive').optional(),
  riskPercent: z.number().min(0.1).max(100, 'Risk percent must be between 0.1% and 100%').optional()
});

module.exports = {
  updateRiskSettingsBody,
  calculatePositionBody
};
