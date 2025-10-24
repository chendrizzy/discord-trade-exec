#!/usr/bin/env node
'use strict';

/**
 * Churn Scoring Batch Job
 *
 * Task: T050 [US5] - Implement baseline churn scorer script (batch job)
 * Story: US-005 (Analytics Platform & Business Intelligence)
 *
 * Calculates churn risk scores for active subscriptions and identifies
 * at-risk customers for retention campaigns.
 *
 * Constitutional Requirements:
 * - Principle VI: Observability (structured logging for batch jobs)
 * - Principle VII: Graceful Error Handling (continue on partial failures)
 *
 * Features:
 * - Churn probability scoring (0-100 scale)
 * - Behavioral signals (last login, trade frequency, balance decline)
 * - Engagement scoring (active days, feature usage)
 * - Risk tier classification (LOW/MEDIUM/HIGH/CRITICAL)
 * - Output reports and database updates
 *
 * Usage:
 *   node scripts/analytics/churn_score.js [--dry-run] [--tier=TIER] [--output=FILE]
 *
 * Options:
 *   --dry-run       Don't update database, only calculate scores
 *   --tier=TIER     Only process specific subscription tier (free/basic/pro/premium)
 *   --output=FILE   Export results to JSON file
 *   --verbose       Enable debug logging
 *
 * Examples:
 *   node scripts/analytics/churn_score.js --dry-run
 *   node scripts/analytics/churn_score.js --tier=pro --output=churn_report.json
 *   node scripts/analytics/churn_score.js --verbose
 *
 * Scheduling:
 *   Run daily via cron: 0 2 * * * /usr/bin/node /path/to/churn_score.js
 *   Or use Railway scheduled tasks (Cron Jobs)
 *
 * @module scripts/analytics/churn_score
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment config
require('../../src/config/env');

// Import models
const User = require('../../src/models/User');
const Subscription = require('../../src/models/Subscription');
const Trade = require('../../src/models/Trade');
const AuditLog = require('../../src/models/AuditLog');

// Import analytics service
const AnalyticsService = require('../../src/services/AnalyticsService');

// Import logger
const logger = require('../../src/middleware/logger');

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const tierFilter = args.find(arg => arg.startsWith('--tier='))?.split('=')[1];
const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];

// Churn risk tiers
const RISK_TIERS = {
  LOW: 'LOW', // 0-24 churn score
  MEDIUM: 'MEDIUM', // 25-49
  HIGH: 'HIGH', // 50-74
  CRITICAL: 'CRITICAL' // 75-100
};

// Churn score weights (total = 100)
const SCORE_WEIGHTS = {
  LOGIN_RECENCY: 20, // Days since last login
  TRADE_FREQUENCY: 25, // Trades per week decline
  BALANCE_TREND: 20, // Account balance decline
  ENGAGEMENT: 15, // Feature usage and active days
  SUBSCRIPTION_AGE: 10, // Months since subscription start
  SUPPORT_TICKETS: 10 // Support interaction frequency
};

/**
 * Calculate churn risk score for a user
 *
 * @param {Object} user - User document
 * @param {Object} subscription - Subscription document
 * @param {Object} activityData - User activity metrics
 * @returns {Object} Churn score and breakdown
 */
