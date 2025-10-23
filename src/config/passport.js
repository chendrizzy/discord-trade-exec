// External dependencies
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// Models and types
const User = require('../models/User');
const logger = require('../utils/logger');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Configure Discord OAuth2 Strategy
passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:5000/auth/discord/callback',
      scope: ['identify', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists
        let user = await User.findOne({ discordId: profile.id });

        if (user) {
          // Update user profile
          user.username = profile.username;
          user.discriminator = profile.discriminator;
          user.avatar = profile.avatar;
          user.email = profile.email;
          await user.save();
        } else {
          // Create new user
          user = new User({
            discordId: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar,
            email: profile.email,
            // Initialize with default trading config
            tradingConfig: {
              isEnabled: false,
              exchanges: [],
              riskManagement: {
                maxPositionSize: 0.02,
                positionSizingMethod: 'risk_based',
                defaultStopLoss: 0.02,
                defaultTakeProfit: 0.04,
                useTrailingStop: false,
                trailingStopPercent: 0.015,
                maxDailyLoss: 0.05,
                dailyLossAmount: 0,
                dailyLossResetDate: new Date(),
                maxOpenPositions: 3,
                maxPositionsPerSymbol: 1,
                maxPortfolioRisk: 0.1,
                tradingHoursEnabled: false,
                tradingHoursStart: '09:00',
                tradingHoursEnd: '17:00'
              }
            }
          });
          await user.save();
        }

        return done(null, user);
      } catch (error) {
        logger.error('Discord authentication error:', { error: error.message, stack: error.stack });
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
