// External dependencies
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Internal utilities and services
const SignalParser = require('../SignalParser');
const TradeExecutor = require('./TradeExecutor');

// Models and types
const User = require('../models/User');
const logger = require('../utils/logger');
const logger = require('../utils/logger');

class DiscordTradeBot {
  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });
    this.tradeExecutor = new TradeExecutor();
    this.signalParser = new SignalParser();
    this.setupEventHandlers();
    this.setupSlashCommands();
  }

  setupEventHandlers() {
    this.client.on('clientReady', () => {
      console.log(`✅ Bot logged in as ${this.client.user.tag}`);
    });

    this.client.on('error', error => {
      logger.error('Discord client error:', { error: error.message, stack: error.stack });
    });

    this.client.on('messageCreate', async message => {
      if (message.author.bot) return;

      // Parse potential trading signals
      const signal = this.signalParser.parseMessage(message.content);
      if (signal) {
        await this.handleTradeSignal(signal, message);
      }
    });
  }

  async handleTradeSignal(signal, message) {
    try {
      // Get or create user
      let user = await User.findByDiscordId(message.author.id);

      if (!user) {
        // Create new user with trial subscription
        user = new User({
          discordId: message.author.id,
          discordUsername: message.author.username,
          discordTag: message.author.tag,
          subscription: {
            status: 'trial',
            tier: 'free'
          }
        });
        await user.save();

        // Welcome new user
        const welcomeEmbed = new EmbedBuilder()
          .setTitle('🎉 Welcome to Discord Trade Executor!')
          .setDescription('Your 7-day free trial has started!')
          .setColor(0x00ff00)
          .addFields(
            {
              name: 'Trial Includes',
              value: '✅ 10 signals/day\n✅ Auto trade execution\n✅ Basic risk management',
              inline: false
            },
            { name: 'Upgrade Anytime', value: 'Use `/subscribe` for unlimited signals!', inline: false }
          )
          .setFooter({ text: `Trial ends ${user.subscription.trialEndsAt.toLocaleDateString()}` });

        await message.author.send({ embeds: [welcomeEmbed] }).catch(() => {
          logger.info('Unable to DM user - DMs may be disabled');
        });
      }

      // Check if user can execute trades
      const canTrade = user.canExecuteTrade();

      if (!canTrade.allowed) {
        const limitEmbed = new EmbedBuilder()
          .setTitle('⚠️ Trade Limit Reached')
          .setDescription(canTrade.reason)
          .setColor(0xffa500)
          .addFields(
            { name: 'Current Plan', value: user.subscription.tier.toUpperCase(), inline: true },
            { name: 'Signals Used Today', value: `${user.limits.signalsUsedToday}`, inline: true },
            { name: 'Upgrade', value: 'Use `/subscribe` for unlimited signals!', inline: false }
          );

        await message.reply({ embeds: [limitEmbed] });
        return;
      }

      // Increment usage
      await user.incrementSignalUsage();

      // If confirmation required, show confirm/cancel buttons
      if (user.tradingConfig.confirmationRequired) {
        const confirmEmbed = new EmbedBuilder()
          .setTitle('📊 Trade Signal Detected')
          .setDescription('Confirm to execute this trade')
          .setColor(0x0099ff)
          .addFields(
            { name: 'Symbol', value: signal.symbol, inline: true },
            { name: 'Action', value: signal.action.toUpperCase(), inline: true },
            { name: 'Price', value: signal.price ? `$${signal.price}` : 'Market', inline: true }
          );

        if (signal.stopLoss) {
          confirmEmbed.addFields({ name: 'Stop Loss', value: `$${signal.stopLoss}`, inline: true });
        }
        if (signal.takeProfit) {
          confirmEmbed.addFields({ name: 'Take Profit', value: `$${signal.takeProfit}`, inline: true });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_trade').setLabel('✅ Execute Trade').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cancel_trade').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
        );

        const confirmMessage = await message.reply({
          embeds: [confirmEmbed],
          components: [row]
        });

        // Wait for button interaction (30 second timeout)
        const filter = i => i.user.id === message.author.id;
        const collector = confirmMessage.createMessageComponentCollector({
          filter,
          time: 30000,
          max: 1
        });

        collector.on('collect', async interaction => {
          if (interaction.customId === 'confirm_trade') {
            await interaction.deferUpdate();
            await this.executeTradeForUser(signal, user, interaction);
          } else {
            await interaction.update({
              content: '❌ Trade cancelled',
              embeds: [],
              components: []
            });
          }
        });

        collector.on('end', collected => {
          if (collected.size === 0) {
            confirmMessage
              .edit({
                content: '⏱️ Trade confirmation timed out',
                components: []
              })
              .catch(() => {});
          }
        });
      } else {
        // Auto-execute without confirmation
        await this.executeTradeForUser(signal, user, message);
      }
    } catch (error) {
      logger.error('Trade signal handling error:', { error: error.message, stack: error.stack });
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error Processing Signal')
        .setDescription('An error occurred while processing your trade signal')
        .setColor(0xff0000)
        .setFooter({ text: 'Please contact support if this persists' });

      await message.reply({ embeds: [errorEmbed] });
    }
  }

  async executeTradeForUser(signal, user, messageOrInteraction) {
    try {
      // Execute the trade
      const result = await this.tradeExecutor.executeTrade(signal);

      // Record trade in user stats
      await user.recordTrade(result.success);

      const embed = new EmbedBuilder()
        .setTitle(result.success ? '🎯 Trade Executed Successfully' : '❌ Trade Execution Failed')
        .setColor(result.success ? 0x00ff00 : 0xff0000)
        .addFields(
          { name: 'Symbol', value: signal.symbol, inline: true },
          { name: 'Action', value: signal.action.toUpperCase(), inline: true },
          { name: 'Status', value: result.success ? '✅ Success' : '❌ Failed', inline: true }
        );

      if (result.success) {
        embed.addFields(
          { name: 'Order ID', value: result.orderId || 'N/A', inline: true },
          { name: 'Amount', value: result.amount?.toString() || 'N/A', inline: true }
        );
      } else {
        embed.addFields({ name: 'Reason', value: result.reason || 'Unknown error', inline: false });
      }

      // Add usage stats
      embed.setFooter({
        text: `Signals used today: ${user.limits.signalsUsedToday} | Total trades: ${user.stats.totalTradesExecuted}`
      });

      // Check if it's a deferred interaction or regular message
      if (messageOrInteraction.deferred) {
        // Interaction was deferred, use editReply
        await messageOrInteraction.editReply({
          embeds: [embed],
          components: []
        });
      } else if (messageOrInteraction.reply) {
        // Regular message, use reply
        await messageOrInteraction.reply({ embeds: [embed] });
      } else if (messageOrInteraction.update) {
        // Interaction not deferred, use update
        await messageOrInteraction.update({
          embeds: [embed],
          components: []
        });
      }
    } catch (error) {
      logger.error('Trade execution error:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  setupSlashCommands() {
    // Register slash commands when bot is ready
    this.client.once('clientReady', async () => {
      const commands = [
        {
          name: 'subscribe',
          description: 'Manage your subscription plan'
        },
        {
          name: 'stats',
          description: 'View your trading statistics'
        },
        {
          name: 'config',
          description: 'Configure your trading settings'
        },
        {
          name: 'help',
          description: 'Get help with using the bot'
        }
      ];

      try {
        await this.client.application.commands.set(commands);
        logger.info('✅ Slash commands registered');
      } catch (error) {
        logger.error('Failed to register slash commands:', { error: error.message, stack: error.stack });
      }
    });

    // Handle slash command interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      try {
        switch (interaction.commandName) {
          case 'subscribe':
            await this.handleSubscribeCommand(interaction);
            break;
          case 'stats':
            await this.handleStatsCommand(interaction);
            break;
          case 'config':
            await this.handleConfigCommand(interaction);
            break;
          case 'help':
            await this.handleHelpCommand(interaction);
            break;
        }
      } catch (error) {
        logger.error('Slash command error:', { error: error.message, stack: error.stack });
        await interaction.reply({
          content: 'An error occurred processing your command',
          ephemeral: true
        });
      }
    });
  }

  async handleSubscribeCommand(interaction) {
    const user = await User.findByDiscordId(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('💳 Subscription Plans')
      .setDescription('Choose the perfect plan for your trading needs')
      .setColor(0x0099ff)
      .addFields(
        {
          name: '🆓 Free (Trial)',
          value: '10 signals/day\nBasic features\n7-day trial',
          inline: true
        },
        {
          name: '⭐ Basic - $49/month',
          value: '100 signals/day\nMulti-broker support\nBasic analytics',
          inline: true
        },
        {
          name: '🚀 Pro - $99/month',
          value: 'Unlimited signals\nAdvanced risk management\nPriority support\nPerformance analytics',
          inline: true
        },
        {
          name: '💎 Premium - $299/month',
          value: 'Everything in Pro\nMultiple brokers\nCustom strategies\nDedicated support\nAPI access',
          inline: false
        }
      )
      .setFooter({ text: user ? `Current plan: ${user.subscription.tier.toUpperCase()}` : 'Sign up to get started!' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Upgrade Now')
        .setStyle(ButtonStyle.Link)
        .setURL(process.env.POLAR_CHECKOUT_URL || 'https://polar.sh/checkout')
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  async handleStatsCommand(interaction) {
    const user = await User.findByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: 'You need to execute a trade first to see your stats!',
        ephemeral: true
      });
      return;
    }

    const winRate =
      user.stats.totalTradesExecuted > 0
        ? ((user.stats.successfulTrades / user.stats.totalTradesExecuted) * 100).toFixed(1)
        : '0.0';

    const netProfit = user.stats.totalProfit - user.stats.totalLoss;

    const embed = new EmbedBuilder()
      .setTitle('📊 Your Trading Statistics')
      .setColor(netProfit >= 0 ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: 'Total Trades', value: user.stats.totalTradesExecuted.toString(), inline: true },
        { name: 'Successful', value: user.stats.successfulTrades.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Total Profit', value: `$${user.stats.totalProfit.toFixed(2)}`, inline: true },
        { name: 'Total Loss', value: `$${user.stats.totalLoss.toFixed(2)}`, inline: true },
        { name: 'Net P&L', value: `$${netProfit.toFixed(2)}`, inline: true },
        { name: 'Signals Processed', value: user.stats.totalSignalsProcessed.toString(), inline: true },
        { name: 'Signals Today', value: `${user.limits.signalsUsedToday}/${user.limits.signalsPerDay}`, inline: true },
        { name: 'Account Age', value: this.getAccountAge(user.stats.accountCreatedAt), inline: true }
      )
      .setFooter({ text: `Last trade: ${user.stats.lastTradeAt ? user.stats.lastTradeAt.toLocaleString() : 'Never'}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async handleConfigCommand(interaction) {
    await interaction.reply({
      content: '⚙️ Configuration dashboard coming soon! For now, visit https://your-dashboard-url.com',
      ephemeral: true
    });
  }

  async handleHelpCommand(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📚 Discord Trade Executor Help')
      .setDescription('Automated trading bot that executes trades from Discord signals')
      .setColor(0x0099ff)
      .addFields(
        {
          name: 'How It Works',
          value:
            '1. Bot monitors channels for trading signals\n2. Parses buy/sell signals automatically\n3. Executes trades on your connected exchange\n4. Sends you confirmation & results',
          inline: false
        },
        {
          name: 'Signal Format',
          value: '```BUY BTCUSDT at 45000\nSL: 43000\nTP: 48000```',
          inline: false
        },
        {
          name: 'Commands',
          value:
            '`/subscribe` - Manage subscription\n`/stats` - View statistics\n`/config` - Configure settings\n`/help` - Show this message',
          inline: false
        },
        {
          name: 'Need Support?',
          value: 'Visit https://your-support-url.com or DM <@YOUR_SUPPORT_USER_ID>',
          inline: false
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  getAccountAge(createdAt) {
    const days = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    const months = Math.floor(days / 30);
    if (months === 1) return '1 month';
    return `${months} months`;
  }

  start() {
    this.client.login(process.env.DISCORD_BOT_TOKEN);
  }
}

module.exports = DiscordTradeBot;
