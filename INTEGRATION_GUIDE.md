# Integration Guide - Dual Dashboard System

This guide provides detailed instructions for completing the integration scaffolding implemented in Phases 2-3 of the dual dashboard system.

## Overview

The dual dashboard system has been scaffolded with complete UI components, API endpoints, and service stubs. The following integrations need to be completed:

1. **Stripe** - Payment processing and subscription management
2. **Discord API** - Channel validation, webhook testing, bot status
3. **Redis** - Analytics caching and performance optimization
4. **Database Queries** - Replace mock data with actual queries

---

## Table of Contents

- [Stripe Integration](#stripe-integration)
- [Discord API Integration](#discord-api-integration)
- [Redis Integration](#redis-integration)
- [Database Implementation](#database-implementation)
- [Testing](#testing)
- [Deployment Checklist](#deployment-checklist)

---

## Stripe Integration

### Setup

1. **Install Stripe SDK**
   ```bash
   npm install stripe
   ```

2. **Environment Configuration**
   ```bash
   # Add to .env file
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. **Initialize Stripe Client**

   Update `src/services/stripe.js`:
   ```javascript
   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
   ```

### Implementation Tasks

#### 1. Get Community Subscription (`getCommunitySubscription`)

**File**: `src/services/stripe.js:17`

Replace mock data with:
```javascript
const getCommunitySubscription = async (customerId) => {
  const subscription = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1
  });

  if (!subscription.data.length) {
    throw new Error('No active subscription found');
  }

  const sub = subscription.data[0];
  const product = await stripe.products.retrieve(sub.items.data[0].price.product);

  return {
    id: sub.id,
    customerId,
    status: sub.status,
    tier: product.metadata.tier || 'professional',
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    limits: JSON.parse(product.metadata.limits || '{}'),
    usage: await getUsageMetrics(customerId), // Implement this function
    pricing: {
      amount: sub.items.data[0].price.unit_amount,
      currency: sub.items.data[0].price.currency,
      interval: sub.items.data[0].price.recurring.interval
    }
  };
};
```

#### 2. Get User Subscription (`getUserSubscription`)

**File**: `src/services/stripe.js:55`

Similar implementation to community subscription but with user-specific limits.

#### 3. Create Customer Portal Session (`createCustomerPortalSession`)

**File**: `src/services/stripe.js:94`

Replace mock data with:
```javascript
const createCustomerPortalSession = async (customerId, returnUrl) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });

  return {
    id: session.id,
    url: session.url
  };
};
```

#### 4. Create Checkout Session (`createCheckoutSession`)

**File**: `src/services/stripe.js:114`

Replace mock data with:
```javascript
const createCheckoutSession = async (customerId, priceId, successUrl, cancelUrl) => {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true
  });

  return {
    id: session.id,
    url: session.url
  };
};
```

#### 5. Handle Webhooks (`handleWebhook`)

**File**: `src/services/stripe.js:138`

Implement full webhook handling:
```javascript
const handleWebhook = async (event) => {
  console.log('[Stripe Webhook] Processing event:', event.type);

  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    default:
      console.log('[Stripe Webhook] Unhandled event type:', event.type);
  }
};