function calculateChurnScore(user, subscription, activityData) {
  let totalScore = 0;
  const breakdown = {};

  // 1. Login Recency Score (0-20 points)
  // More days since last login = higher churn risk
  const daysSinceLogin = activityData.daysSinceLastLogin || 0;
  const loginScore = Math.min((daysSinceLogin / 30) * SCORE_WEIGHTS.LOGIN_RECENCY, SCORE_WEIGHTS.LOGIN_RECENCY);
  breakdown.loginRecency = Math.round(loginScore);
  totalScore += loginScore;

  // 2. Trade Frequency Score (0-25 points)
  // Declining trades per week = higher churn risk
  const avgTradesPerWeek = activityData.avgTradesPerWeek || 0;
  const prevAvgTradesPerWeek = activityData.prevAvgTradesPerWeek || 0;
  const tradeDecline = prevAvgTradesPerWeek > 0 ? (prevAvgTradesPerWeek - avgTradesPerWeek) / prevAvgTradesPerWeek : 0;
  const tradeScore = Math.max(0, tradeDecline * SCORE_WEIGHTS.TRADE_FREQUENCY);
  breakdown.tradeFrequency = Math.round(tradeScore);
  totalScore += tradeScore;

  // 3. Balance Trend Score (0-20 points)
  // Declining balance = higher churn risk
  const balanceDecline = activityData.balanceDeclinePercent || 0;
  const balanceScore = Math.min(balanceDecline * SCORE_WEIGHTS.BALANCE_TREND, SCORE_WEIGHTS.BALANCE_TREND);
  breakdown.balanceTrend = Math.round(balanceScore);
  totalScore += balanceScore;

  // 4. Engagement Score (0-15 points)
  // Low active days = higher churn risk
  const activeDaysPercent = activityData.activeDaysPercent || 100;
  const engagementScore = (1 - activeDaysPercent / 100) * SCORE_WEIGHTS.ENGAGEMENT;
  breakdown.engagement = Math.round(engagementScore);
  totalScore += engagementScore;

  // 5. Subscription Age Score (0-10 points)
  // New subscriptions (< 3 months) have higher churn risk
  const subscriptionAgeDays = Math.floor((new Date() - subscription.currentPeriodStart) / (1000 * 60 * 60 * 24));
  const subscriptionAgeMonths = subscriptionAgeDays / 30;
  const ageScore = subscriptionAgeMonths < 3 ? (3 - subscriptionAgeMonths) / 3 * SCORE_WEIGHTS.SUBSCRIPTION_AGE : 0;
  breakdown.subscriptionAge = Math.round(ageScore);
  totalScore += ageScore;

  // 6. Support Tickets Score (0-10 points)
  // More support tickets = potential dissatisfaction
  const supportTicketCount = activityData.supportTicketCount || 0;
  const supportScore = Math.min((supportTicketCount / 5) * SCORE_WEIGHTS.SUPPORT_TICKETS, SCORE_WEIGHTS.SUPPORT_TICKETS);
  breakdown.supportTickets = Math.round(supportScore);
  totalScore += supportScore;

  // Cap at 100
  totalScore = Math.min(Math.round(totalScore), 100);

  // Determine risk tier
  let riskTier = RISK_TIERS.LOW;
  if (totalScore >= 75) {
    riskTier = RISK_TIERS.CRITICAL;
  } else if (totalScore >= 50) {
    riskTier = RISK_TIERS.HIGH;
  } else if (totalScore >= 25) {
    riskTier = RISK_TIERS.MEDIUM;
  }

  return {
    score: totalScore,
    tier: riskTier,
    breakdown,
    calculatedAt: new Date()
  };
}

/**
 * Gather user activity data for churn scoring
 *
 * @param {string} userId - User ID
 * @returns {Object} Activity metrics
 */
async function getUserActivityData(userId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  // Get user document
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }

  // Days since last login
  const daysSinceLastLogin = user.lastLoginAt ? Math.floor((now - user.lastLoginAt) / (1000 * 60 * 60 * 24)) : 999;

  // Trade frequency (last 30 days vs previous 30 days)
  const recentTrades = await Trade.countDocuments({
    userId,
    createdAt: { $gte: thirtyDaysAgo }
  });

  const previousTrades = await Trade.countDocuments({
    userId,
    createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
  });

  const avgTradesPerWeek = (recentTrades / 30) * 7;
  const prevAvgTradesPerWeek = (previousTrades / 30) * 7;

  // Balance trend (from broker accounts)
  let balanceDeclinePercent = 0;
  if (user.brokerAccounts && user.brokerAccounts.length > 0) {
    const currentBalance = user.brokerAccounts.reduce((sum, account) => sum + (account.equity || 0), 0);
    const previousBalance = currentBalance * 1.1; // Placeholder: should fetch historical balance
    balanceDeclinePercent = previousBalance > 0 ? ((previousBalance - currentBalance) / previousBalance) * 100 : 0;
  }

  // Active days (days with at least 1 login in last 30 days)
  // Placeholder: should query AuditLog for login events
  const activeDaysPercent = Math.max(0, 100 - daysSinceLastLogin * 3); // Simplified

  // Support tickets (placeholder)
  const supportTicketCount = 0; // TODO: Implement support ticket model and query

  return {
    daysSinceLastLogin,
    avgTradesPerWeek,
    prevAvgTradesPerWeek,
    balanceDeclinePercent,
    activeDaysPercent,
    supportTicketCount
  };
}

