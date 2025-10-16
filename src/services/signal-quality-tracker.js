/**
 * Signal Quality Tracker Service
 *
 * Analyzes trading signals for quality indicators including:
 * - Smart money detection (unusual timing, high conviction, pattern matching)
 * - Rare information likelihood
 * - Provider performance tracking
 * - 3-tier quality classification (ELITE, VERIFIED, STANDARD)
 *
 * Based on prediction market insider trading detection concepts
 */

// Models and types
const Trade = require('../models/Trade');

/**
 * Quality tier definitions
 */
const QUALITY_TIERS = {
  ELITE: {
    name: 'ELITE',
    symbol: '💎',
    minConfidence: 85,
    minAccuracy: 80,
    minWinRate: 75,
    description: 'Exceptional signal quality with strong smart money indicators'
  },
  VERIFIED: {
    name: 'VERIFIED',
    symbol: '✓',
    minConfidence: 70,
    minAccuracy: 65,
    minWinRate: 60,
    description: 'High-quality signals with proven track record'
  },
  STANDARD: {
    name: 'STANDARD',
    symbol: '○',
    minConfidence: 0,
    minAccuracy: 0,
    minWinRate: 0,
    description: 'Standard signals awaiting quality verification'
  }
};

/**
 * Smart money indicator thresholds
 */
const SMART_MONEY_INDICATORS = {
  UNUSUAL_TIMING: {
    name: 'Unusual Timing',
    weight: 0.25,
    thresholds: {
      afterHours: 30, // Points for after-hours signals
      preMarket: 25, // Points for pre-market signals
      newsRelease: 40, // Points for signals near news releases
      earningsWindow: 35 // Points for signals near earnings
    }
  },
  HIGH_CONVICTION: {
    name: 'High Conviction',
    weight: 0.3,
    thresholds: {
      largePosition: 35, // Points for position size > 10% of typical
      leverage: 30, // Points for leveraged positions
      concentration: 25 // Points for concentrated bets
    }
  },
  PATTERN_MATCHING: {
    name: 'Pattern Matching',
    weight: 0.25,
    thresholds: {
      historicalSuccess: 30, // Points for matching successful patterns
      consistency: 25, // Points for consistent signal patterns
      uniquePattern: 20 // Points for rare/unique patterns
    }
  },
  INSIDER_LIKELIHOOD: {
    name: 'Insider Likelihood',
    weight: 0.2,
    thresholds: {
      corporateAction: 40, // Points for signals before corporate actions
      regulatoryFiling: 35, // Points for signals before filings
      marketMoving: 30, // Points for signals before major moves
      industryEvent: 25 // Points for signals before industry events
    }
  }
};

/**
 * Calculate smart money score for a signal
 * @param {Object} signal - Signal data
 * @param {Object} context - Additional context (timing, market conditions, etc.)
 * @returns {Object} Smart money analysis
 */
