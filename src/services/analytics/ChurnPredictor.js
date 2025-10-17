/**
 * Churn Prediction Service
 * Calculates churn risk scores for active users
 */
class ChurnPredictor {
  /**
   * Calculate churn risk for a user
   * @param {Object} user - User object with stats and subscription info
   * @returns {Object} Churn risk analysis
   */
  calculateChurnRisk(user) {
    const features = this.extractFeatures(user);
    const riskScore = this.computeRiskScore(features);

    return {
      userId: user._id || user.id,
      riskScore,
      riskLevel: this.getRiskLevel(riskScore),
      factors: this.identifyRiskFactors(features),
      recommendations: this.getRetentionRecommendations(riskScore, features)
    };
  }

  /**
   * Extract features from user data for risk calculation
   * @private
   */
  extractFeatures(user) {
    const now = Date.now();
    const daysSinceSignup = Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24));

    const stats = user.stats || {};
    const subscription = user.subscription || {};
    const lastTradeDate = stats.lastTrade || null;
    const lastLogin = user.lastLogin || user.lastLoginAt || new Date();

    return {
      daysSinceSignup,
      tradeCount: stats.totalTrades || 0,
      lastTradeDate,
      daysSinceLastTrade: lastTradeDate ? Math.floor((now - lastTradeDate.getTime()) / (1000 * 60 * 60 * 24)) : null,
      winRate: stats.winRate || 0,
      totalProfit: stats.totalProfit || stats.netProfit || 0,
      subscriptionTier: subscription.tier || 'basic',
      lastLoginDate: lastLogin,
      daysSinceLastLogin: Math.floor((now - lastLogin.getTime()) / (1000 * 60 * 60 * 24)),
      supportTickets: user.supportTickets?.length || 0,
      brokerConnectionIssues: user.brokerConnections?.filter(c => c.status === 'error').length || 0
    };
  }

  /**
   * Compute risk score based on extracted features
   * @private
   */
  computeRiskScore(features) {
    let score = 0;

    // Days since last trade (35% weight)
    if (features.daysSinceLastTrade === null || features.daysSinceLastTrade > 30) {
      score += 35;
    } else if (features.daysSinceLastTrade > 14) {
      score += 25;
    } else if (features.daysSinceLastTrade > 7) {
      score += 15;
    }

    // Low win rate (25% weight)
    if (features.winRate < 30) {
      score += 25;
    } else if (features.winRate < 45) {
      score += 15;
    }

    // Days since last login (20% weight)
    if (features.daysSinceLastLogin > 14) {
      score += 20;
    } else if (features.daysSinceLastLogin > 7) {
      score += 10;
    }

    // Broker connection issues (10% weight)
    if (features.brokerConnectionIssues > 0) {
      score += 10;
    }

    // Negative profit (10% weight)
    if (features.totalProfit < -1000) {
      score += 10;
    } else if (features.totalProfit < 0) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Get risk level category from score
   * @private
   */
  getRiskLevel(score) {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Identify specific risk factors
   * @private
   */
  identifyRiskFactors(features) {
    const factors = [];

    if (features.daysSinceLastTrade === null || features.daysSinceLastTrade > 14) {
      factors.push({ factor: 'Inactive trading', severity: 'high' });
    }

    if (features.winRate < 45) {
      factors.push({ factor: 'Low win rate', severity: 'medium' });
    }

    if (features.daysSinceLastLogin > 7) {
      factors.push({ factor: 'Low engagement', severity: 'medium' });
    }

    if (features.brokerConnectionIssues > 0) {
      factors.push({ factor: 'Technical issues', severity: 'high' });
    }

    if (features.totalProfit < 0) {
      factors.push({ factor: 'Negative profit', severity: 'medium' });
    }

    return factors;
  }

  /**
   * Get retention recommendations based on risk
   * @private
   */
  getRetentionRecommendations(riskScore, features) {
    const recommendations = [];

    if (riskScore >= 70) {
      recommendations.push('Send personalized win-back email with 20% discount');
      recommendations.push('Schedule customer success call');
    }

    if (features.daysSinceLastTrade > 14) {
      recommendations.push('Send signal performance highlight email');
      recommendations.push('Offer free trial of premium signals');
    }

    if (features.winRate < 45) {
      recommendations.push('Suggest risk management webinar');
      recommendations.push('Offer portfolio review by expert');
    }

    if (features.brokerConnectionIssues > 0) {
      recommendations.push('Proactive tech support outreach');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring engagement');
    }

    return recommendations;
  }

  /**
   * Batch calculate churn risk for multiple users
   * @param {Array<Object>} users - Array of user objects
   * @returns {Array<Object>} Array of churn risk analyses
   */
  batchCalculateRisk(users) {
    return users.map(user => this.calculateChurnRisk(user));
  }

  /**
   * Get users at high churn risk
   * @param {Array<Object>} users - Array of user objects
   * @param {string} minRiskLevel - Minimum risk level ('medium', 'high', 'critical')
   * @returns {Array<Object>} Filtered users with risk analysis
   */
  getHighRiskUsers(users, minRiskLevel = 'high') {
    const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
    const minLevel = riskLevels[minRiskLevel] || 2;

    return users
      .map(user => this.calculateChurnRisk(user))
      .filter(analysis => riskLevels[analysis.riskLevel] >= minLevel)
      .sort((a, b) => b.riskScore - a.riskScore);
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton ChurnPredictor instance
 * @returns {ChurnPredictor} Singleton instance
 */
function getChurnPredictorInstance() {
  if (!instance) {
    instance = new ChurnPredictor();
  }
  return instance;
}

module.exports = {
  ChurnPredictor,
  getChurnPredictorInstance
};