/**
 * Process churn scoring for all active subscriptions
 *
 * @returns {Object} Results summary
 */
async function processChurnScoring() {
  logger.info('Starting churn scoring batch job', {
    dryRun,
    tierFilter,
    outputFile
  });

  const startTime = Date.now();
  const results = {
    total: 0,
    processed: 0,
    failed: 0,
    byTier: {
      [RISK_TIERS.LOW]: 0,
      [RISK_TIERS.MEDIUM]: 0,
      [RISK_TIERS.HIGH]: 0,
      [RISK_TIERS.CRITICAL]: 0
    },
    errors: [],
    scores: []
  };

  // Query active subscriptions
  const query = {
    status: 'active'
  };

  if (tierFilter) {
    query.plan = tierFilter;
  }

  const subscriptions = await Subscription.find(query).populate('userId');
  results.total = subscriptions.length;

  logger.info(`Found ${results.total} active subscriptions to process`);

  // Process each subscription
  for (const subscription of subscriptions) {
    try {
      const user = subscription.userId;

      if (!user) {
        logger.warn('Subscription missing user', { subscriptionId: subscription._id });
        results.failed++;
        continue;
      }

      // Gather activity data
      const activityData = await getUserActivityData(user._id);

      if (!activityData) {
        logger.warn('Could not gather activity data', { userId: user._id });
        results.failed++;
        continue;
      }

      // Calculate churn score
      const churnResult = calculateChurnScore(user, subscription, activityData);

      // Update results
      results.processed++;
      results.byTier[churnResult.tier]++;

      // Store score
      results.scores.push({
        userId: user._id.toString(),
        email: user.email,
        plan: subscription.plan,
        score: churnResult.score,
        tier: churnResult.tier,
        breakdown: churnResult.breakdown,
        calculatedAt: churnResult.calculatedAt
      });

      // Update database (unless dry-run)
      if (!dryRun) {
        await User.findByIdAndUpdate(user._id, {
          'analytics.churnScore': churnResult.score,
          'analytics.churnTier': churnResult.tier,
          'analytics.churnCalculatedAt': churnResult.calculatedAt
        });
      }

      if (verbose) {
        logger.debug('Processed user', {
          userId: user._id,
          score: churnResult.score,
          tier: churnResult.tier
        });
      }
    } catch (error) {
      logger.error('Error processing subscription', {
        subscriptionId: subscription._id,
        error: error.message
      });
      results.failed++;
      results.errors.push({
        subscriptionId: subscription._id,
        error: error.message
      });
    }
  }

  // Calculate duration
  const durationMs = Date.now() - startTime;
  const durationSeconds = Math.round(durationMs / 1000);

  logger.info('Churn scoring batch job completed', {
    total: results.total,
    processed: results.processed,
    failed: results.failed,
    byTier: results.byTier,
    durationSeconds,
    dryRun
  });

  // Export to file if requested
  if (outputFile) {
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    logger.info('Results exported to file', { outputPath });
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Run churn scoring
    const results = await processChurnScoring();

    // Print summary
    console.log('\n=== Churn Scoring Summary ===');
    console.log(`Total Subscriptions: ${results.total}`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Failed: ${results.failed}`);
    console.log('\nRisk Distribution:');
    console.log(`  LOW (0-24):      ${results.byTier.LOW}`);
    console.log(`  MEDIUM (25-49):  ${results.byTier.MEDIUM}`);
    console.log(`  HIGH (50-74):    ${results.byTier.HIGH}`);
    console.log(`  CRITICAL (75-100): ${results.byTier.CRITICAL}`);
    console.log('\n' + (dryRun ? '(DRY RUN - No database updates)' : '(Database updated)'));

    // Disconnect
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error('Fatal error in churn scoring batch job', {
      error: error.message,
      stack: error.stack
    });
    console.error('FATAL ERROR:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  calculateChurnScore,
  getUserActivityData,
  processChurnScoring,
  RISK_TIERS,
  SCORE_WEIGHTS
};