function calculateSmartMoneyScore(signal, context = {}) {
  const scores = {
    unusualTiming: 0,
    highConviction: 0,
    patternMatching: 0,
    insiderLikelihood: 0
  };

  // 1. Unusual Timing Analysis
  const signalTime = new Date(signal.timestamp || signal.createdAt);
  const hour = signalTime.getUTCHours();

  if (hour < 9 || hour >= 16) {
    scores.unusualTiming += SMART_MONEY_INDICATORS.UNUSUAL_TIMING.thresholds.afterHours;
  }
  if (hour >= 4 && hour < 9) {
    scores.unusualTiming += SMART_MONEY_INDICATORS.UNUSUAL_TIMING.thresholds.preMarket;
  }
  if (context.nearNewsRelease) {
    scores.unusualTiming += SMART_MONEY_INDICATORS.UNUSUAL_TIMING.thresholds.newsRelease;
  }
  if (context.nearEarnings) {
    scores.unusualTiming += SMART_MONEY_INDICATORS.UNUSUAL_TIMING.thresholds.earningsWindow;
  }

  // 2. High Conviction Analysis
  const positionSize = signal.quantity * (signal.entryPrice || signal.price || 0);
  const typicalSize = context.typicalPositionSize || 10000;

  if (positionSize > typicalSize * 1.5) {
    scores.highConviction += SMART_MONEY_INDICATORS.HIGH_CONVICTION.thresholds.largePosition;
  }
  if (signal.leverage && signal.leverage > 1) {
    scores.highConviction += SMART_MONEY_INDICATORS.HIGH_CONVICTION.thresholds.leverage;
  }
  if (context.isConcentratedBet) {
    scores.highConviction += SMART_MONEY_INDICATORS.HIGH_CONVICTION.thresholds.concentration;
  }

  // 3. Pattern Matching Analysis
  if (context.matchesHistoricalSuccess) {
    scores.patternMatching += SMART_MONEY_INDICATORS.PATTERN_MATCHING.thresholds.historicalSuccess;
  }
  if (context.consistentPattern) {
    scores.patternMatching += SMART_MONEY_INDICATORS.PATTERN_MATCHING.thresholds.consistency;
  }
  if (context.uniquePattern) {
    scores.patternMatching += SMART_MONEY_INDICATORS.PATTERN_MATCHING.thresholds.uniquePattern;
  }

  // 4. Insider Likelihood Analysis
  if (context.beforeCorporateAction) {
    scores.insiderLikelihood += SMART_MONEY_INDICATORS.INSIDER_LIKELIHOOD.thresholds.corporateAction;
  }
  if (context.beforeRegulatoryFiling) {
    scores.insiderLikelihood += SMART_MONEY_INDICATORS.INSIDER_LIKELIHOOD.thresholds.regulatoryFiling;
  }
  if (context.beforeMarketMovingEvent) {
    scores.insiderLikelihood += SMART_MONEY_INDICATORS.INSIDER_LIKELIHOOD.thresholds.marketMoving;
  }
  if (context.beforeIndustryEvent) {
    scores.insiderLikelihood += SMART_MONEY_INDICATORS.INSIDER_LIKELIHOOD.thresholds.industryEvent;
  }

  // Calculate weighted total
  const weightedTotal =
    scores.unusualTiming * SMART_MONEY_INDICATORS.UNUSUAL_TIMING.weight +
    scores.highConviction * SMART_MONEY_INDICATORS.HIGH_CONVICTION.weight +
    scores.patternMatching * SMART_MONEY_INDICATORS.PATTERN_MATCHING.weight +
    scores.insiderLikelihood * SMART_MONEY_INDICATORS.INSIDER_LIKELIHOOD.weight;

  return {
    total: Math.min(100, Math.round(weightedTotal)),
    breakdown: scores,
    indicators: {
      unusualTiming: scores.unusualTiming > 20,
      highConviction: scores.highConviction > 25,
      patternMatching: scores.patternMatching > 20,
      insiderLikelihood: scores.insiderLikelihood > 25
    }
  };
}

/**
 * Calculate rare information likelihood
 * @param {Object} signal - Signal data
 * @param {Object} smartMoneyScore - Smart money analysis
 * @returns {Object} Rare information analysis
 */
function calculateRareInformationLikelihood(signal, smartMoneyScore) {
  let likelihood = 0;
  const factors = [];

  // Factor 1: High smart money score (30 points max)
  if (smartMoneyScore.total > 70) {
    likelihood += 30;
    factors.push('Very high smart money indicators');
  } else if (smartMoneyScore.total > 50) {
    likelihood += 20;
    factors.push('High smart money indicators');
  } else if (smartMoneyScore.total > 30) {
    likelihood += 10;
    factors.push('Moderate smart money indicators');
  }

  // Factor 2: Unusual timing (20 points max)
  if (smartMoneyScore.indicators.unusualTiming) {
    likelihood += 20;
    factors.push('Unusual market timing');
  }

  // Factor 3: High conviction (25 points max)
  if (smartMoneyScore.indicators.highConviction) {
    likelihood += 25;
    factors.push('High conviction position');
  }

  // Factor 4: Insider likelihood (25 points max)
  if (smartMoneyScore.indicators.insiderLikelihood) {
    likelihood += 25;
    factors.push('Potential insider information');
  }

  return {
    score: Math.min(100, likelihood),
    level: likelihood > 70 ? 'HIGH' : likelihood > 40 ? 'MODERATE' : 'LOW',
    factors
  };
}

