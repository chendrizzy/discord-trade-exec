/**
 * Discord API Integration Service
 *
 * Handles Discord API integration for channel validation, webhook testing, and bot permissions.
 */

const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../utils/logger');

// Initialize Discord client as singleton
let discordClient = null;

/**
 * Get or initialize Discord client
 * @returns {Client} Discord.js client instance
 */
const getClient = () => {
  if (!discordClient) {
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    // Login with bot token
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      logger.warn('[Discord] DISCORD_BOT_TOKEN not set - Discord integration will fail');
      return null;
    }

    discordClient.login(token).catch(err => {
      logger.error('[Discord] Failed to login:', err);
      discordClient = null;
    });

    discordClient.once('ready', () => {
      logger.info(`[Discord] Bot logged in as ${discordClient.user.tag}`);
    });

    discordClient.on('error', error => {
      logger.error('[Discord] Client error:', error);
    });
  }

  return discordClient;
};

/**
 * Validate Discord channel exists and bot has access
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<Object>} Channel validation result
 */
const validateChannel = async channelId => {
  if (!channelId || channelId.length < 10) {
    return {
      valid: false,
      error: 'Invalid channel ID format'
    };
  }

  const client = getClient();
  if (!client) {
    return {
      valid: false,
      error: 'Discord client not initialized - check DISCORD_BOT_TOKEN'
    };
  }

  // Wait for client to be ready
  if (!client.isReady()) {
    await new Promise(resolve => {
      client.once('ready', resolve);
      setTimeout(resolve, 5000); // Timeout after 5s
    });
  }

  if (!client.isReady()) {
    return {
      valid: false,
      error: 'Discord client failed to connect'
    };
  }

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      return {
        valid: false,
        error: 'Channel not found - bot may not have access'
      };
    }

    // Check if it's a text-based channel
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread
    ) {
      return {
        valid: false,
        error: `Channel type ${channel.type} does not support messages`
      };
    }

    // Check bot permissions
    const permissions = channel.permissionsFor(client.user);
    const canSendMessages = permissions.has(PermissionFlagsBits.SendMessages);
    const canViewChannel = permissions.has(PermissionFlagsBits.ViewChannel);
    const canEmbedLinks = permissions.has(PermissionFlagsBits.EmbedLinks);
    const canAttachFiles = permissions.has(PermissionFlagsBits.AttachFiles);

    const missingPermissions = [];
    if (!canSendMessages) missingPermissions.push('SendMessages');
    if (!canViewChannel) missingPermissions.push('ViewChannel');
    if (!canEmbedLinks) missingPermissions.push('EmbedLinks');
    if (!canAttachFiles) missingPermissions.push('AttachFiles');

    if (missingPermissions.length > 0) {
      return {
        valid: false,
        error: `Missing permissions: ${missingPermissions.join(', ')}`,
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          guildId: channel.guildId
        },
        permissions: {
          canSendMessages,
          canViewChannel,
          canEmbedLinks,
          canAttachFiles
        }
      };
    }

    return {
      valid: true,
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        guildId: channel.guildId
      },
      permissions: {
        canSendMessages,
        canViewChannel,
        canEmbedLinks,
        canAttachFiles
      }
    };
  } catch (error) {
    logger.error('[Discord] Channel validation error:', error);
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Get bot status and permissions in a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>} Bot status and permissions
 */
const getBotStatus = async guildId => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return {
      online: false,
      error: 'Discord client not ready'
    };
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return {
        online: false,
        error: 'Guild not found - bot may not be in server'
      };
    }

    const member = await guild.members.fetch(client.user.id);
    const permissions = member.permissions;

    const hasAdmin = permissions.has(PermissionFlagsBits.Administrator);
    const hasManageChannels = permissions.has(PermissionFlagsBits.ManageChannels);
    const hasManageWebhooks = permissions.has(PermissionFlagsBits.ManageWebhooks);
    const hasSendMessages = permissions.has(PermissionFlagsBits.SendMessages);
    const hasEmbedLinks = permissions.has(PermissionFlagsBits.EmbedLinks);
    const hasAttachFiles = permissions.has(PermissionFlagsBits.AttachFiles);

    const missingPermissions = [];
    if (!hasManageWebhooks) missingPermissions.push('ManageWebhooks');
    if (!hasSendMessages) missingPermissions.push('SendMessages');
    if (!hasEmbedLinks) missingPermissions.push('EmbedLinks');

    return {
      online: true,
      guildId,
      permissions: {
        administrator: hasAdmin,
        manageChannels: hasManageChannels,
        manageWebhooks: hasManageWebhooks,
        sendMessages: hasSendMessages,
        embedLinks: hasEmbedLinks,
        attachFiles: hasAttachFiles
      },
      missingPermissions,
      lastSeen: new Date().toISOString()
    };
  } catch (error) {
    logger.error('[Discord] Bot status error:', error);
    return {
      online: false,
      error: error.message
    };
  }
};

/**
 * Send test notification to Discord channel
 * @param {string} channelId - Discord channel ID
 * @param {Object} message - Message content
 * @returns {Promise<Object>} Send result
 */