// Implement handler functions for each event type
```

### API Endpoint Updates

Update these endpoints to use real Stripe data:
- `/api/community/subscription` (`src/routes/api/community.js:271`)
- `/api/trader/subscription` (`src/routes/api/trader.js:290`)

---

## Discord API Integration

### Setup

1. **Install Discord.js**
   ```bash
   npm install discord.js
   ```

2. **Environment Configuration**
   ```bash
   # Add to .env file
   DISCORD_BOT_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   ```

3. **Initialize Discord Client**

   Update `src/services/discord.js`:
   ```javascript
   const { Client, GatewayIntentBits } = require('discord.js');

   const client = new Client({
     intents: [
       GatewayIntentBits.Guilds,
       GatewayIntentBits.GuildMessages
     ]
   });

   client.login(process.env.DISCORD_BOT_TOKEN);
   ```

### Implementation Tasks

#### 1. Validate Channel (`validateChannel`)

**File**: `src/services/discord.js:18`

Replace mock validation with:
```javascript
const validateChannel = async (channelId) => {
  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      return {
        valid: false,
        error: 'Channel not found'
      };
    }

    const permissions = channel.permissionsFor(client.user);

    return {
      valid: true,
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        guildId: channel.guild.id
      },
      permissions: {
        canSendMessages: permissions.has('SendMessages'),
        canViewChannel: permissions.has('ViewChannel'),
        canEmbedLinks: permissions.has('EmbedLinks'),
        canAttachFiles: permissions.has('AttachFiles')
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};
```

#### 2. Get Bot Status (`getBotStatus`)

**File**: `src/services/discord.js:48`

Replace mock status with:
```javascript
const getBotStatus = async (guildId) => {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(client.user.id);
    const permissions = member.permissions;

    const requiredPermissions = [
      'ManageChannels',
      'ManageWebhooks',
      'SendMessages',
      'EmbedLinks',
      'AttachFiles'
    ];

    const missingPermissions = requiredPermissions.filter(
      perm => !permissions.has(perm)
    );

    return {
      online: true,
      guildId,
      permissions: {
        administrator: permissions.has('Administrator'),
        manageChannels: permissions.has('ManageChannels'),
        manageWebhooks: permissions.has('ManageWebhooks'),
        sendMessages: permissions.has('SendMessages'),
        embedLinks: permissions.has('EmbedLinks'),
        attachFiles: permissions.has('AttachFiles')
      },
      missingPermissions,
      lastSeen: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to get bot status: ${error.message}`);
  }
};
```

#### 3. Send Test Notification (`sendTestNotification`)

**File**: `src/services/discord.js:79`

Replace mock send with:
```javascript
const sendTestNotification = async (channelId, message) => {
  try {
    const channel = await client.channels.fetch(channelId);

    const embed = {
      title: '🧪 Test Notification',
      description: message.content || 'This is a test notification from your trading bot.',
      color: 0x00ff00,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Trade Executor Bot'
      }
    };

    const sentMessage = await channel.send({ embeds: [embed] });

    return {
      success: true,
      messageId: sentMessage.id,
      channelId: sentMessage.channel.id,
      timestamp: sentMessage.createdAt.toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to send test notification: ${error.message}`);
  }
};
```

#### 4. Create Webhook (`createWebhook`)

**File**: `src/services/discord.js:103`

Replace mock webhook creation with:
```javascript
const createWebhook = async (channelId, name) => {
  try {
    const channel = await client.channels.fetch(channelId);

    const webhook = await channel.createWebhook({
      name,
      avatar: client.user.displayAvatarURL()
    });

    return {
      id: webhook.id,
      token: webhook.token,
      channelId: webhook.channelId,
      name: webhook.name,
      url: webhook.url
    };
  } catch (error) {
    throw new Error(`Failed to create webhook: ${error.message}`);
  }
};
```

### API Endpoint Updates

Update these endpoints to use real Discord data:
- `/api/community/signals/:id` PUT (channel validation) (`src/routes/api/community.js:215`)

---

## Redis Integration

### Setup

1. **Install Redis Client**
   ```bash
   npm install redis
   ```

2. **Environment Configuration**
   ```bash
   # Add to .env file
   REDIS_URL=redis://localhost:6379
   REDIS_PASSWORD=your_password (optional)
   ```

3. **Initialize Redis Client**

   Update `src/services/redis.js`:
   ```javascript
   const redis = require('redis');

   const client = redis.createClient({
     url: process.env.REDIS_URL,
     password: process.env.REDIS_PASSWORD
   });

   client.on('error', (err) => console.error('Redis Client Error', err));

   client.connect();
   ```

### Implementation Tasks

#### Replace In-Memory Cache with Redis

**File**: `src/services/redis.js`

Update each function to use the Redis client instead of `memoryCache`:

```javascript
const get = async (key) => {
  try {
    const value = await client.get(key);
    if (!value) return null;

    console.log(`[Cache] HIT: ${key}`);
    return JSON.parse(value);
  } catch (error) {
    console.error('[Cache] Error getting key:', error);
    return null;
  }
};

const set = async (key, value, ttlSeconds = 300) => {
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
    console.log(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.error('[Cache] Error setting key:', error);
  }
};

const del = async (key) => {
  try {
    await client.del(key);
    console.log(`[Cache] DEL: ${key}`);
  } catch (error) {
    console.error('[Cache] Error deleting key:', error);
  }
};

