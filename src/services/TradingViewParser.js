// Node.js built-in modules
const crypto = require('crypto');
const logger = require('../utils/logger');
const logger = require('../utils/logger');

class TradingViewParser {
  constructor() {
    this.requiredFields = ['symbol', 'action'];
    this.validActions = ['buy', 'sell', 'long', 'short'];
  }

  /**
   * Parse TradingView webhook payload
   * @param {string|Buffer|Object} payload - JSON payload from TradingView webhook
   * @returns {Object|null} - Parsed signal object or null if invalid
   */
  parseWebhook(payload) {
    try {
      let data;

      // Handle different payload types
      if (Buffer.isBuffer(payload)) {
        // Convert buffer to string then parse
        data = JSON.parse(payload.toString('utf8'));
      } else if (typeof payload === 'string') {
        // If it's already a JSON string, parse it
        data = JSON.parse(payload);
      } else if (typeof payload === 'object' && payload !== null) {
        // If it's already a JavaScript object, use it directly
        data = payload;
      } else {
        console.warn('Invalid TradingView webhook payload type:', typeof payload);
        return null;
      }

      // Validate required fields
      if (!this.validateRequiredFields(data)) {
        console.warn('TradingView webhook missing required fields:', data);
        return null;
      }

      // Parse and normalize the signal
      const signal = {
        id: this.generateSignalId(data),
        source: 'tradingview',
        timestamp: Date.now(),
        original: Buffer.isBuffer(payload) ? payload.toString('utf8') : payload,
        ...this.extractTradingData(data)
      };

      // Validate parsed signal
      if (!this.validateParsedSignal(signal)) {
        console.warn('TradingView signal failed validation:', signal);
        return null;
      }

      return signal;
    } catch (error) {
      logger.error('Error parsing TradingView webhook:', { error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * Extract trading data from TradingView payload
   * @param {Object} data - Raw TradingView data
   * @returns {Object} - Extracted trading data
   */
  extractTradingData(data) {
    const signal = {};

    // Symbol processing
    signal.symbol = this.normalizeSymbol(data.symbol || data.ticker);

    // Action processing
    signal.action = this.normalizeAction(data.action || data.side || data.direction);

    // Price data
    if (data.price) {
      signal.price = parseFloat(data.price);
    } else if (data.close) {
      signal.price = parseFloat(data.close);
    }

    // Stop loss
    if (data.stop_loss || data.sl || data.stopLoss) {
      signal.stopLoss = parseFloat(data.stop_loss || data.sl || data.stopLoss);
    }

    // Take profit
    if (data.take_profit || data.tp || data.takeProfit || data.target) {
      signal.takeProfit = parseFloat(data.take_profit || data.tp || data.takeProfit || data.target);
    }

    // Quantity/Amount
    if (data.quantity || data.amount || data.size) {
      signal.amount = parseFloat(data.quantity || data.amount || data.size);
    }

    // Alert metadata
    if (data.alert) {
      signal.alertName = data.alert.name;
      signal.alertId = data.alert.id;
    }

    // Chart metadata
    if (data.chart) {
      signal.timeframe = data.chart.timeframe;
      signal.exchange = data.chart.exchange;
    }

    // Strategy metadata
    if (data.strategy) {
      signal.strategyName = data.strategy.name;
      signal.strategyId = data.strategy.id;
    }

    return signal;
  }

  /**
   * Normalize symbol format (e.g., BTCUSD -> BTCUSDT)
   * @param {string} symbol - Raw symbol
   * @returns {string} - Normalized symbol
   */
  normalizeSymbol(symbol) {
    if (!symbol) return null;

    // Remove common separators and convert to uppercase
    let normalized = symbol.replace(/[\/\-_]/g, '').toUpperCase();

    // Handle common TradingView symbol formats
    const symbolMappings = {
      BTCUSD: 'BTCUSDT',
      ETHUSD: 'ETHUSDT',
      ADAUSD: 'ADAUSDT',
      XRPUSD: 'XRPUSDT',
      SOLUSD: 'SOLUSDT'
    };

    return symbolMappings[normalized] || normalized;
  }

  /**
   * Normalize action/direction format
   * @param {string} action - Raw action
   * @returns {string} - Normalized action ('buy' or 'sell')
   */
  normalizeAction(action) {
    if (!action) return null;

    const actionLower = action.toLowerCase();

    // Map various action formats to buy/sell
    const buyActions = ['buy', 'long', 'bull', 'up', 'enter_long'];
    const sellActions = ['sell', 'short', 'bear', 'down', 'enter_short'];

    if (buyActions.includes(actionLower)) {
      return 'buy';
    } else if (sellActions.includes(actionLower)) {
      return 'sell';
    }

    return null;
  }

  /**
   * Validate required fields in webhook payload
   * @param {Object} data - Webhook payload
   * @returns {boolean} - True if valid
   */
  validateRequiredFields(data) {
    return this.requiredFields.every(field => {
      if (field === 'symbol') {
        return data.symbol || data.ticker;
      }
      if (field === 'action') {
        return data.action || data.side || data.direction;
      }
      return data[field] !== undefined && data[field] !== null;
    });
  }

  /**
   * Validate parsed signal object
   * @param {Object} signal - Parsed signal
   * @returns {boolean} - True if valid
   */
  validateParsedSignal(signal) {
    // Must have symbol and action
    if (!signal.symbol || !signal.action) {
      return false;
    }

    // Action must be valid
    if (!['buy', 'sell'].includes(signal.action)) {
      return false;
    }

    // If price is provided, it must be positive
    if (signal.price && signal.price <= 0) {
      return false;
    }

    // If stop loss is provided, it must be positive
    if (signal.stopLoss && signal.stopLoss <= 0) {
      return false;
    }

    // If take profit is provided, it must be positive
    if (signal.takeProfit && signal.takeProfit <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Generate unique signal ID
   * @param {Object} data - Signal data
   * @returns {string} - Unique signal ID
   */
  generateSignalId(data) {
    const identifier = `${data.symbol || 'unknown'}_${data.action || 'unknown'}_${Date.now()}`;
    return crypto.createHash('md5').update(identifier).digest('hex').substring(0, 12);
  }

  /**
   * Verify webhook signature (for security)
   * @param {string|Buffer|Object} payload - Raw payload
   * @param {string} signature - Webhook signature
   * @param {string} secret - Webhook secret
   * @returns {boolean} - True if signature is valid
   */
  verifyWebhookSignature(payload, signature, secret) {
    if (!signature || !secret) {
      return false;
    }

    try {
      // Normalize payload to string for HMAC computation
      let payloadData;

      if (Buffer.isBuffer(payload)) {
        // If it's a buffer, convert to string
        payloadData = payload.toString('utf8');
      } else if (typeof payload === 'object' && payload !== null) {
        // If it's an object, stringify it
        payloadData = JSON.stringify(payload);
      } else if (typeof payload === 'string') {
        // If it's already a string, use it as-is
        payloadData = payload;
      } else {
        console.warn('Invalid payload type for signature verification:', typeof payload);
        return false;
      }

      const expectedSignature = crypto.createHmac('sha256', secret).update(payloadData).digest('hex');

      // Remove any prefixes (like 'sha256=') from the signature
      const cleanSignature = signature.replace(/^(sha256=|sha1=)/, '');

      // Validate that the signature is a valid hex string
      if (!/^[0-9a-fA-F]+$/.test(cleanSignature)) {
        console.warn('Invalid signature format - not hex:', cleanSignature);
        return false;
      }

      // Ensure both signatures are the same length for timingSafeEqual
      if (cleanSignature.length !== expectedSignature.length) {
        console.warn('Signature length mismatch:', {
          received: cleanSignature.length,
          expected: expectedSignature.length
        });
        return false;
      }

      return crypto.timingSafeEqual(Buffer.from(cleanSignature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    } catch (error) {
      logger.error('Error verifying webhook signature:', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * Create sample TradingView webhook payload for testing
   * @returns {Object} - Sample payload
   */
  createSamplePayload() {
    return {
      symbol: 'BTCUSDT',
      action: 'buy',
      price: 45000,
      stop_loss: 43000,
      take_profit: 48000,
      quantity: 0.001,
      alert: {
        name: 'BTC Long Alert',
        id: 'alert_123456'
      },
      chart: {
        timeframe: '1h',
        exchange: 'BINANCE'
      },
      strategy: {
        name: 'Momentum Strategy',
        id: 'strategy_789'
      },
      timestamp: Date.now()
    };
  }
}

module.exports = TradingViewParser;