/**
 * Get provider performance statistics
 * @param {String} providerId - Provider/user ID
 * @returns {Object} Provider statistics
 */
async function getProviderStats(providerId) {
  try {
    const trades = await Trade.find({ userId: providerId }).sort({ entryTime: -1 });

    if (trades.length === 0) {
      return {
        totalSignals: 0,
        winRate: 0,
        accuracy: 0,
        avgReturn: 0,
        totalReturn: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        bestTrade: null,
        worstTrade: null,
        recentPerformance: []
      };
    }

    // Calculate statistics
    const completedTrades = trades.filter(t => t.status === 'FILLED' || t.status === 'CLOSED');
    const winningTrades = completedTrades.filter(t => (t.profitLoss || 0) > 0);
    const losingTrades = completedTrades.filter(t => (t.profitLoss || 0) < 0);

    const totalReturn = completedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const avgReturn = completedTrades.length > 0 ? totalReturn / completedTrades.length : 0;
    const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;

    // Calculate accuracy (predicted direction vs actual)
    const accurateTrades = completedTrades.filter(t => {
      if (!t.predictedDirection || !t.profitLoss) return false;
      return (
        (t.predictedDirection === 'up' && t.profitLoss > 0) || (t.predictedDirection === 'down' && t.profitLoss < 0)
      );
    });
    const accuracy = completedTrades.length > 0 ? (accurateTrades.length / completedTrades.length) * 100 : 0;

    // Calculate consecutive streaks
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let isWinStreak = null;

    for (const trade of completedTrades) {
      const isWin = (trade.profitLoss || 0) > 0;

      if (isWinStreak === null) {
        isWinStreak = isWin;
        currentStreak = 1;
      } else if (isWinStreak === isWin) {
        currentStreak++;
      } else {
        if (isWinStreak) {
          maxWinStreak = Math.max(maxWinStreak, currentStreak);
        } else {
          maxLossStreak = Math.max(maxLossStreak, currentStreak);
        }
        isWinStreak = isWin;
        currentStreak = 1;
      }
    }

    // Final streak update
    if (isWinStreak) {
      maxWinStreak = Math.max(maxWinStreak, currentStreak);
    } else {
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    }

    // Find best and worst trades
    const bestTrade = completedTrades.reduce(
      (best, t) => (!best || (t.profitLoss || 0) > (best.profitLoss || 0) ? t : best),
      null
    );
    const worstTrade = completedTrades.reduce(
      (worst, t) => (!worst || (t.profitLoss || 0) < (worst.profitLoss || 0) ? t : worst),
      null
    );

    // Recent performance (last 10 trades)
    const recentPerformance = completedTrades.slice(0, 10).map(t => ({
      symbol: t.symbol,
      side: t.side,
      profitLoss: t.profitLoss,
      returnPercent: t.profitLossPercentage,
      entryTime: t.entryTime
    }));

    return {
      totalSignals: trades.length,
      completedSignals: completedTrades.length,
      winRate: Math.round(winRate * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      avgReturn: Math.round(avgReturn * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      bestTrade: bestTrade
        ? {
            symbol: bestTrade.symbol,
            profitLoss: bestTrade.profitLoss,
            returnPercent: bestTrade.profitLossPercentage
          }
        : null,
      worstTrade: worstTrade
        ? {
            symbol: worstTrade.symbol,
            profitLoss: worstTrade.profitLoss,
            returnPercent: worstTrade.profitLossPercentage
          }
        : null,
      recentPerformance
    };
  } catch (error) {
    console.error('Error calculating provider stats:', error);
    throw error;
  }
}

/**
 * Calculate confidence score for a signal
 * @param {Object} providerStats - Provider performance statistics
 * @param {Object} smartMoneyScore - Smart money analysis
 * @param {Object} context - Additional context
 * @returns {Number} Confidence score (0-100)
 */
function calculateConfidenceScore(providerStats, smartMoneyScore, context = {}) {
  // Weighted scoring:
  // - Provider accuracy: 50%
  // - Smart money indicators: 30%
  // - Signal timing: 20%

  const providerScore = providerStats.accuracy || 0;
  const smartMoneyScoreValue = smartMoneyScore.total || 0;

  // Timing score based on market conditions
  let timingScore = 50; // Baseline
  if (context.optimalTiming) timingScore += 30;
  if (context.volatileMarket) timingScore -= 20;
  if (context.lowLiquidity) timingScore -= 15;
  timingScore = Math.max(0, Math.min(100, timingScore));

  const confidenceScore = providerScore * 0.5 + smartMoneyScoreValue * 0.3 + timingScore * 0.2;

  return Math.round(Math.min(100, Math.max(0, confidenceScore)));
}

/**
 * Determine quality tier based on metrics
 * @param {Object} metrics - Quality metrics
 * @returns {Object} Quality tier information
 */
function determineQualityTier(metrics) {
  const { confidence, providerAccuracy, providerWinRate } = metrics;

  // Check ELITE tier
  if (
    confidence >= QUALITY_TIERS.ELITE.minConfidence &&
    providerAccuracy >= QUALITY_TIERS.ELITE.minAccuracy &&
    providerWinRate >= QUALITY_TIERS.ELITE.minWinRate
  ) {
    return QUALITY_TIERS.ELITE;
  }

  // Check VERIFIED tier
  if (
    confidence >= QUALITY_TIERS.VERIFIED.minConfidence &&
    providerAccuracy >= QUALITY_TIERS.VERIFIED.minAccuracy &&
    providerWinRate >= QUALITY_TIERS.VERIFIED.minWinRate
  ) {
    return QUALITY_TIERS.VERIFIED;
  }

  // Default to STANDARD tier
  return QUALITY_TIERS.STANDARD;
}

/**
 * Calculate position size recommendation
 * @param {Number} confidenceScore - Signal confidence (0-100)
 * @param {Object} providerStats - Provider statistics
 * @param {Object} riskParameters - User risk parameters
 * @returns {Object} Position size recommendation
 */
function calculatePositionSizeRecommendation(confidenceScore, providerStats, riskParameters = {}) {
  const {
    accountBalance = 100000,
    maxRiskPerTrade = 0.02, // 2% default
    basePositionSize = 0.1 // 10% default
  } = riskParameters;

  // Adjust position size based on confidence
  let sizeMultiplier = 1.0;
  if (confidenceScore >= 85) {
    sizeMultiplier = 1.5; // Increase size for high confidence
  } else if (confidenceScore >= 70) {
    sizeMultiplier = 1.2;
  } else if (confidenceScore < 50) {
    sizeMultiplier = 0.5; // Reduce size for low confidence
  }

  // Adjust based on provider consistency
  if (providerStats.winRate > 70) {
    sizeMultiplier *= 1.2;
  } else if (providerStats.winRate < 50) {
    sizeMultiplier *= 0.8;
  }

  // Calculate recommended position size
  const recommendedSize = accountBalance * basePositionSize * sizeMultiplier;
  const maxRiskAmount = accountBalance * maxRiskPerTrade;

  return {
    recommendedSize: Math.round(recommendedSize),
    maxRiskAmount: Math.round(maxRiskAmount),
    sizeMultiplier: Math.round(sizeMultiplier * 100) / 100,
    reasoning: [
      `Base allocation: ${(basePositionSize * 100).toFixed(0)}%`,
      `Confidence adjustment: ${((sizeMultiplier - 1) * 100).toFixed(0)}%`,
      `Max risk per trade: ${(maxRiskPerTrade * 100).toFixed(1)}%`
    ]
  };
}

/**
 * Analyze signal quality (main function)
 * @param {Object} signal - Trading signal to analyze
 * @param {Object} options - Analysis options
 * @returns {Object} Complete quality analysis
 */
async function analyzeSignalQuality(signal, options = {}) {
  try {
    const { context = {}, includeProviderStats = true, includePositionSizing = true, riskParameters = {} } = options;

    // Get provider statistics
    const providerStats = includeProviderStats
      ? await getProviderStats(signal.userId || signal.providerId)
      : { accuracy: 0, winRate: 0 };

    // Calculate smart money score
    const smartMoneyScore = calculateSmartMoneyScore(signal, context);

    // Calculate rare information likelihood
    const rareInformation = calculateRareInformationLikelihood(signal, smartMoneyScore);

    // Calculate confidence score
    const confidence = calculateConfidenceScore(providerStats, smartMoneyScore, context);

    // Determine quality tier
    const qualityTier = determineQualityTier({
      confidence,
      providerAccuracy: providerStats.accuracy,
      providerWinRate: providerStats.winRate
    });

    // Calculate position sizing (if requested)
    const positionSizing = includePositionSizing
      ? calculatePositionSizeRecommendation(confidence, providerStats, riskParameters)
      : null;

    return {
      signalId: signal._id || signal.id,
      symbol: signal.symbol,
      side: signal.side,
      quality: {
        tier: qualityTier.name,
        symbol: qualityTier.symbol,
        confidence,
        description: qualityTier.description
      },
      smartMoney: {
        score: smartMoneyScore.total,
        breakdown: smartMoneyScore.breakdown,
        indicators: smartMoneyScore.indicators
      },
      rareInformation,
      provider: {
        id: signal.userId || signal.providerId,
        stats: providerStats
      },
      positionSizing,
      timestamp: new Date(),
      analysisVersion: '1.0'
    };
  } catch (error) {
    console.error('Error analyzing signal quality:', error);
    throw error;
  }
}

/**
 * Get provider leaderboard
 * @param {Object} options - Leaderboard options
 * @returns {Array} Ranked providers
 */
async function getProviderLeaderboard(options = {}) {
  try {
    const { minSignals = 10, timeRange = '30d', limit = 50 } = options;

    // Calculate time range
    const startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate.setFullYear(startDate.getFullYear() - 1); // All time
    }

    // Aggregate provider performance
    const providerPerformance = await Trade.aggregate([
      {
        $match: {
          entryTime: { $gte: startDate },
          status: { $in: ['FILLED', 'CLOSED'] }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalSignals: { $sum: 1 },
          winningSignals: {
            $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
          },
          totalReturn: { $sum: '$profitLoss' },
          avgReturn: { $avg: '$profitLoss' },
          accurateSignals: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $and: [{ $eq: ['$predictedDirection', 'up'] }, { $gt: ['$profitLoss', 0] }] },
                    { $and: [{ $eq: ['$predictedDirection', 'down'] }, { $lt: ['$profitLoss', 0] }] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $match: {
          totalSignals: { $gte: minSignals }
        }
      },
      {
        $project: {
          providerId: '$_id',
          totalSignals: 1,
          winRate: {
            $multiply: [{ $divide: ['$winningSignals', '$totalSignals'] }, 100]
          },
          accuracy: {
            $multiply: [{ $divide: ['$accurateSignals', '$totalSignals'] }, 100]
          },
          totalReturn: 1,
          avgReturn: 1
        }
      },
      {
        $sort: { accuracy: -1, winRate: -1 }
      },
      {
        $limit: limit
      }
    ]);

    // Determine tier for each provider
    const leaderboard = providerPerformance.map(provider => {
      const confidence = calculateConfidenceScore(
        { accuracy: provider.accuracy, winRate: provider.winRate },
        { total: 50 }, // Baseline smart money score
        {}
      );

      const tier = determineQualityTier({
        confidence,
        providerAccuracy: provider.accuracy,
        providerWinRate: provider.winRate
      });

      return {
        ...provider,
        tier: tier.name,
        tierSymbol: tier.symbol,
        confidence,
        rank: 0 // Will be set after sorting
      };
    });

    // Assign ranks
    leaderboard.forEach((provider, index) => {
      provider.rank = index + 1;
    });

    return leaderboard;
  } catch (error) {
    console.error('Error generating provider leaderboard:', error);
    throw error;
  }
}

module.exports = {
  analyzeSignalQuality,
  getProviderStats,
  getProviderLeaderboard,
  calculateSmartMoneyScore,
  calculateRareInformationLikelihood,
  calculateConfidenceScore,
  calculatePositionSizeRecommendation,
  QUALITY_TIERS,
  SMART_MONEY_INDICATORS
};
