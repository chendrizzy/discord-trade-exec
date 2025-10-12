const { describe, it, expect } = require('@jest/globals');
const {
    sanitizeString,
    sanitizeObject,
    validateEmail,
    validateApiKey,
    validateAmount,
    validatePercentage,
    validateSymbol,
    validateExchangeName,
    validateWebhookUrl,
    validateDiscordId,
    validateTimeString,
    validateEnum
} = require('../../src/middleware/validation');

describe('Input Validation & Sanitization Tests', () => {
    describe('String Sanitization', () => {
        it('should remove HTML tags', () => {
            const input = '<script>alert("XSS")</script>Hello';
            const sanitized = sanitizeString(input);

            expect(sanitized).toBe('Hello');
            expect(sanitized).not.toContain('<script>');
        });

        it('should remove null bytes', () => {
            const input = 'test\0data';
            const sanitized = sanitizeString(input);

            expect(sanitized).not.toContain('\0');
            expect(sanitized).toBe('testdata');
        });

        it('should trim whitespace', () => {
            const input = '  hello world  ';
            const sanitized = sanitizeString(input);

            expect(sanitized).toBe('hello world');
        });

        it('should handle multiple HTML tags', () => {
            const input = '<div><span>Text</span></div>';
            const sanitized = sanitizeString(input);

            expect(sanitized).toBe('Text');
        });

        it('should handle complex XSS attempts', () => {
            const xss = '<img src=x onerror="alert(1)">';
            const sanitized = sanitizeString(xss);

            expect(sanitized).not.toContain('onerror');
            expect(sanitized).not.toContain('<img');
        });
    });

    describe('Object Sanitization', () => {
        it('should sanitize nested objects', () => {
            const input = {
                name: '<script>XSS</script>John',
                data: {
                    value: 'test\0data'
                }
            };

            const sanitized = sanitizeObject(input);

            expect(sanitized.name).toBe('John');
            expect(sanitized.data.value).toBe('testdata');
        });

        it('should remove dangerous keys', () => {
            const input = {
                name: 'John',
                __proto__: { admin: true },
                $where: 'malicious'
            };

            const sanitized = sanitizeObject(input);

            expect(sanitized.name).toBe('John');
            // __proto__ won't be an own property (not copied)
            expect(Object.hasOwn(sanitized, '__proto__')).toBe(false);
            expect(sanitized.$where).toBeUndefined();
            // Verify dangerous values weren't copied
            expect(sanitized.admin).toBeUndefined();
        });

        it('should handle arrays', () => {
            const input = {
                items: ['<b>test1</b>', 'test2', '<script>XSS</script>']
            };

            const sanitized = sanitizeObject(input);

            expect(sanitized.items).toEqual(['test1', 'test2', '']);
        });

        it('should prevent deep recursion attacks', () => {
            const deep = { level1: { level2: { level3: { level4: { level5: { level6: 'too deep' } } } } } };

            expect(() => {
                sanitizeObject(deep, 3);
            }).toThrow('Maximum depth exceeded');
        });
    });

    describe('Email Validation', () => {
        it('should accept valid email', () => {
            const result = validateEmail('user@example.com');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('user@example.com');
        });

        it('should reject invalid email formats', () => {
            const invalid = [
                'invalid',
                '@example.com',
                'user@',
                'user @example.com',
                'user..test@example.com'
            ];

            invalid.forEach(email => {
                const result = validateEmail(email);
                expect(result.valid).toBe(false);
            });
        });

        it('should reject email that is too long', () => {
            const longEmail = 'a'.repeat(250) + '@test.com';
            const result = validateEmail(longEmail);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('too long');
        });

        it('should sanitize email with HTML', () => {
            const result = validateEmail('<script>alert(1)</script>test@example.com');

            expect(result.valid).toBe(false); // Becomes invalid after sanitization
        });
    });

    describe('API Key Validation', () => {
        it('should accept valid API key', () => {
            const result = validateApiKey('ABC123-def456_GHI789');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('ABC123-def456_GHI789');
        });

        it('should reject API key that is too short', () => {
            const result = validateApiKey('short');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('length');
        });

        it('should reject API key that is too long', () => {
            const longKey = 'a'.repeat(600);
            const result = validateApiKey(longKey);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('length');
        });

        it('should reject API key with invalid characters', () => {
            const result = validateApiKey('key-with-invalid-chars-<>');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('invalid characters');
        });

        it('should accept base64-encoded keys', () => {
            const result = validateApiKey('SGVsbG8gV29ybGQ=');

            expect(result.valid).toBe(true);
        });
    });

    describe('Amount Validation', () => {
        it('should accept valid positive numbers', () => {
            const result = validateAmount(100.50);

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(100.50);
        });

        it('should reject negative numbers by default', () => {
            const result = validateAmount(-50);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('negative');
        });

        it('should accept negative numbers when allowed', () => {
            const result = validateAmount(-50, { allowNegative: true });

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(-50);
        });

        it('should enforce min/max constraints', () => {
            const result1 = validateAmount(5, { min: 10, max: 100 });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('at least 10');

            const result2 = validateAmount(150, { min: 10, max: 100 });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('cannot exceed 100');
        });

        it('should reject non-numeric values', () => {
            const result = validateAmount('not-a-number');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('valid number');
        });

        it('should convert string numbers', () => {
            const result = validateAmount('42.50');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(42.50);
        });
    });

    describe('Percentage Validation', () => {
        it('should accept valid percentage (0-100)', () => {
            const result = validatePercentage(75);

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(75);
        });

        it('should accept valid decimal percentage (0-1)', () => {
            const result = validatePercentage(0.75, true);

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(0.75);
        });

        it('should reject percentage > 100', () => {
            const result = validatePercentage(150);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('0 and 100');
        });

        it('should reject decimal percentage > 1', () => {
            const result = validatePercentage(1.5, true);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('0 and 1');
        });

        it('should reject negative percentage', () => {
            const result = validatePercentage(-10);

            expect(result.valid).toBe(false);
        });
    });

    describe('Symbol Validation', () => {
        it('should accept valid trading symbols', () => {
            const symbols = ['BTC/USDT', 'ETH/BTC', 'SOL/USD'];

            symbols.forEach(symbol => {
                const result = validateSymbol(symbol);
                expect(result.valid).toBe(true);
            });
        });

        it('should normalize symbol to uppercase', () => {
            const result = validateSymbol('btc/usdt');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('BTC/USDT');
        });

        it('should reject invalid symbol formats', () => {
            const invalid = ['BTC', 'BTC-USDT', 'BTC_USDT', 'BTCUSDT', '/USDT', 'BTC/'];

            invalid.forEach(symbol => {
                const result = validateSymbol(symbol);
                expect(result.valid).toBe(false);
            });
        });

        it('should reject symbols that are too long', () => {
            const result = validateSymbol('VERYLONGCOIN/ANOTHERVERYLONGCOIN');

            expect(result.valid).toBe(false);
        });
    });

    describe('Exchange Name Validation', () => {
        it('should accept supported exchanges', () => {
            const exchanges = ['binance', 'coinbase', 'kraken', 'bybit', 'okx'];

            exchanges.forEach(exchange => {
                const result = validateExchangeName(exchange);
                expect(result.valid).toBe(true);
            });
        });

        it('should normalize exchange name to lowercase', () => {
            const result = validateExchangeName('BINANCE');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('binance');
        });

        it('should reject unsupported exchanges', () => {
            const result = validateExchangeName('unsupported-exchange');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Unsupported');
        });
    });

    describe('Webhook URL Validation', () => {
        it('should accept valid HTTPS URLs', () => {
            const result = validateWebhookUrl('https://api.example.com/webhook');

            expect(result.valid).toBe(true);
        });

        it('should accept valid HTTP URLs', () => {
            const result = validateWebhookUrl('http://api.example.com/webhook');

            expect(result.valid).toBe(true);
        });

        it('should reject URLs without protocol', () => {
            const result = validateWebhookUrl('api.example.com/webhook');

            expect(result.valid).toBe(false);
        });

        it('should reject localhost URLs', () => {
            const invalid = [
                'http://localhost/webhook',
                'http://127.0.0.1/webhook'
            ];

            invalid.forEach(url => {
                const result = validateWebhookUrl(url);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Localhost');
            });
        });

        it('should reject invalid URL formats', () => {
            const result = validateWebhookUrl('not-a-url');

            expect(result.valid).toBe(false);
        });
    });

    describe('Discord ID Validation', () => {
        it('should accept valid Discord snowflake IDs', () => {
            const validIds = [
                '123456789012345678',   // 18 digits
                '1234567890123456789'   // 19 digits
            ];

            validIds.forEach(id => {
                const result = validateDiscordId(id);
                expect(result.valid).toBe(true);
            });
        });

        it('should reject IDs that are too short', () => {
            const result = validateDiscordId('1234567890');

            expect(result.valid).toBe(false);
        });

        it('should reject IDs that are too long', () => {
            const result = validateDiscordId('12345678901234567890');

            expect(result.valid).toBe(false);
        });

        it('should reject non-numeric IDs', () => {
            const result = validateDiscordId('abc123def456ghij78');

            expect(result.valid).toBe(false);
        });
    });

    describe('Time String Validation', () => {
        it('should accept valid 24-hour times', () => {
            const valid = ['00:00', '09:30', '12:00', '23:59'];

            valid.forEach(time => {
                const result = validateTimeString(time);
                expect(result.valid).toBe(true);
            });
        });

        it('should reject invalid hour', () => {
            const result = validateTimeString('25:00');

            expect(result.valid).toBe(false);
        });

        it('should reject invalid minute', () => {
            const result = validateTimeString('12:60');

            expect(result.valid).toBe(false);
        });

        it('should reject invalid formats', () => {
            const invalid = ['9:30', '09:5', '9:5', '09:30 AM', '09-30'];

            invalid.forEach(time => {
                const result = validateTimeString(time);
                expect(result.valid).toBe(false);
            });
        });
    });

    describe('Enum Validation', () => {
        it('should accept valid enum values', () => {
            const result = validateEnum('active', ['active', 'inactive', 'pending'], 'Status');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('active');
        });

        it('should reject invalid enum values', () => {
            const result = validateEnum('invalid', ['active', 'inactive'], 'Status');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Status');
            expect(result.error).toContain('must be one of');
        });

        it('should handle numeric enums', () => {
            const result = validateEnum(1, [1, 2, 3], 'Priority');

            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe(1);
        });
    });
});