const sendTestNotification = async (channelId, message) => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return {
      success: false,
      error: 'Discord client not ready'
    };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return {
        success: false,
        error: 'Channel not found'
      };
    }

    // Build embed for test notification
    const embed = {
      title: message.title || '🧪 Test Notification',
      description: message.description || 'This is a test message from Discord Trade Executor',
      color: 0x00ff00, // Green
      fields: message.fields || [
        { name: 'Status', value: '✅ Connection successful', inline: true },
        { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
      ],
      footer: {
        text: message.footer || 'Discord Trade Executor • Test Mode'
      },
      timestamp: new Date()
    };

    const sentMessage = await channel.send({ embeds: [embed] });

    logger.info(`[Discord] Test notification sent to channel ${channelId}, message ID: ${sentMessage.id}`);

    return {
      success: true,
      messageId: sentMessage.id,
      channelId,
      timestamp: sentMessage.createdAt.toISOString()
    };
  } catch (error) {
    logger.error('[Discord] Send test notification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create or update webhook for a channel
 * @param {string} channelId - Discord channel ID
 * @param {string} name - Webhook name
 * @returns {Promise<Object>} Webhook details
 */
const createWebhook = async (channelId, name) => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return {
      success: false,
      error: 'Discord client not ready'
    };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return {
        success: false,
        error: 'Channel not found'
      };
    }

    // Check if channel supports webhooks
    if (!channel.isTextBased() || channel.type === ChannelType.DM) {
      return {
        success: false,
        error: 'Channel does not support webhooks'
      };
    }

    // Check for existing webhook with same name
    const existingWebhooks = await channel.fetchWebhooks();
    const existingWebhook = existingWebhooks.find(wh => wh.name === name);

    if (existingWebhook) {
      logger.info(`[Discord] Reusing existing webhook '${name}' for channel ${channelId}`);
      return {
        success: true,
        id: existingWebhook.id,
        token: existingWebhook.token,
        channelId,
        name: existingWebhook.name,
        url: existingWebhook.url
      };
    }

    // Create new webhook
    const webhook = await channel.createWebhook({
      name,
      avatar: client.user.displayAvatarURL(),
      reason: 'Trade signal notifications'
    });

    logger.info(`[Discord] Created webhook '${name}' for channel ${channelId}`);

    return {
      success: true,
      id: webhook.id,
      token: webhook.token,
      channelId,
      name: webhook.name,
      url: webhook.url
    };
  } catch (error) {
    logger.error('[Discord] Create webhook error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send message via webhook
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} content - Message content
 * @returns {Promise<Object>} Send result
 */
const sendWebhookMessage = async (webhookUrl, content) => {
  try {
    const fetch = require('node-fetch');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook request failed: ${response.status} - ${errorText}`);
    }

    // Discord webhooks return 204 No Content on success
    const messageId = response.headers.get('x-discord-message-id');

    logger.info(`[Discord] Webhook message sent successfully, ID: ${messageId || 'unknown'}`);

    return {
      success: true,
      messageId: messageId || `webhook_msg_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('[Discord] Webhook message error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get Discord user information
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object>} User information
 */
const getUser = async userId => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return {
      error: 'Discord client not ready'
    };
  }

  try {
    const user = await client.users.fetch(userId);

    if (!user) {
      return {
        error: 'User not found'
      };
    }

    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      avatarURL: user.displayAvatarURL({ dynamic: true }),
      bot: user.bot,
      system: user.system,
      createdAt: user.createdAt.toISOString()
    };
  } catch (error) {
    logger.error('[Discord] Get user error:', error);
    return {
      error: error.message
    };
  }
};


/**
 * Get list of guild channels
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Array>} List of channels
 */
const getGuildChannels = async (guildId) => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return {
      error: 'Discord client not ready'
    };
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return {
        error: 'Guild not found'
      };
    }

    const channels = await guild.channels.fetch();

    // Filter to only text-based channels that support messages
    const textChannels = channels
      .filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        parentId: channel.parentId
      }))
      .sort((a, b) => a.position - b.position);

    return textChannels;
  } catch (error) {
    logger.error('[Discord] Get guild channels error:', error);
    return {
      error: error.message
    };
  }
};


/**
 * Check if bot is in guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} Whether bot is in guild
 */
const isBotInGuild = async guildId => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return false;
  }

  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    return !!guild;
  } catch (error) {
    logger.error('[Discord] Check bot in guild error:', error);
    return false;
  }
};

/**
 * Gracefully shut down Discord client
 * @returns {Promise<void>}
 */
const shutdown = async () => {
  if (discordClient && discordClient.isReady()) {
    logger.info('[Discord] Shutting down Discord client...');
    await discordClient.destroy();
    discordClient = null;
  }
};

module.exports = {
  validateChannel,
  getBotStatus,
  sendTestNotification,
  createWebhook,
  sendWebhookMessage,
  getUser,
  getGuildChannels,
  isBotInGuild,
  shutdown,
  getClient // Export for testing purposes
};
