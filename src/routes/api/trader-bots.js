/**
 * Trading Bot Management API Routes
 *
 * CRUD operations for automated trading bots.
 * Constitution Principle I: All routes are user-scoped (userId/tenantId filtering)
 * Constitution Principle III: SecurityAudit logging for bot operations
 * Constitution Principle V: Rate limiting applied
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { authenticateToken, requireTraderAccess } = require('../../middleware/auth-middleware');
const TradingBot = require('../../models/TradingBot');
const SecurityAudit = require('../../models/SecurityAudit');
const { debugLog, debugWarn, debugError } = require('../../utils/debug-logger');

// Rate limiters
const botsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many bot requests, please try again later'
});

const botActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: 'Too many bot actions, please try again later'
});

// Validation schemas
const CreateBotSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  tradingPair: z.string().regex(/^[A-Z]{3,6}\/[A-Z]{3,6}$/),
  exchange: z.enum(['binance', 'alpaca', 'coinbase', 'kraken']).default('binance'),
  strategy: z.enum(['conservative', 'moderate', 'aggressive', 'custom']).default('moderate'),
  strategyType: z.enum(['dca', 'grid', 'trend', 'scalping', 'arbitrage', 'custom']).default('dca'),
  riskConfig: z.object({
    positionSize: z.number().min(0).max(100000).default(100),
    positionSizeType: z.enum(['fixed', 'percentage', 'risk-based']).default('fixed'),
    stopLossPercent: z.number().min(0).max(100).default(2),
    takeProfitPercent: z.number().min(0).max(1000).default(5),
    maxDailyLoss: z.number().min(0).max(100000).default(500),
    maxOpenPositions: z.number().min(1).max(50).default(3)
  }).optional()
});

const UpdateBotSchema = CreateBotSchema.partial();

/**
 * GET /api/trader/bots
 * Get all trading bots for the authenticated user
 */
router.get('/',
  botsLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      const bots = await TradingBot.find({ tenantId, userId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: bots,
        count: bots.length
      });

    } catch (error) {
      debugError('[Bot API] Error fetching bots:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trading bots'
      });
    }
  }
);

/**
 * GET /api/trader/bots/:id
 * Get a specific trading bot
 */
router.get('/:id',
  botsLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      const bot = await TradingBot.findOne({
        _id: id,
        tenantId,
        userId
      }).lean();

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      res.json({
        success: true,
        data: bot
      });

    } catch (error) {
      debugError('[Bot API] Error fetching bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trading bot'
      });
    }
  }
);

/**
 * POST /api/trader/bots
 * Create a new trading bot
 */
router.post('/',
  botsLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Validate request body
      const validation = CreateBotSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bot configuration',
          details: validation.error.errors
        });
      }

      const botData = validation.data;

      // Create bot
      const bot = await TradingBot.create({
        ...botData,
        userId,
        tenantId
      });

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_created',
        resourceType: 'trading_bot',
        resourceId: bot._id.toString(),
        changes: botData,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(201).json({
        success: true,
        data: bot,
        message: 'Trading bot created successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error creating bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create trading bot'
      });
    }
  }
);

/**
 * PUT /api/trader/bots/:id
 * Update a trading bot
 */
router.put('/:id',
  botsLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      // Validate request body
      const validation = UpdateBotSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bot configuration',
          details: validation.error.errors
        });
      }

      const updates = validation.data;

      // Find and update bot
      const bot = await TradingBot.findOneAndUpdate(
        { _id: id, tenantId, userId },
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_updated',
        resourceType: 'trading_bot',
        resourceId: bot._id.toString(),
        changes: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: bot,
        message: 'Trading bot updated successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error updating bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update trading bot'
      });
    }
  }
);

/**
 * DELETE /api/trader/bots/:id
 * Delete a trading bot
 */
router.delete('/:id',
  botsLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      const bot = await TradingBot.findOneAndDelete({
        _id: id,
        tenantId,
        userId
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_deleted',
        resourceType: 'trading_bot',
        resourceId: id,
        changes: { name: bot.name, tradingPair: bot.tradingPair },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: 'Trading bot deleted successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error deleting bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete trading bot'
      });
    }
  }
);

/**
 * POST /api/trader/bots/:id/start
 * Start a trading bot
 */
router.post('/:id/start',
  botActionLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      const bot = await TradingBot.findOne({
        _id: id,
        tenantId,
        userId
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      // Start the bot
      await bot.start();

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_started',
        resourceType: 'trading_bot',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: bot,
        message: 'Trading bot started successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error starting bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start trading bot'
      });
    }
  }
);

/**
 * POST /api/trader/bots/:id/pause
 * Pause a trading bot
 */
router.post('/:id/pause',
  botActionLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      const bot = await TradingBot.findOne({
        _id: id,
        tenantId,
        userId
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      // Pause the bot
      await bot.pause();

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_paused',
        resourceType: 'trading_bot',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: bot,
        message: 'Trading bot paused successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error pausing bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to pause trading bot'
      });
    }
  }
);

/**
 * POST /api/trader/bots/:id/stop
 * Stop a trading bot
 */
router.post('/:id/stop',
  botActionLimiter,
  authenticateToken,
  requireTraderAccess,
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;
      const { id } = req.params;

      const bot = await TradingBot.findOne({
        _id: id,
        tenantId,
        userId
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Trading bot not found'
        });
      }

      // Stop the bot
      await bot.stop();

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'trading_bot_stopped',
        resourceType: 'trading_bot',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: bot,
        message: 'Trading bot stopped successfully'
      });

    } catch (error) {
      debugError('[Bot API] Error stopping bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop trading bot'
      });
    }
  }
);

module.exports = router;
