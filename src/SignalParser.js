class SignalParser {
  constructor() {
    this.patterns = {
      buy: /\b(buy|long|bull|bullish|up)\b/i,
      sell: /\b(sell|short|bear|bearish|down)\b/i,
      symbol: /(?:\$?\b([A-Z]{3,5})[/-]?([A-Z]{3,5})?\b|\b([A-Z]{3,5})[/-]([A-Z]{3,5})\b)/g,
      price: /\$?([\d,]+\.?\d*)/g,
      entryPrice: /\b(?:entry|at)(?:\s*[:])?\s*\$?([\d,]+\.?\d*)/i,
      stopLoss: /\b(?:sl|stop\s*(?:loss)?|stop)(?:\s*(?:at|:|is))?\s*\$?([\d,]+\.?\d*)/i,
      takeProfit: /\b(?:tp\d*|take\s*profit|target)(?:\s*(?:at|:|is))?\s*\$?([\d,]+\.?\d*)/i
    };
  }

  parseMessage(message) {
    const cleanMessage = message.toLowerCase().trim();

    // Check if message contains trading keywords
    if (!this.containsTradeKeywords(cleanMessage)) {
      return null;
    }

    const signal = {
      original: message,
      timestamp: Date.now()
    };

    // Parse action (buy/sell)
    if (this.patterns.buy.test(cleanMessage)) {
      signal.action = 'buy';
    } else if (this.patterns.sell.test(cleanMessage)) {
      signal.action = 'sell';
    } else {
      return null; // No clear action found
    }

    // Parse symbol
    const symbolMatch = message.match(this.patterns.symbol);
    if (symbolMatch) {
      // Clean the symbol by removing separators and $ prefix
      signal.symbol = symbolMatch[0].replace(/[$/-]/g, '').toUpperCase();
    }

    // Parse price - check for entry price first, then general price
    const entryPriceMatch = message.match(this.patterns.entryPrice);
    if (entryPriceMatch) {
      signal.price = parseFloat(entryPriceMatch[1].replace(/,/g, ''));
    } else {
      const priceMatch = message.match(this.patterns.price);
      if (priceMatch) {
        signal.price = parseFloat(priceMatch[0].replace(/[$,]/g, ''));
      }
    }

    // Parse stop loss
    const stopLossMatch = message.match(this.patterns.stopLoss);
    if (stopLossMatch) {
      signal.stopLoss = parseFloat(stopLossMatch[1].replace(/,/g, ''));
    }

    // Parse take profit
    const takeProfitMatch = message.match(this.patterns.takeProfit);
    if (takeProfitMatch) {
      signal.takeProfit = parseFloat(takeProfitMatch[1].replace(/,/g, ''));
    }

    return signal.symbol ? signal : null;
  }

  containsTradeKeywords(message) {
    const tradeKeywords = [
      'buy',
      'sell',
      'long',
      'short',
      'bull',
      'bear',
      'bullish',
      'bearish',
      'target',
      'tp',
      'sl',
      'stop',
      'entry',
      'exit',
      'profit',
      'loss'
    ];

    return tradeKeywords.some(keyword => message.includes(keyword));
  }
}

module.exports = SignalParser;
