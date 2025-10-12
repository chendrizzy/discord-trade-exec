const SignalParser = require('../../src/signal-parser');

describe('SignalParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SignalParser();
  });

  describe('Basic Signal Parsing', () => {
    test('should parse a complete buy signal', () => {
      const message = 'BTC/USDT buy at $45000 with stop loss at $43000 and target at $48000';
      const signal = parser.parseMessage(message);

      expect(signal).toBeTruthy();
      expect(signal.action).toBe('buy');
      expect(signal.symbol).toBe('BTCUSDT');
      expect(signal.price).toBe(45000);
      expect(signal.stopLoss).toBe(43000);
      expect(signal.takeProfit).toBe(48000);
      expect(signal.original).toBe(message);
      expect(signal.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    test('should parse a complete sell signal', () => {
      const message = 'Short ETHUSDT at 2800 sl 2850 tp 2600';
      const signal = parser.parseMessage(message);

      expect(signal).toBeTruthy();
      expect(signal.action).toBe('sell');
      expect(signal.symbol).toBe('ETHUSDT');
      expect(signal.price).toBe(2800);
      expect(signal.stopLoss).toBe(2850);
      expect(signal.takeProfit).toBe(2600);
    });

    test('should parse signals with different symbol formats', () => {
      const testCases = [
        { input: 'BTC/USD buy', expected: 'BTCUSD' },
        { input: 'BTC-USDT long', expected: 'BTCUSDT' },
        { input: 'ETHUSDT bullish', expected: 'ETHUSDT' },
        { input: 'ADA/BTC bull', expected: 'ADABTC' }
      ];

      testCases.forEach(({ input, expected }) => {
        const signal = parser.parseMessage(input);
        expect(signal.symbol).toBe(expected);
      });
    });

    test('should handle various buy keywords', () => {
      const buyKeywords = ['buy', 'long', 'bull', 'bullish'];
      
      buyKeywords.forEach(keyword => {
        const message = `BTCUSDT ${keyword} at 45000`;
        const signal = parser.parseMessage(message);
        expect(signal.action).toBe('buy');
      });
    });

    test('should handle various sell keywords', () => {
      const sellKeywords = ['sell', 'short', 'bear', 'bearish'];
      
      sellKeywords.forEach(keyword => {
        const message = `BTCUSDT ${keyword} at 45000`;
        const signal = parser.parseMessage(message);
        expect(signal.action).toBe('sell');
      });
    });
  });

  describe('Edge Cases', () => {
    test('should return null for messages without trading keywords', () => {
      const message = 'Hello, how are you today?';
      const signal = parser.parseMessage(message);
      expect(signal).toBeNull();
    });

    test('should return null for messages without clear action', () => {
      const message = 'BTCUSDT looking interesting at 45000';
      const signal = parser.parseMessage(message);
      expect(signal).toBeNull();
    });

    test('should return null for messages without symbol', () => {
      const message = 'buy at 45000';
      const signal = parser.parseMessage(message);
      expect(signal).toBeNull();
    });

    test('should handle messages with only partial information', () => {
      const message = 'BTCUSDT buy';
      const signal = parser.parseMessage(message);
      
      expect(signal).toBeTruthy();
      expect(signal.action).toBe('buy');
      expect(signal.symbol).toBe('BTCUSDT');
      expect(signal.price).toBeUndefined();
    });

    test('should handle empty or whitespace messages', () => {
      expect(parser.parseMessage('')).toBeNull();
      expect(parser.parseMessage('   ')).toBeNull();
      expect(parser.parseMessage('\n\t')).toBeNull();
    });
  });

  describe('Price Parsing', () => {
    test('should parse prices with dollar signs', () => {
      const message = 'BTCUSDT buy at $45000';
      const signal = parser.parseMessage(message);
      expect(signal.price).toBe(45000);
    });

    test('should parse decimal prices', () => {
      const message = 'ETHUSDT buy at 2800.50';
      const signal = parser.parseMessage(message);
      expect(signal.price).toBe(2800.50);
    });

    test('should parse prices without currency symbols', () => {
      const message = 'BTCUSDT buy at 45000';
      const signal = parser.parseMessage(message);
      expect(signal.price).toBe(45000);
    });
  });

  describe('Stop Loss and Take Profit Parsing', () => {
    test('should parse stop loss with various formats', () => {
      const testCases = [
        'BTCUSDT buy sl 43000',
        'BTCUSDT buy stop loss 43000',
        'BTCUSDT buy stop: 43000',
        'BTCUSDT buy stop loss: $43000'
      ];

      testCases.forEach(message => {
        const signal = parser.parseMessage(message);
        expect(signal.stopLoss).toBe(43000);
      });
    });

    test('should parse take profit with various formats', () => {
      const testCases = [
        'BTCUSDT buy tp 48000',
        'BTCUSDT buy take profit 48000',
        'BTCUSDT buy target: 48000',
        'BTCUSDT buy target: $48000'
      ];

      testCases.forEach(message => {
        const signal = parser.parseMessage(message);
        expect(signal.takeProfit).toBe(48000);
      });
    });
  });

  describe('containsTradeKeywords', () => {
    test('should identify messages with trading keywords', () => {
      const tradingMessages = [
        'BTCUSDT buy now',
        'Time to sell ETHUSDT',
        'Going long on ADAUSDT',
        'Short position on BTCUSDT',
        'Stop loss hit on ETHUSDT',
        'Take profit at 50k'
      ];

      tradingMessages.forEach(message => {
        expect(parser.containsTradeKeywords(message.toLowerCase())).toBe(true);
      });
    });

    test('should reject messages without trading keywords', () => {
      const nonTradingMessages = [
        'Hello everyone',
        'Good morning',
        'How was your day?',
        'The weather is nice',
        'Check out this article'
      ];

      nonTradingMessages.forEach(message => {
        expect(parser.containsTradeKeywords(message.toLowerCase())).toBe(false);
      });
    });
  });

  describe('Real-world Message Examples', () => {
    test('should parse typical Discord trading signals', () => {
      const realWorldExamples = [
        {
          message: '🚀 $BTC Long Entry: $45,000 SL: $43,000 TP: $48,000 🎯',
          expected: {
            action: 'buy',
            symbol: 'BTC',
            stopLoss: 43000,
            takeProfit: 48000
          }
        },
        {
          message: 'ETHUSDT SHORT 2800 | SL 2850 | TP1: 2750 TP2: 2700',
          expected: {
            action: 'sell',
            symbol: 'ETHUSDT',
            price: 2800,
            stopLoss: 2850,
            takeProfit: 2750
          }
        },
        {
          message: 'ADA/USDT bullish momentum, entry 0.45, stop 0.42',
          expected: {
            action: 'buy',
            symbol: 'ADAUSDT',
            price: 0.45,
            stopLoss: 0.42
          }
        }
      ];

      realWorldExamples.forEach(({ message, expected }) => {
        const signal = parser.parseMessage(message);
        
        expect(signal).toBeTruthy();
        Object.keys(expected).forEach(key => {
          expect(signal[key]).toBe(expected[key]);
        });
      });
    });
  });

  describe('Performance', () => {
    test('should parse signals quickly', () => {
      const message = 'BTCUSDT buy at $45000 with stop loss at $43000 and target at $48000';
      const iterations = 1000;
      
      const startTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        parser.parseMessage(message);
      }
      const endTime = Date.now();
      
      const averageTime = (endTime - startTime) / iterations;
      expect(averageTime).toBeLessThan(1); // Should parse in less than 1ms on average
    });
  });
});