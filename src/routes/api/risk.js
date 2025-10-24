// External dependencies
const express = require('express');

const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validation');
const {
  updateRiskSettingsBody,
  calculatePositionBody
} = require('../../validators/risk.validators');
const logger = require('../../utils/logger');

// Apply rate limiting
router.use(apiLimiter);

// Get current risk settings
router.get('/settings', ensureAuthenticated, async (req, res) => {
  try {
    const riskSettings = req.user.tradingConfig.riskManagement;

    res.json({
      success: true,
      settings: {
        // Position sizing
        maxPositionSize: riskSettings.maxPositionSize,
        positionSizingMethod: riskSettings.positionSizingMethod,

        // Stop loss & take profit
        defaultStopLoss: riskSettings.defaultStopLoss,
        defaultTakeProfit: riskSettings.defaultTakeProfit,
        useTrailingStop: riskSettings.useTrailingStop,
        trailingStopPercent: riskSettings.trailingStopPercent,

        // Daily limits
        maxDailyLoss: riskSettings.maxDailyLoss,
        dailyLossAmount: riskSettings.dailyLossAmount,
        dailyLossPercentage: (riskSettings.dailyLossAmount * 100).toFixed(2),

        // Position limits
        maxOpenPositions: riskSettings.maxOpenPositions,
        maxPositionsPerSymbol: riskSettings.maxPositionsPerSymbol,
        maxPortfolioRisk: riskSettings.maxPortfolioRisk,

        // Trading hours
        tradingHoursEnabled: riskSettings.tradingHoursEnabled,
        tradingHoursStart: riskSettings.tradingHoursStart,
        tradingHoursEnd: riskSettings.tradingHoursEnd
      }
    });
  } catch (error) {
    logger.error('Error fetching risk settings:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch risk settings'
    });
  }
});

// Update risk settings
router.put('/settings', ensureAuthenticated, validate(updateRiskSettingsBody, 'body'), async (req, res) => {
  try {
    const updates = req.body;
    const riskSettings = req.user.tradingConfig.riskManagement;

    // Validate and update position sizing
    if (updates.maxPositionSize !== undefined) {
      const value = parseFloat(updates.maxPositionSize);
      if (value >= 0.005 && value <= 0.1) {
        riskSettings.maxPositionSize = value;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Max position size must be between 0.5% and 10%'
        });
      }
    }

    if (updates.positionSizingMethod !== undefined) {
      if (['fixed', 'risk_based', 'kelly'].includes(updates.positionSizingMethod)) {
        riskSettings.positionSizingMethod = updates.positionSizingMethod;
      }
    }

    // Validate and update stop loss & take profit
    if (updates.defaultStopLoss !== undefined) {
      const value = parseFloat(updates.defaultStopLoss);
      if (value >= 0.01 && value <= 0.1) {
        riskSettings.defaultStopLoss = value;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Default stop loss must be between 1% and 10%'
        });
      }
    }

    if (updates.defaultTakeProfit !== undefined) {
      const value = parseFloat(updates.defaultTakeProfit);
      if (value >= 0.02 && value <= 0.2) {
        riskSettings.defaultTakeProfit = value;
      }
    }

    if (updates.useTrailingStop !== undefined) {
      riskSettings.useTrailingStop = Boolean(updates.useTrailingStop);
    }

    if (updates.trailingStopPercent !== undefined) {
      const value = parseFloat(updates.trailingStopPercent);
      if (value >= 0.005 && value <= 0.05) {
        riskSettings.trailingStopPercent = value;
      }
    }

    // Validate and update daily limits
    if (updates.maxDailyLoss !== undefined) {
      const value = parseFloat(updates.maxDailyLoss);
      if (value >= 0.02 && value <= 0.2) {
        riskSettings.maxDailyLoss = value;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Max daily loss must be between 2% and 20%'
        });
      }
    }

    // Validate and update position limits
    if (updates.maxOpenPositions !== undefined) {
      const value = parseInt(updates.maxOpenPositions);
      if (value >= 1 && value <= 10) {
        riskSettings.maxOpenPositions = value;
      }
    }

    if (updates.maxPositionsPerSymbol !== undefined) {
      const value = parseInt(updates.maxPositionsPerSymbol);
      if (value >= 1 && value <= 3) {
        riskSettings.maxPositionsPerSymbol = value;
      }
    }

    if (updates.maxPortfolioRisk !== undefined) {
      const value = parseFloat(updates.maxPortfolioRisk);
      if (value >= 0.05 && value <= 0.3) {
        riskSettings.maxPortfolioRisk = value;
      }
    }

    // Validate and update trading hours
    if (updates.tradingHoursEnabled !== undefined) {
      riskSettings.tradingHoursEnabled = Boolean(updates.tradingHoursEnabled);
    }

    if (updates.tradingHoursStart !== undefined) {
      // Validate time format HH:MM
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(updates.tradingHoursStart)) {
        riskSettings.tradingHoursStart = updates.tradingHoursStart;
      }
    }

    if (updates.tradingHoursEnd !== undefined) {
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(updates.tradingHoursEnd)) {
        riskSettings.tradingHoursEnd = updates.tradingHoursEnd;
      }
    }

    await req.user.save();

    res.json({
      success: true,
      message: 'Risk settings updated successfully',
      settings: riskSettings
    });
  } catch (error) {
    logger.error('Error updating risk settings:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to update risk settings'
    });
  }
});

// Calculate position size
router.post('/calculate-position', ensureAuthenticated, validate(calculatePositionBody, 'body'), async (req, res) => {
  try {
    const { accountBalance, entryPrice, stopLossPrice } = req.body;

    if (!accountBalance || !entryPrice || !stopLossPrice) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountBalance, entryPrice, stopLossPrice'
      });
    }

    const calculation = req.user.calculatePositionSize(
      parseFloat(accountBalance),
      parseFloat(entryPrice),
      parseFloat(stopLossPrice)
    );

    res.json({
      success: true,
      calculation: {
        positionSize: calculation.positionSize.toFixed(8),
        riskAmount: calculation.riskAmount.toFixed(2),
        stopLossDistance: calculation.stopLossDistance.toFixed(2) + '%'
      }
    });
  } catch (error) {
    logger.error('Error calculating position size:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate position size'
    });
  }
});

// Get daily loss status
router.get('/daily-loss', ensureAuthenticated, async (req, res) => {
  try {
    const lossCheck = req.user.checkDailyLossLimit();

    res.json({
      success: true,
      dailyLoss: {
        allowed: lossCheck.allowed,
        currentLoss: lossCheck.currentLoss || 0,
        currentLossPercentage: ((lossCheck.currentLoss || 0) * 100).toFixed(2) + '%',
        maxLoss: lossCheck.maxLoss || req.user.tradingConfig.riskManagement.maxDailyLoss,
        maxLossPercentage:
          ((lossCheck.maxLoss || req.user.tradingConfig.riskManagement.maxDailyLoss) * 100).toFixed(2) + '%',
        reason: lossCheck.reason
      }
    });
  } catch (error) {
    logger.error('Error checking daily loss:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to check daily loss'
    });
  }
});

// Reset daily loss (manual reset, admin only or end of day)
router.post('/daily-loss/reset', ensureAuthenticated, async (req, res) => {
  try {
    req.user.tradingConfig.riskManagement.dailyLossAmount = 0;
    req.user.tradingConfig.riskManagement.dailyLossResetDate = new Date();
    await req.user.save();

    res.json({
      success: true,
      message: 'Daily loss counter reset successfully'
    });
  } catch (error) {
    logger.error('Error resetting daily loss:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to reset daily loss'
    });
  }
});

module.exports = router;
