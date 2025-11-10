/**
 * Community Integration API Routes
 *
 * Discord bot integration, webhooks, and notification management for community hosts.
 * Constitution Principle I: All routes are community-scoped (tenantId filtering)
 * Constitution Principle III: SecurityAudit logging for sensitive operations
 * Constitution Principle V: Rate limiting applied
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const axios = require('axios');
const { authenticateToken, requireCommunityAccess, requireRole } = require('../../middleware/auth-middleware');
const User = require('../../models/User');
const SecurityAudit = require('../../models/SecurityAudit');
const { debugLog, debugWarn, debugError } = require('../../utils/debug-logger');

// Rate limiters
const integrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many integration requests, please try again later'
});

const testLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: 'Too many test requests, please try again later'
});

// Validation schemas
const IntegrationUpdateSchema = z.object({
  webhookUrl: z.string().url().optional(),
  notificationChannelId: z.string().regex(/^\d{17,19}$/).optional(),
  alertChannelId: z.string().regex(/^\d{17,19}$/).optional()
});

const TestNotificationSchema = z.object({
  channelId: z.string().regex(/^\d{17,19}$/),
  message: z.string().min(1).max(2000)
});

/**
 * GET /api/community/integration
 * Get Discord integration settings and status
 */
router.get('/',
  integrationLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin', 'moderator']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;

      const user = await User.findOne({
        tenantId,
        roles: { $in: ['admin', 'moderator'] }
      }).select('integration discord');

      if (!user || !user.integration) {
        return res.status(404).json({
          success: false,
          error: 'Integration settings not found'
        });
      }

      // Get bot status from Discord API
      let botStatus = { online: false, lastSeen: user.integration.discord?.lastPing || null };

      if (process.env.DISCORD_BOT_TOKEN) {
        try {
          const botResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` }
          });

          if (botResponse.data) {
            botStatus = {
              online: true,
              lastSeen: new Date().toISOString()
            };
          }
        } catch (botError) {
          debugWarn('[Integration API] Failed to fetch bot status:', botError.message);
        }
      }

      // Get bot info and permissions
      const botInfo = user.integration.discord?.botInfo || {
        username: process.env.DISCORD_BOT_USERNAME || 'Trade Executor Bot',
        applicationId: process.env.DISCORD_CLIENT_ID || 'Not configured'
      };

      const permissions = [
        { name: 'Read Messages', granted: true },
        { name: 'Send Messages', granted: true },
        { name: 'Manage Webhooks', granted: !!user.integration.discord?.webhookUrl },
        { name: 'Embed Links', granted: true }
      ];

      const notifications = [
        {
          type: 'trade_executed',
          label: 'Trade Executed',
          description: 'Notify when a trade is executed',
          enabled: user.integration.notifications?.tradeExecuted ?? true
        },
        {
          type: 'signal_posted',
          label: 'Signal Posted',
          description: 'Notify when a new signal is posted',
          enabled: user.integration.notifications?.signalPosted ?? true
        },
        {
          type: 'daily_summary',
          label: 'Daily Summary',
          description: 'Send daily performance summary',
          enabled: user.integration.notifications?.dailySummary ?? true
        },
        {
          type: 'system_alerts',
          label: 'System Alerts',
          description: 'Critical system alerts and errors',
          enabled: user.integration.notifications?.systemAlerts ?? true
        }
      ];

      res.json({
        success: true,
        data: {
          discord: {
            webhookUrl: user.integration.discord?.webhookUrl || '',
            notificationChannelId: user.integration.discord?.notificationChannelId || '',
            alertChannelId: user.integration.discord?.alertChannelId || '',
            botStatus,
            botInfo,
            permissions
          },
          notifications,
          apiKey: user.integration.apiKey || 'Not generated',
          webhookSecret: user.integration.webhookSecret || 'Not generated'
        }
      });

    } catch (error) {
      debugError('[Integration API] Error fetching settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch integration settings'
      });
    }
  }
);

/**
 * PUT /api/community/integration
 * Update Discord integration settings
 */
router.put('/',
  integrationLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Validate request body
      const validation = IntegrationUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid integration settings',
          details: validation.error.errors
        });
      }

      const updates = validation.data;

      // Validate webhook URL if provided
      if (updates.webhookUrl) {
        const webhookValid = await validateDiscordWebhook(updates.webhookUrl);
        if (!webhookValid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Discord webhook URL or webhook is disabled'
          });
        }
      }

      // Validate channel IDs if provided
      if (updates.notificationChannelId) {
        const channelValid = await validateDiscordChannel(updates.notificationChannelId);
        if (!channelValid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid notification channel ID or bot lacks access'
          });
        }
      }

      if (updates.alertChannelId) {
        const channelValid = await validateDiscordChannel(updates.alertChannelId);
        if (!channelValid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid alert channel ID or bot lacks access'
          });
        }
      }

      // Update user integration settings
      const updateFields = {};
      if (updates.webhookUrl !== undefined) {
        updateFields['integration.discord.webhookUrl'] = updates.webhookUrl;
      }
      if (updates.notificationChannelId !== undefined) {
        updateFields['integration.discord.notificationChannelId'] = updates.notificationChannelId;
      }
      if (updates.alertChannelId !== undefined) {
        updateFields['integration.discord.alertChannelId'] = updates.alertChannelId;
      }
      updateFields['integration.discord.lastUpdated'] = new Date();

      await User.updateOne(
        { tenantId, roles: 'admin' },
        { $set: updateFields }
      );

      // Log security audit
      await SecurityAudit.create({
        tenantId,
        userId,
        action: 'integration_settings_updated',
        resourceType: 'integration',
        resourceId: tenantId,
        changes: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: 'Integration settings updated successfully'
      });

    } catch (error) {
      debugError('[Integration API] Error updating settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update integration settings'
      });
    }
  }
);

/**
 * POST /api/community/integration/test
 * Send test notification to Discord channel
 */
router.post('/test',
  testLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin', 'moderator']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;

      // Validate request body
      const validation = TestNotificationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid test notification request',
          details: validation.error.errors
        });
      }

      const { channelId, message } = validation.data;

      // Get user's webhook URL
      const user = await User.findOne({
        tenantId,
        roles: { $in: ['admin', 'moderator'] }
      }).select('integration.discord.webhookUrl');

      if (!user?.integration?.discord?.webhookUrl) {
        return res.status(400).json({
          success: false,
          error: 'Webhook URL not configured. Please configure your webhook first.'
        });
      }

      // Send test notification via webhook
      const webhookResponse = await axios.post(user.integration.discord.webhookUrl, {
        content: message,
        embeds: [{
          title: '🧪 Test Notification',
          description: message,
          color: 0x00ff00,
          footer: {
            text: 'Discord Trade Executor'
          },
          timestamp: new Date().toISOString()
        }]
      });

      if (webhookResponse.status === 204) {
        res.json({
          success: true,
          message: 'Test notification sent successfully'
        });
      } else {
        throw new Error('Webhook returned unexpected status');
      }

    } catch (error) {
      debugError('[Integration API] Error sending test notification:', error);

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Webhook URL is invalid or has been deleted'
        });
      }

      if (error.response?.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Webhook authentication failed'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to send test notification',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/community/integration/reconnect
 * Reconnect Discord bot
 */
router.post('/reconnect',
  integrationLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      // Verify bot token is configured
      if (!process.env.DISCORD_BOT_TOKEN) {
        return res.status(503).json({
          success: false,
          error: 'Discord bot token not configured on server'
        });
      }

      // Test bot connection
      try {
        const botResponse = await axios.get('https://discord.com/api/v10/users/@me', {
          headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` }
        });

        if (botResponse.data) {
          // Update last ping timestamp
          await User.updateOne(
            { tenantId, roles: 'admin' },
            {
              $set: {
                'integration.discord.lastPing': new Date(),
                'integration.discord.botStatus': 'online'
              }
            }
          );

          // Log security audit
          await SecurityAudit.create({
            tenantId,
            userId,
            action: 'bot_reconnection_initiated',
            resourceType: 'integration',
            resourceId: tenantId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });

          res.json({
            success: true,
            message: 'Bot reconnected successfully',
            botInfo: {
              username: botResponse.data.username,
              id: botResponse.data.id
            }
          });
        }
      } catch (botError) {
        debugError('[Integration API] Bot connection failed:', botError);
        return res.status(503).json({
          success: false,
          error: 'Failed to connect to Discord bot',
          details: botError.response?.data || botError.message
        });
      }

    } catch (error) {
      debugError('[Integration API] Error reconnecting bot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reconnect bot'
      });
    }
  }
);

