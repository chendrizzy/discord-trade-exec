const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');

// Configure passport Discord strategy
const discordStrategy = new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'email']
},
async (accessToken, refreshToken, profile, done) => {
    try {
        // Find or create user
        let user = await User.findByDiscordId(profile.id);

        if (!user) {
            // Create new user if doesn't exist
            user = new User({
                discordId: profile.id,
                discordUsername: profile.username,
                discordTag: `${profile.username}#${profile.discriminator}`,
                email: profile.email,
                avatar: profile.avatar,
                subscription: {
                    status: 'trial',
                    tier: 'free',
                    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });
            await user.save();
        } else {
            // Update user info
            user.discordUsername = profile.username;
            user.discordTag = `${profile.username}#${profile.discriminator}`;
            user.email = profile.email;
            user.avatar = profile.avatar;
            await user.save();
        }

        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
});

// Override parseErrorResponse to log raw Discord API response
const originalParseError = discordStrategy.parseErrorResponse;
discordStrategy.parseErrorResponse = function(body, status) {
    console.error('🔍 Raw Discord API Response:');
    console.error('Status Code:', status);
    console.error('Response Body (raw):', body);
    try {
        const parsed = JSON.parse(body);
        console.error('Response Body (parsed):', JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.error('Failed to parse response as JSON');
    }

    // Call original implementation
    return originalParseError.call(this, body, status);
};

passport.use(discordStrategy);

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.discordId);
});

// Deserialize user from session
passport.deserializeUser(async (discordId, done) => {
    try {
        const user = await User.findByDiscordId(discordId);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/discord');
}

// Middleware to ensure user has active subscription
function ensureSubscription(req, res, next) {
    if (req.user && req.user.isSubscriptionActive()) {
        return next();
    }
    res.status(403).json({ error: 'Active subscription required' });
}

module.exports = {
    passport,
    ensureAuthenticated,
    ensureSubscription
};
