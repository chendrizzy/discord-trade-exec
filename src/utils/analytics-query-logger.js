/**
 * Analytics Query Pattern Logger
 *
 * Logs query patterns to identify optimization opportunities and usage patterns.
 * Tracks frequency, parameters, performance, and user patterns.
 */

const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

// Query pattern logger
const queryLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/analytics-query-patterns.log' }),
    new winston.transports.File({
      filename: 'logs/analytics-slow-queries.log',
      level: 'warn'
    })
  ]
});

class QueryPatternLogger {
  constructor() {
    this.patterns = new Map();
    this.PATTERN_CACHE_SIZE = 1000;
    this.SLOW_QUERY_THRESHOLD = 1000; // 1 second

    // Pattern aggregation intervals
    this.hourlyPatterns = [];
    this.dailyPatterns = [];
  }

  /**
   * Log a query execution
   * @param {Object} queryInfo - Query information
   */
  logQuery(queryInfo) {
    const {
      queryType,
      params,
      executionTime,
      userId,
      timestamp = new Date(),
      resultSize = 0,
      cacheHit = false
    } = queryInfo;

    // Create query pattern key
    const patternKey = this.generatePatternKey(queryType, params);

    // Update pattern statistics
    this.updatePattern(patternKey, {
      queryType,
      params,
      executionTime,
      resultSize,
      cacheHit,
      timestamp
    });

    // Log to file
    const logEntry = {
      timestamp: timestamp.toISOString(),
      queryType,
      params: this.sanitizeParams(params),
      executionTime,
      userId,
      resultSize,
      cacheHit,
      patternKey
    };

    if (executionTime > this.SLOW_QUERY_THRESHOLD) {
      queryLogger.warn('Slow query detected', logEntry);
    } else {
      queryLogger.info('Query executed', logEntry);
    }

    return patternKey;
  }

  /**
   * Generate pattern key for query aggregation
   * @private
   */
  generatePatternKey(queryType, params = {}) {
    // Create key based on query type and parameter structure (not values)
    const paramKeys = Object.keys(params).sort().join(',');
    return `${queryType}:${paramKeys}`;
  }

  /**
   * Update pattern statistics
   * @private
   */
  updatePattern(patternKey, queryData) {
    if (!this.patterns.has(patternKey)) {
      this.patterns.set(patternKey, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        totalResultSize: 0,
        avgResultSize: 0,
        cacheHitRate: 0,
        cacheHits: 0,
        firstSeen: queryData.timestamp,
        lastSeen: queryData.timestamp,
        queryType: queryData.queryType,
        paramStructure: Object.keys(queryData.params || {}).sort()
      });
    }

    const pattern = this.patterns.get(patternKey);
    pattern.count++;
    pattern.totalTime += queryData.executionTime;
    pattern.avgTime = pattern.totalTime / pattern.count;
    pattern.minTime = Math.min(pattern.minTime, queryData.executionTime);
    pattern.maxTime = Math.max(pattern.maxTime, queryData.executionTime);
    pattern.totalResultSize += queryData.resultSize;
    pattern.avgResultSize = pattern.totalResultSize / pattern.count;
    pattern.lastSeen = queryData.timestamp;

    if (queryData.cacheHit) {
      pattern.cacheHits++;
    }
    pattern.cacheHitRate = pattern.cacheHits / pattern.count;