const delPattern = async (pattern) => {
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    console.log(`[Cache] DEL PATTERN: ${pattern} (${keys.length} keys)`);
  } catch (error) {
    console.error('[Cache] Error deleting pattern:', error);
  }
};
```

### API Endpoint Updates

These endpoints use Redis caching and need to be tested:
- `/api/community/analytics/performance` (`src/routes/api/community.js:240`)
- `/api/trader/analytics/performance` (`src/routes/api/trader.js:187`)

---

## Database Implementation

### Community API Endpoints

**File**: `src/routes/api/community.js`

#### 1. Community Overview (`/api/community/overview`)

**Lines**: 32-110

Replace mock data with actual database queries:

```javascript
const User = require('../../models/User');
const Trade = require('../../models/Trade');
const SignalProvider = require('../../models/SignalProvider');

router.get('/overview', async (req, res) => {
  try {
    const user = req.user;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Member counts
    const memberCount = await User.countDocuments({ tenantId: user.tenantId });
    const activeToday = await User.countDocuments({
      tenantId: user.tenantId,
      lastActive: { $gte: todayStart }
    });
    const activeThisWeek = await User.countDocuments({
      tenantId: user.tenantId,
      lastActive: { $gte: weekStart }
    });
    const newThisMonth = await User.countDocuments({
      tenantId: user.tenantId,
      createdAt: { $gte: monthStart }
    });

    // Signal counts (implement based on your Signal model)
    // const signalCounts = await Signal.aggregate([...]);

    // Performance metrics
    const trades = await Trade.find({ tenantId: user.tenantId });
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const successfulTrades = trades.filter(t => (t.pnl || 0) > 0).length;

    // Top providers
    const topProviders = await SignalProvider.find({
      tenantId: user.tenantId
    })
      .sort({ winRate: -1 })
      .limit(3);

    const overview = {
      members: {
        total: memberCount,
        activeToday,
        activeThisWeek,
        newThisMonth,
        growth: {
          // Calculate growth percentages
        }
      },
      signals: {
        // Implement signal statistics
      },
      performance: {
        totalPnL,
        avgPnLPerMember: totalPnL / memberCount,
        winRate: (successfulTrades / trades.length) * 100,
        totalTrades: trades.length,
        successfulTrades
      },
      // ... rest of overview object
    };

    res.json(overview);
  } catch (error) {
    console.error('[Community API] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch community overview' });
  }
});
```

#### 2. Member List (`/api/community/members`)

**Lines**: 119-167

Replace mock members with actual query:

```javascript
router.get('/members', async (req, res) => {
  try {
    const { page = 1, limit = 25, search, role } = req.query;
    const skip = (page - 1) * limit;

    const query = { tenantId: req.user.tenantId };

    if (search) {
      query.$or = [
        { username: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { discordId: search }
      ];
    }

    if (role) {
      query.communityRole = role;
    }

    const members = await User.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .select('username email communityRole accountStatus createdAt lastActive');

    const total = await User.countDocuments(query);

    // Get trade stats for each member
    const membersWithStats = await Promise.all(
      members.map(async (member) => {
        const trades = await Trade.find({ userId: member._id });
        const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const winRate = trades.length > 0
          ? (trades.filter(t => (t.pnl || 0) > 0).length / trades.length) * 100
          : 0;

        return {
          id: member._id,
          username: member.username,
          email: member.email,
          communityRole: member.communityRole,
          accountStatus: member.accountStatus,
          joinedAt: member.createdAt,
          lastActive: member.lastActive,
          stats: {
            totalTrades: trades.length,
            winRate,
            totalPnL
          }
        };
      })
    );

    res.json({
      members: membersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Community API] Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});
```

#### 3. Update Member Role (`/api/community/members/:id/role`)

**Lines**: 176-214

Implement actual database update and audit logging:

```javascript
const SecurityAudit = require('../../models/SecurityAudit'); // Create this model

router.post('/members/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['admin', 'trader', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const user = await User.findOne({
      _id: id,
      tenantId: req.user.tenantId
    });

    if (!user) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const oldRole = user.communityRole;
    user.communityRole = role;
    await user.save();

    // Create security audit log
    await SecurityAudit.create({
      tenantId: req.user.tenantId,
      userId: req.user._id,
      action: 'role_change',
      targetUserId: id,
      details: {
        oldRole,
        newRole: role,
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Member role updated successfully',
      member: {
        id,
        role
      }
    });
  } catch (error) {
    console.error('[Community API] Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});
```

### Trader API Endpoints

**File**: `src/routes/api/trader.js`

Similar implementation patterns apply to trader endpoints:

#### 1. Trader Overview (`/api/trader/overview`)

**Lines**: 27-118

Replace mock data with:
```javascript
const trades = await Trade.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);
const positions = await Position.countDocuments({ userId: user._id, status: 'open' });
const signalSubscriptions = await UserSignalSubscription.find({ userId: user._id }).populate('providerId');
```

#### 2. Signal Providers (`/api/trader/signals`)

**Lines**: 127-190

Query signal providers with user's follow status:
```javascript
const providers = await SignalProvider.find({
  tenantId: user.tenantId,
  enabled: true
});

const userSubscriptions = await UserSignalSubscription.find({ userId: user._id });
const followedProviderIds = userSubscriptions.map(s => s.providerId.toString());

const providersWithFollowStatus = providers.map(p => ({
  ...p.toObject(),
  following: followedProviderIds.includes(p._id.toString())
}));
```

#### 3. Follow/Unfollow Provider (`/api/trader/signals/:id/follow`)

**Lines**: 199-230

Implement actual follow/unfollow:
```javascript
const { id } = req.params;
const { following } = req.body;

if (following) {
  await UserSignalSubscription.create({
    userId: user._id,
    providerId: id,
    tenantId: user.tenantId
  });
} else {
  await UserSignalSubscription.deleteOne({
    userId: user._id,
    providerId: id
  });
}
```

---

## Testing

### Unit Tests

Create test files for each service:

1. **Stripe Service Tests**
   ```bash
   # Create test file
   touch tests/unit/services/stripe.test.js
   ```

   Test coverage:
   - getCommunitySubscription
   - getUserSubscription
   - createCustomerPortalSession
   - createCheckoutSession
   - handleWebhook (each event type)

2. **Discord Service Tests**
   ```bash
   touch tests/unit/services/discord.test.js
   ```

   Test coverage:
   - validateChannel (valid, invalid, no permissions)
   - getBotStatus (online, offline, missing permissions)
   - sendTestNotification (success, failure)
   - createWebhook (success, failure)

3. **Redis Service Tests**
   ```bash
   touch tests/unit/services/redis.test.js
   ```

   Test coverage:
   - get (hit, miss, expired)
   - set (with TTL)
   - del (single key)
   - delPattern (multiple keys)
   - getOrCompute (cached, uncached)

### Integration Tests

Create integration tests for API endpoints:

```bash
# Create test files
touch tests/integration/api/community.test.js
touch tests/integration/api/trader.test.js
```

Test scenarios:
- Authentication/authorization (admin-only, trader-only)
- Data retrieval (valid responses, pagination)
- Data mutation (role changes, subscriptions)
- Error handling (404, 403, 500)

### End-to-End Tests

Using a tool like Cypress or Playwright:

```bash
# Create E2E test files
touch tests/e2e/community-dashboard.spec.js
touch tests/e2e/trader-dashboard.spec.js
```

Test flows:
- Community host navigates dashboard tabs
- Trader follows/unfollows signal providers
- Admin updates member roles
- User upgrades subscription tier

---

## Deployment Checklist

### Environment Variables

Ensure all required environment variables are set:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...

# Redis
REDIS_URL=redis://...
REDIS_PASSWORD=... (if required)

# Database
MONGODB_URI=mongodb://...
```

### Pre-Deployment

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests pass on staging
- [ ] Stripe webhooks are configured
- [ ] Discord bot has required permissions
- [ ] Redis is running and accessible
- [ ] Database indexes are optimized
- [ ] Rate limiting is configured
- [ ] Error monitoring is set up (Sentry, etc.)
- [ ] Logging is configured
- [ ] Performance monitoring is enabled

### Post-Deployment

- [ ] Verify Stripe webhooks are receiving events
- [ ] Check Discord bot status in production
- [ ] Monitor Redis cache hit rates
- [ ] Review API response times
- [ ] Check error logs
- [ ] Verify user authentication flows
- [ ] Test subscription upgrades/downgrades
- [ ] Confirm notification deliveries

---

## Support

For questions or issues:
1. Review this integration guide
2. Check TODO comments in source files
3. Review API documentation in `openspec/changes/implement-dual-dashboard-system/design.md`
4. Create an issue in the project repository

---

**Last Updated**: October 2024
**Version**: Phase 2-3 Scaffolding Release