/**
 * GET /api/community/integration/webhook/validate
 * Validate Discord webhook URL
 */
router.get('/webhook/validate',
  integrationLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin', 'moderator']),
  async (req, res) => {
    try {
      const { url } = req.query;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Webhook URL is required'
        });
      }

      const isValid = await validateDiscordWebhook(url);

      res.json({
        success: true,
        valid: isValid,
        message: isValid ? 'Webhook URL is valid' : 'Webhook URL is invalid or disabled'
      });

    } catch (error) {
      debugError('[Integration API] Error validating webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate webhook URL'
      });
    }
  }
);

/**
 * GET /api/community/integration/channel/validate
 * Validate Discord channel ID
 */
router.get('/channel/validate',
  integrationLimiter,
  authenticateToken,
  requireCommunityAccess,
  requireRole(['admin', 'moderator']),
  async (req, res) => {
    try {
      const { channelId } = req.query;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          error: 'Channel ID is required'
        });
      }

      // Validate channel ID format
      if (!/^\d{17,19}$/.test(channelId)) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'Invalid channel ID format'
        });
      }

      const isValid = await validateDiscordChannel(channelId);

      res.json({
        success: true,
        valid: isValid,
        message: isValid ? 'Channel ID is valid and bot has access' : 'Channel ID is invalid or bot lacks access'
      });

    } catch (error) {
      debugError('[Integration API] Error validating channel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate channel ID'
      });
    }
  }
);

// Helper Functions

/**
 * Validate Discord webhook URL
 * @param {string} webhookUrl - Discord webhook URL
 * @returns {Promise<boolean>} - True if valid
 */
async function validateDiscordWebhook(webhookUrl) {
  try {
    // Discord webhook URL pattern: https://discord.com/api/webhooks/{webhook.id}/{webhook.token}
    const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

    if (!webhookPattern.test(webhookUrl)) {
      return false;
    }

    // Test webhook by getting its info (doesn't send message)
    const response = await axios.get(webhookUrl);

    // Check if webhook is active
    return response.status === 200 && response.data.id;
  } catch (error) {
    debugWarn('[Integration API] Webhook validation failed:', error.message);
    return false;
  }
}

/**
 * Validate Discord channel ID
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<boolean>} - True if valid and bot has access
 */
async function validateDiscordChannel(channelId) {
  try {
    if (!process.env.DISCORD_BOT_TOKEN) {
      debugWarn('[Integration API] Discord bot token not configured');
      return false;
    }

    // Try to fetch channel info
    const response = await axios.get(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` }
    });

    // Check if bot has access to channel
    return response.status === 200 && response.data.id === channelId;
  } catch (error) {
    debugWarn('[Integration API] Channel validation failed:', error.message);
    return false;
  }
}

module.exports = router;