    // Limit cache size
    if (this.patterns.size > this.PATTERN_CACHE_SIZE) {
      this.cleanupOldestPatterns();
    }
  }

  /**
   * Remove oldest patterns when cache is full
   * @private
   */
  cleanupOldestPatterns() {
    const sortedPatterns = Array.from(this.patterns.entries()).sort((a, b) => a[1].lastSeen - b[1].lastSeen);

    // Remove oldest 20%
    const removeCount = Math.floor(this.PATTERN_CACHE_SIZE * 0.2);
    for (let i = 0; i < removeCount; i++) {
      this.patterns.delete(sortedPatterns[i][0]);
    }
  }

  /**
   * Get query patterns sorted by frequency
   * @param {number} limit - Max patterns to return
   * @returns {Array} Query patterns
   */
  getFrequentPatterns(limit = 50) {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(p => ({
        queryType: p.queryType,
        paramStructure: p.paramStructure,
        count: p.count,
        avgTime: Math.round(p.avgTime),
        minTime: Math.round(p.minTime),
        maxTime: Math.round(p.maxTime),
        avgResultSize: Math.round(p.avgResultSize),
        cacheHitRate: (p.cacheHitRate * 100).toFixed(1) + '%',
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen
      }));
  }

  /**
   * Get slowest query patterns
   * @param {number} limit - Max patterns to return
   * @returns {Array} Slow query patterns
   */
  getSlowestPatterns(limit = 20) {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit)
      .map(p => ({
        queryType: p.queryType,
        paramStructure: p.paramStructure,
        count: p.count,
        avgTime: Math.round(p.avgTime),
        maxTime: Math.round(p.maxTime),
        avgResultSize: Math.round(p.avgResultSize),
        recommendation: this.getOptimizationRecommendation(p)
      }));
  }

  /**
   * Get optimization recommendations for slow patterns
   * @private
   */
  getOptimizationRecommendation(pattern) {
    const recommendations = [];

    if (pattern.avgTime > 5000) {
      recommendations.push('CRITICAL: Optimize query logic or add indexes');
    }

    if (pattern.cacheHitRate < 0.5 && pattern.count > 10) {
      recommendations.push('Consider adding Redis caching (low cache hit rate)');
    }

    if (pattern.avgResultSize > 10000) {
      recommendations.push('Implement pagination for large result sets');
    }

    if (pattern.count > 100 && pattern.avgTime > 1000) {
      recommendations.push('High-frequency slow query - prioritize optimization');
    }

    if (recommendations.length === 0) {
      return 'Query performance acceptable';
    }

    return recommendations.join(' | ');
  }

  /**
   * Get patterns by time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} Patterns within time range
   */
  getPatternsByTimeRange(startDate, endDate) {
    return Array.from(this.patterns.values())
      .filter(p => p.lastSeen >= startDate && p.lastSeen <= endDate)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate optimization report
   * @returns {Object} Optimization report
   */
  generateOptimizationReport() {
    const allPatterns = Array.from(this.patterns.values());

    const report = {
      summary: {
        totalPatterns: allPatterns.length,
        totalQueries: allPatterns.reduce((sum, p) => sum + p.count, 0),
        avgQueryTime: Math.round(
          allPatterns.reduce((sum, p) => sum + p.avgTime * p.count, 0) /
            allPatterns.reduce((sum, p) => sum + p.count, 0)
        ),
        slowPatterns: allPatterns.filter(p => p.avgTime > this.SLOW_QUERY_THRESHOLD).length
      },
      topFrequent: this.getFrequentPatterns(10),
      slowest: this.getSlowestPatterns(10),
      cacheOpportunities: this.identifyCacheOpportunities(),
      indexRecommendations: this.generateIndexRecommendations(),
      timestamp: new Date().toISOString()
    };

    return report;
  }

  /**
   * Identify cache opportunities
   * @private
   */
  identifyCacheOpportunities() {
    return Array.from(this.patterns.values())
      .filter(p => p.count > 20 && p.cacheHitRate < 0.7)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => ({
        queryType: p.queryType,
        frequency: p.count,
        currentCacheHitRate: (p.cacheHitRate * 100).toFixed(1) + '%',
        estimatedTimeSavings: Math.round(p.count * p.avgTime * (1 - p.cacheHitRate)) + 'ms',
        recommendation: `Add Redis caching with ${this.suggestCacheTTL(p)} TTL`
      }));
  }

  /**
   * Suggest cache TTL based on query characteristics
   * @private
   */
  suggestCacheTTL(pattern) {
    if (pattern.queryType.includes('dashboard') || pattern.queryType.includes('summary')) {
      return '5 minutes';
    }
    if (pattern.queryType.includes('revenue') || pattern.queryType.includes('metrics')) {
      return '10 minutes';
    }
    if (pattern.queryType.includes('cohort') || pattern.queryType.includes('retention')) {
      return '30 minutes';
    }
    return '15 minutes';
  }

  /**
   * Generate database index recommendations
   * @private
   */
  generateIndexRecommendations() {
    const slowPatterns = Array.from(this.patterns.values())
      .filter(p => p.avgTime > 2000)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5);

    return slowPatterns.map(p => {
      const indexes = [];

      if (p.queryType.includes('revenue') || p.queryType.includes('mrr')) {
        indexes.push('subscription.status', 'subscription.tier', 'subscription.startDate');
      }

      if (p.queryType.includes('churn') || p.queryType.includes('risk')) {
        indexes.push('lastLogin', 'subscription.status', 'stats.lastTradeDate');
      }

      if (p.queryType.includes('cohort')) {
        indexes.push('createdAt', 'subscription.status', 'subscription.startDate');
      }

      return {
        queryType: p.queryType,
        avgTime: Math.round(p.avgTime),
        recommendedIndexes: indexes.length > 0 ? indexes : ['Analyze query execution plan']
      };
    });
  }

  /**
   * Sanitize query parameters (remove sensitive data)
   * @private
   */
  sanitizeParams(params) {
    const sanitized = { ...params };

    // Remove potentially sensitive fields
    delete sanitized.userId;
    delete sanitized.email;
    delete sanitized.token;
    delete sanitized.password;

    return sanitized;
  }

  /**
   * Export patterns to file for analysis
   * @param {string} filePath - Export file path
   */
  async exportPatterns(filePath = 'logs/query-patterns-export.json') {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        patterns: Array.from(this.patterns.entries()).map(([key, pattern]) => ({
          patternKey: key,
          ...pattern
        })),
        summary: {
          totalPatterns: this.patterns.size,
          oldestPattern: Math.min(...Array.from(this.patterns.values()).map(p => p.firstSeen)),
          newestPattern: Math.max(...Array.from(this.patterns.values()).map(p => p.lastSeen))
        }
      };

      await fs.writeFile(path.resolve(filePath), JSON.stringify(exportData, null, 2), 'utf8');

      return { success: true, filePath };
    } catch (error) {
      queryLogger.error('Failed to export patterns', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset pattern cache
   */
  reset() {
    this.patterns.clear();
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton query logger instance
 * @returns {QueryPatternLogger} Query logger instance
 */
function getQueryLoggerInstance() {
  if (!instance) {
    instance = new QueryPatternLogger();
  }
  return instance;
}

module.exports = {
  QueryPatternLogger,
  getQueryLoggerInstance
};
